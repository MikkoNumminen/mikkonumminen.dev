/**
 * Name-state target positions for the unified particle field.
 *
 * PLACEHOLDER — the real implementation (rasterising "MIKKO NUMMINEN" on
 * a hidden 2D canvas and sampling glyph pixels into world-space targets)
 * lands in the name-formation step of the particle-field rewrite. Until
 * then the field's formation state is never driven above 0, so these
 * targets are unreachable; the stub exists so the geometry's attribute
 * layout (and everything downstream of it) is final from day one.
 *
 * The stub shape is a flat ellipsoid where the name will sit, so if the
 * formation uniform is ever driven early the result is a soft blob at
 * the right screen position rather than a degenerate point.
 */

export interface NameTargetStubOptions {
  count: number;
  /** Ellipsoid semi-axes, world units. */
  semiX?: number;
  semiY?: number;
  semiZ?: number;
  /** World-space centre of the name block. */
  centerY?: number;
  random?: () => number;
}

export function generateNameTargetsStub(opts: NameTargetStubOptions): Float32Array {
  const {
    count,
    semiX = 9,
    semiY = 3.5,
    semiZ = 1.2,
    centerY = 0.5,
    random = Math.random,
  } = opts;

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform direction, centre-biased radius — reads as a dense soft
    // blob rather than a hollow shell.
    const r = Math.pow(random(), 0.55);
    const cosPhi = 2 * random() - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const theta = random() * Math.PI * 2;

    const i3 = i * 3;
    positions[i3] = sinPhi * Math.cos(theta) * r * semiX;
    positions[i3 + 1] = cosPhi * r * semiY + centerY;
    positions[i3 + 2] = sinPhi * Math.sin(theta) * r * semiZ;
  }
  return positions;
}
