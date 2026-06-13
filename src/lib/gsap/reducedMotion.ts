/**
 * Read the user's reduced-motion preference. Safe in non-browser contexts:
 * returns `false` if `window` / `matchMedia` are unavailable.
 *
 * Deliberately kept in its own module, free of the `gsap` import: the scenes
 * gate their animation paths on this, and importing `./setup` registers the
 * GSAP ScrollTrigger plugin (a side effect that needs a real browser). Keeping
 * the preference read separate lets it be imported — and unit-tested — without
 * that side effect.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
