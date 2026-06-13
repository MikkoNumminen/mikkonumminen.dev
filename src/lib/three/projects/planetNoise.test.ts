import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  hashString,
  hash3,
  smooth,
  noise3,
  fbm3,
  sampleRamp,
  clamp255,
  derivePalette,
  type Rgb,
} from './planetNoise';

// The deterministic procedural-texture kernel, extracted from buildPlanetTexture
// so it's testable without a 2d canvas. Every function is pure; these pin the
// determinism, ranges, and interpolation that drive every planet's surface.

describe('mulberry32', () => {
  it('is deterministic per seed and yields [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('diverges for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

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

describe('smooth (smoothstep)', () => {
  it('fixes the endpoints and the midpoint', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5, 10);
  });

  it('is monotonic non-decreasing on [0,1]', () => {
    let prev = smooth(0);
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const v = smooth(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('hash3 / noise3', () => {
  it('hash3 is deterministic and in [0,1)', () => {
    expect(hash3(1, 2, 3, 9)).toBe(hash3(1, 2, 3, 9));
    const h = hash3(5, 6, 7, 1);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(1);
  });

  it('noise3 at an integer lattice point equals the corner hash', () => {
    // integer coords → fractional parts 0 → interpolation collapses to c000
    expect(noise3(3, 4, 5, 11)).toBeCloseTo(hash3(3, 4, 5, 11), 12);
  });

  it('noise3 is deterministic and bounded to [0,1)', () => {
    const a = noise3(1.3, 2.7, 0.4, 5);
    expect(noise3(1.3, 2.7, 0.4, 5)).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });
});

describe('fbm3', () => {
  it('with a single octave equals noise3', () => {
    expect(fbm3(1.1, 2.2, 3.3, 7, 1)).toBeCloseTo(noise3(1.1, 2.2, 3.3, 7), 12);
  });

  it('is deterministic and stays within [0,1]', () => {
    const v = fbm3(0.5, 0.5, 0.5, 3, 4);
    expect(fbm3(0.5, 0.5, 0.5, 3, 4)).toBe(v);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe('clamp255', () => {
  it('clamps to the [0,255] byte range', () => {
    expect(clamp255(-5)).toBe(0);
    expect(clamp255(300)).toBe(255);
    expect(clamp255(128)).toBe(128);
    expect(clamp255(0)).toBe(0);
    expect(clamp255(255)).toBe(255);
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
