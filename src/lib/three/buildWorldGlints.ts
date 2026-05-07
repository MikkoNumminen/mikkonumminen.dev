import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Points,
  PointsMaterial,
  type Texture,
} from 'three';

export interface GlintCluster {
  points: Points;
  geometry: BufferGeometry;
  material: PointsMaterial;
  /** Pulse frequency in Hz (cycles per second). */
  freq: number;
  /** Phase offset so the four worlds don't all pulse together. */
  phase: number;
}

export interface WorldGlintsHandle {
  group: Group;
  clusters: GlintCluster[];
  texture: Texture;
}

/**
 * Four small additive-blended particle clusters that twinkle ON the surface
 * of the title in the colors of the four worlds — galaxy blue (projects),
 * phosphor green (contact), warm amber (experience), chrome white (home).
 *
 * Each cluster pulses its material opacity on its own frequency and phase,
 * so at any moment some worlds are visible and others are dimmed — the
 * visual is "the four worlds breathing on the metal", not a synchronized
 * disco. The clusters are positioned slightly in front of the title
 * (z ≈ +0.7) so they read as decoration ON the letterforms rather than
 * floating in front or sitting behind.
 *
 * Positions are seeded so they're stable across reloads — same arrangement
 * every visit, no jarring re-roll on refresh.
 */

const PARTICLES_PER_WORLD = 7;
const ZONE_WIDTH = 14;
const ZONE_HEIGHT = 8;
const ZONE_DEPTH = 0.8;
const ZONE_Z_OFFSET = 0.7;

interface WorldDef {
  color: number;
  freq: number;
  phase: number;
}

const WORLDS: WorldDef[] = [
  { color: 0x80a8ff, freq: 0.42, phase: 0 }, // projects — galaxy blue
  { color: 0x4ade80, freq: 0.58, phase: 1.7 }, // contact — phosphor green
  { color: 0xffb878, freq: 0.51, phase: 3.4 }, // experience — warm amber
  { color: 0xfff8e8, freq: 0.46, phase: 5.1 }, // home — chrome white
];

function makeGlintTexture(): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('makeGlintTexture: 2D context unavailable');

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.28, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.18)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Stable pseudo-random based on a seed — same positions on every reload.
 * Linear congruential generator; good enough for placing decorative dots.
 */
function seededRandom(seed: number): () => number {
  let state = (seed * 9301 + 49297) % 233280;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function generatePositions(count: number, seed: number): Float32Array {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (rand() - 0.5) * ZONE_WIDTH;
    positions[i3 + 1] = (rand() - 0.5) * ZONE_HEIGHT;
    positions[i3 + 2] = (rand() - 0.5) * ZONE_DEPTH + ZONE_Z_OFFSET;
  }
  return positions;
}

export function buildWorldGlints(): WorldGlintsHandle {
  const group = new Group();
  const texture = makeGlintTexture();

  const clusters: GlintCluster[] = WORLDS.map((world, i) => {
    const positions = generatePositions(PARTICLES_PER_WORLD, i + 1);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));

    const material = new PointsMaterial({
      color: world.color,
      size: 0.34,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      map: texture,
    });

    const points = new Points(geometry, material);
    group.add(points);

    return {
      points,
      geometry,
      material,
      freq: world.freq,
      phase: world.phase,
    };
  });

  return { group, clusters, texture };
}
