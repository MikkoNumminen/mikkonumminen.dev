import { gsap, ScrollTrigger, createScope, prefersReducedMotion } from './setup';

// Local alias so we don't have to repeat the long generic in helper signatures.
// `gsap.core.Tween` is the runtime type returned by `gsap.to(...)`.
type Tween = gsap.core.Tween;

export interface HomeTimelineOptions {
  onScrollProgress?: (progress: number) => void;
  /**
   * Hero-scrub progress 0→1 over the hero section's own height — drives
   * the particle field's name→starfield dissolve (and its reverse when
   * scrolling back to top). Kept separate from `onScrollProgress` (whole
   * document) so the dissolve completes within the first viewport.
   */
  onHeroProgress?: (progress: number) => void;
  /**
   * Per-section field mood, already blended: as each `[data-field-section]`
   * scrubs into view its mood crossfades in from the previous section's.
   * Small state changes only — a hue lean, a density/drift nudge.
   */
  onSectionMood?: (hue: number, density: number, drift: number) => void;
  /**
   * Fired ONCE as each marked section becomes the active one, unlike
   * `onSectionMood` which is scrubbed and fires at scroll rate. Anything
   * that records rather than renders — the field log — wants this.
   */
  onSectionEnter?: (name: string) => void;
  reducedMotion?: boolean;
}

export interface FieldMood {
  /** Palette hue rotation in degrees (applied to the starfield colours). */
  hue: number;
  /** Multiplier on the field's density (fraction of particles visible). */
  density: number;
  /** Multiplier on the drift speed. */
  drift: number;
}

const NEUTRAL_MOOD: FieldMood = { hue: 0, density: 1, drift: 1 };

/**
 * Mood per section marker value. Deliberately small deltas — noticeable,
 * not a show: About leans teal and calm, Writing leans warm and a touch
 * denser, the nav cards go neutral with livelier drift.
 */
const SECTION_MOODS: Record<string, FieldMood> = {
  about: { hue: 18, density: 0.85, drift: 0.8 },
  writing: { hue: -14, density: 1.1, drift: 1.1 },
  nav: { hue: 0, density: 1, drift: 1.4 },
};

export interface HomeTimelineHandle {
  dispose: () => void;
  refresh: () => void;
}

/**
 * Wraps each character of every `[data-split]` element in a `.char` span so we
 * can animate them individually. Each word is wrapped in a `.word` span with
 * `white-space: nowrap` so the browser only breaks lines BETWEEN words, never
 * inside one — without that, every `.char` is its own inline-block atom and
 * the browser happily splits "applications" into "applica" / "tions".
 *
 * The original text lives on a sr-only sibling so screen readers read the
 * heading naturally (instead of "I... space... b... u... i...") without
 * putting aria-label on a generic span (which Lighthouse flags as a
 * prohibited ARIA attribute).
 *
 * NOTE: One-way DOM mutation. `data-split-done` prevents re-splitting on a
 * remount; we intentionally do NOT unsplit on dispose because the .char spans
 * are also referenced by CSS for the static fallback styling.
 */
function splitChars(root: ParentNode): void {
  const targets = root.querySelectorAll<HTMLElement>('[data-split]');
  targets.forEach((el) => {
    if (el.dataset.splitDone === '1') return;
    const text = el.textContent ?? '';
    el.textContent = '';

    const srOnly = document.createElement('span');
    srOnly.className = 'sr-only';
    srOnly.textContent = text;
    el.appendChild(srOnly);

    // aria-hidden cascades to every .word/.char inside, so individual chars
    // no longer need their own aria-hidden attribute.
    const chars = document.createElement('span');
    chars.setAttribute('aria-hidden', 'true');

    // Split into word/whitespace segments and keep each word's chars inside
    // a `.word` wrapper. Whitespace becomes a real text node so the browser
    // can break the line at that position naturally.
    const segments = text.split(/(\s+)/);
    for (const segment of segments) {
      if (segment === '') continue;
      if (/^\s+$/.test(segment)) {
        chars.appendChild(document.createTextNode(' '));
        continue;
      }
      const word = document.createElement('span');
      word.className = 'word';
      for (const ch of segment) {
        const charSpan = document.createElement('span');
        charSpan.className = 'char';
        charSpan.textContent = ch;
        word.appendChild(charSpan);
      }
      chars.appendChild(word);
    }

    el.appendChild(chars);

    el.dataset.splitDone = '1';
  });
}

export function initHomeTimeline(opts: HomeTimelineOptions = {}): HomeTimelineHandle {
  const {
    onScrollProgress,
    onHeroProgress,
    onSectionMood,
    onSectionEnter,
    reducedMotion = prefersReducedMotion(),
  } = opts;

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
    if (onHeroProgress) onHeroProgress(0);

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

    // ── Hero dissolve scrub for the particle field ──────────────────────
    // Name (or galaxy, pre-formation) → starfield across the hero's own
    // height. Scrub means reverse comes free: scrolling back to the top
    // re-forms the name every time.
    if (onHeroProgress) {
      ownedTriggers.push(
        ScrollTrigger.create({
          trigger: '[data-section-hero]',
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => onHeroProgress(self.progress),
        }),
      );
    }

    // ── Per-section field moods ─────────────────────────────────────────
    // Each marked section scrubs a crossfade from the previous section's
    // mood to its own as its top travels 70% → 25% of the viewport. The
    // trigger windows of consecutive full-height sections don't overlap,
    // so the last writer is always the section actually arriving.
    if (onSectionMood || onSectionEnter) {
      const marked = Array.from(
        document.querySelectorAll<HTMLElement>('[data-field-section]'),
      );
      // Latched so a scrub that wanders back and forth across one
      // boundary announces the section once, not once per direction.
      let activeSection = '';
      marked.forEach((el, i) => {
        const mood = SECTION_MOODS[el.dataset.fieldSection ?? ''] ?? NEUTRAL_MOOD;
        const prev =
          i === 0
            ? NEUTRAL_MOOD
            : (SECTION_MOODS[marked[i - 1]?.dataset.fieldSection ?? ''] ?? NEUTRAL_MOOD);
        ownedTriggers.push(
          ScrollTrigger.create({
            trigger: el,
            start: 'top 70%',
            end: 'top 25%',
            scrub: true,
            onUpdate: (self) => {
              const p = self.progress;
              onSectionMood?.(
                prev.hue + (mood.hue - prev.hue) * p,
                prev.density + (mood.density - prev.density) * p,
                prev.drift + (mood.drift - prev.drift) * p,
              );
              const name = el.dataset.fieldSection ?? '';
              if (onSectionEnter && p > 0.5 && name && name !== activeSection) {
                activeSection = name;
                onSectionEnter(name);
              }
            },
          }),
        );
      });
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
