import * as THREE from 'three';
import type { LocalizedProject } from '../../../data/projects';
import { createGlowMaterial } from '../createGlowMaterial';

export interface PlanetEntry {
  project: LocalizedProject;
  /** The orbit-positioned wrapper that holds mesh, glow, and optional ring. */
  group: THREE.Group;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  orbitLine: THREE.Line;
  ring?: THREE.Mesh;
}

const PLANET_BASE_RADIUS = 0.55;
const ORBIT_SEGMENTS = 128;

export function buildPlanet(project: LocalizedProject): {
  entry: PlanetEntry;
  /** The tilted parent group that should be added to the scene. */
  rootGroup: THREE.Group;
} {
  const rootGroup = new THREE.Group();
  rootGroup.rotation.x = project.tilt;

  const radius = PLANET_BASE_RADIUS * project.scale;
  const geometry = new THREE.SphereGeometry(radius, 36, 36);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(project.color),
    roughness: 0.55,
    metalness: 0.1,
    emissive: new THREE.Color(project.color).multiplyScalar(0.08),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.projectId = project.id;

  const glowMaterial = createGlowMaterial({
    color: project.color,
    falloff: 0.65,
    intensity: 0.9,
  });
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.55, 24, 24),
    glowMaterial,
  );
  glow.userData.projectId = project.id;

  const planetWrap = new THREE.Group();
  planetWrap.add(mesh);
  planetWrap.add(glow);
  planetWrap.position.set(
    Math.cos(project.phase) * project.orbitRadius,
    0,
    Math.sin(project.phase) * project.orbitRadius,
  );

  let ring: THREE.Mesh | undefined;
  if (project.hasRing) {
    const ringGeometry = new THREE.RingGeometry(radius * 1.35, radius * 2, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(project.ringColor ?? project.color),
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2 - 0.4;
    planetWrap.add(ring);
  }

  rootGroup.add(planetWrap);

  // Orbit ring (a circle in the planet's tilted reference frame).
  const orbitGeometry = new THREE.BufferGeometry();
  const orbitPositions = new Float32Array((ORBIT_SEGMENTS + 1) * 3);
  for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
    const angle = (i / ORBIT_SEGMENTS) * Math.PI * 2;
    orbitPositions[i * 3] = Math.cos(angle) * project.orbitRadius;
    orbitPositions[i * 3 + 1] = 0;
    orbitPositions[i * 3 + 2] = Math.sin(angle) * project.orbitRadius;
  }
  orbitGeometry.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
  const orbitMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(project.color),
    transparent: true,
    opacity: 0.18,
  });
  const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
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
