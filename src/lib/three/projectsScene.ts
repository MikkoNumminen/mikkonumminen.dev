/**
 * Projects page (`/projects`) scene: a "solar system" — one planet per project
 * orbiting a central sun, with drag-rotate / wheel-zoom camera control and
 * click-to-select. Entry point is `createProjectsScene` (below).
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  FogExp2,
  Mesh,
  PerspectiveCamera,
  PointLight,
  type Object3D,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three';
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
import { buildSun } from './projects/buildSun';
import { buildPlanet, type PlanetEntry } from './projects/buildPlanet';
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
  const starfield = buildStarfield();
  scene.add(starfield.points);

  // ── Sun ─────────────────────────────────────────────────────────────
  // HRM is the star, not a planet: it is the hub the rest of the system hangs
  // off, and ranking by size alone understated that.
  const sunProject = projects.find((p) => p.isSun) ?? null;
  const sun = buildSun();
  scene.add(sun.group);

  // ── Lighting ────────────────────────────────────────────────────────
  // Sun radiates outward without distance falloff so outer planets
  // aren't visibly dimmer than inner ones. Intensity tuned so the lit
  // hemisphere reads bright against the starfield without blowing out
  // the procedural surface texture detail.
  const sunLight = new PointLight(0xffd6a0, 3.6, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  // Ambient lifts the dark hemispheres just enough that planets read
  // as 3D bodies rather than crescent silhouettes. Cool blue tint so
  // the dark side feels like reflected starlight, not a flat fill.
  const ambient = new AmbientLight(0x2a3a60, 0.3);
  scene.add(ambient);
  // Cool counter-rim catches the side opposite the sun and gives the
  // planets a defined edge against the deep-space backdrop.
  const rimLight = new DirectionalLight(0x6a8cc0, 0.32);
  rimLight.position.set(-10, -2, -8);
  scene.add(rimLight);

  // Camera-tracked fill light. Planets orbiting between camera and
  // sun show their dark hemisphere to the viewer — physically correct
  // but a portfolio scene needs every planet readable. This light
  // follows the camera each frame so the side facing the viewer is
  // always lit. Cool blue-white tint keeps the deep-space mood
  // intact rather than reading as studio fill.
  const cameraFill = new DirectionalLight(0x9cb6e0, 0.55);
  // Target stays at scene origin; updating cameraFill.position each
  // frame aims the directional ray camera→origin. Adding the target
  // to the scene is the documented three.js pattern — it ensures
  // matrixWorld updates correctly if anyone later enables shadows or
  // moves the target.
  scene.add(cameraFill, cameraFill.target);

  // ── Bodies ──────────────────────────────────────────────────────────
  // One project is the star, one is a moon of another, the rest are planets.
  // Every project stays in `projects` regardless — the terminal, the fallback
  // grid and the timeline linkifier all read that same list.
  const planetProjects = projects.filter((p) => !p.isSun && !p.moonOf);
  const moonProjects = projects.filter((p) => p.moonOf);

  const planets: PlanetEntry[] = [];
  for (const project of planetProjects) {
    const built = buildPlanet(project);
    scene.add(built.rootGroup);
    planets.push(built.entry);
  }

  // Moons hang off their parent's positioned group, so they ride the parent's
  // orbit for free and only have to track their own local angle.
  const moons: PlanetEntry[] = [];
  for (const project of moonProjects) {
    const parent = planets.find((p) => p.project.id === project.moonOf);
    if (!parent) continue;
    const built = buildPlanet(project);
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
      // Far enough back to clear the corona shell, which extends to 3.1.
      focusDistance: 11,
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
  const connectionsBundle = buildConnections(connections, planets, {
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
  const externalIndicators: ExternalIndicator[] = [];
  for (const planet of planets) {
    if (planet.project.externalApis && planet.project.externalApis.length > 0) {
      externalIndicators.push(buildExternalIndicator(planet));
    }
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
      // Re-fit only while the user is still on the default framing.
      if (!userZoomed) sphericalTarget.radius = computeFitRadius(sphericalCurrent.polar);
    },
    maxPixelRatio,
  );
  resize.handler();

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

    // Sun spin
    sun.core.rotation.y = elapsed * 0.2;
    // ShaderMaterial uniforms are typed as Record<string, IUniform>; the
    // `intensity` key is set in createGlowMaterial so the lookup is safe.
    sun.glowMaterial.uniforms.intensity!.value = 1.75 + Math.sin(elapsed * 1.8) * 0.18;
    // Independent sine pulses on the corona sprites give the sun a sense
    // of life. Halo breathes slow, flare flickers faster.
    const haloScale = 11.5 + Math.sin(elapsed * 0.9) * 0.6;
    sun.halo.scale.set(haloScale, haloScale, 1);
    const flareScale = 5.6 + Math.sin(elapsed * 2.3) * 0.45;
    sun.flare.scale.set(flareScale, flareScale, 1);

    // Planets orbit. The selected planet's angle stays frozen — the
    // camera lerp toward it (factor 0.06 below) takes ~1 s to settle,
    // and if the planet keeps moving during that time the click target
    // and the framed-final position don't match. Other planets keep
    // drifting at the reduced 0.18× speed so the scene stays alive.
    const baseOrbitScale = reducedMotion ? 0.25 : 1.0;
    const orbitSpeedScale = (selected ? 0.18 : 1.0) * baseOrbitScale;
    for (const entry of orbiting) {
      if (entry.project.id !== selected?.project.id) {
        const next =
          planetAngles.get(entry)! + delta * entry.project.orbitSpeed * orbitSpeedScale;
        planetAngles.set(entry, next);
      }
      const angle = planetAngles.get(entry)!;
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
        }
        if (newHovered) {
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

    // Camera-tracked fill follows the camera each frame so whichever
    // hemisphere of each planet is facing the viewer stays lit.
    cameraFill.position.copy(camera.position);

    // Planet name labels — projected screen-space follow each planet.
    planetLabels.update(camera);

    renderer.render(scene, camera);

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
    resize: resize.handler,
    dispose: (): void => {
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

      // Reset hover-driven DOM state so nothing is left behind on teardown.
      canvas.style.cursor = '';
      hoverLabelHandle.reset();

      for (const p of orbiting) {
        p.mesh.geometry.dispose();
        disposeMaterial(p.mesh.material);
        // Material.dispose() does NOT walk attached textures, so the
        // procedural surface + bump textures must be freed explicitly.
        p.surfaceMap.dispose();
        p.bumpMap.dispose();
        p.glow.geometry.dispose();
        disposeMaterial(p.glow.material);
        p.orbitLine.geometry.dispose();
        disposeMaterial(p.orbitLine.material);
        if (p.ring) {
          p.ring.geometry.dispose();
          disposeMaterial(p.ring.material);
        }
      }

      sun.coreGeometry.dispose();
      sun.coreMaterial.dispose();
      sun.glowGeometry.dispose();
      sun.glowMaterial.dispose();
      sun.haloMaterial.dispose();
      sun.haloTexture.dispose();
      sun.flareMaterial.dispose();
      sun.flareTexture.dispose();
      starfield.geometry.dispose();
      starfield.material.dispose();
      disposeConnections(connectionsBundle.entries);
      scene.remove(connectionsBundle.group);
      disposeExternalIndicators(externalIndicators);
      planetLabels.dispose();

      scene.remove(sunLight, ambient, rimLight, cameraFill, cameraFill.target);
      sunLight.dispose();
      ambient.dispose();
      rimLight.dispose();
      cameraFill.dispose();

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
