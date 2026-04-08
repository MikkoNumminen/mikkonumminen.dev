import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Shared GSAP setup. Both timeline modules import `gsap` and `ScrollTrigger`
 * from here so the plugin is registered exactly once and there is a single
 * place to add future plugins.
 */
gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/**
 * Read the user's reduced-motion preference. Safe in non-browser contexts:
 * returns `false` if `window`/`matchMedia` are unavailable.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface GsapScope {
  context: gsap.Context;
  dispose: () => void;
}

/**
 * Run `fn` inside a `gsap.context` so every tween, ScrollTrigger and
 * inline style created during setup can be reverted with a single call.
 *
 * `dispose` calls `context.revert()`, which:
 *  - kills all tweens registered inside the scope
 *  - kills their ScrollTriggers
 *  - reverts inline styles set by `gsap.set` / tweens
 */
export function createScope(fn: (ctx: gsap.Context) => void, scope?: Element): GsapScope {
  const context = gsap.context(fn, scope);
  return {
    context,
    dispose: (): void => context.revert(),
  };
}
