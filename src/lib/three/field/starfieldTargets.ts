/**
 * Starfield-state target positions for the unified particle field: a
 * sparse, calm volume that fills the fixed camera's view with depth once
 * the hero dissolves. Generated in world space (the camera never moves
 * from its +z perch), sized generously on x so ultra-wide viewports stay
 * covered — off-frustum particles on narrow screens are wasted vertices,
 * but at the field's budget that waste is cheaper than re-generating on
 * resize.
 *
 * Pure function; `random` is injectable so tests can run deterministically.
 */

export interface StarfieldTargetOptions {
  count: number;
  /** Half-extent on x, world units. */
  halfWidth?: number;
  /** Half-extent on y, world units. */
  halfHeight?: number;
  /** Depth range [zMin, zMax]. Keep zMax well short of the camera so no
   *  star balloons to a screen-filling sprite via size attenuation. */
  zMin?: number;
  zMax?: number;
  random?: () => number;
}

export function generateStarfieldTargets(opts: StarfieldTargetOptions): Float32Array {
  const {
    count,
    halfWidth = 46,
    halfHeight = 30,
    zMin = -50,
    zMax = 6,
    random = Math.random,
  } = opts;

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (random() * 2 - 1) * halfWidth;
    positions[i3 + 1] = (random() * 2 - 1) * halfHeight;
    positions[i3 + 2] = zMin + random() * (zMax - zMin);
  }
  return positions;
}
