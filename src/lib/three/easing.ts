/**
 * Ease-out cubic: fast at the start, settling smoothly at the end.
 * `x` is expected in [0, 1]; f(0) = 0, f(1) = 1.
 *
 * Shared by the home title entrance and the data-feed console slide so the two
 * use one curve (they previously hand-inlined the same `1 - (1-x)^3`).
 */
export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Ease-in-out cubic: settles at both ends. `x` in [0, 1]; f(0) = 0,
 * f(0.5) = 0.5, f(1) = 1.
 *
 * Used where a transition has no natural impulse at either end — the
 * idle choreography's shape-to-shape crossfades, where an ease-out's
 * fast start reads as a jolt because nothing "launched" the move.
 */
export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
