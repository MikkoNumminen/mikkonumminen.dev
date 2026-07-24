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
import { generateNameTargetsStub } from './field/nameTargets';
import { makeRadialSpriteTexture } from './textures';

export interface HomeSceneOptions {
  canvas: HTMLCanvasElement;
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

export async function createHomeScene(opts: HomeSceneOptions): Promise<HomeSceneHandle> {
  const { canvas } = opts;

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
  const field = buildParticleField({
    count: particleCount,
    galaxyPositions: generateGalaxyTargets({
      count: particleCount,
      radius: GALAXY_RADIUS,
    }),
    namePositions: generateNameTargetsStub({ count: particleCount }),
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

  // ── Fit math (camera never moves; cache the frustum trig once) ───────
  const tanHalfFov = Math.tan((CAMERA_FOV * Math.PI) / 180 / 2);
  const halfHeightAtZ0 = tanHalfFov * CAMERA_Z;
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
    u.uGalaxySpin.value = elapsed * GALAXY_SPIN_RATE;
    u.uDissolve.value = dissolve;
    // Field lags the content slightly as the page scrolls — enough to
    // feel attached to the page, not painted on the glass.
    u.uScrollDrift.value = scrollProgress * 1.5;

    // State-blended palette + brightness. Starfield must stay dimmer
    // than page text — that contrast clamp lives here, not in CSS.
    colorA.lerpColors(GALAXY_COLOR_A, STAR_COLOR_A, dissolve);
    colorB.lerpColors(GALAXY_COLOR_B, STAR_COLOR_B, dissolve);
    u.uColorA.value.copy(colorA);
    u.uColorB.value.copy(colorB);
    u.uBrightness.value =
      GALAXY_BRIGHTNESS + (STARFIELD_BRIGHTNESS - GALAXY_BRIGHTNESS) * dissolve;

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
    resize: resize.handler,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      resize.dispose();
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
