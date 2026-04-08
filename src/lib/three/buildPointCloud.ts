import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three';

export interface BuildPointCloudOptions {
  positions: Float32Array;
  colors?: Float32Array;
  material: PointsMaterial;
}

export interface PointCloud {
  points: Points;
  geometry: BufferGeometry;
  material: PointsMaterial;
}

/**
 * Wraps the boilerplate of building a `THREE.Points` cloud from a positions
 * (and optional colors) array. Caller owns the material lifetime via the
 * returned reference.
 */
export function buildPointCloud(opts: BuildPointCloudOptions): PointCloud {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(opts.positions, 3));
  if (opts.colors) {
    geometry.setAttribute('color', new BufferAttribute(opts.colors, 3));
  }
  const points = new Points(geometry, opts.material);
  return { points, geometry, material: opts.material };
}
