/**
 * Home page (`/`) scene: ONE continuous particle field on a fixed,
 * full-viewport, transparent canvas behind the whole page. The field
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
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
} from 'three';
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
  /** Release the renderer, all GPU resources, and listeners. Call once. */
  dispose: () => void;
  /** Re-fit the field after a viewport / orientation change. */
  resize: () => void;
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

export async function createHomeScene(opts: HomeSceneOptions): Promise<HomeSceneHandle> {
  const { canvas, onRipple, onFormed } = opts;

  const perfFlags = readPerfFlags();
  const maxPixelRatio = perfFlags.lowPerf ? 1 : 1.5;
  const particleCount = perfFlags.lowPerf ? 8_000 : 24_000;

  const renderer = createRenderer(canvas, { maxPixelRatio });

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
  const field = buildParticleField({
    count: particleCount,
    galaxyPositions: generateGalaxyTargets({
      count: particleCount,
      radius: GALAXY_RADIUS,
    }),
    namePositions: nameTargets.positions,
    nameDim: nameTargets.dim,
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

  // ── Scroll / state inputs (written by handle setters, read by tick) ──
  let scrollProgress = 0;
  let dissolve = 0;

  // ── Formation state (time-driven, owned by the tick loop) ────────────
  let formTime = 0;
  let form = 0;
  let formedNotified = false;

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

  const onPointerDown = (e: PointerEvent): void => {
    const target = e.target as Element | null;
    if (target?.closest(RIPPLE_EXCLUDE_SELECTOR)) return;
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
    const delta = (now - lastFrame) / 1000;
    lastFrame = now;

    const u = field.uniforms;
    u.uTime.value = elapsed;
    elapsedNow = elapsed;
    u.uGalaxySpin.value = elapsed * GALAXY_SPIN_RATE;
    u.uDissolve.value = dissolve;

    // Name formation — advances on its own clock after a short galaxy
    // hold; an early scroll makes it race to completion under the
    // dissolve instead of leaving two owners fighting over the morph.
    if (form < 1 && elapsed > FORM_DELAY) {
      formTime += delta * (dissolve > 0.02 ? FORM_CATCHUP : 1);
      form = easeOutCubic(Math.min(1, formTime / FORM_DURATION));
      if (form >= 1 && !formedNotified) {
        formedNotified = true;
        onFormed?.();
      }
    }
    u.uForm.value = form;

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
    u.uColorA.value.copy(colorA);
    u.uColorB.value.copy(colorB);
    const formedBrightness =
      GALAXY_BRIGHTNESS + (NAME_BRIGHTNESS - GALAXY_BRIGHTNESS) * form;
    u.uBrightness.value =
      formedBrightness + (STARFIELD_BRIGHTNESS - formedBrightness) * dissolve;

    // Starfield reads sparse: only ~40% of the field stays visible once
    // fully dissolved (density thresholds against the per-particle rank).
    u.uDensity.value = 1 - dissolve * 0.6;

    glowMaterial.opacity = 1 - dissolve * 0.9;

    renderer.render(scene, camera);
    perfOverlay?.tick(delta);
  };

  const onVisibilityChange = (): void => {
    if (disposed) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (raf === 0) {
      lastFrame = performance.now();
      tick();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

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
