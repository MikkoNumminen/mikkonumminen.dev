import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
 */
function splitChars(root: ParentNode) {
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
  const { onScrollProgress, reducedMotion = false } = opts;

  splitChars(document);

  const triggers: ScrollTrigger[] = [];

  // ── Scroll progress for the Three.js scene (whole document) ─────────
  if (onScrollProgress) {
    const t = ScrollTrigger.create({
      trigger: document.documentElement,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => onScrollProgress(self.progress),
    });
    triggers.push(t);
  }

  // ── Hero scroll hint fade ───────────────────────────────────────────
  const scrollHint = document.querySelector<HTMLElement>('[data-scroll-hint]');
  if (scrollHint) {
    const t = gsap.to(scrollHint, {
      opacity: 0,
      y: 20,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '[data-section-hero]',
        start: 'top top',
        end: 'bottom 70%',
        scrub: true,
      },
    });
    if (t.scrollTrigger) triggers.push(t.scrollTrigger);
  }

  // ── Letter-by-letter intro reveals ──────────────────────────────────
  document.querySelectorAll<HTMLElement>('[data-reveal-chars]').forEach((el) => {
    const chars = el.querySelectorAll<HTMLElement>('.char');
    if (chars.length === 0) return;
    gsap.set(chars, { yPercent: 110, opacity: 0 });
    const t = gsap.to(chars, {
      yPercent: 0,
      opacity: 1,
      ease: 'power3.out',
      duration: reducedMotion ? 0.001 : 0.6,
      stagger: reducedMotion ? 0 : 0.018,
      scrollTrigger: {
        trigger: el,
        start: 'top 80%',
        end: 'top 40%',
        toggleActions: 'play none none reverse',
      },
    });
    if (t.scrollTrigger) triggers.push(t.scrollTrigger);
  });

  // ── Block fade-up reveals ───────────────────────────────────────────
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.set(el, { y: 60, opacity: 0 });
    const t = gsap.to(el, {
      y: 0,
      opacity: 1,
      ease: 'power3.out',
      duration: reducedMotion ? 0.001 : 0.9,
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none reverse',
      },
    });
    if (t.scrollTrigger) triggers.push(t.scrollTrigger);
  });

  // ── Parallax layers ─────────────────────────────────────────────────
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const speed = parseFloat(el.dataset.parallax ?? '0.2');
    const t = gsap.to(el, {
      yPercent: -speed * 100,
      ease: 'none',
      scrollTrigger: {
        trigger: el.closest('section') ?? el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
    if (t.scrollTrigger) triggers.push(t.scrollTrigger);
  });

  // ── Nav cards entrance ──────────────────────────────────────────────
  const cards = gsap.utils.toArray<HTMLElement>('[data-nav-card]');
  if (cards.length) {
    gsap.set(cards, { y: 80, opacity: 0 });
    const t = gsap.to(cards, {
      y: 0,
      opacity: 1,
      ease: 'power3.out',
      duration: reducedMotion ? 0.001 : 0.9,
      stagger: reducedMotion ? 0 : 0.12,
      scrollTrigger: {
        trigger: '[data-section-nav-cards]',
        start: 'top 75%',
        toggleActions: 'play none none reverse',
      },
    });
    if (t.scrollTrigger) triggers.push(t.scrollTrigger);
  }

  return {
    refresh: () => ScrollTrigger.refresh(),
    dispose: () => {
      triggers.forEach((t) => t.kill());
    },
  };
}
