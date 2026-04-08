import { Group, Mesh, MeshBasicMaterial, ShaderMaterial, SphereGeometry } from 'three';
import { createGlowMaterial } from '../createGlowMaterial';

export interface SunHandle {
  group: Group;
  core: Mesh;
  coreMaterial: MeshBasicMaterial;
  coreGeometry: SphereGeometry;
  glow: Mesh;
  glowMaterial: ShaderMaterial;
  glowGeometry: SphereGeometry;
}

export function buildSun(): SunHandle {
  const group = new Group();

  const coreGeometry = new SphereGeometry(1.6, 48, 48);
  const coreMaterial = new MeshBasicMaterial({ color: 0xfff0c8 });
  const core = new Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const glowMaterial = createGlowMaterial({
    color: 0xffc865,
    falloff: 0.7,
    intensity: 1.4,
  });
  const glowGeometry = new SphereGeometry(2.6, 48, 48);
  const glow = new Mesh(glowGeometry, glowMaterial);
  group.add(glow);

  return { group, core, coreMaterial, coreGeometry, glow, glowMaterial, glowGeometry };
}
