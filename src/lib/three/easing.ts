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
