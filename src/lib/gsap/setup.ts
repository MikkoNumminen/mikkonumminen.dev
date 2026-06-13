import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Shared GSAP setup. Both timeline modules import `gsap` and `ScrollTrigger`
 * from here so the plugin is registered exactly once and there is a single
 * place to add future plugins.
 */
gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

// Re-exported from its own side-effect-free module so the scenes keep importing
// it from here, while it stays unit-testable in isolation (importing this file
// registers the gsap ScrollTrigger plugin, which needs a real browser).
export { prefersReducedMotion } from './reducedMotion';

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
