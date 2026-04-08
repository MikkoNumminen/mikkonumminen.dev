import * as THREE from 'three';
import { createGlowMaterial } from '../createGlowMaterial';

export interface SunHandle {
  group: THREE.Group;
  core: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
  coreGeometry: THREE.SphereGeometry;
  glow: THREE.Mesh;
  glowMaterial: THREE.ShaderMaterial;
  glowGeometry: THREE.SphereGeometry;
}

export function buildSun(): SunHandle {
  const group = new THREE.Group();

  const coreGeometry = new THREE.SphereGeometry(1.6, 48, 48);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const glowMaterial = createGlowMaterial({
    color: 0xffc865,
    falloff: 0.7,
    intensity: 1.4,
  });
  const glowGeometry = new THREE.SphereGeometry(2.6, 48, 48);
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  group.add(glow);

  return { group, core, coreMaterial, coreGeometry, glow, glowMaterial, glowGeometry };
}
