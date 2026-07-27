import { describe, it, expect } from 'vitest';
import { bakeOctaves, bakeSize } from './bakePlanetSurface';
import { surfaceKindFor, SURFACE_KIND, TUNING } from './surfaceKinds';
import { projects } from '../../../data/projects';

describe('bakeSize', () => {
  it('is twice as wide as it is tall, because the sampling is equirectangular', () => {
    for (const low of [false, true]) {
      const { width, height } = bakeSize(low);
      expect(width, `lowPerf=${low}`).toBe(height * 2);
    }
  });

  it('halves both axes on the cheap path', () => {
    const full = bakeSize(false);
    const low = bakeSize(true);
    expect(low.width * 2).toBe(full.width);
    expect(low.height * 2).toBe(full.height);
  });

  it('defaults to the full tier when asked nothing', () => {
    expect(bakeSize()).toEqual(bakeSize(false));
  });
});

describe('bakeOctaves', () => {
  it('drops on the cheap path, so the low tier compiles a smaller program', () => {
    // Octaves are a compile-time define, so this is the one knob that changes
    // program size rather than only fill cost.
    expect(bakeOctaves(true)).toBeLessThan(bakeOctaves(false));
  });
});

describe('surface kinds', () => {
  it('names every project explicitly, with no silent fallback', () => {
    // The CPU path had a `default` branch and five projects quietly shared one
    // generic rocky world. Adding a project should be a decision, not an
    // omission that still renders.
    for (const p of projects) {
      const kind = surfaceKindFor(p.id);
      expect(TUNING[kind], `${p.id} -> ${kind}`).toBeDefined();
      expect(Object.keys(SURFACE_KIND)).toContain(kind);
    }
  });

  it('gives every kind a full tuning entry', () => {
    for (const kind of Object.keys(SURFACE_KIND) as (keyof typeof SURFACE_KIND)[]) {
      const t = TUNING[kind];
      expect(t.noiseScale, kind).toBeGreaterThan(0);
      expect(t.relief, kind).toBeGreaterThanOrEqual(0);
      expect(t.featureColor, kind).toHaveLength(3);
    }
  });
});
