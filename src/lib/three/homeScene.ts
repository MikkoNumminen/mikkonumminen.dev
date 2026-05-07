import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  DirectionalLight,
  Fog,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
} from 'three';
import { createRenderer } from './createRenderer';
import { createResizeHandler } from './createResizeHandler';
import { buildParticleField, type ParticleField } from './buildParticleField';
import { buildTitle, loadFont } from './buildTitle';
import { buildTitleColorMap } from './buildTitleColorMap';
import { buildCollisionSparks, type CollisionSparksHandle } from './buildCollisionSparks';
import { buildEnvironment, type EnvironmentHandle } from './buildEnvironment';
import { buildGalaxyLayer, type GalaxyLayerHandle } from './buildGalaxyLayer';
import { buildHorizonGlow, type HorizonGlowHandle } from './buildHorizonGlow';
import { buildMeteors, type MeteorsHandle } from './buildMeteors';
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

  // Rim is animated on a slow orbit in the tick loop. Steady intensity
  // is 70 % lower than before (0.045) so the ongoing sweep is essentially
  // invisible — the title gets a clear bright sequence from the flash
  // peaks below, then the chrome quiets right down.
  const RIM_BASE_INTENSITY = 0.045;
  const rimLight = new DirectionalLight(0xa6c2ff, RIM_BASE_INTENSITY);
  rimLight.position.set(-8, -2, -4);
  scene.add(rimLight);

  /**
   * Stroboscopic flash peaks during AND just after the entrance —
   * `[center, height, width]` in seconds. Three peaks land while the
   * title is still arriving (entrance ends at 1.4 s), and two more
   * land just after to extend the bright sequence so the arrival reads
   * as a real moment rather than a single hit. After ~2.6 s the rim
   * sits at the very dim steady level.
   */
  const ENTRANCE_FLASH_PEAKS: Array<[number, number, number]> = [
    [0.15, 4.0, 0.1],
    [0.55, 3.5, 0.13],
    [1.05, 5.0, 0.16],
    [1.55, 4.2, 0.16],
    [2.1, 3.6, 0.18],
  ];
  const entranceFlashEnvelope = (t: number): number => {
    let sum = 0;
    for (const [c, h, w] of ENTRANCE_FLASH_PEAKS) {
      const d = (t - c) / w;
      if (Math.abs(d) > 4) continue;
      sum += h * Math.exp(-d * d);
    }
    return sum;
  };

  const fillLight = new PointLight(0xff8a4c, 0.55, 40);
  fillLight.position.set(-4, 4, 6);
  scene.add(fillLight);

  // Shared center the two galaxies orbit around — also where the
  // collision-flash light lives.
  const SHARED_CENTER: [number, number, number] = [-10, -4.5, -14];

  // Dedicated collision-flash PointLight that lives near the galaxies.
  // Steady at 0; pulses to ~4.5 when sparks spawn and decays back over
  // ~0.25 s, painting the chrome with a brief bright flash agreeing with
  // the sparks.
  const collisionFlashLight = new PointLight(0xeaf5ff, 0, 32);
  collisionFlashLight.position.set(...SHARED_CENTER);
  scene.add(collisionFlashLight);

  // ── Horizon glow plate (sun-side halo behind the title) ──────────────
  const horizon: HorizonGlowHandle = buildHorizonGlow();
  scene.add(horizon.mesh);

  // ── Galaxy layers ────────────────────────────────────────────────────
  // Two procedural spirals that periodically pass through each other on a
  // long elliptical orbit. The collision drives the sparks system below.
  const galaxy: GalaxyLayerHandle = buildGalaxyLayer();
  scene.add(galaxy.group);

  // Galaxy B is an elliptical (no spiral arms) so the two read as visibly
  // different shapes when they pass through each other.
  const galaxyB: GalaxyLayerHandle = buildGalaxyLayer({
    shape: 'elliptical',
    starCount: 480,
    color: 0xc080ff,
    starSize: 0.075,
    semiAxes: [3.4, 2.6, 2.2],
    // Position is updated each frame; this is just the initial spawn.
    position: [-7, -3, -14],
    rotation: [0, 0, 0],
  });
  scene.add(galaxyB.group);

  // ── Collision sparks (galaxy-on-galaxy fireworks) ────────────────────
  const sparks: CollisionSparksHandle = buildCollisionSparks();
  scene.add(sparks.points);

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

  // ── Title (continuous chrome with four-world gradient color map) ─────
  // The four worlds are seamlessly painted across the letterforms via a
  // horizontal gradient color map: galaxy blue on the left, chrome white
  // in the middle-left, warm bronze in the middle-right, phosphor green
  // on the right. The chrome metal multiplies its envMap reflections by
  // this map, so the four worlds read as smooth color zones flowing
  // through the letters with no segment seams.
  const titleColorMap = buildTitleColorMap();
  const titleMaterial = new MeshPhysicalMaterial({
    color: 0xffffff,
    map: titleColorMap,
    metalness: 0.95,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    reflectivity: 1,
    envMapIntensity: 1.25,
  });
  const title = buildTitle(font, TITLE, titleMaterial);
  scene.add(title.group);
  const totalHeight = title.totalHeight;

  // ── Meteors (occasional shooting stars carrying world tints) ─────────
  const meteors: MeteorsHandle = buildMeteors();
  scene.add(meteors.group);

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
  let lastSparkSpawnAt = -1;
  let collisionFlashEnergy = 0;
  const COLLISION_THRESHOLD = 3.6;
  const SPARK_COOLDOWN = 0.18;

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

    // Rim light orbit (steady, very dim) plus three sharp flash peaks
    // during the entrance — the title arrives with a stroboscopic burst,
    // then the rim drops to a barely-perceptible ongoing highlight.
    const rimAngle = (elapsed * Math.PI * 2) / 14;
    rimLight.position.set(
      Math.cos(rimAngle) * 9,
      2 + Math.sin(rimAngle * 0.5) * 1.5,
      Math.sin(rimAngle) * 9 - 2,
    );
    rimLight.intensity = reducedMotion
      ? RIM_BASE_INTENSITY
      : RIM_BASE_INTENSITY + entranceFlashEnvelope(elapsed);

    // Horizon glow has a small pulse — kept narrow (0.04 amplitude, slower
    // 0.3 Hz) so it reads as atmospheric, not as a beat.
    horizon.material.opacity = reducedMotion
      ? 0.85
      : 0.82 + Math.sin(elapsed * 0.3) * 0.04;

    // Both galaxies orbit a shared center on perpendicular planes
    // (Galaxy A on XY, Galaxy B on XZ) at slightly different speeds, so
    // their paths cross periodically — guaranteed close approaches
    // instead of two parallel orbits that never quite meet. Period
    // ~22 s, threshold 3.6 units; while inside the threshold, sparks
    // fire every 0.18 s with 14–22 particles per burst.
    if (!reducedMotion) {
      galaxy.group.rotation.z = elapsed * 0.04;
      galaxyB.group.rotation.x = elapsed * 0.06;
      galaxyB.group.rotation.y = elapsed * 0.09;

      const orbitT = (elapsed * Math.PI * 2) / 22;
      // Galaxy A — ellipse on the XY plane.
      galaxy.group.position.set(
        SHARED_CENTER[0] + Math.cos(orbitT) * 4.5,
        SHARED_CENTER[1] + Math.sin(orbitT) * 2.0,
        SHARED_CENTER[2],
      );
      // Galaxy B — circle on the XZ plane at a 1.4× rate with a phase
      // offset so the two galaxies don't share a relative phase that
      // would lock them into never-touching parallel paths.
      galaxyB.group.position.set(
        SHARED_CENTER[0] + Math.cos(orbitT * 1.4 + 0.7) * 3.6,
        SHARED_CENTER[1],
        SHARED_CENTER[2] + Math.sin(orbitT * 1.4 + 0.7) * 3,
      );

      const dx = galaxy.group.position.x - galaxyB.group.position.x;
      const dy = galaxy.group.position.y - galaxyB.group.position.y;
      const dz = galaxy.group.position.z - galaxyB.group.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < COLLISION_THRESHOLD && elapsed - lastSparkSpawnAt > SPARK_COOLDOWN) {
        const t = 0.3 + Math.random() * 0.4;
        sparks.spawn(
          galaxyB.group.position.x + dx * t,
          galaxyB.group.position.y + dy * t,
          galaxyB.group.position.z + dz * t,
          14 + Math.floor(Math.random() * 9),
        );
        lastSparkSpawnAt = elapsed;
        // Also pulse the collision flash light for an extra-bright moment.
        collisionFlashEnergy = 1;
      }

      // Decay the collision-flash pulse each frame; bright on hit, fades
      // smoothly to zero.
      collisionFlashEnergy = Math.max(0, collisionFlashEnergy - delta * 4);
      collisionFlashLight.intensity = collisionFlashEnergy * 4.5;
      collisionFlashLight.position.set(
        (galaxy.group.position.x + galaxyB.group.position.x) / 2,
        (galaxy.group.position.y + galaxyB.group.position.y) / 2,
        (galaxy.group.position.z + galaxyB.group.position.z) / 2,
      );

      sparks.tick(delta);
    }

    // Meteors — randomized spawn schedule, fade-in/out envelope, trail
    // updated as a per-frame position queue inside the meteor module.
    if (!reducedMotion) {
      meteors.tick(elapsed, delta);
    }

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
      titleColorMap.dispose();

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
        galaxyB.group,
        sparks.points,
        meteors.group,
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
      galaxyB.starsGeometry.dispose();
      galaxyB.starsMaterial.dispose();

      sparks.dispose();
      meteors.dispose();

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
