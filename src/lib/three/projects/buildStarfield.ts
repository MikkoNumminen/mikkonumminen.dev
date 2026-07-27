/**
 * The deep-space backdrop for the projects scene: stars scattered on a
 * spherical shell (radius 60-200) and coloured from a 3-stop cool palette,
 * wrapped into a single `THREE.Points` cloud. Distribution invariants are
 * covered by buildStarfield.test.ts.
 *
 * Two constraints shape the numbers. The home page's field states the same
 * visual language — sparse, cool, size-attenuated points — so this reads as
 * the same sky rather than a different one. And every star has to stay below
 * the bloom threshold the composer uses: a backdrop that blooms competes with
 * the bodies for attention and lifts the whole frame off black. That is what
 * STAR_MAX_LUMINANCE is for, and it is asserted rather than eyeballed.
 */
import { BufferGeometry, Color, Points, PointsMaterial } from 'three';
import { buildPointCloud } from '../buildPointCloud';

export interface Starfield {
  points: Points;
  geometry: BufferGeometry;
  material: PointsMaterial;
}

const STAR_COUNT = 1100;
const STAR_COUNT_LOW = 600;

/**
 * Ceiling on a star's rendered luminance, held under the composer's bloom
 * threshold (0.55) with margin. Enforced by opacity, and pinned by test.
 */
export const STAR_MAX_LUMINANCE = 0.42;
const STAR_RADIUS_MIN = 60;
const STAR_RADIUS_RANGE = 140;
const STAR_PALETTE: readonly Color[] = [
  new Color(0xffffff),
  new Color(0xc8d8ff),
  new Color(0xfff0c8),
];

export function buildStarfield(opts: { lowPerf?: boolean } = {}): Starfield {
  const count = opts.lowPerf ? STAR_COUNT_LOW : STAR_COUNT;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const radius = STAR_RADIUS_MIN + Math.random() * STAR_RADIUS_RANGE;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);
    // Random integer in [0, STAR_PALETTE.length); the array is non-empty
    // so the lookup is always defined.
    const color = STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)]!;
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
  }

  const material = new PointsMaterial({
    size: 0.4,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: STAR_MAX_LUMINANCE,
    depthWrite: false,
  });

  return buildPointCloud({ positions, colors, material });
}
