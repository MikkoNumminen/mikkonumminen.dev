import { describe, it, expect } from 'vitest';
import { generateGalaxyTargets } from './galaxyTargets';

// Pure generator — deterministic under an injected RNG, so the disk
// shape (radius bound, thickness bound, centre bias) is directly
// assertable without a renderer.

/** Tiny deterministic LCG so assertions never flake. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe('generateGalaxyTargets', () => {
  it('emits count*3 floats with no NaNs', () => {
    const p = generateGalaxyTargets({ count: 500, radius: 8, random: seededRandom(1) });
    expect(p.length).toBe(1500);
    for (let i = 0; i < p.length; i++) expect(Number.isNaN(p[i])).toBe(false);
  });

  it('keeps every star inside radius + jitter on xy and thickness on z', () => {
    const radius = 8;
    const diskThickness = 0.8;
    const p = generateGalaxyTargets({
      count: 1000,
      radius,
      diskThickness,
      random: seededRandom(2),
    });
    for (let i = 0; i < 1000; i++) {
      const x = p[i * 3]!;
      const y = p[i * 3 + 1]!;
      const z = p[i * 3 + 2]!;
      // Radial jitter is ±0.3 world units on top of the disk radius.
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(radius + 0.31);
      expect(Math.abs(z)).toBeLessThanOrEqual(diskThickness / 2 + 1e-9);
    }
  });

  it('concentrates stars toward the core (sqrt distribution)', () => {
    const radius = 8;
    const p = generateGalaxyTargets({ count: 2000, radius, random: seededRandom(3) });
    let inner = 0;
    for (let i = 0; i < 2000; i++) {
      if (Math.hypot(p[i * 3]!, p[i * 3 + 1]!) < radius / 2) inner++;
    }
    // Under sqrt-radius placement ~25% of stars sit inside half the
    // radius vs ~25% of the *area* — i.e. clearly denser than uniform.
    // Uniform-by-area would put 25% here too; sqrt-by-index puts ~25%
    // of INDICES at t<0.25 → r<radius/2, which is 25% of stars on 25%
    // of area at the centre = the visible core brightening.
    expect(inner / 2000).toBeGreaterThan(0.2);
  });
});
