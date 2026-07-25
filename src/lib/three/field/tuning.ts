/**
 * Every tuning number the field's micro-life, click impulse, and shape
 * cycle read — deliberately ONE block, so the choreography can be
 * re-tuned without reading a line of shader logic.
 *
 * Shader-side values are injected into the GLSL source as compile-time
 * `const float` literals (see the shader in buildParticleField), not
 * uploaded as uniforms: the driver constant-folds them, so a knob here
 * costs nothing per frame. JS-side values are read directly by
 * homeScene.
 *
 * Distances are world units. At the home camera (fov 50, z 26) one world
 * unit is ~44.6 px on a 1080p-tall viewport, and a glyph stem of the
 * formed name is ~0.43 world (~19 px) — the reference every micro-life
 * amplitude below is sized against.
 *
 * PER-SHAPE ARRAYS are indexed by SHAPES order: [name, galaxy, wordmark,
 * sparse]. That order is mirrored by the shader's weight vec4 and by
 * `shapeCycle.ts`; changing it means changing all three.
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

/** Shape order, mirrored by the shader's weight vec4. */
export const SHAPES = ['name', 'galaxy', 'word', 'sparse'] as const;
export type FieldShape = (typeof SHAPES)[number];

export const FIELD_TUNING = {
  /**
   * Life inside whatever shape the field currently holds. No shape is
   * ever fully static, and the text shapes must never stop being
   * legible — every amplitude here is sized against the ~0.43 world
   * glyph stem noted above, then scaled per shape by `shapeLife`.
   */
  microLife: {
    /** Fast jitter amplitude, world units, at shapeLife 1. Amplitude
     *  alone reads as a lean; the frequency below makes it a shimmer. */
    shimmer: 0.02,
    /** Jitter frequency in rad/s. */
    shimmerSpeed: 3.7,

    /** Seconds for the brightness highlight to complete one cycle. */
    wavePeriod: 8,
    /** Crest exponent — higher narrows the highlight into a band. */
    waveSharpness: 3,
    /** Peak alpha gain at the crest. Held low on purpose: additive
     *  blending plus bloom (luminanceThreshold 0.32) turns an
     *  over-driven crest into a marquee. */
    waveGain: 0.18,

    /** Fraction of a shape's particles ever eligible to stray. */
    strayFraction: 0.01,
    /** Seconds for one stray cycle (phase-offset per particle). */
    strayPeriod: 9,
    /** Fraction of that cycle actually spent off the shape. */
    strayDuty: 0.3,
    /** Peak excursion, world units, at shapeLife 1. */
    strayDistance: 0.25,
  },

  /**
   * Clicking whatever shape is on screen: a local strike, not the
   * travelling ring the background ripple uses. Particles scatter and
   * reassemble into the shape they were struck in.
   */
  impulse: {
    /** Falloff radius on the z=0 plane, world units (~134 px). */
    radius: 3,
    /** Peak radial displacement at the epicentre, world units. */
    push: 1.8,
    /** Seconds to reach full displacement. Zero would be a teleport and
     *  reads as a rendering glitch; ~4 frames reads as a strike. */
    attack: 0.06,
    /** Return window in seconds — each particle picks its own point in
     *  this range from its seed. Sized to finish comfortably inside one
     *  `cycle.hold`, so a strike resolves back into the shape it hit
     *  instead of being carried off into the next morph. */
    returnMin: 1,
    returnMax: 1.7,
    /** Peak z displacement, world units, signed per particle. */
    lift: 0.6,
    /** Slack around a shape's hit region when testing a click. */
    hitPadding: 0.5,
    /** uForm floor / uDissolve ceiling for a click to strike at all.
     *  Mid-formation or mid-scroll it is a background click. */
    minForm: 0.9,
    maxDissolve: 0.05,
  },

  /**
   * The shape cycle. NOT idle-gated — it runs continuously while the
   * lander is mounted, because the reshaping is the lander's behaviour
   * rather than a screensaver waiting for absence.
   */
  cycle: {
    /** Seconds a shape is held still before the next morph begins. */
    hold: 5,
    /** Seconds the morph itself takes. Paced to the load-in formation
     *  rather than to UI-crossfade speed. */
    transition: 3,
    /** Ceiling on the delta a single advance may consume, seconds. A
     *  safety bound on the input, not a design knob. */
    maxAdvance: 0.25,

    /** The galaxy again, but turned to face the viewer and centred —
     *  the same object seen differently, which is what makes it read as
     *  a variation rather than a rewind of the load-in. */
    galaxyVariant: {
      x: 0,
      y: 0,
      z: -8,
      scale: 1.35,
      spinRate: 0.06,
      tiltX: -0.32,
      tiltZ: 0.55,
    },
    /** Disk radius the variant is built from, world units — mirrors
     *  homeScene's GALAXY_RADIUS, and the hit test scales it. */
    galaxyRadius: 8,

    /** Free-floating calm field: a centred ellipsoid, widened on x so it
     *  fills a landscape frame. World units. */
    sparseRadius: 11,
    sparseAspect: 1.5,
    sparseDepth: 0.7,
    /** Hit radius for the sparse shape on the z=0 plane, world units.
     *  Deliberately far smaller than the cloud itself: the cloud covers
     *  most of the frame, and treating every click inside it as a strike
     *  would delete the commit-popup easter egg from a quarter of every
     *  cycle. Clicks near the middle strike; clicks out in the thin
     *  edges still ripple, which moves those particles anyway. */
    sparseHitRadius: 6,

    /**
     * Per-shape presentation, indexed [name, galaxy, wordmark, sparse]
     * and blended by the same weights the shader uses for geometry.
     * Every array MUST carry all four entries — a missing `name` row
     * renders the name at zero.
     */
    shapeBrightness: [1.12, 1, 1.05, 0.6],
    shapeDensity: [1, 1, 1, 0.45],
    shapeBloom: [0.35, 1, 0.45, 0.25],
    /**
     * Micro-life scale per shape. The base amplitudes are sized against
     * the NAME's ~0.43 world stroke; the wordmark's stroke is roughly a
     * third of that, so unscaled shimmer visibly wobbles the mark and
     * unscaled strays read as debris around it. The two non-text shapes
     * have no legibility budget at all and can move far more freely —
     * the sparse cloud is the one that otherwise looks still.
     */
    shapeLife: [1, 1.6, 0.4, 2.2],
    /**
     * Slow-sway amplitude factor per shape; multiplies uDriftAmp (0.4).
     * Sparse deliberately matches the 0.55 the scroll transition already
     * uses — that starfield drift is the motion being asked for.
     */
    shapeSway: [0.11, 0.4, 0.09, 0.55],
    /** Twinkle amplitude per shape. */
    shapeTwinkle: [0.12, 0.24, 0.1, 0.22],
    /**
     * Brightness-wave spatial frequency per shape, radians per world
     * unit. Tuned to each shape's width: one constant sized for the
     * name's ~10 world span paints repeating stripes across the 33-world
     * sparse cloud instead of a single travelling highlight.
     */
    shapeWaveFreq: [0.7, 0.28, 0.9, 0.16],
  },
} as const;
