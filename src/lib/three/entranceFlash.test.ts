import { describe, it, expect } from 'vitest';
import { entranceFlashEnvelope, ENTRANCE_FLASH_PEAKS } from './entranceFlash';

// The home title's rim-light flash envelope — a superposition of Gaussian
// peaks. Pure f(t)->number, now module-scope and testable. Expected values are
// derived independently of the implementation so a botched extraction fails.

describe('entranceFlashEnvelope', () => {
  it('is ~0 far from every peak (all beyond the 4-width cutoff)', () => {
    expect(entranceFlashEnvelope(10)).toBeCloseTo(0, 6);
    expect(entranceFlashEnvelope(-5)).toBeCloseTo(0, 6);
  });

  it('reaches at least each peak height at that peak centre (exp(0)=1)', () => {
    for (const [center, height] of ENTRANCE_FLASH_PEAKS) {
      expect(entranceFlashEnvelope(center)).toBeGreaterThanOrEqual(height - 1e-9);
    }
  });

  it('returns a finite, non-negative value across the entrance window', () => {
    for (let t = 0; t <= 3; t += 0.05) {
      const v = entranceFlashEnvelope(t);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('falls off away from a peak centre', () => {
    const tallest = ENTRANCE_FLASH_PEAKS[2]; // [1.05, 5.0, 0.16]
    expect(tallest).toBeDefined();
    if (tallest) {
      const [center, , width] = tallest;
      expect(entranceFlashEnvelope(center)).toBeGreaterThan(
        entranceFlashEnvelope(center + width * 0.5),
      );
    }
  });

  it('superposes overlapping peaks (sum, not max)', () => {
    const t = 0.35; // between peak 0 (0.15) and peak 1 (0.55)
    const first = ENTRANCE_FLASH_PEAKS[0];
    expect(first).toBeDefined();
    if (first) {
      const [c0, h0, w0] = first;
      const single0 = h0 * Math.exp(-(((t - c0) / w0) ** 2));
      expect(entranceFlashEnvelope(t)).toBeGreaterThan(single0);
    }
  });
});
