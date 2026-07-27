import { describe, it, expect } from 'vitest';
import { derivePalette, hashString, sampleRamp, type Rgb } from './planetNoise';

// Palette derivation and the seed hash, which survived the move of the surface
// noise to GLSL. Every function is pure; these pin the determinism, ranges, and interpolation that drive every planet's surface.

describe('hashString', () => {
  it('is stable and a uint32', () => {
    expect(hashString('skill-registry')).toBe(hashString('skill-registry'));
    const h = hashString('abc');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('differs for different strings', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('sampleRamp', () => {
  const pal: readonly [Rgb, Rgb, Rgb, Rgb] = [
    [0, 0, 0],
    [10, 10, 10],
    [20, 20, 20],
    [30, 30, 30],
  ];

  it('returns the first stop at t≤0 and the last at t≥1 (clamped)', () => {
    expect(sampleRamp(pal, 0)).toEqual([0, 0, 0]);
    expect(sampleRamp(pal, 1)).toEqual([30, 30, 30]);
    expect(sampleRamp(pal, -1)).toEqual([0, 0, 0]);
    expect(sampleRamp(pal, 2)).toEqual([30, 30, 30]);
  });

  it('interpolates linearly within a segment', () => {
    // t = 1/6 → f = 0.5 → halfway between stop 0 and stop 1
    expect(sampleRamp(pal, 1 / 6)).toEqual([5, 5, 5]);
  });
});

describe('derivePalette', () => {
  it('returns 4 integer RGB stops in [0,255], deterministically', () => {
    const p = derivePalette(0x4080ff);
    expect(p).toHaveLength(4);
    for (const stop of p) {
      expect(stop).toHaveLength(3);
      for (const c of stop) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
    expect(derivePalette(0x4080ff)).toEqual(p);
  });

  it('ramps dark → light (stop 0 is darker than stop 3)', () => {
    const p = derivePalette(0x4080ff);
    const lum = (s: Rgb) => s[0] + s[1] + s[2];
    expect(lum(p[0])).toBeLessThan(lum(p[3]));
  });
});
