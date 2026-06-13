import { describe, it, expect } from 'vitest';
import { BufferAttribute, PointsMaterial } from 'three';
import { buildPointCloud } from './buildPointCloud';

// buildPointCloud is the shared positions(+colors) → THREE.Points wrapper used
// by the starfields and particle clouds. Three's geometry/attribute objects
// construct fine headless (no WebGL context until render), so the attribute
// binding, the optional-color branch, and the caller-owns-the-references
// contract are all unit-testable.

describe('buildPointCloud', () => {
  it('binds position as itemSize-3 over the same backing array (no copy)', () => {
    const positions = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    const { geometry } = buildPointCloud({ positions, material: new PointsMaterial() });
    const attr = geometry.getAttribute('position') as BufferAttribute;
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBe(3); // 9 floats / 3
    expect(attr.array).toBe(positions);
  });

  it('omits the color attribute when no colors are given', () => {
    const { geometry } = buildPointCloud({
      positions: new Float32Array([0, 0, 0]),
      material: new PointsMaterial(),
    });
    expect(geometry.getAttribute('color')).toBeUndefined();
  });

  it('binds a color attribute when colors are provided', () => {
    const { geometry } = buildPointCloud({
      positions: new Float32Array([0, 0, 0, 1, 1, 1]),
      colors: new Float32Array([1, 0, 0, 0, 1, 0]),
      material: new PointsMaterial(),
    });
    const attr = geometry.getAttribute('color') as BufferAttribute;
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBe(2);
  });

  it('returns the caller-owned material and the geometry the Points wraps', () => {
    const material = new PointsMaterial();
    const result = buildPointCloud({ positions: new Float32Array([0, 0, 0]), material });
    expect(result.material).toBe(material);
    expect(result.points.geometry).toBe(result.geometry);
  });
});
