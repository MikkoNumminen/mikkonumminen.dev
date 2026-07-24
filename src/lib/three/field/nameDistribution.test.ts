import { describe, it, expect } from 'vitest';
import { distributeNameTargets } from './nameDistribution';

/** Tiny deterministic LCG so assertions never flake. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// A 4-point square of glyph candidates around the origin.
const CANDIDATES = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

describe('distributeNameTargets', () => {
  it('assigns the dust fraction and flags it in the dim array', () => {
    const { positions, dim } = distributeNameTargets({
      candidates: CANDIDATES,
      count: 100,
      dustFraction: 0.35,
      random: seededRandom(1),
    });
    expect(positions.length).toBe(300);
    expect(dim.length).toBe(100);
    const dustCount = dim.reduce((a, b) => a + b, 0);
    expect(dustCount).toBe(35);
    // Glyph particles come first, dust after.
    expect(dim[0]).toBe(0);
    expect(dim[99]).toBe(1);
  });

  it('places glyph particles on candidate xy with bounded depth jitter', () => {
    const { positions, dim } = distributeNameTargets({
      candidates: CANDIDATES,
      count: 40,
      dustFraction: 0.25,
      glyphDepth: 0.4,
      random: seededRandom(2),
    });
    for (let i = 0; i < 40; i++) {
      if (dim[i] !== 0) continue;
      expect(Math.abs(positions[i * 3]!)).toBe(1);
      expect(Math.abs(positions[i * 3 + 1]!)).toBe(1);
      expect(Math.abs(positions[i * 3 + 2]!)).toBeLessThanOrEqual(0.2);
    }
  });

  it('covers every candidate when particles outnumber them', () => {
    const { positions } = distributeNameTargets({
      candidates: CANDIDATES,
      count: 16,
      dustFraction: 0,
      glyphDepth: 0,
      random: seededRandom(3),
    });
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) {
      seen.add(`${positions[i * 3]},${positions[i * 3 + 1]}`);
    }
    expect(seen.size).toBe(4);
  });

  it('strides across the candidate list when candidates outnumber particles', () => {
    // 8 candidates left→right; only 4 glyph particles. A naive first-N
    // pick would cover just the left half — the stride must reach the
    // right end of the list (bottom of the letters in row-major order).
    const wide = new Float32Array([0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0]);
    const { positions } = distributeNameTargets({
      candidates: wide,
      count: 4,
      dustFraction: 0,
      glyphDepth: 0,
      random: seededRandom(5),
    });
    const xs = [positions[0], positions[3], positions[6], positions[9]];
    expect(Math.max(...(xs as number[]))).toBeGreaterThanOrEqual(6);
    expect(Math.min(...(xs as number[]))).toBe(0);
  });

  it('falls back to all-dust when there are no candidates', () => {
    const { dim } = distributeNameTargets({
      candidates: new Float32Array(0),
      count: 10,
      random: seededRandom(4),
    });
    expect(dim.every((d) => d === 1)).toBe(true);
  });
});
