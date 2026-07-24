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

  /**
   * Clicking the formed name: a local strike, not the travelling ring
   * the background ripple uses. Particles scatter and reassemble on
   * per-particle timing so the name comes back together organically.
   */
  impulse: {
    /** Falloff radius on the z=0 plane, world units (~134 px). */
    radius: 3,
    /** Peak radial displacement at the epicentre, world units (~80 px). */
    push: 1.8,
    /** Seconds to reach full displacement. Zero would be a teleport and
     *  reads as a rendering glitch; ~4 frames reads as a strike. */
    attack: 0.06,
    /** Return window in seconds — each particle picks its own point in
     *  this range from its seed, so the name doesn't snap back as a unit. */
    returnMin: 1.5,
    returnMax: 2.5,
    /** Peak z displacement, world units, signed per particle. */
    lift: 0.6,
    /** Slack around the measured glyph box when hit-testing a click,
     *  world units — a click just off a stroke still counts as the name. */
    hitPadding: 0.5,
    /** uForm floor / uDissolve ceiling for a click to count as a name
     *  hit. Mid-formation or mid-scroll, the click is a background one. */
    minForm: 0.9,
    maxDissolve: 0.05,
  },

  /**
   * What the field does when nobody is doing anything. Only ever runs on
   * the formed name at the top of the page, and every path out of it
   * ends on the name — the name is what an interrupting visitor gets.
   */
  idle: {
    /** Seconds of continuous idleness before the first transition. */
    firstDelay: 12,
    /** Hold window per formation, seconds. Randomised inside the range
     *  so a visitor who stays a while never learns the beat. */
    holdMin: 20,
    holdMax: 30,
    /** Transition duration, seconds — paced to the load-in formation's
     *  unhurried quality, not to UI-crossfade speed. */
    transition: 3,
    /** Return-to-name duration, seconds. Covers both routes back: a
     *  deliberate interruption and a tab regaining focus. */
    returnDuration: 0.9,
    /** Multiplier on that return once the scrub has taken over. The
     *  dissolve is already moving the field somewhere else and two
     *  owners of one morph must not overlap; mirrors FORM_CATCHUP. */
    scrubCatchup: 4,
    /** uDissolve at or below which idle may arm. Not exactly zero: a
     *  restore landing a pixel down the page must not lock the
     *  choreography out for the whole visit. */
    maxDissolve: 0.002,
    /** Ceiling on the delta a single advance may consume, seconds. A tab
     *  that was never visible hands its first real frame a delta of the
     *  entire time the page sat in the background; without this the
     *  clock swallows it whole and opens on a transition nobody idled
     *  for. Well above a hitched frame, far below any idle window. */
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

    /** Free-floating calm field: a centred ellipsoid, widened on x so it
     *  fills a landscape frame. World units. */
    sparseRadius: 11,
    sparseAspect: 1.5,
    sparseDepth: 0.7,

    /** Per-shape presentation, blended by the same weights the shader
     *  uses for geometry: [galaxy, wordmark, sparse]. The sparse field
     *  earns its name here — density and brightness drop rather than the
     *  particle count changing. */
    shapeBrightness: [1, 1.05, 0.6],
    shapeDensity: [1, 1, 0.45],
    shapeBloom: [1, 0.45, 0.25],
  },
} as const;
