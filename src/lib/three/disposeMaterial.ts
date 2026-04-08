import * as THREE from 'three';

/**
 * Three.js types `Object3D.material` as `Material | Material[]`. This helper
 * normalizes both shapes so callers don't need to repeat the union check.
 */
export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) m.dispose();
  } else {
    material.dispose();
  }
}
