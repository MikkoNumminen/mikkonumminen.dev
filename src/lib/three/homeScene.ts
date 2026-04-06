import * as THREE from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

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

export async function createHomeScene(
  opts: HomeSceneOptions,
): Promise<HomeSceneHandle> {
  const { canvas, fontUrl, reducedMotion = false } = opts;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

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
  const particleCount = reducedMotion ? 0 : Math.min(2200, Math.floor((window.innerWidth * window.innerHeight) / 800));
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 80;
    positions[i3 + 1] = (Math.random() - 0.5) * 50;
    positions[i3 + 2] = (Math.random() - 0.5) * 60 - 5;
    speeds[i] = 0.0008 + Math.random() * 0.0025;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const particleTexture = makeCircleTexture();
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.08,
    sizeAttenuation: true,
    color: 0xc8d8ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: particleTexture,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  // ── Title (loaded async) ─────────────────────────────────────────────
  const titleGroup = new THREE.Group();
  scene.add(titleGroup);

  const fontLoader = new FontLoader();
  const font = await new Promise<Font>((resolve, reject) => {
    fontLoader.load(fontUrl, resolve, undefined, reject);
  });

  const titleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf3f6ff,
    metalness: 0.55,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    reflectivity: 0.85,
  });

  const lines = TITLE.split('\n');
  const lineMeshes: THREE.Mesh[] = [];
  let lineY = 0;
  lines.forEach((line) => {
    const geometry = new TextGeometry(line, {
      font,
      size: 2.2,
      depth: 0.45,
      curveSegments: 8,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.025,
      bevelSegments: 4,
    });
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const width = bb.max.x - bb.min.x;
    const height = bb.max.y - bb.min.y;
    geometry.translate(-width / 2, -height / 2, 0);

    const mesh = new THREE.Mesh(geometry, titleMaterial);
    mesh.position.y = lineY;
    titleGroup.add(mesh);
    lineMeshes.push(mesh);
    lineY -= height + 0.6;
  });

  // Center the whole title group vertically
  const totalHeight = -lineY - 0.6;
  titleGroup.position.y = totalHeight / 2;

  // ── State ────────────────────────────────────────────────────────────
  let scrollProgress = 0;
  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;
  let raf = 0;
  let disposed = false;

  const onPointerMove = (e: PointerEvent) => {
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (!reducedMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  const onResize = () => {
    if (disposed) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    // Scale title down on small screens
    const baseScale = Math.min(1, w / 1100);
    titleGroup.scale.setScalar(Math.max(0.5, baseScale));

    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);
  onResize();

  // ── Animation loop ───────────────────────────────────────────────────
  const startTime = performance.now();
  let lastFrame = startTime;

  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);

    const now = performance.now();
    const t = (now - startTime) / 1000;
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;

    // Smooth pointer
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    // Title floats and reacts to pointer + scroll
    titleGroup.rotation.x = mouseY * 0.12 + Math.sin(t * 0.5) * 0.02;
    titleGroup.rotation.y = mouseX * 0.18 + Math.sin(t * 0.4) * 0.03;
    titleGroup.position.z = -scrollProgress * 6;
    titleGroup.position.y = totalHeight / 2 + Math.sin(t * 0.7) * 0.08 + scrollProgress * 1.5;

    // Camera pulls back slightly with scroll
    camera.position.z = 18 + scrollProgress * 4;
    camera.position.x = mouseX * 0.6;
    camera.position.y = -mouseY * 0.4 - scrollProgress * 0.5;
    camera.lookAt(0, 0, 0);

    // Particles drift
    if (particleCount > 0) {
      const posAttr = particleGeometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        arr[i3 + 1]! += speeds[i]! * (dt * 60);
        if (arr[i3 + 1]! > 25) arr[i3 + 1] = -25;
      }
      posAttr.needsUpdate = true;
      particles.rotation.y = t * 0.02;
    }

    renderer.render(scene, camera);
  };
  tick();

  // ── Handle ───────────────────────────────────────────────────────────
  return {
    setScrollProgress: (p: number) => {
      scrollProgress = Math.max(0, Math.min(1, p));
    },
    resize: onResize,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);

      lineMeshes.forEach((m) => {
        m.geometry.dispose();
      });
      titleMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      particleTexture.dispose();
      renderer.dispose();
    },
  };
}

function makeCircleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
