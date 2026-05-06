import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
} from 'three';
import type { LocalizedProject } from '../../../data/projects';
import { createGlowMaterial } from '../createGlowMaterial';
import { PLANET_BASE_RADIUS } from './constants';

export interface PlanetEntry {
  project: LocalizedProject;
  /** The orbit-positioned wrapper that holds mesh, glow, and optional ring. */
  group: Group;
  mesh: Mesh;
  glow: Mesh;
  orbitLine: Line;
  ring?: Mesh;
}

const ORBIT_SEGMENTS = 128;

export function buildPlanet(project: LocalizedProject): {
  entry: PlanetEntry;
  /** The tilted parent group that should be added to the scene. */
  rootGroup: Group;
} {
  const rootGroup = new Group();
  rootGroup.rotation.x = project.tilt;

  const radius = PLANET_BASE_RADIUS * project.scale;
  const geometry = new SphereGeometry(radius, 36, 36);
  const material = new MeshStandardMaterial({
    color: new Color(project.color),
    roughness: 0.55,
    metalness: 0.1,
    emissive: new Color(project.color).multiplyScalar(0.08),
  });
  const mesh = new Mesh(geometry, material);
  mesh.userData.projectId = project.id;

  const glowMaterial = createGlowMaterial({
    color: project.color,
    falloff: 0.65,
    intensity: 0.9,
  });
  const glow = new Mesh(new SphereGeometry(radius * 1.55, 24, 24), glowMaterial);
  glow.userData.projectId = project.id;

  const planetWrap = new Group();
  planetWrap.add(mesh);
  planetWrap.add(glow);
  planetWrap.position.set(
    Math.cos(project.phase) * project.orbitRadius,
    0,
    Math.sin(project.phase) * project.orbitRadius,
  );

  let ring: Mesh | undefined;
  if (project.hasRing) {
    const ringGeometry = new RingGeometry(radius * 1.35, radius * 2, 64);
    const ringMaterial = new MeshBasicMaterial({
      color: new Color(project.ringColor ?? project.color),
      transparent: true,
      opacity: 0.5,
      side: DoubleSide,
      depthWrite: false,
    });
    ring = new Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2 - 0.4;
    planetWrap.add(ring);
  }

  rootGroup.add(planetWrap);

  // Orbit ring (a circle in the planet's tilted reference frame).
  const orbitGeometry = new BufferGeometry();
  const orbitPositions = new Float32Array((ORBIT_SEGMENTS + 1) * 3);
  for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
    const angle = (i / ORBIT_SEGMENTS) * Math.PI * 2;
    orbitPositions[i * 3] = Math.cos(angle) * project.orbitRadius;
    orbitPositions[i * 3 + 1] = 0;
    orbitPositions[i * 3 + 2] = Math.sin(angle) * project.orbitRadius;
  }
  orbitGeometry.setAttribute('position', new BufferAttribute(orbitPositions, 3));
  const orbitMaterial = new LineBasicMaterial({
    color: new Color(project.color),
    transparent: true,
    opacity: 0.18,
  });
  const orbitLine = new Line(orbitGeometry, orbitMaterial);
  rootGroup.add(orbitLine);

  const entry: PlanetEntry = {
    project,
    group: planetWrap,
    mesh,
    glow,
    orbitLine,
    ring,
  };

  return { entry, rootGroup };
}
