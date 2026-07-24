/**
 * Every tuning number the field's micro-life, click impulse, and idle
 * choreography read — deliberately ONE block, so the choreography can be
 * re-tuned without reading a line of shader logic.
 *
 * Shader-side values are injected into the GLSL source as compile-time
 * `const float` literals (see `buildVertexShader` in buildParticleField),
 * not uploaded as uniforms: the driver constant-folds them, so a knob
 * here costs nothing per frame. JS-side values (idle delays) are read
 * directly by homeScene.
 *
 * Distances are world units. At the home camera (fov 50, z 26) one world
 * unit is ~44.6 px on a 1080p-tall viewport, and a glyph stem of the
 * formed name is ~0.43 world (~19 px) — the reference every micro-life
 * amplitude below is sized against.
 */

/**
 * Format a JS number as a GLSL float literal. `1` alone is an *int*
 * literal in GLSL and fails to compile where a float is expected, so the
 * decimal point is mandatory; exponent notation is expanded because the
 * shader is easier to read (and diff) without it.
 */
export function glslFloat(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`glslFloat: refusing to emit non-finite value ${n}`);
  }
  const plain = Number.isInteger(n) ? `${n}.0` : `${n}`;
  if (!plain.includes('e') && !plain.includes('E')) return plain;
  // Exponent form only shows up for values far outside this module's
  // range; expanding keeps the emitted shader source human-readable.
  const expanded = n.toFixed(12).replace(/0+$/, '');
  return expanded.endsWith('.') ? `${expanded}0` : expanded;
}

export const FIELD_TUNING = {
  /**
   * Life in the formed-name state. The name must never be fully static,
   * and must never stop being legible — every amplitude here is sized
   * against the ~0.43 world glyph stem noted above.
   */
  microLife: {
    /** Slow-sway amplitude factor in the name state; multiplies uDriftAmp
     *  (0.4), so 0.11 ⇒ ~0.044 world ≈ 2 px. */
    nameSway: 0.11,
    /** Fast jitter amplitude, world units. Amplitude alone reads as a
     *  lean; the frequency below is what makes it a shimmer. */
    nameShimmer: 0.02,
    /** Jitter frequency in rad/s. */
    nameShimmerSpeed: 3.7,
    /** Twinkle amplitude in the name state (was 0.08 — near-frozen). */
    nameTwinkle: 0.12,

    /** Seconds for the brightness highlight to complete one cycle. */
    wavePeriod: 8,
    /** Radians of wave phase per world unit of name-space x. At the
     *  ~10 world-unit name width this is ~1.1 crests across the block. */
    waveFrequency: 0.7,
    /** Crest exponent — higher narrows the highlight into a band. */
    waveSharpness: 3,
    /** Peak alpha gain at the crest. Held low on purpose: additive
     *  blending plus bloom (luminanceThreshold 0.32) turns an over-driven
     *  crest into a marquee sweeping the letterforms. */
    waveGain: 0.18,

    /** Fraction of glyph particles ever eligible to stray. */
    strayFraction: 0.01,
    /** Seconds for one stray cycle (phase-offset per particle). */
    strayPeriod: 9,
    /** Fraction of that cycle actually spent off the glyph — with the
     *  fraction above, ~47 of 24k particles are displaced at any instant. */
    strayDuty: 0.3,
    /** Peak excursion, world units (~11 px). */
    strayDistance: 0.25,
  },
} as const;
