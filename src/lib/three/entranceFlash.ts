/**
 * Stroboscopic rim-light flash for the home title's entrance.
 *
 * Each peak is `[center, height, width]` in seconds. Three peaks land while the
 * title is still arriving (entrance ends at 1.4 s), and two more land just after
 * to extend the bright sequence so the arrival reads as a real moment rather
 * than a single hit. After ~2.6 s the rim sits at the very dim steady level.
 */
export const ENTRANCE_FLASH_PEAKS: ReadonlyArray<readonly [number, number, number]> = [
  [0.15, 4.0, 0.1],
  [0.55, 3.5, 0.13],
  [1.05, 5.0, 0.16],
  [1.55, 4.2, 0.16],
  [2.1, 3.6, 0.18],
];

/**
 * Rim-light intensity at time `t` (seconds): the superposition of Gaussian
 * peaks, with each peak skipped once it is more than 4 widths away (negligible
 * contribution). Pure function of `t`.
 */
export function entranceFlashEnvelope(t: number): number {
  let sum = 0;
  for (const [c, h, w] of ENTRANCE_FLASH_PEAKS) {
    const d = (t - c) / w;
    if (Math.abs(d) > 4) continue;
    sum += h * Math.exp(-d * d);
  }
  return sum;
}
