/**
 * Pure half of the name-state target pipeline: distribute the field's
 * particles over the glyph sample points produced by the rasteriser
 * (nameTargets.ts), with the remainder becoming dimmed background dust.
 *
 * Split from the canvas work so this logic runs under jsdom — the
 * rasteriser itself needs a real 2D context and is covered by the
 * browser verification pass instead.
 */

export interface DistributeNameTargetsOptions {
  /** Glyph sample points as [x, y] pairs in world units (len = 2*n). */
  candidates: Float32Array;
  /**
   * Optional per-candidate dim value in 0..1 (len = n), for a shape whose
   * own ink is not uniformly bright. Absent means every glyph point is
   * fully lit, which is what the name and the wordmark want.
   *
   * The CV block uses it to fade its unreadable tail: dim is already the
   * channel the shader shrinks and darkens a particle through, so a
   * continuous value gets the fade for free rather than needing a second
   * attribute. Nothing here assumes the flag is binary.
   */
  candidateDim?: Float32Array;
  /** Total particle count to assign. */
  count: number;
  /** Fraction of particles that become background dust (not glyphs). */
  dustFraction?: number;
  /** Depth jitter for glyph particles — keeps the name subtly volumetric
   *  while staying legible. */
  glyphDepth?: number;
  /** Dust cloud half-extents; sits behind the name plane. */
  dustHalfWidth?: number;
  dustHalfHeight?: number;
  dustZMin?: number;
  dustZMax?: number;
  random?: () => number;
}

/** Axis-aligned box around the glyph ink at unit scale, world units.
 *  Degenerate (all zeros) when there were no glyph candidates. */
export interface NameBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface NameTargetSet {
  /** World-space positions at unit scale (len = count*3). */
  positions: Float32Array;
  /** Per-particle dim flag: 0 = glyph (full brightness), 1 = dust
   *  (dimmed hard while the name is formed). len = count. */
  dim: Float32Array;
  /** Where the letterforms actually are. Measured from the sampled ink
   *  rather than hardcoded from the raster geometry, so it survives font
   *  substitution and copy changes — the click hit-test reads it. */
  bounds: NameBounds;
}

const EMPTY_BOUNDS: NameBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

/**
 * Is a world-space point inside the name's ink box at the given scale?
 * `uNameScale` multiplies the whole name block in the shader, so the box
 * scales with it. Pure so the hit-test is testable without a GL context.
 */
export function isInsideNameBounds(
  bounds: NameBounds,
  scale: number,
  x: number,
  y: number,
  padding = 0,
): boolean {
  if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return false;
  return (
    x >= bounds.minX * scale - padding &&
    x <= bounds.maxX * scale + padding &&
    y >= bounds.minY * scale - padding &&
    y <= bounds.maxY * scale + padding
  );
}

export function distributeNameTargets(opts: DistributeNameTargetsOptions): NameTargetSet {
  const {
    candidates,
    candidateDim,
    count,
    dustFraction = 0.35,
    glyphDepth = 0.35,
    dustHalfWidth = 16,
    dustHalfHeight = 9,
    dustZMin = -6,
    dustZMax = -2,
    random = Math.random,
  } = opts;

  const candidateCount = Math.floor(candidates.length / 2);
  const positions = new Float32Array(count * 3);
  const dim = new Float32Array(count);
  const glyphCount = candidateCount > 0 ? Math.round(count * (1 - dustFraction)) : 0;

  // Measured over every candidate, not just the ones a particle lands
  // on: the box describes where the letterforms ARE, independent of how
  // many particles the field happens to be carrying.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let c = 0; c < candidateCount; c++) {
    const x = candidates[c * 2] ?? 0;
    const y = candidates[c * 2 + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const bounds: NameBounds =
    candidateCount > 0 ? { minX, maxX, minY, maxY } : { ...EMPTY_BOUNDS };

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    if (i < glyphCount) {
      // Even spatial coverage in both regimes. More candidates than
      // particles: stride through the (row-major) sample list so the
      // whole glyph area is subsampled uniformly — a naive first-N pick
      // would cover only the top of the letters. Fewer candidates than
      // particles: cycle so every glyph pixel is hit at least once.
      const c =
        candidateCount > glyphCount
          ? Math.floor((i * candidateCount) / glyphCount)
          : i % candidateCount;
      positions[i3] = candidates[c * 2] ?? 0;
      positions[i3 + 1] = candidates[c * 2 + 1] ?? 0;
      positions[i3 + 2] = (random() - 0.5) * glyphDepth;
      dim[i] = candidateDim?.[c] ?? 0;
    } else {
      positions[i3] = (random() * 2 - 1) * dustHalfWidth;
      positions[i3 + 1] = (random() * 2 - 1) * dustHalfHeight;
      positions[i3 + 2] = dustZMin + random() * (dustZMax - dustZMin);
      dim[i] = 1;
    }
  }

  return { positions, dim, bounds };
}
