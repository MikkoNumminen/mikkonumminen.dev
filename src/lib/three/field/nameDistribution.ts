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

export interface NameTargetSet {
  /** World-space positions at unit scale (len = count*3). */
  positions: Float32Array;
  /** Per-particle dim flag: 0 = glyph (full brightness), 1 = dust
   *  (dimmed hard while the name is formed). len = count. */
  dim: Float32Array;
}

export function distributeNameTargets(opts: DistributeNameTargetsOptions): NameTargetSet {
  const {
    candidates,
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
      dim[i] = 0;
    } else {
      positions[i3] = (random() * 2 - 1) * dustHalfWidth;
      positions[i3 + 1] = (random() * 2 - 1) * dustHalfHeight;
      positions[i3 + 2] = dustZMin + random() * (dustZMax - dustZMin);
      dim[i] = 1;
    }
  }

  return { positions, dim };
}
