import {
  ACESFilmicToneMapping,
  AmbientLight,
  FogExp2,
  Mesh,
  PerspectiveCamera,
  PointLight,
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
import { buildStarfield } from './projects/buildStarfield';
import { buildSun } from './projects/buildSun';
import { buildPlanet, type PlanetEntry } from './projects/buildPlanet';
import {
  buildConnections,
  updateConnections,
  animateConnectionFlow,
  fadeConnections,
  resizeConnections,
  disposeConnections,
} from './projects/buildConnections';
import { createHoverLabel } from './projects/createHoverLabel';

export interface ProjectsSceneOptions {
  canvas: HTMLCanvasElement;
  hoverLabel: HTMLElement;
  /** Localized project data merged from i18n. */
  projects: LocalizedProject[];
  onSelect: (project: LocalizedProject) => void;
  onDeselect: () => void;
  reducedMotion?: boolean;
}

export interface ProjectsSceneHandle {
  selectById: (id: string | null) => void;
  resize: () => void;
  dispose: () => void;
}

const FOG_COLOR = 0x020512;
const SOLAR_CAMERA_POS = new Vector3(0, 8, 28);
const SOLAR_LOOK_AT = new Vector3(0, 0, 0);

// Camera-control tuning. Spherical coords (azimuth, polar, radius) are
// damped each frame toward their target values, which the user nudges
// via drag (rotate) and wheel (zoom).
const SPHERICAL_DAMPING = 0.18;
const ROTATE_SPEED = 0.005;
const ZOOM_SPEED = 0.0015;
const MIN_RADIUS = 12;
const MAX_RADIUS = 60;
const MIN_POLAR = 0.25;
const MAX_POLAR = Math.PI - 0.25;
const DRAG_THRESHOLD = 4;

export function createProjectsScene(opts: ProjectsSceneOptions): ProjectsSceneHandle {
  const {
    canvas,
    hoverLabel,
    projects,
    onSelect,
    onDeselect,
    reducedMotion = false,
  } = opts;

  // ── Lifecycle state (hoisted so resize/visibility handlers can read it) ─
  let disposed = false;
  let raf = 0;

  // ── Renderer ────────────────────────────────────────────────────────
  const renderer = createRenderer(canvas, {
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.05,
  });

  // ── Scene + camera ──────────────────────────────────────────────────
  const scene = new Scene();
  scene.fog = new FogExp2(FOG_COLOR, 0.012);

  const camera = new PerspectiveCamera(
    52,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );
  camera.position.copy(SOLAR_CAMERA_POS);
  camera.lookAt(SOLAR_LOOK_AT);

  // ── Starfield ───────────────────────────────────────────────────────
  const starfield = buildStarfield();
  scene.add(starfield.points);

  // ── Sun ─────────────────────────────────────────────────────────────
  const sun = buildSun();
  scene.add(sun.group);

  // ── Lighting ────────────────────────────────────────────────────────
  const sunLight = new PointLight(0xffd6a0, 4.2, 220, 1.3);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  const ambient = new AmbientLight(0x404060, 0.55);
  scene.add(ambient);

  // ── Planets ─────────────────────────────────────────────────────────
  const planets: PlanetEntry[] = [];
  for (const project of projects) {
    const built = buildPlanet(project);
    scene.add(built.rootGroup);
    planets.push(built.entry);
  }
  // Cached once so the raycaster doesn't allocate per frame and per click.
  const planetMeshes: Mesh[] = planets.map((p) => p.mesh);

  // ── Connections (semantic edges between related projects) ──────────
  const connectionsBundle = buildConnections(connections, planets, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  scene.add(connectionsBundle.group);
  let connectionVisibility = 1;

  // ── Hover label ─────────────────────────────────────────────────────
  const hoverLabelHandle = createHoverLabel(hoverLabel);

  // ── Raycasting state ────────────────────────────────────────────────
  const raycaster = new Raycaster();
  const pointer = new Vector2(-1, -1);
  let hovered: PlanetEntry | null = null;
  let selected: PlanetEntry | null = null;

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
  // Initial spherical derived from SOLAR_CAMERA_POS (0, 8, 28).
  const initialRadius = Math.sqrt(
    SOLAR_CAMERA_POS.x ** 2 + SOLAR_CAMERA_POS.y ** 2 + SOLAR_CAMERA_POS.z ** 2,
  );
  const sphericalCurrent = {
    azimuth: Math.atan2(SOLAR_CAMERA_POS.x, SOLAR_CAMERA_POS.z),
    polar: Math.acos(SOLAR_CAMERA_POS.y / initialRadius),
    radius: initialRadius,
  };
  const sphericalTarget = { ...sphericalCurrent };

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
      Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > DRAG_THRESHOLD
    ) {
      dragMoved = true;
    }
    if (dragMoved) {
      sphericalTarget.azimuth -= dx * ROTATE_SPEED;
      sphericalTarget.polar -= dy * ROTATE_SPEED;
      if (sphericalTarget.polar < MIN_POLAR) sphericalTarget.polar = MIN_POLAR;
      if (sphericalTarget.polar > MAX_POLAR) sphericalTarget.polar = MAX_POLAR;
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
    const factor = Math.exp(e.deltaY * ZOOM_SPEED);
    let next = sphericalTarget.radius * factor;
    if (next < MIN_RADIUS) next = MIN_RADIUS;
    if (next > MAX_RADIUS) next = MAX_RADIUS;
    sphericalTarget.radius = next;
  };

  canvas.addEventListener('pointerdown', onCanvasPointerDown);
  canvas.addEventListener('pointermove', onCanvasPointerMove);
  canvas.addEventListener('pointerup', onCanvasPointerUp);
  canvas.addEventListener('pointercancel', onCanvasPointerUp);
  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  canvas.style.touchAction = 'none';

  const findPlanetByMeshId = (id: string | undefined): PlanetEntry | null => {
    if (!id) return null;
    return planets.find((p) => p.project.id === id) ?? null;
  };

  const onClick = (e: MouseEvent): void => {
    if (selected) return;
    // Suppress click when the gesture was a drag — otherwise the click that
    // ends a rotate would also pick a planet underneath.
    if (dragMoved) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(planetMeshes);
    if (hits.length > 0) {
      // `userData.projectId` is a string we set ourselves in buildPlanet,
      // but Three.js types `userData` as `Record<string, any>`.
      const id = hits[0]!.object.userData.projectId as string | undefined;
      const entry = findPlanetByMeshId(id);
      if (entry) selectPlanet(entry);
    }
  };
  canvas.addEventListener('click', onClick);

  // ── Camera tween state ──────────────────────────────────────────────
  const cameraTarget = SOLAR_CAMERA_POS.clone();
  const lookAtCurrent = SOLAR_LOOK_AT.clone();

  function selectPlanet(entry: PlanetEntry): void {
    selected = entry;
    onSelect(entry.project);
  }

  function deselect(): void {
    selected = null;
    onDeselect();
  }

  // ── Resize ──────────────────────────────────────────────────────────
  // Line2's LineMaterial needs the viewport resolution to render proper
  // pixel-space line widths — hook it into the existing resize handler.
  const resize = createResizeHandler(renderer, camera, (w, h) => {
    resizeConnections(connectionsBundle.entries, w, h);
  });

  // ── Animation loop ──────────────────────────────────────────────────
  const startTime = performance.now();
  let lastFrame = startTime;

  const planetWorldPos = new Vector3();
  const labelProjectionVec = new Vector3();

  const tick = (): void => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);

    const now = performance.now();
    const elapsed = (now - startTime) / 1000;
    const delta = (now - lastFrame) / 1000;
    lastFrame = now;

    // Sun spin
    sun.core.rotation.y = elapsed * 0.2;
    // ShaderMaterial uniforms are typed as Record<string, IUniform>; the
    // `intensity` key is set in createGlowMaterial so the lookup is safe.
    sun.glowMaterial.uniforms.intensity!.value = 1.3 + Math.sin(elapsed * 1.8) * 0.12;
    // Independent sine pulses on the corona sprites give the sun a sense
    // of life. Halo breathes slow, flare flickers faster.
    const haloScale = 9 + Math.sin(elapsed * 0.9) * 0.45;
    sun.halo.scale.set(haloScale, haloScale, 1);
    const flareScale = 4.5 + Math.sin(elapsed * 2.3) * 0.35;
    sun.flare.scale.set(flareScale, flareScale, 1);

    // Planets orbit
    const baseOrbitScale = reducedMotion ? 0.25 : 1.0;
    const orbitSpeedScale = (selected ? 0.18 : 1.0) * baseOrbitScale;
    for (const entry of planets) {
      const angle =
        entry.project.phase + elapsed * entry.project.orbitSpeed * orbitSpeedScale;
      entry.group.position.set(
        Math.cos(angle) * entry.project.orbitRadius,
        0,
        Math.sin(angle) * entry.project.orbitRadius,
      );
      entry.mesh.rotation.y += delta * 0.4;
    }

    // Connections — recompute arc positions from current planet world
    // positions, advance the dash flow, and dim while a planet is selected.
    updateConnections(connectionsBundle.entries);
    animateConnectionFlow(connectionsBundle.entries, elapsed);
    const targetVisibility = selected ? 0.18 : 1;
    connectionVisibility += (targetVisibility - connectionVisibility) * 0.08;
    fadeConnections(connectionsBundle.entries, connectionVisibility);

    // Raycast hover (skip while a planet is selected)
    if (!selected) {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(planetMeshes);
      const newHovered =
        hits.length > 0
          ? findPlanetByMeshId(hits[0]!.object.userData.projectId as string | undefined)
          : null;

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
            x: 1.18,
            y: 1.18,
            z: 1.18,
            duration: 0.35,
            ease: 'power2.out',
          });
          canvas.style.cursor = 'pointer';
          hoverLabelHandle.show({
            name: newHovered.project.name,
            tagline: newHovered.project.tagline,
            tech: newHovered.project.tech,
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

    // Camera target
    if (selected) {
      // Position camera at an offset relative to the planet's WORLD position.
      // Offset puts the planet on the LEFT third of the screen so the detail
      // panel can occupy the right side.
      selected.group.getWorldPosition(planetWorldPos);
      const offsetX = 2.0;
      const offsetY = 1.4;
      const offsetZ = 4.5 + selected.project.scale * 1.5;
      cameraTarget.set(
        planetWorldPos.x + offsetX,
        planetWorldPos.y + offsetY,
        planetWorldPos.z + offsetZ,
      );
      lookAtCurrent.lerp(planetWorldPos, 0.08);
    } else {
      // User-controlled spherical orbit. Damp current toward target each
      // frame; project to Cartesian for the camera target.
      sphericalCurrent.azimuth +=
        (sphericalTarget.azimuth - sphericalCurrent.azimuth) * SPHERICAL_DAMPING;
      sphericalCurrent.polar +=
        (sphericalTarget.polar - sphericalCurrent.polar) * SPHERICAL_DAMPING;
      sphericalCurrent.radius +=
        (sphericalTarget.radius - sphericalCurrent.radius) * SPHERICAL_DAMPING;
      const sinPolar = Math.sin(sphericalCurrent.polar);
      cameraTarget.set(
        sphericalCurrent.radius * sinPolar * Math.sin(sphericalCurrent.azimuth),
        sphericalCurrent.radius * Math.cos(sphericalCurrent.polar),
        sphericalCurrent.radius * sinPolar * Math.cos(sphericalCurrent.azimuth),
      );
      lookAtCurrent.lerp(SOLAR_LOOK_AT, 0.08);
    }

    // Smooth camera move. Slightly higher lerp factor when free-orbiting so
    // drag/zoom feel responsive without being snappy.
    camera.position.lerp(cameraTarget, selected ? 0.06 : 0.12);
    camera.lookAt(lookAtCurrent);

    // Starfield slow drift (parallax)
    starfield.points.rotation.y = elapsed * 0.005;

    renderer.render(scene, camera);
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
    selectById: (id: string | null): void => {
      if (id === null) {
        if (selected) deselect();
        return;
      }
      const entry = planets.find((p) => p.project.id === id);
      if (entry && entry !== selected) selectPlanet(entry);
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

      // Kill any in-flight hover tweens before the Vector3s they target are
      // freed alongside the meshes below.
      for (const p of planets) {
        gsap.killTweensOf(p.mesh.scale);
      }

      // Reset hover-driven DOM state so nothing is left behind on teardown.
      canvas.style.cursor = '';
      hoverLabelHandle.reset();

      for (const p of planets) {
        p.mesh.geometry.dispose();
        disposeMaterial(p.mesh.material);
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

      scene.remove(sunLight, ambient);
      sunLight.dispose();
      ambient.dispose();

      scene.fog = null;
      scene.clear();
      renderer.dispose();
    },
  };
}
