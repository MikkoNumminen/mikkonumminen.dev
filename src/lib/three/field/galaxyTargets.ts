/**
 * Galaxy-state target positions for the unified particle field.
 *
 * Positions are generated in the galaxy's LOCAL disk space (spiral in the
 * xy plane, thickness on z, centred on the origin). The vertex shader
 * spins the disk around local z, applies the fixed tilt, and translates
 * to the galaxy anchor — so the same attribute data serves every frame
 * without CPU rewrites.
 *
 * Math ported from the previous `buildGalaxyLayer` spiral generator so
 * the galaxy silhouette carries over. Pure function; `random` is
 * injectable so tests can run deterministically.
 */

export interface GalaxyTargetOptions {
  count: number;
  /** Disk radius in world units. */
  radius: number;
  arms?: number;
  spiralTightness?: number;
  /** Disk thickness on local z. */
  diskThickness?: number;
  random?: () => number;
}

export function generateGalaxyTargets(opts: GalaxyTargetOptions): Float32Array {
  const {
    count,
    radius,
    arms = 3,
    spiralTightness = 2.5,
    diskThickness = 0.8,
    random = Math.random,
  } = opts;

  const positions = new Float32Array(count * 3);
  const armOffset = (Math.PI * 2) / arms;

  for (let i = 0; i < count; i++) {
    const arm = i % arms;
    // sqrt distribution concentrates stars toward the core, matching how
    // real disks brighten inward and how the old galaxy read on screen.
    const t = Math.sqrt(i / count);
    const r = t * radius;
    const angle = arm * armOffset + t * Math.PI * spiralTightness;
    const finalAngle = angle + (random() - 0.5) * 0.45;
    const finalR = r + (random() - 0.5) * 0.6;

    const i3 = i * 3;
    positions[i3] = Math.cos(finalAngle) * finalR;
    positions[i3 + 1] = Math.sin(finalAngle) * finalR;
    positions[i3 + 2] = (random() - 0.5) * diskThickness;
  }
  return positions;
}
