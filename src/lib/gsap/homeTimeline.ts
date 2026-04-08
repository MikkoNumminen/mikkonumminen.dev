import { gsap, ScrollTrigger, createScope, prefersReducedMotion } from './setup';

// Local alias so we don't have to repeat the long generic in helper signatures.
// `gsap.core.Tween` is the runtime type returned by `gsap.to(...)`.
type Tween = gsap.core.Tween;

export interface HomeTimelineOptions {
  onScrollProgress?: (progress: number) => void;
  reducedMotion?: boolean;
}

export interface HomeTimelineHandle {
  dispose: () => void;
  refresh: () => void;
}

/**
 * Wraps each character of every `[data-split]` element in a `.char` span so we
 * can animate them individually. Whitespace is preserved.
 *
 * NOTE: This is a one-way DOM mutation. The original text is preserved on the
 * `aria-label` attribute and the `data-split-done` flag prevents re-splitting,
 * so an SPA-style remount restores the right content. We intentionally do NOT
 * unsplit on dispose because the .char spans are also referenced by CSS for
 * the static fallback styling.
 */
function splitChars(root: ParentNode): void {
  const targets = root.querySelectorAll<HTMLElement>('[data-split]');
  targets.forEach((el) => {
    if (el.dataset.splitDone === '1') return;
    const text = el.textContent ?? '';
    el.textContent = '';
    el.setAttribute('aria-label', text);
    for (const ch of text) {
      const span = document.createElement('span');
      span.className = 'char';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = ch === ' ' ? '\u00A0' : ch;
      el.appendChild(span);
    }
    el.dataset.splitDone = '1';
  });
}

export function initHomeTimeline(opts: HomeTimelineOptions = {}): HomeTimelineHandle {
  const { onScrollProgress, reducedMotion = prefersReducedMotion() } = opts;

  // ── Reduced-motion static fallback ─────────────────────────────────
  // No splitting, no opacity:0, no tweens, no ScrollTriggers. Everything
  // sits at its natural state. We still call onScrollProgress(0) once so
  // the Three.js scene starts in a sensible position.
  if (reducedMotion) {
    const charsTargets = document.querySelectorAll<HTMLElement>('[data-reveal-chars]');
    const revealTargets = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const parallaxTargets = document.querySelectorAll<HTMLElement>('[data-parallax]');
    const cards = document.querySelectorAll<HTMLElement>('[data-nav-card]');
    const scrollHint = document.querySelectorAll<HTMLElement>('[data-scroll-hint]');

    gsap.set(
      [...charsTargets, ...revealTargets, ...parallaxTargets, ...cards, ...scrollHint],
      { clearProps: 'all' },
    );

    if (onScrollProgress) onScrollProgress(0);

    return {
      refresh: (): void => {},
      dispose: (): void => {},
    };
  }

  splitChars(document);

  // Track the ScrollTriggers we create so `refresh()` can scope to just
  // ours instead of calling the global `ScrollTrigger.refresh()`.
  const ownedTriggers: ScrollTrigger[] = [];
  const track = (tween: Tween): void => {
    if (tween.scrollTrigger) ownedTriggers.push(tween.scrollTrigger);
  };

  // Wrap everything in a gsap.context so a single revert() kills tweens,
  // ScrollTriggers AND reverts the inline styles set by gsap.set below.
  const scope = createScope(() => {
    // ── Scroll progress for the Three.js scene (whole document) ─────────
    if (onScrollProgress) {
      ownedTriggers.push(
        ScrollTrigger.create({
          trigger: document.documentElement,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => onScrollProgress(self.progress),
        }),
      );
    }

    // ── Hero scroll hint fade ───────────────────────────────────────────
    const scrollHint = document.querySelector<HTMLElement>('[data-scroll-hint]');
    if (scrollHint) {
      track(
        gsap.to(scrollHint, {
          opacity: 0,
          y: 20,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '[data-section-hero]',
            start: 'top top',
            end: 'bottom 70%',
            scrub: true,
          },
        }),
      );
    }

    // ── Letter-by-letter intro reveals ──────────────────────────────────
    document.querySelectorAll<HTMLElement>('[data-reveal-chars]').forEach((el) => {
      const chars = el.querySelectorAll<HTMLElement>('.char');
      if (chars.length === 0) return;
      gsap.set(chars, { yPercent: 110, opacity: 0 });
      track(
        gsap.to(chars, {
          yPercent: 0,
          opacity: 1,
          ease: 'power3.out',
          duration: 0.6,
          stagger: 0.018,
          scrollTrigger: {
            trigger: el,
            start: 'top 80%',
            end: 'top 40%',
            toggleActions: 'play none none reverse',
          },
        }),
      );
    });

    // ── Block fade-up reveals ───────────────────────────────────────────
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      gsap.set(el, { y: 60, opacity: 0 });
      track(
        gsap.to(el, {
          y: 0,
          opacity: 1,
          ease: 'power3.out',
          duration: 0.9,
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            end: 'top 40%',
            toggleActions: 'play none none reverse',
          },
        }),
      );
    });

    // ── Parallax layers ─────────────────────────────────────────────────
    document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
      const speed = parseFloat(el.dataset.parallax ?? '0.45');
      track(
        gsap.to(el, {
          yPercent: -speed * 100,
          ease: 'none',
          scrollTrigger: {
            trigger: el.closest('section') ?? el,
            start: 'top bottom',
            end: 'bottom 20%',
            scrub: true,
          },
        }),
      );
    });

    // ── Nav cards entrance ──────────────────────────────────────────────
    const cards = gsap.utils.toArray<HTMLElement>('[data-nav-card]');
    if (cards.length) {
      gsap.set(cards, { y: 80, opacity: 0 });
      track(
        gsap.to(cards, {
          y: 0,
          opacity: 1,
          ease: 'power3.out',
          duration: 0.9,
          stagger: 0.12,
          scrollTrigger: {
            trigger: '[data-section-nav-cards]',
            start: 'top 75%',
            toggleActions: 'play none none reverse',
          },
        }),
      );
    }
  });

  return {
    // Scope-local refresh: only refreshes the ScrollTriggers we created,
    // not every trigger registered globally on the document.
    refresh: (): void => {
      ownedTriggers.forEach((t) => t.refresh());
    },
    dispose: scope.dispose,
  };
}
