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
  type CanvasTexture,
} from 'three';
import type { LocalizedProject } from '../../../data/projects';
import { createGlowMaterial } from '../createGlowMaterial';
import { PLANET_BASE_RADIUS } from './constants';
import { buildPlanetTexture } from './buildPlanetTexture';

export interface PlanetEntry {
  project: LocalizedProject;
  /** The orbit-positioned wrapper that holds mesh, glow, and optional ring. */
  group: Group;
  mesh: Mesh;
  glow: Mesh;
  orbitLine: Line;
  ring?: Mesh;
  /** Procedural surface textures — owned by the entry so dispose can free them. */
  surfaceMap: CanvasTexture;
  bumpMap: CanvasTexture;
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
  const geometry = new SphereGeometry(radius, 48, 48);
  const baseColor = new Color(project.color);
  // Procedural surface texture + bump map — gives each planet a distinct
  // identity (gas giant bands, lava ridges, ice frost, vegetation,
  // craters) instead of a flat coloured sphere. `bumpScale` is per-style:
  // gas giants stay near 0 (cloud bands aren't surface relief), rocky /
  // volcanic worlds push higher.
  const {
    map: surfaceMap,
    bumpMap,
    bumpScale,
  } = buildPlanetTexture(project.id, baseColor.getHex());
  const material = new MeshStandardMaterial({
    map: surfaceMap,
    bumpMap,
    bumpScale,
    // White multiplier so the texture's colors come through unmuddied.
    color: 0xffffff,
    // Heavy matte (Spacepotatis uses 0.95) so specular highlights from
    // the sun don't blow out the texture detail across the whole face.
    roughness: 0.95,
    metalness: 0.0,
    // No emissive — even at 0.06 it laid a flat brand-color tint over
    // every pixel of the texture, masking the gas-giant bands / lava
    // ridges / vegetation patches we worked to generate. Brand color
    // is conveyed by the per-planet glow halo and the texture's own
    // palette ramp (which is derived from the brand color).
  });
  const mesh = new Mesh(geometry, material);
  mesh.userData.projectId = project.id;

  // Glow tightened from 1.55× → 1.18× radius and intensity 0.9 → 0.5.
  // The earlier values made the halo bigger than the planet body, which
  // (combined with the small default zoom) hid the procedural surface
  // texture entirely — every planet read as a soft glowing dot. Smaller
  // halo lets the textured sphere dominate the visual.
  const glowMaterial = createGlowMaterial({
    color: project.color,
    falloff: 0.6,
    intensity: 0.5,
  });
  const glow = new Mesh(new SphereGeometry(radius * 1.18, 24, 24), glowMaterial);
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
    surfaceMap,
    bumpMap,
  };

  return { entry, rootGroup };
}
