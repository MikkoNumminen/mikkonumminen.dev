import * as THREE from 'three';
import { createRenderer } from './createRenderer';
import { createResizeHandler } from './createResizeHandler';
import { buildParticleField, type ParticleField } from './buildParticleField';
import { buildTitle, loadFont } from './buildTitle';
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

  const renderer = createRenderer(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_COLOR, 12, 60);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 0, 18);

  // ── Lighting ─────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xeaf2ff, 1.6);
  keyLight.position.set(6, 8, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x80a8ff, 0.9);
  rimLight.position.set(-8, -2, -4);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0xff8a4c, 0.6, 40);
  fillLight.position.set(-4, 4, 6);
  scene.add(fillLight);

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
  });
  resize.handler();

  // ── Animation loop (visibility-aware) ────────────────────────────────
  const startTime = performance.now();
  let lastFrame = startTime;

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

    // Title floats and reacts to pointer + scroll
    title.group.rotation.x = mouseY * 0.12 + Math.sin(elapsed * 0.5) * 0.02;
    title.group.rotation.y = mouseX * 0.18 + Math.sin(elapsed * 0.4) * 0.03;
    title.group.position.z = -scrollProgress * 6;
    title.group.position.y =
      totalHeight / 2 + Math.sin(elapsed * 0.7) * 0.08 + scrollProgress * 1.5;

    // Camera pulls back slightly with scroll
    camera.position.z = 18 + scrollProgress * 4;
    camera.position.x = mouseX * 0.6;
    camera.position.y = -mouseY * 0.4 - scrollProgress * 0.5;
    camera.lookAt(0, 0, 0);

    if (particleField) {
      const posAttr = particleField.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      // `array` is the same Float32Array we passed in via BufferAttribute,
      // but Three.js types it as the typed-array union.
      const arr = posAttr.array as Float32Array;
      const speeds = particleField.speeds;
      for (let i = 0; i < particleField.count; i++) {
        const i3 = i * 3;
        // Both lookups are in-bounds: i < count and the position array is
        // length count*3, the speed array is length count.
        const next = arr[i3 + 1]! + speeds[i]! * (delta * 60);
        arr[i3 + 1] = next > 25 ? -25 : next;
      }
      posAttr.needsUpdate = true;
      particleField.points.rotation.y = elapsed * 0.02;
    }

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

      scene.remove(ambient, keyLight, rimLight, fillLight);
      ambient.dispose();
      keyLight.dispose();
      rimLight.dispose();
      fillLight.dispose();
      scene.fog = null;
      scene.clear();

      renderer.dispose();
    },
  };
}
