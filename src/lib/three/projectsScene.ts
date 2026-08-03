/**
 * Projects page (`/projects`) scene: a "solar system" — one planet per project
 * orbiting a central sun, with drag-rotate / wheel-zoom camera control and
 * click-to-select. Entry point is `createProjectsScene` (below).
 */
import {
  ACESFilmicToneMapping,
  FogExp2,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  PerspectiveCamera,
  type Object3D,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  VignetteEffect,
} from 'postprocessing';
import { gsap } from 'gsap';
import { connections, type LocalizedProject } from '../../data/projects';
import { createRenderer } from './createRenderer';
import { createResizeHandler } from './createResizeHandler';
import { disposeMaterial } from './disposeMaterial';
import { userDataString } from './userData';
import { createOffscreenPauser } from '../utils/createOffscreenPauser';
import { readPerfFlags } from '../debug/perfFlags';
import {
  mountPerfOverlay,
  formatPerfOverlayLabel,
  type PerfOverlayHandle,
} from '../debug/perfOverlay';
import { buildStarfield } from './projects/buildStarfield';
import { buildSun, SUN_CORONA_RADIUS, SUN_FOCUS_DISTANCE } from './projects/buildSun';
import { buildPlanet, type PlanetEntry } from './projects/buildPlanet';
import { NIGHT_FLOOR, NIGHT_FLOOR_HOVERED } from './projects/buildPlanetMaterial';
import { PLANET_BASE_RADIUS } from './projects/constants';
import {
  buildConnections,
  updateConnections,
  animateConnectionFlow,
  updateConnectionVisibility,
  resizeConnections,
  disposeConnections,
} from './projects/buildConnections';
import {
  buildExternalIndicator,
  updateExternalIndicator,
  disposeExternalIndicators,
  type ExternalIndicator,
} from './projects/buildExternalIndicator';
import { createHoverLabel } from './projects/createHoverLabel';
import { createPlanetLabels } from './projects/createPlanetLabels';
import {
  clampPolar,
  zoomRadius,
  exceedsDragThreshold,
  damp,
  fitRadius,
  sphericalToCartesian,
} from './projects/cameraControls';

/**
 * Anything on the canvas the pointer can inspect or focus. Planets, moons and
 * the star differ in how they are built and where they sit, but hover, click,
 * labelling and camera framing treat them identically — this is the shape that
 * lets one code path do all four.
 */
interface FocusTarget {
  project: LocalizedProject;
  /** World-positioned holder, used for label placement and camera framing. */
  group: Object3D;
  /** Raycast and hover-scale target. */
  mesh: Mesh;
  hoverScale: number;
  /** Camera stand-off distance when this body is focused. */
  focusDistance: number;
  /** How far above the body centre its HTML label floats, in world units. */
  labelLift: number;
}

export interface ProjectsSceneOptions {
  canvas: HTMLCanvasElement;
  hoverLabel: HTMLElement;
  /** Container for the persistent per-planet name labels. */
  planetLabels: HTMLElement;
  /** Localized project data merged from i18n. */
  projects: LocalizedProject[];
  onSelect: (project: LocalizedProject) => void;
  onDeselect: () => void;
  reducedMotion?: boolean;
}

/**
 * Imperative handle to a mounted projects scene. The caller owns the lifecycle:
 * call `dispose()` once on unmount to release the WebGL context, GPU resources,
 * and listeners.
 */
export interface ProjectsSceneHandle {
  /** Open/close the detail focus for a planet by project id; `null` deselects. */
  selectById: (id: string | null) => void;
  /**
   * Force a hover state on a specific planet, mirroring the raycast-driven
   * hover. Used by the side-panel list so hovering a list item highlights
   * the matching planet (scale-up + label) without requiring the user to
   * locate the moving planet themselves. Pass `null` to release the forced
   * hover and let raycast take over again.
   */
  hoverById: (id: string | null) => void;
  /**
   * Resolves once the scene has proved it renders under the jank threshold.
   * The page's loading gate reveals on this — measured, not assumed, and not a
   * timer: the point is that the visitor is not dropped into a scene that is
   * still compiling shaders.
   */
  whenReady: () => Promise<void>;
  /** Re-fit the renderer + camera to the viewport. */
  resize: () => void;
  /** Tear the scene down — release the WebGL context, GPU resources, and listeners. Call once on unmount. */
  dispose: () => void;
}

const FOG_COLOR = 0x020512;
/** Only the direction matters — the distance is derived per viewport, see FIT_MARGIN. */
const SOLAR_CAMERA_DIR = new Vector3(0, 8, 28);
const SOLAR_LOOK_AT = new Vector3(0, 0, 0);

// Camera-control tuning. Spherical coords (azimuth, polar, radius) are
// damped each frame toward their target values, which the user nudges
// via drag (rotate) and wheel (zoom).
const CAMERA_FOV = 52;
const SPHERICAL_DAMPING = 0.18;
const ROTATE_SPEED = 0.005;
const ZOOM_SPEED = 0.0015;
const MIN_RADIUS = 9;
const MAX_RADIUS = 68;
const MIN_POLAR = 0.25;
const MAX_POLAR = Math.PI - 0.25;
const DRAG_THRESHOLD = 4;
/**
 * World-unit gap left between the outermost orbit and the frustum edge at the
 * default zoom, covering the planet's own radius and its floating name label.
 */
const FIT_MARGIN = 2.6;
/** Per-frame damping of each connection's hover fade. */
const CONNECTION_FADE_DAMPING = 0.12;
/** The star's label clears its corona rather than its core. */
const SUN_LABEL_LIFT = 3.4;

// Warm-up gate. Same shape as the home field: a couple of consecutive frames
// under the jank threshold, or a hard cap so a slow machine is let in rather
// than held at a loading screen forever.
const READY_FRAME_MS = 20;
const READY_STREAK = 2;
const READY_FRAME_CAP = 20;

/**
 * Build and mount the projects "solar system": one planet per project orbiting
 * a central sun, with drag-to-rotate / wheel-to-zoom camera control (spherical
 * coords damped each frame), raycast hover labels, and click-to-select that
 * opens the detail drawer.
 *
 * Lifecycle: returns a {@link ProjectsSceneHandle}; the caller owns it and MUST
 * call `dispose()` on unmount to release the WebGL context and GPU resources.
 * Honours `reducedMotion`.
 */
export function createProjectsScene(opts: ProjectsSceneOptions): ProjectsSceneHandle {
  const {
    canvas,
    hoverLabel,
    planetLabels: planetLabelsContainer,
    projects,
    onSelect,
    onDeselect,
    reducedMotion = false,
  } = opts;

  // ── Lifecycle state (hoisted so resize/visibility handlers can read it) ─
  let disposed = false;
  let raf = 0;

  const perfFlags = readPerfFlags();

  // ── Renderer ────────────────────────────────────────────────────────
  // Keep a local reference so the same cap can be forwarded to
  // createResizeHandler — otherwise every resize event would silently
  // upgrade the DPR back to the browser's native value (up to 2).
  const maxPixelRatio = perfFlags.lowPerf ? 1 : 1.5;
  const renderer = createRenderer(canvas, {
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.05,
    // See homeScene for reasoning — `?perf=low` clamps DPR at 1 so the
    // pixel work of every draw call halves on retina/HiDPI displays.
    maxPixelRatio,
  });

  // Debug overlay (`?debug=perf`) — small FPS / ms-per-frame readout
  // in the top-left so a tester can report numbers instead of vibes.
  const perfOverlay: PerfOverlayHandle | null = perfFlags.debugOverlay
    ? mountPerfOverlay(formatPerfOverlayLabel('projects', perfFlags))
    : null;

  // ── Scene + camera ──────────────────────────────────────────────────
  const scene = new Scene();
  scene.fog = new FogExp2(FOG_COLOR, 0.012);

  const camera = new PerspectiveCamera(
    CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );

  // The default camera distance is derived from the viewport, not fixed: the
  // outermost orbit has to fit inside the frustum on every window shape, and
  // portrait viewports are bound by width where landscape ones are bound by
  // height. A constant distance frames exactly one window and clips the rest.
  const initialPolar = Math.acos(SOLAR_CAMERA_DIR.y / SOLAR_CAMERA_DIR.length());
  const maxOrbitRadius = projects.reduce(
    (m, p) => (p.isSun || p.moonOf ? m : Math.max(m, p.orbitRadius)),
    0,
  );
  // Polar is passed in rather than read off the camera state: the first call
  // happens while that state is still being initialised.
  const computeFitRadius = (polar: number): number =>
    fitRadius(
      maxOrbitRadius,
      FIT_MARGIN,
      CAMERA_FOV,
      camera.aspect,
      polar,
      MIN_RADIUS,
      MAX_RADIUS,
    );

  // ── Starfield ───────────────────────────────────────────────────────
  const starfield = buildStarfield({ lowPerf: perfFlags.lowPerf });
  scene.add(starfield.points);

  // ── Sun ─────────────────────────────────────────────────────────────
  // HRM is the star, not a planet: it is the hub the rest of the system hangs
  // off, and ranking by size alone understated that.
  const sunProject = projects.find((p) => p.isSun) ?? null;
  const sun = buildSun({ lowPerf: perfFlags.lowPerf });
  scene.add(sun.group);

  // ── Lighting ────────────────────────────────────────────────────────
  // There is none, in the THREE.Light sense. Every surface in this scene is a
  // shader that knows where the star is, so a light object would only be read
  // by materials that no longer exist. See buildPlanetMaterial for why the
  // ambient fill, the counter-rim and the camera-tracked directional light
  // were removed rather than retuned.
  const sunWorldPos = new Vector3(0, 0, 0);

  // ── Bodies ──────────────────────────────────────────────────────────
  // One project is the star, one is a moon of another, the rest are planets.
  // Every project stays in `projects` regardless — the terminal, the fallback
  // grid and the timeline linkifier all read that same list.
  const planetProjects = projects.filter((p) => !p.isSun && !p.moonOf);
  const moonProjects = projects.filter((p) => p.moonOf);

  const planets: PlanetEntry[] = [];
  for (const project of planetProjects) {
    const built = buildPlanet(project, { lowPerf: perfFlags.lowPerf, renderer });
    scene.add(built.rootGroup);
    planets.push(built.entry);
  }

  // Moons hang off their parent's positioned group, so they ride the parent's
  // orbit for free and only have to track their own local angle.
  const moons: PlanetEntry[] = [];
  for (const project of moonProjects) {
    const parent = planets.find((p) => p.project.id === project.moonOf);
    if (!parent) continue;
    const built = buildPlanet(project, { lowPerf: perfFlags.lowPerf, renderer });
    parent.group.add(built.rootGroup);
    moons.push(built.entry);
  }

  // Anything the pointer can inspect or focus: planets, moons, and the star.
  // The star is a project like any other, so it answers to hover, click, the
  // side-panel list and the drawer through exactly the same path.
  const orbiting = [...planets, ...moons];
  const focusTargets: FocusTarget[] = orbiting.map((entry) => ({
    project: entry.project,
    group: entry.group,
    mesh: entry.mesh,
    hoverScale: 1.18,
    focusDistance: 4.5 + entry.project.scale * 1.5,
    labelLift: PLANET_BASE_RADIUS * entry.project.scale * 1.5,
  }));

  if (sunProject) {
    sun.core.userData.projectId = sunProject.id;
    focusTargets.push({
      project: sunProject,
      group: sun.group,
      mesh: sun.core,
      // Gentler than a planet's: the star already dominates, and 1.18x on a
      // body this size reads as a lurch rather than a highlight.
      hoverScale: 1.06,
      focusDistance: SUN_FOCUS_DISTANCE,
      labelLift: SUN_LABEL_LIFT,
    });
  }

  // Cached once so the raycaster doesn't allocate per frame and per click.
  const raycastTargets: Mesh[] = focusTargets.map((f) => f.mesh);

  // Runtime orbital angle per planet, advanced delta-style each frame.
  // The original formula was `project.phase + elapsed * speed * scale`
  // — elastic against `scale = 0`, which would teleport the planet back
  // to its base `phase`; leave the scale > 0 and the planet drifts
  // during the camera lerp so the user ends up looking at a position
  // the planet wasn't at when they clicked. Tracking the angle
  // ourselves lets us simply *not* advance it for the selected entry;
  // the value persists across the selection and resumes seamlessly on
  // deselect.
  const planetAngles = new Map<PlanetEntry, number>();
  for (const entry of orbiting) {
    planetAngles.set(entry, entry.project.phase);
  }

  // ── Persistent planet name labels ──────────────────────────────────
  // HTML overlay so users can identify any planet at a glance without
  // hovering. Repositioned per frame from the planet's projected screen
  // position; hidden while the drawer is open to keep focus on the
  // selected project.
  const planetLabels = createPlanetLabels(planetLabelsContainer, focusTargets);

  // ── Connections (semantic edges between related projects) ──────────
  const connectionsBundle = buildConnections(connections, focusTargets, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  scene.add(connectionsBundle.group);
  // Nothing is hovered on arrival, so no edge is lit and the group starts dark.
  connectionsBundle.group.visible = false;
  let indicatorVisibility = 1;

  // ── External-API indicators ────────────────────────────────────────
  // Each planet that connects to an outside service gets an orbiting
  // satellite and concentric pulse rings — visual shorthand for
  // "this planet talks to the outside world".
  // A satellite may not reach into whatever sits either side of its planet:
  // the neighbouring orbits, or the star's corona for the innermost one. Only
  // the scene knows those distances, so it computes the allowance per planet.
  const orbitRadii = planets.map((p) => p.project.orbitRadius).sort((a, b) => a - b);
  const clearanceFor = (radius: number): number => {
    const i = orbitRadii.indexOf(radius);
    const inner = i > 0 ? radius - orbitRadii[i - 1]! : radius - SUN_CORONA_RADIUS;
    const outer =
      i < orbitRadii.length - 1 ? orbitRadii[i + 1]! - radius : Number.POSITIVE_INFINITY;
    // 0.85 of the tighter side, so the satellite stops short of the line
    // rather than grazing it.
    return Math.max(0, Math.min(inner, outer)) * 0.85;
  };

  const externalIndicators: ExternalIndicator[] = [];
  for (const planet of planets) {
    if (planet.project.externalApis && planet.project.externalApis.length > 0) {
      externalIndicators.push(
        buildExternalIndicator(planet, {
          maxReach: clearanceFor(planet.project.orbitRadius),
        }),
      );
    }
  }

  // ── Post-processing ─────────────────────────────────────────────────
  // PARALLEL TO src/lib/three/homeScene.ts — same composer shape, different
  // tuning. Second use of this pattern, so it stays duplicated rather than
  // extracted; if a third scene needs it, that is the time to share it.
  //
  // The threshold is much higher than the home field's 0.32. There, the bloom
  // IS the effect. Here only two things should glow: the star, which is driven
  // past 1.0 for exactly this reason, and the brightest planet rims. Everything
  // else — orbit trails, the backdrop, the satellites — has to stay under it,
  // which is what the starfield's asserted luminance ceiling protects.
  // Unlike the home field, nothing here drives bloom intensity per frame — the
  // star's brightness is a property of its own shader — so the effect needs no
  // handle beyond the pass it lives in.
  let composer: EffectComposer | null = null;
  if (!perfFlags.lowPerf) {
    // The renderer's own output conversion MUST be off while the composer is
    // active: pmndrs applies the sRGB encode in its final screen pass, and with
    // both on every frame is encoded twice and all blacks lift to grey. Learned
    // the hard way on the home scene; the same pairing applies here.
    renderer.outputColorSpace = LinearSRGBColorSpace;
    composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    // Both effects in ONE pass: pmndrs merges them into a single fragment
    // shader, where two passes would be a second full-screen draw for nothing.
    composer.addPass(
      new EffectPass(
        camera,
        new BloomEffect({
          intensity: 0.85,
          luminanceThreshold: 0.55,
          luminanceSmoothing: 0.2,
          mipmapBlur: true,
          radius: 0.55,
        }),
        new VignetteEffect({ offset: 0.35, darkness: 0.5 }),
      ),
    );
  }

  // ── Hover label ─────────────────────────────────────────────────────
  const hoverLabelHandle = createHoverLabel(hoverLabel);

  // ── Raycasting state ────────────────────────────────────────────────
  const raycaster = new Raycaster();
  const pointer = new Vector2(-1, -1);
  let hovered: FocusTarget | null = null;
  let selected: FocusTarget | null = null;
  // Set by `hoverById` from the side-panel list. When non-null, overrides
  // raycast hover so list-item hovers highlight the matching planet.
  let forcedHovered: FocusTarget | null = null;

  const onPointerMove = (e: PointerEvent): void => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  const onPointerLeave = (): void => {
    pointer.set(-2, -2);
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave);

  // ── Camera-control state ────────────────────────────────────────────
  // Viewing angle comes from SOLAR_CAMERA_DIR; the distance is fitted.
  const dirLength = SOLAR_CAMERA_DIR.length();
  const sphericalCurrent = {
    azimuth: Math.atan2(SOLAR_CAMERA_DIR.x, SOLAR_CAMERA_DIR.z),
    polar: Math.acos(SOLAR_CAMERA_DIR.y / dirLength),
    radius: computeFitRadius(initialPolar),
  };
  const sphericalTarget = { ...sphericalCurrent };
  // Once the user has zoomed, a resize must not yank them back to the fitted
  // default — re-framing someone's chosen view on a window drag is hostile.
  let userZoomed = false;

  let dragging = false;
  let dragMoved = false;
  let dragPointerId = -1;
  let lastDragX = 0;
  let lastDragY = 0;
  let dragStartX = 0;
  let dragStartY = 0;

  const onCanvasPointerDown = (e: PointerEvent): void => {
    if (selected) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true;
    dragMoved = false;
    dragPointerId = e.pointerId;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw on some clients; safe to ignore */
    }
  };

  const onCanvasPointerMove = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== dragPointerId) return;
    const dx = e.clientX - lastDragX;
    const dy = e.clientY - lastDragY;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    if (
      !dragMoved &&
      exceedsDragThreshold(e.clientX - dragStartX, e.clientY - dragStartY, DRAG_THRESHOLD)
    ) {
      dragMoved = true;
    }
    if (dragMoved) {
      sphericalTarget.azimuth -= dx * ROTATE_SPEED;
      sphericalTarget.polar -= dy * ROTATE_SPEED;
      sphericalTarget.polar = clampPolar(sphericalTarget.polar, MIN_POLAR, MAX_POLAR);
    }
  };

  const onCanvasPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== dragPointerId) return;
    dragging = false;
    dragPointerId = -1;
    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  const onCanvasWheel = (e: WheelEvent): void => {
    if (selected) return;
    e.preventDefault();
    userZoomed = true;
    sphericalTarget.radius = zoomRadius(
      sphericalTarget.radius,
      e.deltaY,
      ZOOM_SPEED,
      MIN_RADIUS,
      MAX_RADIUS,
    );
  };

  canvas.addEventListener('pointerdown', onCanvasPointerDown);
  canvas.addEventListener('pointermove', onCanvasPointerMove);
  canvas.addEventListener('pointerup', onCanvasPointerUp);
  canvas.addEventListener('pointercancel', onCanvasPointerUp);
  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  canvas.style.touchAction = 'none';

  const nightFloorTweens = new Map<FocusTarget, { v: number }>();
  const setNightFloor = (target: FocusTarget, to: number): void => {
    const entry = orbiting.find((e) => e.project.id === target.project.id);
    if (!entry) return; // the star is emissive; it has no night side
    // INVARIANT for the `!` on every uniform read in this file: these uniforms
    // are declared literally in the material each entry was built with, so they
    // exist wherever the entry does. The early return above is what excludes the
    // one material that has no night side. Three.js types uniforms behind an
    // index signature, which `noUncheckedIndexedAccess` must treat as possibly
    // absent; the assertion states the invariant rather than papering over one.
    const holder = nightFloorTweens.get(target) ?? {
      v: entry.material.uniforms.uNightFloor!.value as number,
    };
    nightFloorTweens.set(target, holder);
    gsap.to(holder, {
      v: to,
      duration: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        entry.material.uniforms.uNightFloor!.value = holder.v;
      },
    });
  };

  const focusById = (id: string | undefined): FocusTarget | null => {
    if (!id) return null;
    return focusTargets.find((f) => f.project.id === id) ?? null;
  };

  const onClick = (e: MouseEvent): void => {
    if (selected) return;
    // Suppress click when the gesture was a drag — otherwise the click that
    // ends a rotate would also pick a planet underneath.
    if (dragMoved) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(raycastTargets);
    if (hits.length > 0) {
      // `userData.projectId` is a string we set ourselves in buildPlanet;
      // userDataString guards the Record<string, any> read.
      const id = userDataString(hits[0]!.object, 'projectId');
      const entry = focusById(id);
      if (entry) selectPlanet(entry);
    }
  };
  canvas.addEventListener('click', onClick);

  // ── Camera tween state ──────────────────────────────────────────────
  const initialCamera = sphericalToCartesian(
    sphericalCurrent.azimuth,
    sphericalCurrent.polar,
    sphericalCurrent.radius,
  );
  camera.position.set(initialCamera.x, initialCamera.y, initialCamera.z);
  camera.lookAt(SOLAR_LOOK_AT);
  const cameraTarget = camera.position.clone();
  const lookAtCurrent = SOLAR_LOOK_AT.clone();

  function selectPlanet(entry: FocusTarget): void {
    // Reset any in-progress hover state before locking the camera onto
    // the new selection. Without this the previously-hovered planet
    // keeps its 1.18× scale through the drawer's lifetime (the raycast
    // tick block is gated on !selected, so it never gets a chance to
    // tween down). Also clears any forced hover from the side-panel
    // list so a list-then-click flow doesn't leave forcedHovered
    // pointing at the now-selected planet's neighbour.
    if (hovered) {
      gsap.to(hovered.mesh.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.35,
        ease: 'power2.out',
      });
      hovered = null;
    }
    forcedHovered = null;
    canvas.style.cursor = '';
    hoverLabelHandle.hide();
    // Hide planet name labels while a project is focused — the drawer
    // already shows the project name prominently and the floating
    // labels would compete for attention.
    planetLabels.setHidden(true);
    selected = entry;
    onSelect(entry.project);
  }

  function deselect(): void {
    selected = null;
    planetLabels.setHidden(false);
    onDeselect();
  }

  // ── Resize ──────────────────────────────────────────────────────────
  // Line2's LineMaterial needs the viewport resolution to render proper
  // pixel-space line widths — hook it into the existing resize handler.
  const resize = createResizeHandler(
    renderer,
    camera,
    (w, h) => {
      resizeConnections(connectionsBundle.entries, w, h);
      composer?.setSize(w, h);
      // Re-fit only while the user is still on the default framing.
      if (!userZoomed) sphericalTarget.radius = computeFitRadius(sphericalCurrent.polar);
    },
    maxPixelRatio,
  );
  resize.handler();

  // ── Measured readiness (drives the loading gate's reveal) ────────────
  let readyResolved = false;
  let warmFrames = 0;
  let goodStreak = 0;
  let resolveReady: () => void = () => {};
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  // ── Animation loop ──────────────────────────────────────────────────
  const startTime = performance.now();
  let lastFrame = startTime;

  // Cap to ~60 fps regardless of monitor refresh — see homeScene.ts for
  // the reasoning. The orbit / camera / connection logic is delta-driven
  // so capping changes how often we render, not how fast things move.
  const TARGET_FRAME_MS = 1000 / 60 - 1;

  const planetWorldPos = new Vector3();
  const labelProjectionVec = new Vector3();

  const tick = (): void => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);

    const now = performance.now();
    if (now - lastFrame < TARGET_FRAME_MS) return;
    const elapsed = (now - startTime) / 1000;
    const delta = (now - lastFrame) / 1000;
    lastFrame = now;

    sun.tick(elapsed);

    // Every planet shades against the star's actual position, so a body on the
    // far side of the system is lit from the far side.
    for (const entry of orbiting) {
      entry.material.uniforms.uSunPos!.value = sunWorldPos;
    }

    // Planets orbit. The selected planet's angle stays frozen — the
    // camera lerp toward it (factor 0.06 below) takes ~1 s to settle,
    // and if the planet keeps moving during that time the click target
    // and the framed-final position don't match. Other planets keep
    // drifting at the reduced 0.18× speed so the scene stays alive.
    const baseOrbitScale = reducedMotion ? 0.25 : 1.0;
    const orbitSpeedScale = (selected ? 0.18 : 1.0) * baseOrbitScale;
    // INVARIANT for both `planetAngles.get(entry)!` below: every entry in
    // `orbiting` was given a starting angle when the map was built, and nothing
    // deletes from it — so a `get` keyed by an orbiting entry is always present.
    // `Map.get` is typed as possibly-undefined regardless, which is what the
    // assertions answer.
    for (const entry of orbiting) {
      if (entry.project.id !== selected?.project.id) {
        const next =
          planetAngles.get(entry)! + delta * entry.project.orbitSpeed * orbitSpeedScale;
        planetAngles.set(entry, next);
      }
      const angle = planetAngles.get(entry)!;
      entry.orbitMaterial.uniforms.uAngle!.value = angle;
      entry.group.position.set(
        Math.cos(angle) * entry.project.orbitRadius,
        0,
        Math.sin(angle) * entry.project.orbitRadius,
      );
      entry.mesh.rotation.y += delta * 0.4;
    }

    // External-API indicators — orbit the satellite and pulse the rings,
    // dimmed while a planet is selected so they don't crowd the close-up.
    const targetIndicatorVisibility = selected ? 0.18 : 1;
    indicatorVisibility += (targetIndicatorVisibility - indicatorVisibility) * 0.08;
    for (const ind of externalIndicators) {
      updateExternalIndicator(ind, elapsed, indicatorVisibility);
    }

    // Raycast hover (skip while a planet is selected). Forced hover from
    // the side-panel list takes priority over raycast, so a list-item
    // hover keeps the matching planet highlighted regardless of where
    // the cursor actually sits in the canvas.
    if (!selected) {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(raycastTargets);
      const raycastHovered =
        hits.length > 0 ? focusById(userDataString(hits[0]!.object, 'projectId')) : null;
      const newHovered = forcedHovered ?? raycastHovered;

      if (newHovered !== hovered) {
        if (hovered) {
          gsap.to(hovered.mesh.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.35,
            ease: 'power2.out',
          });
          setNightFloor(hovered, NIGHT_FLOOR);
        }
        if (newHovered) {
          // Physically the dark side stays dark; a portfolio still has to let
          // you read the thing you are pointing at. Lifting only the hovered
          // body keeps the terminator honest everywhere else.
          setNightFloor(newHovered, NIGHT_FLOOR_HOVERED);
          gsap.to(newHovered.mesh.scale, {
            x: newHovered.hoverScale,
            y: newHovered.hoverScale,
            z: newHovered.hoverScale,
            duration: 0.35,
            ease: 'power2.out',
          });
          canvas.style.cursor = 'pointer';
          hoverLabelHandle.show({
            name: newHovered.project.name,
            tagline: newHovered.project.tagline,
            tech: newHovered.project.tech,
            externalApis: newHovered.project.externalApis,
          });
          newHovered.group.getWorldPosition(planetWorldPos);
          hoverLabelHandle.position(planetWorldPos, camera, labelProjectionVec);
        } else {
          canvas.style.cursor = '';
          hoverLabelHandle.hide();
        }
        hovered = newHovered;
      } else if (hovered) {
        hovered.group.getWorldPosition(planetWorldPos);
        hoverLabelHandle.position(planetWorldPos, camera, labelProjectionVec);
      }
    } else {
      hoverLabelHandle.hide();
    }

    // Connections are hover-only: only the edges touching the planet under
    // the cursor (or the focused one) are drawn. Runs after the hover block
    // so it reacts in the same frame the hover changes. When nothing is lit
    // the whole group is skipped — that drops its draw calls AND the
    // per-frame Bézier/arc-length rebuild, which is the resting state.
    const activeEntry = forcedHovered ?? hovered ?? selected;
    const connectionsVisible = updateConnectionVisibility(
      connectionsBundle.entries,
      activeEntry?.project.id ?? null,
      CONNECTION_FADE_DAMPING,
    );
    connectionsBundle.group.visible = connectionsVisible;
    if (connectionsVisible) {
      updateConnections(connectionsBundle.entries);
      animateConnectionFlow(connectionsBundle.entries, elapsed);
    }

    // Camera target
    if (selected) {
      // Position camera at an offset relative to the planet's WORLD position.
      // Offset puts the planet on the LEFT third of the screen so the detail
      // panel can occupy the right side.
      selected.group.getWorldPosition(planetWorldPos);
      const offsetX = 2.0;
      const offsetY = 1.4;
      const offsetZ = selected.focusDistance;
      cameraTarget.set(
        planetWorldPos.x + offsetX,
        planetWorldPos.y + offsetY,
        planetWorldPos.z + offsetZ,
      );
      lookAtCurrent.lerp(planetWorldPos, 0.08);
    } else {
      // User-controlled spherical orbit. Damp current toward target each
      // frame; project to Cartesian for the camera target.
      sphericalCurrent.azimuth = damp(
        sphericalCurrent.azimuth,
        sphericalTarget.azimuth,
        SPHERICAL_DAMPING,
      );
      sphericalCurrent.polar = damp(
        sphericalCurrent.polar,
        sphericalTarget.polar,
        SPHERICAL_DAMPING,
      );
      sphericalCurrent.radius = damp(
        sphericalCurrent.radius,
        sphericalTarget.radius,
        SPHERICAL_DAMPING,
      );
      const pos = sphericalToCartesian(
        sphericalCurrent.azimuth,
        sphericalCurrent.polar,
        sphericalCurrent.radius,
      );
      cameraTarget.set(pos.x, pos.y, pos.z);
      lookAtCurrent.lerp(SOLAR_LOOK_AT, 0.08);
    }

    // Smooth camera move. Slightly higher lerp factor when free-orbiting so
    // drag/zoom feel responsive without being snappy.
    camera.position.lerp(cameraTarget, selected ? 0.06 : 0.12);
    camera.lookAt(lookAtCurrent);

    // Starfield slow drift (parallax)
    starfield.points.rotation.y = elapsed * 0.005;

    // Planet name labels — projected screen-space follow each planet.
    planetLabels.update(camera);

    if (composer) composer.render(delta);
    else renderer.render(scene, camera);

    // The first frames have to prove the scene renders under the jank
    // threshold before the gate lets the visitor in.
    if (!readyResolved) {
      const frameCpu = performance.now() - now;
      warmFrames++;
      goodStreak = frameCpu < READY_FRAME_MS ? goodStreak + 1 : 0;
      if (goodStreak >= READY_STREAK || warmFrames >= READY_FRAME_CAP) {
        readyResolved = true;
        resolveReady();
      }
    }

    perfOverlay?.tick(delta);
  };

  // Pause when the canvas is fully off-screen (e.g. user scrolled the
  // side-panel content past the canvas on narrow viewports).
  const pauser = createOffscreenPauser({
    target: canvas,
    onResume: (): void => {
      if (disposed || document.hidden || raf !== 0) return;
      lastFrame = performance.now();
      tick();
    },
    onPause: (): void => {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
    },
  });

  const onVisibilityChange = (): void => {
    if (disposed) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (raf === 0 && pauser.isVisible()) {
      lastFrame = performance.now();
      tick();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  tick();

  return {
    selectById: (id: string | null): void => {
      if (id === null) {
        if (selected) deselect();
        return;
      }
      const entry = focusById(id);
      if (entry && entry !== selected) selectPlanet(entry);
    },
    hoverById: (id: string | null): void => {
      // Don't fight the selected-planet camera focus. Raycast hover is
      // already disabled while a planet is selected; mirror that here.
      if (selected) {
        forcedHovered = null;
        return;
      }
      forcedHovered = focusById(id ?? undefined);
    },
    whenReady: (): Promise<void> => readyPromise,
    resize: resize.handler,
    dispose: (): void => {
      // A gate waiting on a scene that is being torn down would hold the page
      // forever; release it before anything else.
      resolveReady();
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      resize.dispose();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      canvas.removeEventListener('pointerup', onCanvasPointerUp);
      canvas.removeEventListener('pointercancel', onCanvasPointerUp);
      canvas.removeEventListener('wheel', onCanvasWheel);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      pauser.dispose();
      perfOverlay?.dispose();

      // Kill any in-flight hover tweens before the Vector3s they target are
      // freed alongside the meshes below.
      for (const f of focusTargets) {
        gsap.killTweensOf(f.mesh.scale);
      }
      for (const holder of nightFloorTweens.values()) gsap.killTweensOf(holder);
      nightFloorTweens.clear();

      // Reset hover-driven DOM state so nothing is left behind on teardown.
      canvas.style.cursor = '';
      hoverLabelHandle.reset();

      for (const p of orbiting) {
        p.mesh.geometry.dispose();
        disposeMaterial(p.mesh.material);
        // A render target is GPU memory the material does not own.
        p.surfaceTarget?.dispose();
        p.orbitLine.geometry.dispose();
        disposeMaterial(p.orbitLine.material);
        if (p.ring) {
          p.ring.geometry.dispose();
          disposeMaterial(p.ring.material);
        }
      }

      sun.coreGeometry.dispose();
      sun.coreMaterial.dispose();
      sun.coronaGeometry.dispose();
      sun.coronaMaterial.dispose();
      starfield.geometry.dispose();
      starfield.material.dispose();
      disposeConnections(connectionsBundle.entries);
      scene.remove(connectionsBundle.group);
      disposeExternalIndicators(externalIndicators);
      planetLabels.dispose();

      composer?.dispose();
      scene.fog = null;
      scene.clear();
      renderer.dispose();
      // Release the WebGL context now (dispose() only frees GPU objects, not the
      // context) — this scene is created/destroyed per navigation under
      // client-side routing, so leaving contexts for GC lets them pile up.
      renderer.forceContextLoss();
    },
  };
}
