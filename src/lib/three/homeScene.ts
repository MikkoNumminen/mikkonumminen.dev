import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  DirectionalLight,
  Fog,
  PerspectiveCamera,
  PointLight,
  Scene,
} from 'three';
import { createRenderer } from './createRenderer';
import { createResizeHandler } from './createResizeHandler';
import { buildParticleField, type ParticleField } from './buildParticleField';
import { buildTitle, loadFont } from './buildTitle';
import { buildEnvironment, type EnvironmentHandle } from './buildEnvironment';
import { buildGalaxyLayer, type GalaxyLayerHandle } from './buildGalaxyLayer';
import { buildHorizonGlow, type HorizonGlowHandle } from './buildHorizonGlow';
import { buildMountainLayer, type MountainLayerHandle } from './buildMountainLayer';
import { createBloomComposer, type BloomComposerHandle } from './postprocessing';
import { disposeMaterial } from './disposeMaterial';

interface HomeSceneOptions {
  canvas: HTMLCanvasElement;
  fontUrl: string;
  reducedMotion?: boolean;
}

export interface HomeSceneHandle {
  setScrollProgress: (progress: number) => void;
  dispose: () => void;
  resize: () => void;
}

const FOG_COLOR = 0x05060c;
const TITLE = 'MIKKO\nNUMMINEN';
const TITLE_DESIGN_WIDTH = 1100;
const TITLE_MIN_SCALE = 0.5;
const PARTICLE_AREA_DIVISOR = 800;
const PARTICLE_MAX = 2200;

export async function createHomeScene(opts: HomeSceneOptions): Promise<HomeSceneHandle> {
  const { canvas, fontUrl, reducedMotion = false } = opts;

  // Load the font BEFORE allocating any GPU/DOM resources. If the font fails
  // we never enter the try-block, so there is nothing to clean up.
  const font = await loadFont(fontUrl);

  const renderer = createRenderer(canvas, {
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.05,
  });

  const scene = new Scene();
  scene.fog = new Fog(FOG_COLOR, 12, 60);

  // ── Environment (drives the chrome reflection on the title) ──────────
  const env: EnvironmentHandle = buildEnvironment(renderer);
  scene.environment = env.envMap;

  const camera = new PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 0, 18);

  // ── Lighting ─────────────────────────────────────────────────────────
  const ambient = new AmbientLight(0xffffff, 0.28);
  scene.add(ambient);

  const keyLight = new DirectionalLight(0xeaf2ff, 1.4);
  keyLight.position.set(6, 8, 10);
  scene.add(keyLight);

  // Rim is animated on a slow orbit in the tick loop so a specular streak
  // periodically traverses the letterforms — the Apple-keynote sweep.
  const rimLight = new DirectionalLight(0xa6c2ff, 1.1);
  rimLight.position.set(-8, -2, -4);
  scene.add(rimLight);

  const fillLight = new PointLight(0xff8a4c, 0.55, 40);
  fillLight.position.set(-4, 4, 6);
  scene.add(fillLight);

  // ── Horizon glow plate (sun-side halo behind the title) ──────────────
  const horizon: HorizonGlowHandle = buildHorizonGlow();
  scene.add(horizon.mesh);

  // ── Galaxy layer (projects-world hint, far back lower-left) ──────────
  const galaxy: GalaxyLayerHandle = buildGalaxyLayer();
  scene.add(galaxy.group);

  // ── Mountain silhouette (experience-world hint, lower-right horizon) ─
  const mountain: MountainLayerHandle = buildMountainLayer();
  scene.add(mountain.mesh);

  // ── Particle field ───────────────────────────────────────────────────
  const particleCount = reducedMotion
    ? 0
    : Math.min(
        PARTICLE_MAX,
        Math.floor((window.innerWidth * window.innerHeight) / PARTICLE_AREA_DIVISOR),
      );
  let particleField: ParticleField | null = null;
  if (particleCount > 0) {
    particleField = buildParticleField(particleCount);
    scene.add(particleField.points);
  }

  // ── Title ────────────────────────────────────────────────────────────
  const title = buildTitle(font, TITLE);
  scene.add(title.group);
  const totalHeight = title.totalHeight;

  // ── Postprocessing: bloom on bright specular peaks + sun glow ────────
  // Skipped for reduced-motion clients to keep them on the cheap path.
  const bloom: BloomComposerHandle | null = reducedMotion
    ? null
    : createBloomComposer(renderer, scene, camera, {
        strength: 0.55,
        radius: 0.5,
        threshold: 0.82,
      });

  // ── State ────────────────────────────────────────────────────────────
  let disposed = false;
  let raf = 0;
  let scrollProgress = 0;
  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;

  const onPointerMove = (e: PointerEvent): void => {
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (!reducedMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  const resize = createResizeHandler(renderer, camera, (width) => {
    const baseScale = Math.min(1, width / TITLE_DESIGN_WIDTH);
    title.group.scale.setScalar(Math.max(TITLE_MIN_SCALE, baseScale));
    if (bloom) bloom.resize(window.innerWidth, window.innerHeight);
  });
  resize.handler();

  // ── Animation loop (visibility-aware) ────────────────────────────────
  const startTime = performance.now();
  let lastFrame = startTime;

  // One-shot entrance: title flies in from far-Z with a slight tilt over
  // ENTRANCE_DURATION seconds, then settles into its idle float. Disabled
  // for reduced-motion clients so they see the title in its final pose.
  const ENTRANCE_DURATION = 1.4;

  const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);

  const tick = (): void => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);

    const now = performance.now();
    const elapsed = (now - startTime) / 1000;
    const delta = (now - lastFrame) / 1000;
    lastFrame = now;

    // Smooth pointer
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    // Entrance: 0 → 1 over ENTRANCE_DURATION, then frozen at 1.
    const entrance = reducedMotion
      ? 1
      : easeOutCubic(Math.min(1, elapsed / ENTRANCE_DURATION));
    const entranceOffset = (1 - entrance) * -22;
    const entranceTilt = (1 - entrance) * 0.18;

    // Title floats and reacts to pointer + scroll
    title.group.rotation.x =
      mouseY * 0.12 + Math.sin(elapsed * 0.5) * 0.02 - entranceTilt;
    title.group.rotation.y = mouseX * 0.18 + Math.sin(elapsed * 0.4) * 0.03;
    title.group.position.z = -scrollProgress * 6 + entranceOffset;
    title.group.position.y =
      totalHeight / 2 + Math.sin(elapsed * 0.7) * 0.08 + scrollProgress * 1.5;

    // Sweeping rim light — slow 14-second orbit around the title so a
    // specular streak periodically traverses the chrome.
    const rimAngle = (elapsed * Math.PI * 2) / 14;
    rimLight.position.set(
      Math.cos(rimAngle) * 9,
      2 + Math.sin(rimAngle * 0.5) * 1.5,
      Math.sin(rimAngle) * 9 - 2,
    );

    // Horizon glow gently pulses to sell "atmospheric" — half the period of
    // the rim sweep so they never line up boringly.
    horizon.material.opacity = reducedMotion
      ? 0.85
      : 0.78 + Math.sin(elapsed * 0.45) * 0.08;

    // Galaxy slowly rotates around its own normal axis so the spiral arms
    // visibly turn as you watch — far enough back that the motion reads as
    // a slow drift, not a foreground spin.
    if (!reducedMotion) {
      galaxy.group.rotation.z = elapsed * 0.025;
    }

    // Mountain silhouette gets a tiny mouse-driven parallax shift so it
    // doesn't sit completely flat behind the title. Kept very subtle — it's
    // a hint, not the main subject.
    mountain.mesh.position.x = 3 + mouseX * 0.4;
    mountain.mesh.position.y = -7.5 + mouseY * 0.18;

    // Camera pulls back slightly with scroll, plus a slow lazy ~30-second
    // orbit so each world layer rotates across the title's reflection. The
    // orbit is tiny (≤1 unit) — sells "alive" without feeling drifty.
    const orbit = reducedMotion ? 0 : 1;
    const orbitAngle = (elapsed * Math.PI * 2) / 30;
    camera.position.z = 18 + scrollProgress * 4;
    camera.position.x = mouseX * 0.6 + Math.sin(orbitAngle) * 0.9 * orbit;
    camera.position.y =
      -mouseY * 0.4 - scrollProgress * 0.5 + Math.cos(orbitAngle) * 0.45 * orbit;
    camera.lookAt(0, 0, 0);

    if (particleField) {
      const posAttr = particleField.geometry.getAttribute('position') as BufferAttribute;
      // `array` is the same Float32Array we passed in via BufferAttribute,
      // but Three.js types it as the typed-array union.
      const arr = posAttr.array as Float32Array;
      const speeds = particleField.speeds;
      for (let i = 0; i < particleField.count; i++) {
        const i3 = i * 3;
        // Both lookups are in-bounds: i < count and the position array is
        // length count*3, the speed array is length count.
        const next = arr[i3 + 1]! + speeds[i]! * delta;
        arr[i3 + 1] = next > 25 ? -25 : next;
      }
      posAttr.needsUpdate = true;
      particleField.points.rotation.y = elapsed * 0.02;
    }

    if (bloom) {
      bloom.composer.render();
    } else {
      renderer.render(scene, camera);
    }
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
    resize: resize.handler,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      resize.dispose();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);

      title.meshes.forEach((m) => m.geometry.dispose());
      disposeMaterial(title.material);

      if (particleField) {
        particleField.geometry.dispose();
        disposeMaterial(particleField.material);
        particleField.texture.dispose();
      }

      scene.remove(
        ambient,
        keyLight,
        rimLight,
        fillLight,
        horizon.mesh,
        galaxy.group,
        mountain.mesh,
      );
      ambient.dispose();
      keyLight.dispose();
      rimLight.dispose();
      fillLight.dispose();
      horizon.geometry.dispose();
      horizon.material.dispose();
      horizon.texture.dispose();

      galaxy.starsGeometry.dispose();
      galaxy.starsMaterial.dispose();
      galaxy.ringGeometry.dispose();
      galaxy.ringMaterial.dispose();

      mountain.geometry.dispose();
      mountain.material.dispose();

      scene.environment = null;
      env.envMap.dispose();
      env.source.dispose();
      env.pmrem.dispose();

      bloom?.dispose();

      scene.fog = null;
      scene.clear();

      renderer.dispose();
    },
  };
}
