import { describe, it, expect, vi, afterEach } from 'vitest';
import { Color, type BufferAttribute } from 'three';
import { buildStarfield } from './buildStarfield';

// buildStarfield scatters 1800 stars on a spherical shell with palette colors.
// Three's BufferGeometry/Points construct headless, so the distribution
// invariants (count, radius bounds, palette membership) are unit-testable.
// Math.random is the only nondeterminism and is stubbable.

afterEach(() => {
  vi.restoreAllMocks();
});

const arr = (a: BufferAttribute) => a.array;

describe('buildStarfield', () => {
  it('builds 1800 points with matching position and color counts', () => {
    const { geometry } = buildStarfield();
    expect((geometry.getAttribute('position') as BufferAttribute).count).toBe(1800);
    expect((geometry.getAttribute('color') as BufferAttribute).count).toBe(1800);
  });

  it('places every star within the [60, 200] radius shell', () => {
    const { geometry } = buildStarfield();
    const pos = arr(geometry.getAttribute('position') as BufferAttribute);
    for (let i = 0; i < pos.length; i += 3) {
      const r = Math.hypot(pos[i] ?? 0, pos[i + 1] ?? 0, pos[i + 2] ?? 0);
      expect(r).toBeGreaterThanOrEqual(60 - 1e-6);
      expect(r).toBeLessThanOrEqual(200 + 1e-6);
    }
  });

  it('colors every star from the three-entry palette', () => {
    const palette = [new Color(0xffffff), new Color(0xc8d8ff), new Color(0xfff0c8)];
    const { geometry } = buildStarfield();
    const col = arr(geometry.getAttribute('color') as BufferAttribute);
    for (let i = 0; i < col.length; i += 3) {
      const r = col[i] ?? -1;
      const g = col[i + 1] ?? -1;
      const b = col[i + 2] ?? -1;
      const match = palette.some(
        (c) =>
          Math.abs(c.r - r) < 1e-4 &&
          Math.abs(c.g - g) < 1e-4 &&
          Math.abs(c.b - b) < 1e-4,
      );
      expect(match, `star ${i / 3} color (${r},${g},${b})`).toBe(true);
    }
  });

  it('with Math.random pinned to 0, the first star sits at radius 60 and is white', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { geometry } = buildStarfield();
    const pos = arr(geometry.getAttribute('position') as BufferAttribute);
    const col = arr(geometry.getAttribute('color') as BufferAttribute);
    expect(Math.hypot(pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0)).toBeCloseTo(60, 4);
    expect(col[0] ?? 0).toBeCloseTo(1, 5);
    expect(col[1] ?? 0).toBeCloseTo(1, 5);
    expect(col[2] ?? 0).toBeCloseTo(1, 5);
  });

  it('configures a transparent, vertex-colored, non-depth-writing material', () => {
    const { material } = buildStarfield();
    expect(material.vertexColors).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeCloseTo(0.95, 5);
    expect(material.size).toBeCloseTo(0.18, 5);
  });
});
