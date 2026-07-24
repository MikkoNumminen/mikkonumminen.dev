import { describe, it, expect } from 'vitest';
import { generateStarfieldTargets } from './starfieldTargets';

/** Tiny deterministic LCG so assertions never flake. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe('generateStarfieldTargets', () => {
  it('emits count*3 floats with no NaNs', () => {
    const p = generateStarfieldTargets({ count: 500, random: seededRandom(1) });
    expect(p.length).toBe(1500);
    for (let i = 0; i < p.length; i++) expect(Number.isNaN(p[i])).toBe(false);
  });

  it('respects the volume bounds', () => {
    const opts = {
      count: 1000,
      halfWidth: 40,
      halfHeight: 25,
      zMin: -50,
      zMax: 6,
      random: seededRandom(2),
    };
    const p = generateStarfieldTargets(opts);
    for (let i = 0; i < opts.count; i++) {
      expect(Math.abs(p[i * 3]!)).toBeLessThanOrEqual(opts.halfWidth);
      expect(Math.abs(p[i * 3 + 1]!)).toBeLessThanOrEqual(opts.halfHeight);
      expect(p[i * 3 + 2]!).toBeGreaterThanOrEqual(opts.zMin);
      expect(p[i * 3 + 2]!).toBeLessThanOrEqual(opts.zMax);
    }
  });

  it('never places a star past zMax toward the camera', () => {
    // zMax must stay well short of the camera's z so size attenuation
    // can't balloon a near star into a screen-filling sprite.
    const p = generateStarfieldTargets({ count: 500, random: seededRandom(3) });
    for (let i = 0; i < 500; i++) {
      expect(p[i * 3 + 2]!).toBeLessThanOrEqual(6);
    }
  });
});
