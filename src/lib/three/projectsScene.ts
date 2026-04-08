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
import type { LocalizedProject } from '../../data/projects';
import { createRenderer } from './createRenderer';
import { createResizeHandler } from './createResizeHandler';
import { disposeMaterial } from './disposeMaterial';
import { buildStarfield } from './projects/buildStarfield';
import { buildSun } from './projects/buildSun';
import { buildPlanet, type PlanetEntry } from './projects/buildPlanet';
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
  const sunLight = new PointLight(0xffd6a0, 3.2, 180, 1.4);
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

  const findPlanetByMeshId = (id: string | undefined): PlanetEntry | null => {
    if (!id) return null;
    return planets.find((p) => p.project.id === id) ?? null;
  };

  const onClick = (e: MouseEvent): void => {
    if (selected) return;
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
  const resize = createResizeHandler(renderer, camera);

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
      cameraTarget.copy(SOLAR_CAMERA_POS);
      lookAtCurrent.lerp(SOLAR_LOOK_AT, 0.08);
    }

    // Smooth camera move
    camera.position.lerp(cameraTarget, selected ? 0.06 : 0.045);
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
      starfield.geometry.dispose();
      starfield.material.dispose();

      scene.remove(sunLight, ambient);
      sunLight.dispose();
      ambient.dispose();

      scene.fog = null;
      scene.clear();
      renderer.dispose();
    },
  };
}
