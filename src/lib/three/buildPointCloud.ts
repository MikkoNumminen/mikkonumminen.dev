import * as THREE from 'three';

export interface BuildPointCloudOptions {
  positions: Float32Array;
  colors?: Float32Array;
  material: THREE.PointsMaterial;
}

export interface PointCloud {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
}

/**
 * Wraps the boilerplate of building a `THREE.Points` cloud from a positions
 * (and optional colors) array. Caller owns the material lifetime via the
 * returned reference.
 */
export function buildPointCloud(opts: BuildPointCloudOptions): PointCloud {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(opts.positions, 3));
  if (opts.colors) {
    geometry.setAttribute('color', new THREE.BufferAttribute(opts.colors, 3));
  }
  const points = new THREE.Points(geometry, opts.material);
  return { points, geometry, material: opts.material };
}
