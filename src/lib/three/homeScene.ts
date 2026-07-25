/**
 * Home page (`/`) scene: ONE continuous particle field on a fixed,
 * full-viewport canvas behind the whole page (opaque, cleared in the
 * page's own ink — see the createRenderer call below). The field
 * morphs between three states — galaxy (load-in), name ("MIKKO
 * NUMMINEN" formation), and starfield (persistent background for every
 * content section) — driven entirely by uniforms; see
 * `field/buildParticleField.ts` for the state model.
 *
 * Scroll stays off the critical path by construction: GSAP ScrollTrigger
 * callbacks write plain numbers through the {@link HomeSceneHandle}, the
 * tick loop copies them into uniforms, and the vertex shader does the
 * rest. No per-frame allocations, no layout reads, no CPU per-particle
 * work.
 *
 * The scene is only ever constructed on the full-motion desktop path —
 * the boot script in HomePage.astro skips it for reduced-motion and
 * small-screen clients (they get the static DOM fallback and the canvas
 * is display:none), so unlike the previous implementation there is no
 * internal reduced-motion branching.
 */
import {
  Color,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector4,
} from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { createRenderer } from './createRenderer';
import { createResizeHandler } from './createResizeHandler';
import { readPerfFlags } from '../debug/perfFlags';
import {
  mountPerfOverlay,
  formatPerfOverlayLabel,
  type PerfOverlayHandle,
} from '../debug/perfOverlay';
import { buildParticleField } from './field/buildParticleField';
import { generateGalaxyTargets } from './field/galaxyTargets';
import { generateStarfieldTargets } from './field/starfieldTargets';
import { rasterizeNameTargets } from './field/nameTargets';
import { isInsideNameBounds } from './field/nameDistribution';
import { rasterizeWordmarkTargets } from './field/wordmarkTargets';
import { createShapeCycle } from './field/shapeCycle';
import { FIELD_TUNING, SHAPES } from './field/tuning';
import { makeRadialSpriteTexture } from './textures';
import { easeOutCubic } from './easing';

export interface HomeSceneOptions {
  canvas: HTMLCanvasElement;
  /**
   * Fired whenever a ripple actually launches (background clicks and the
   * programmatic {@link HomeSceneHandle.ripple} alike, in viewport
   * coordinates). The commit-message popup layer subscribes here — the
   * scene stays presentation-only and knows nothing about popups.
   */
  onRipple?: (clientX: number, clientY: number) => void;
  /**
   * Fired once, the first time the name formation reaches completion.
   * The boot script hangs the once-per-session discoverability hint off
   * this — the scene itself never decides to show hints.
   */
  onFormed?: () => void;
}

/**
 * Imperative handle to the mounted field. The caller owns the lifecycle:
 * `dispose()` once on route change releases the WebGL context, GPU
 * resources, and listeners. Every setter is a plain number write — safe
 * to call from ScrollTrigger callbacks at scroll rate.
 */
export interface HomeSceneHandle {
  /** Whole-document scroll progress 0→1; drives the subtle global drift. */
  setScrollProgress: (progress: number) => void;
  /** Hero-scrub progress 0→1: name/galaxy dissolves into the starfield. */
  setDissolve: (progress: number) => void;
  /** Launch a field ripple from a viewport position (used by the
   *  discoverability hint; background clicks route here internally). */
  ripple: (clientX: number, clientY: number, strength?: number) => void;
  /** Per-section mood: palette hue rotation (degrees) plus density and
   *  drift multipliers. Values arrive pre-blended from the timeline. */
  setMood: (hue: number, density: number, drift: number) => void;
  /** Release the renderer, all GPU resources, and listeners. Call once. */
  dispose: () => void;
  /** Re-fit the field after a viewport / orientation change. */
  resize: () => void;
  /**
   * Resolves once the scene has proven itself warm: shaders compiled and
   * two consecutive real frames rendered under the jank threshold (or a
   * frame-count cap, so a slow-but-steady machine still resolves). The
   * loading gate reveals on this — measured ready, not assumed.
   */
  whenReady: () => Promise<void>;
  /**
   * Start the load-in choreography (galaxy hold → name formation).
   * Called by the boot script at gate reveal so the formation never
   * plays out invisibly behind the overlay. Idempotent.
   */
  startIntro: () => void;
  /**
   * Jump straight to the fully-formed state, skipping the galaxy→name
   * intro. Used for back/forward restores that land mid-page — replaying
   * the formation inside a scrolled view is nonsense; the correct state
   * there is the formed field at its scrubbed dissolve. Suppresses
   * `onFormed`, so the discoverability hint never fires off a restore.
   */
  snapFormed: () => void;
}

const CAMERA_Z = 26;
const CAMERA_FOV = 50;

// Galaxy anchor — left third of the frame, pushed back, mirroring the
// old scene's editorial layout. X is clamped on resize so narrow
// viewports never clip the disk (see fitGalaxyX below).
const GALAXY_DESIGN_X = -14;
const GALAXY_Y = -2;
const GALAXY_Z = -14;
const GALAXY_RADIUS = 8;
const GALAXY_LEFT_PADDING = 1;
const GALAXY_SPIN_RATE = -0.04;

// Name block design width at uNameScale=1 plus the frustum padding the
// fit math preserves on either side.
const NAME_DESIGN_HALF_WIDTH = 10;
const NAME_FIT_PADDING = 1.5;

// State-blended palettes. Galaxy/name share the richer pair; the
// starfield dims toward the cool end so page text always wins contrast.
const GALAXY_COLOR_A = new Color('#a8c0ff');
const GALAXY_COLOR_B = new Color('#fff1dc');
const STAR_COLOR_A = new Color('#8fa3c8');
const STAR_COLOR_B = new Color('#d8e0f2');
const GALAXY_BRIGHTNESS = 1.0;
const STARFIELD_BRIGHTNESS = 0.5;

// Elements whose clicks belong to real UI — never converted into field
// ripples. `[data-no-ripple]` opts out anything else (e.g. the data-feed
// widget, which has its own click response).
const RIPPLE_EXCLUDE_SELECTOR =
  'a, button, input, textarea, select, summary, [data-no-ripple]';

// Clicks landing on running text still ripple the field (the page is one
// material), just slightly stronger so the response reads as deliberate.
const TEXT_TARGET_SELECTOR = 'p, h1, h2, h3, h4, li, blockquote, figcaption';

// Load-in choreography: hold the pure galaxy briefly, then form the name
// over FORM_DURATION seconds. If the user scrolls mid-formation the
// dissolve scrub takes over visually while formation races to completion
// at FORM_CATCHUP speed — no pop, no conflicting owners of the morph.
const FORM_DELAY = 0.4;
const FORM_DURATION = 2.0;
const FORM_CATCHUP = 4;
/** Glyph particles get a touch more presence than the galaxy so the
 *  formed name is unambiguously the brightest thing in the frame. */
const NAME_BRIGHTNESS = 1.12;

const IMPULSE = FIELD_TUNING.impulse;
const CYCLE = FIELD_TUNING.cycle;

/** Shape indices, derived from the single ordering in tuning.ts rather
 *  than restated — the per-shape tables, the shader's weight vec4 and
 *  these must agree, and three hand-kept copies is two too many. */
const SHAPE_NAME = SHAPES.indexOf('name');
const SHAPE_GALAXY = SHAPES.indexOf('galaxy');
const SHAPE_WORD = SHAPES.indexOf('word');
const SHAPE_SPARSE = SHAPES.indexOf('sparse');

/** Rewrite a Vector4 in place as a one-hot over the four shapes. The
 *  tick loop must not allocate (ADR 0014). */
function setOneHot(v: Vector4, index: number): void {
  v.set(
    index === SHAPE_NAME ? 1 : 0,
    index === SHAPE_GALAXY ? 1 : 0,
    index === SHAPE_WORD ? 1 : 0,
    index === SHAPE_SPARSE ? 1 : 0,
  );
}

/** Blend a per-shape presentation table across the current morph.
 *  Smoothstep rather than linear so it tracks the shader's staggered
 *  geometry blend instead of running ahead of it at the ends. */
function blendShape(
  table: readonly number[],
  state: { from: number; to: number; cross: number },
): number {
  const a = table[state.from] ?? 1;
  const b = table[state.to] ?? 1;
  const t = state.cross;
  return a + (b - a) * (t * t * (3 - 2 * t));
}

/** The galaxy variant sits behind the z=0 plane, but clicks are
 *  converted to the z=0 plane — the same space the shader projects
 *  particles into before testing them. Its on-screen radius is therefore
 *  the world radius foreshortened by the camera, not the world radius. */
const GALAXY_HIT_RADIUS =
  CYCLE.galaxyRadius *
  CYCLE.galaxyVariant.scale *
  (CAMERA_Z / (CAMERA_Z - CYCLE.galaxyVariant.z));

export async function createHomeScene(opts: HomeSceneOptions): Promise<HomeSceneHandle> {
  const { canvas, onRipple, onFormed } = opts;

  const perfFlags = readPerfFlags();
  const maxPixelRatio = perfFlags.lowPerf ? 1 : 1.5;
  const particleCount = perfFlags.lowPerf ? 8_000 : 24_000;

  // Opaque context clearing to the page's own ink (--color-ink). The
  // canvas covers the whole viewport behind every section, so opaque is
  // pixel-identical to transparent-over-ink — and it removes the alpha
  // channel entirely, which the post chain otherwise leaves at 0 in
  // empty regions where the browser then composites the frame
  // additively over the page and lifts every black to gray.
  const renderer = createRenderer(canvas, { maxPixelRatio, alpha: false });
  renderer.setClearColor(0x0a0a0f, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(
    CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 0, CAMERA_Z);
  camera.lookAt(0, 0, 0);

  // ── The field ────────────────────────────────────────────────────────
  const nameTargets = await rasterizeNameTargets({ count: particleCount });
  // Second raster, behind the same gate. Null if it failed — the cycle
  // then skips the wordmark shape rather than showing a stand-in that
  // isn't the mark.
  const wordTargets = rasterizeWordmarkTargets({ count: particleCount });
  const field = buildParticleField({
    count: particleCount,
    galaxyPositions: generateGalaxyTargets({
      count: particleCount,
      radius: GALAXY_RADIUS,
    }),
    namePositions: nameTargets.positions,
    nameDim: nameTargets.dim,
    wordPositions: wordTargets?.positions ?? new Float32Array(particleCount * 3),
    wordDim: wordTargets?.dim ?? new Float32Array(particleCount),
    starPositions: generateStarfieldTargets({ count: particleCount }),
    galaxyCenter: [GALAXY_DESIGN_X, GALAXY_Y, GALAXY_Z],
    // Fewer particles on the low tier read sparser at the same size, so
    // give each one slightly more presence.
    baseSize: perfFlags.lowPerf ? 17 : 13,
    pixelRatio: renderer.getPixelRatio(),
  });
  scene.add(field.points);

  // ── Background glow ──────────────────────────────────────────────────
  // Replaces the hero's old opaque CSS radial gradient: the same deep
  // navy centre glow, but rendered inside the scene so it belongs to the
  // field (fading out as the field dissolves to starfield) and the page
  // background can stay one flat colour from top to footer — the
  // hero→About seam ceases to exist rather than being blended.
  const GLOW_Z = -30;
  // Alpha-matched to the old hero CSS gradient: #0d1226 at centre over
  // the #0a0a0f ink is a whisper of navy, not a blue wash. Normal
  // blending mixes toward the stop colour, so at alpha≈0.85 the centre
  // reproduces the old gradient's peak almost exactly.
  const glowTexture = makeRadialSpriteTexture(512, [
    [0, 'rgba(13, 18, 38, 0.85)'],
    [0.5, 'rgba(8, 11, 26, 0.5)'],
    [1, 'rgba(5, 6, 16, 0)'],
  ]);
  // Canvas 2D paints sRGB values; without declaring that, the renderer
  // treats them as linear and its output encode brightens the plate into
  // a blue wash (rgb 13,18,38 would render as ~63,74,110).
  glowTexture.colorSpace = SRGBColorSpace;
  const glowMaterial = new MeshBasicMaterial({
    map: glowTexture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const glowGeometry = new PlaneGeometry(2, 2);
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.position.set(0, 2, GLOW_Z);
  glow.renderOrder = 0;
  scene.add(glow);

  // ── Post-processing: mipmap-blur bloom, skipped on the low tier ──────
  // Intensity is state-driven per frame: loudest on the galaxy, calm on
  // the formed name (legibility), near-off in the starfield so page text
  // always wins.
  let bloom: BloomEffect | null = null;
  let composer: EffectComposer | null = null;
  if (!perfFlags.lowPerf) {
    // Composer path: pmndrs applies the final sRGB encode in its screen
    // pass, so the renderer's own output conversion must be switched
    // OFF — with both active every frame is encoded twice and all
    // blacks lift to washed gray. Verified empirically against the
    // non-composer low-tier path; if the two tiers ever disagree on
    // background tone again, this pairing is the first suspect.
    renderer.outputColorSpace = LinearSRGBColorSpace;
    composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    // Tight radius + a firm threshold: the widest mip levels of the
    // default settings smear the bright name across the entire viewport
    // and lift the ink background to gray.
    bloom = new BloomEffect({
      intensity: 1.1,
      luminanceThreshold: 0.32,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      radius: 0.45,
    });
    composer.addPass(new EffectPass(camera, bloom));
  }

  // ── Scroll / state inputs (written by handle setters, read by tick) ──
  let scrollProgress = 0;
  let dissolve = 0;

  // ── Formation state (time-driven, owned by the tick loop) ────────────
  let formTime = 0;
  let form = 0;
  let formedNotified = false;
  // Intro waits for the gate reveal — a formation that plays behind the
  // loading overlay would be wasted choreography.
  let introStartedAt = -1;

  // ── Measured readiness (drives the loading gate's reveal) ────────────
  let readyResolved = false;
  let warmFrames = 0;
  let goodStreak = 0;
  let resolveReady: () => void = () => {};
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const READY_FRAME_MS = 20;
  const READY_STREAK = 2;
  const READY_FRAME_CAP = 20;

  // ── Section mood (written by the timeline's scrubbed crossfade) ──────
  let moodHue = 0;
  let moodDensity = 1;
  let moodDrift = 1;

  // ── Fit math (camera never moves; cache the frustum trig once) ───────
  const tanHalfFov = Math.tan((CAMERA_FOV * Math.PI) / 180 / 2);
  const halfHeightAtZ0 = tanHalfFov * CAMERA_Z;

  field.uniforms.uCameraZ.value = CAMERA_Z;

  // ── Pointer avoidance input ──────────────────────────────────────────
  // Raw client coords → world coords on the z=0 plane (the camera looks
  // straight down -z, so this is two multiplies — no raycaster). The
  // target is written by the event, the smoothed value by the tick loop.
  let targetPointerX = 0;
  let targetPointerY = 0;
  let pointerSeen = false;

  const clientToWorldX = (clientX: number): number =>
    (clientX / window.innerWidth - 0.5) * 2 * halfHeightAtZ0 * camera.aspect;
  const clientToWorldY = (clientY: number): number =>
    -(clientY / window.innerHeight - 0.5) * 2 * halfHeightAtZ0;

  // ── Shape cycle ──────────────────────────────────────────────────────
  // Runs continuously while the lander is mounted — reshaping is what
  // the field DOES, not what it falls back on when the visitor leaves.
  // Nothing here reads pointer or scroll state. The clock lives inside
  // the cycle and advances on the tick delta, so it pauses with the rAF
  // loop when the tab hides without its own visibility bookkeeping.
  const cycle = createShapeCycle();
  const wordReady = wordTargets !== null;
  let cycleGalaxySpin = 0;

  const onPointerMove = (e: PointerEvent): void => {
    targetPointerX = clientToWorldX(e.clientX);
    targetPointerY = clientToWorldY(e.clientY);
    pointerSeen = true;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // ── Click ripples ────────────────────────────────────────────────────
  // Document-level because the canvas is pointer-events: none behind the
  // content — the whole page is one clickable material. Round-robin over
  // the fixed pool; overlapping ripples are the point.
  let nextRipple = 0;
  let elapsedNow = 0;

  const launchRipple = (clientX: number, clientY: number, strength: number): void => {
    // Non-null: (non-negative int % 4) always lands inside the 4-tuple.
    const slot = field.uniforms.uRipples.value[nextRipple % 4]!;
    nextRipple++;
    slot.set(clientToWorldX(clientX), clientToWorldY(clientY), elapsedNow, strength);
    onRipple?.(clientX, clientY);
  };

  // ── Shape-click impulse ──────────────────────────────────────────────
  // A click landing on whatever shape is on screen is a different
  // gesture from a click on the page behind it: it strikes the shape
  // rather than rippling the field, and the shape reassembles. Two slots
  // ping-pong so mashing adds up.
  let nextImpulse = 0;

  const launchImpulse = (clientX: number, clientY: number, strength: number): void => {
    // Non-null: (non-negative int % 2) always lands inside the pair.
    const slot = field.uniforms.uImpulses.value[nextImpulse % 2]!;
    nextImpulse++;
    slot.set(clientToWorldX(clientX), clientToWorldY(clientY), elapsedNow, strength);
  };

  // Does a click land on the shape currently on screen? Every region is
  // measured on the z=0 plane, because that is where clientToWorldX/Y
  // put the click AND where the shader projects particles before
  // applying any interaction — a region measured in a shape's own world
  // depth would be the wrong size on screen.
  const isShapeHit = (clientX: number, clientY: number, shape: number): boolean => {
    if (form < IMPULSE.minForm || dissolve > IMPULSE.maxDissolve) return false;
    const x = clientToWorldX(clientX);
    const y = clientToWorldY(clientY);
    const scale = field.uniforms.uNameScale.value;

    if (shape === SHAPE_NAME) {
      return isInsideNameBounds(nameTargets.bounds, scale, x, y, IMPULSE.hitPadding);
    }
    if (shape === SHAPE_WORD) {
      // No bounds when the wordmark raster failed — the cycle skips the
      // shape in that case, so this is belt and braces.
      if (!wordTargets) return false;
      return isInsideNameBounds(wordTargets.bounds, scale, x, y, IMPULSE.hitPadding);
    }
    const r = shape === SHAPE_GALAXY ? GALAXY_HIT_RADIUS : CYCLE.sparseHitRadius; // sparse: see the tuning note
    const dx = x - (shape === SHAPE_GALAXY ? CYCLE.galaxyVariant.x : 0);
    const dy = y - (shape === SHAPE_GALAXY ? CYCLE.galaxyVariant.y : 0);
    return dx * dx + dy * dy <= (r + IMPULSE.hitPadding) * (r + IMPULSE.hitPadding);
  };

  const onPointerDown = (e: PointerEvent): void => {
    const target = e.target as Element | null;
    if (target?.closest(RIPPLE_EXCLUDE_SELECTOR)) return;
    const shape = cycle.current();
    if (isShapeHit(e.clientX, e.clientY, shape)) {
      launchImpulse(e.clientX, e.clientY, 1);
      // Only the typographic shapes suppress the commit popup, and only
      // for the reason ADR 0015 gave: a mono label rising through
      // letterforms fights the legibility they exist to have. The galaxy
      // and the sparse cloud have no legibility to protect, so they keep
      // the easter egg — otherwise it would vanish for half of every
      // cycle, which is not a trade anyone asked for.
      if (shape === SHAPE_NAME || shape === SHAPE_WORD) return;
    }
    const strength = target?.closest(TEXT_TARGET_SELECTOR) ? 1.25 : 1;
    launchRipple(e.clientX, e.clientY, strength);
  };
  document.addEventListener('pointerdown', onPointerDown);
  const halfHeightAtGalaxyZ = tanHalfFov * (CAMERA_Z - GALAXY_Z);
  const halfHeightAtGlowZ = tanHalfFov * (CAMERA_Z - GLOW_Z);

  const resize = createResizeHandler(
    renderer,
    camera,
    () => {
      const aspect = camera.aspect;

      // Name block: scale down (never up) so it always fits the frustum
      // width with padding.
      const visibleHalfWidth = halfHeightAtZ0 * aspect;
      field.uniforms.uNameScale.value = Math.min(
        1,
        (visibleHalfWidth - NAME_FIT_PADDING) / NAME_DESIGN_HALF_WIDTH,
      );

      // Galaxy: pull toward centre on narrow viewports just enough that
      // the disk's left edge stays inside the frame; never push it
      // further left than the design anchor.
      const visibleHalfWidthAtGalaxy = halfHeightAtGalaxyZ * aspect;
      field.uniforms.uGalaxyCenter.value.x = Math.max(
        GALAXY_DESIGN_X,
        -(visibleHalfWidthAtGalaxy - GALAXY_RADIUS - GALAXY_LEFT_PADDING),
      );

      // Glow plate: cover the frustum at its depth with margin.
      const glowHalfWidth = halfHeightAtGlowZ * aspect;
      glow.scale.set(glowHalfWidth * 2.0, halfHeightAtGlowZ * 2.0, 1);

      field.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      composer?.setSize(window.innerWidth, window.innerHeight);
    },
    maxPixelRatio,
  );
  resize.handler();

  const perfOverlay: PerfOverlayHandle | null = perfFlags.debugOverlay
    ? mountPerfOverlay(formatPerfOverlayLabel('home', perfFlags))
    : null;

  // ── Animation loop ───────────────────────────────────────────────────
  let disposed = false;
  let raf = 0;
  const startTime = performance.now();
  let lastFrame = startTime;

  // Cap at ~60 fps regardless of monitor refresh — on 144/240 Hz panels
  // an uncapped loop burns proportionally more CPU/GPU for no visual
  // gain at this scene's motion frequencies.
  const TARGET_FRAME_MS = 1000 / 60 - 1;

  // Ceiling on the frame delta anything time-based is allowed to
  // integrate, seconds. Not every long gap between frames announces
  // itself: a suspended machine resumes without a visibilitychange, and
  // a page opened in a background tab reaches its first real frame with
  // the whole background stretch behind it. Left unbounded, that single
  // delta drives the formation past its own animation and jumps every
  // accumulator. Far above a hitched frame, far below any of those gaps
  // — so a genuinely slow frame still integrates truthfully.
  const MAX_FRAME_DELTA = 0.25;

  // Scratch colours reused every frame — the palette lerp must not
  // allocate in the tick loop.
  const colorA = new Color();
  const colorB = new Color();

  const tick = (): void => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);

    const now = performance.now();
    if (now - lastFrame < TARGET_FRAME_MS) return;
    const elapsed = (now - startTime) / 1000;
    // Two deltas on purpose. `delta` drives simulation and is clamped;
    // `rawDelta` is what actually elapsed and goes only to the perf
    // overlay, which exists to report frame times honestly — clamping
    // the number the instrument reads would hide exactly the hitches it
    // was mounted to catch.
    const rawDelta = (now - lastFrame) / 1000;
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);
    lastFrame = now;

    const u = field.uniforms;
    u.uTime.value = elapsed;
    elapsedNow = elapsed;
    u.uGalaxySpin.value = elapsed * GALAXY_SPIN_RATE;
    u.uDissolve.value = dissolve;

    // Name formation — advances on its own clock after a short galaxy
    // hold once the intro has been released by the gate reveal; an early
    // scroll makes it race to completion under the dissolve instead of
    // leaving two owners fighting over the morph.
    if (form < 1 && introStartedAt >= 0 && elapsed - introStartedAt > FORM_DELAY) {
      formTime += delta * (dissolve > 0.02 ? FORM_CATCHUP : 1);
      form = easeOutCubic(Math.min(1, formTime / FORM_DURATION));
      if (form >= 1 && !formedNotified) {
        formedNotified = true;
        onFormed?.();
      }
    }
    u.uForm.value = form;

    // Shape cycle. `uShape` is derived unconditionally from `form`
    // rather than hooked to the formation-complete branch: snapFormed()
    // sets form = 1 directly on a back/forward restore and never enters
    // that branch, which would leave the cycle switched off for the
    // whole visit while the reducer kept advancing underneath.
    // One switch, shared with the presentation blends below. It is a
    // hard 0/1 rather than a ramp because the cycle holds the NAME row
    // throughout the load-in, and every name-row value already equals
    // the formed value it would ramp toward — so there is nothing to
    // ramp, and ramping anyway squares `form` into the curve.
    const shapeMix = form >= 1 ? 1 : 0;
    u.uShape.value = shapeMix;
    // Clock held until the load-in hands the field over. Otherwise the
    // formation's ~2.7 s runs down the name's very first hold, and the
    // name a first-time visitor just watched assemble morphs away
    // almost immediately.
    const cycleState = cycle.advance({ delta: form >= 1 ? delta : 0, wordReady });
    setOneHot(u.uCrossFrom.value, cycleState.from);
    setOneHot(u.uCrossTo.value, cycleState.to);
    u.uCross.value = cycleState.cross;

    // Accumulated rather than derived from `elapsed`, so it pauses with
    // the loop. This variant is the one shape a visitor can see both
    // before hiding a tab and after returning to it, so a wall-clock
    // spin would resume visibly rotated. The load-in galaxy keeps its
    // wall clock deliberately: it is only ever on screen before the name
    // forms, so there is no earlier orientation to jump from.
    cycleGalaxySpin += delta * CYCLE.galaxyVariant.spinRate;
    u.uCycleGalaxySpin.value = cycleGalaxySpin;

    // Per-shape presentation, blended by the same endpoints the shader
    // uses for geometry. Unstaggered on purpose: brightness, density and
    // bloom are whole-frame properties, not per-particle ones.
    const shapeBrightness = blendShape(CYCLE.shapeBrightness, cycleState);
    const shapeDensity = blendShape(CYCLE.shapeDensity, cycleState);
    const shapeBloom = blendShape(CYCLE.shapeBloom, cycleState);

    // Smooth pointer — the lerp keeps the avoidance feeling weighty
    // rather than glued to the cursor; strength eases in after the first
    // real move so the (0,0) default never repels screen-centre.
    const p = u.uPointer.value;
    p.x += (targetPointerX - p.x) * 0.08;
    p.y += (targetPointerY - p.y) * 0.08;
    u.uPointerStrength.value += ((pointerSeen ? 1 : 0) - u.uPointerStrength.value) * 0.05;
    // Field lags the content slightly as the page scrolls — enough to
    // feel attached to the page, not painted on the glass.
    u.uScrollDrift.value = scrollProgress * 1.5;

    // State-blended palette + brightness. Starfield must stay dimmer
    // than page text — that contrast clamp lives here, not in CSS.
    colorA.lerpColors(GALAXY_COLOR_A, STAR_COLOR_A, dissolve);
    colorB.lerpColors(GALAXY_COLOR_B, STAR_COLOR_B, dissolve);
    if (moodHue !== 0) {
      colorA.offsetHSL(moodHue / 360, 0, 0);
      colorB.offsetHSL(moodHue / 360, 0, 0);
    }
    u.uColorA.value.copy(colorA);
    u.uColorB.value.copy(colorB);
    u.uDriftSpeed.value = moodDrift;
    const formedBrightness =
      GALAXY_BRIGHTNESS + (NAME_BRIGHTNESS - GALAXY_BRIGHTNESS) * form;
    // `form` is this value's ONLY route in. Collapsing the wrapper
    // would render the load-in galaxy with the settled shape's exposure.
    const landerBrightness =
      formedBrightness + (shapeBrightness - formedBrightness) * form;
    u.uBrightness.value =
      landerBrightness + (STARFIELD_BRIGHTNESS - landerBrightness) * dissolve;

    // Starfield reads sparse: only ~40% of the field stays visible once
    // fully dissolved (density thresholds against the per-particle rank),
    // nudged by the active section's mood.
    // Faded by dissolve as well as form: uDensity is the one
    // presentation value the dissolve mix does not already guard, so a
    // sparse shape left holding at the top would otherwise keep thinning
    // the starfield behind the scrolled page.
    const landerDensity = 1 + (shapeDensity - 1) * shapeMix * (1 - dissolve);
    u.uDensity.value = Math.max(
      0,
      Math.min(1, (1 - dissolve * 0.6) * moodDensity * landerDensity),
    );

    glowMaterial.opacity = 1 - dissolve * 0.9;

    if (bloom) {
      const formedBloom = 1.1 + (0.35 - 1.1) * form;
      const landerBloom = formedBloom + (shapeBloom - formedBloom) * shapeMix;
      bloom.intensity = landerBloom * (1 - dissolve) + 0.1 * dissolve;
    }

    if (composer) {
      composer.render(delta);
    } else {
      renderer.render(scene, camera);
    }

    // Warm-up instrumentation: the first frames prove the scene renders
    // under the jank threshold before the gate lets the user in.
    if (!readyResolved) {
      const frameCpu = performance.now() - now;
      warmFrames++;
      goodStreak = frameCpu < READY_FRAME_MS ? goodStreak + 1 : 0;
      if (goodStreak >= READY_STREAK || warmFrames >= READY_FRAME_CAP) {
        readyResolved = true;
        resolveReady();
      }
    }

    perfOverlay?.tick(rawDelta);
  };

  const onVisibilityChange = (): void => {
    if (disposed) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      // Both of these are unconditional, and the `raf === 0` guard below
      // is only about restarting the loop. A page opened in a background
      // tab never had its first rAF fire, so `raf` is non-zero and needs
      // no restart — but that pending frame is still holding a
      // `lastFrame` from scene construction, and would arrive with a
      // delta of the entire background stretch: enough to snap the name
      // into existence instead of forming it, and to hand the composer a
      // nonsense frame time.
      lastFrame = performance.now();
      if (raf === 0) tick();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Compile every program off the critical path where the driver
  // supports KHR_parallel_shader_compile, so the first rendered frame
  // links instead of compiling from scratch. Raced with a timeout —
  // compileAsync polls on rAF in some engines and a hidden tab must not
  // wedge the boot forever.
  // Short race: if the driver stalls the async compile, frame 1 simply
  // compiles synchronously behind the gate — waiting longer here only
  // delays the reveal.
  await Promise.race([
    renderer.compileAsync(scene, camera).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 800)),
  ]);

  tick();

  return {
    setScrollProgress: (p: number): void => {
      scrollProgress = Math.max(0, Math.min(1, p));
    },
    setDissolve: (p: number): void => {
      dissolve = Math.max(0, Math.min(1, p));
    },
    ripple: (clientX: number, clientY: number, strength = 1): void => {
      launchRipple(clientX, clientY, strength);
    },
    setMood: (hue: number, density: number, drift: number): void => {
      moodHue = hue;
      moodDensity = density;
      moodDrift = drift;
    },
    whenReady: (): Promise<void> => readyPromise,
    startIntro: (): void => {
      if (introStartedAt < 0) introStartedAt = elapsedNow;
    },
    snapFormed: (): void => {
      formTime = FORM_DURATION;
      form = 1;
      formedNotified = true;
    },
    resize: resize.handler,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      resize.dispose();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      perfOverlay?.dispose();

      scene.remove(field.points, glow);
      composer?.dispose();
      field.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      glowTexture.dispose();
      scene.clear();

      renderer.dispose();
      // dispose() frees GPU objects but not the WebGL context itself — the
      // browser only reclaims that when the detached canvas is GC'd. Under
      // client-side routing this scene is created/destroyed per navigation,
      // so release the context now to avoid contexts piling toward the cap.
      renderer.forceContextLoss();
    },
  };
}
