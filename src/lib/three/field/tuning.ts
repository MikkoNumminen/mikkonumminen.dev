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
 * PER-SHAPE ARRAYS are indexed by SHAPES (LANE) order: [name, galaxy,
 * wordmark, sparse, cv]. The first four are mirrored by the shader's
 * weight vec4 and the fifth by the scalar riding beside it; changing the
 * order means changing the shader, `shapeCycle.ts` and `homeScene.ts`
 * together. The order shapes are SHOWN in is `CYCLE_ORDER`, which is
 * deliberately different.
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

/**
 * LANE order, mirrored by the shader's weight vector. `cv` is appended
 * rather than inserted at its cycle position on purpose: the first four
 * occupy a `vec4` and the fifth rides a separate scalar, so appending
 * leaves every existing lane index, per-shape table row and GLSL swizzle
 * exactly where it was. Inserting would have renumbered `word` and
 * `sparse` across three files and seven tables, and ADR 0016 records that
 * this field's state masks fail QUIETLY when they disagree.
 *
 * Lane order is therefore NOT the order the shapes appear in. That is
 * `CYCLE_ORDER` below.
 */
export const SHAPES = ['name', 'galaxy', 'word', 'sparse', 'cv'] as const;
export type FieldShape = (typeof SHAPES)[number];

/**
 * The order shapes are actually shown in, as lane indices.
 *
 * `cv` is third so it arrives out of the galaxy, which is the most
 * theatrical entrance in the rotation: a disk of stars resolving into
 * readable prose. It also puts the two text shapes apart rather than
 * back to back.
 *
 * Typed as `readonly number[]` rather than a literal tuple so the cycle
 * walker can `indexOf` a plain lane index without a cast. `fifthLane.test`
 * holds the property the literal type would have implied: every lane
 * appears exactly once.
 */
export const CYCLE_ORDER: readonly number[] = [0, 1, 4, 2, 3];

/**
 * Emit a per-shape table as the GLSL pair the shader reads: a `vec4` for
 * the first four lanes and a `float` for the fifth.
 *
 * A single generator rather than two hand-written interpolations, because
 * the fifth lane is exactly the kind of half-applied change ADR 0016 warns
 * about. Interpolating a five-entry array straight into `vec4(...)` is at
 * least a loud compile error; forgetting the companion float is not, and
 * would silently give the CV shape another shape's value. Here a table of
 * the wrong length throws at module load instead.
 */
export function glslShapeTable(name: string, table: readonly number[]): string {
  if (table.length !== SHAPES.length) {
    throw new Error(
      `glslShapeTable: ${name} has ${table.length} entries, expected ${SHAPES.length}`,
    );
  }
  const fifth = table[4];
  if (fifth === undefined) {
    throw new Error(`glslShapeTable: ${name} is missing its fifth lane`);
  }
  const head = table
    .slice(0, 4)
    .map((n) => glslFloat(n))
    .join(', ');
  return `const vec4 ${name} = vec4(${head});\nconst float ${name}_CV = ${glslFloat(fifth)};`;
}

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
    /** Seconds a shape is held still before the next morph begins.
     *  Per-shape overrides live in `shapeHold`; this is the default the
     *  non-text shapes use. */
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
     * Seconds each shape is held, by LANE index. The CV shape is the one
     * outlier and the reason this is a table rather than a scalar: 5
     * seconds is ample for a wordmark and nowhere near enough to read a
     * paragraph, which is the whole point of that formation.
     */
    shapeHold: [5, 5, 5, 5, 11],

    /**
     * Per-shape presentation, indexed by LANE order
     * [name, galaxy, wordmark, sparse, cv] and blended by the same weights
     * the shader uses for geometry. Every array MUST carry all five
     * entries — a missing `name` row renders the name at zero.
     */
    shapeBrightness: [1.12, 1, 1.05, 0.6, 1.9],
    shapeDensity: [1, 1, 1, 0.45, 1],
    shapeBloom: [0.35, 1, 0.45, 0.25, 0.12],
    /**
     * Point-size multiplier per shape. Exists entirely for the CV shape.
     * The base 13px sprite is sized against the name's ~40px stroke, and
     * on the CV block's ~2.5px body-text stroke it bleeds about 5px past
     * the letterform in every direction: the counters of a, e and o fill
     * in and neighbouring letters merge into a glowing ribbon. Measured
     * against the rasteriser at 13px, 6px and 2.6px, 6px was the size that
     * read cleanly, hence 0.45. Bloom comes down for the same reason, and
     * brightness goes up to pay for the light a smaller sprite loses.
     */
    shapeSize: [1, 1, 1, 1, 0.45],
    /**
     * Micro-life scale per shape. The base amplitudes are sized against
     * the NAME's ~0.43 world stroke; the wordmark's stroke is roughly a
     * third of that, so unscaled shimmer visibly wobbles the mark and
     * unscaled strays read as debris around it. The two non-text shapes
     * have no legibility budget at all and can move far more freely —
     * the sparse cloud is the one that otherwise looks still.
     */
    shapeLife: [1, 1.6, 0.4, 2.2, 0.18],
    /**
     * Slow-sway amplitude factor per shape; multiplies uDriftAmp (0.4).
     * Sparse deliberately matches the 0.55 the scroll transition already
     * uses — that starfield drift is the motion being asked for.
     */
    shapeSway: [0.11, 0.4, 0.09, 0.55, 0.05],
    /** Twinkle amplitude per shape. */
    shapeTwinkle: [0.12, 0.24, 0.1, 0.22, 0.05],
    /**
     * Brightness-wave spatial frequency per shape, radians per world
     * unit. Tuned to each shape's width: one constant sized for the
     * name's ~10 world span paints repeating stripes across the 33-world
     * sparse cloud instead of a single travelling highlight.
     */
    shapeWaveFreq: [0.7, 0.28, 0.9, 0.16, 0.3],
  },
} as const;
