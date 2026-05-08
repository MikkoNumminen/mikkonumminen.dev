import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  DirectionalLight,
  Fog,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
} from 'three';
import { createRenderer } from './createRenderer';
import { createResizeHandler } from './createResizeHandler';
import { buildParticleField, type ParticleField } from './buildParticleField';
import {
  buildTitle,
  DEPTH as TITLE_DEPTH,
  loadFont,
  measureTextWidth,
} from './buildTitle';
import { buildTitleColorMap } from './buildTitleColorMap';
import { buildCollisionSparks, type CollisionSparksHandle } from './buildCollisionSparks';
import { buildEnvironment, type EnvironmentHandle } from './buildEnvironment';
import { buildGalaxyLayer, type GalaxyLayerHandle } from './buildGalaxyLayer';
import { buildHorizonGlow, type HorizonGlowHandle } from './buildHorizonGlow';
import { buildImpactText, type ImpactTextHandle } from './buildImpactText';
import { buildMeteors, type MeteorsHandle } from './buildMeteors';
import {
  buildExperienceZoneDecor,
  type ExperienceZoneDecorHandle,
} from './buildExperienceZoneDecor';
import { buildHomeZoneDecor, type HomeZoneDecorHandle } from './buildHomeZoneDecor';
import {
  buildProjectsZoneDecor,
  type ProjectsZoneDecorHandle,
} from './buildProjectsZoneDecor';
import { createBloomComposer, type BloomComposerHandle } from './postprocessing';
import { disposeMaterial } from './disposeMaterial';

interface HomeSceneOptions {
  canvas: HTMLCanvasElement;
  fontUrl: string;
  reducedMotion?: boolean;
  /**
   * Recent commit subjects, baked in at build time. One is shown at each
   * meteor impact as an RPG-style damage popup. Falls back to a small
   * sentinel list when empty (e.g. dev outside a git checkout).
   */
  commitMessages?: string[];
}

const FALLBACK_COMMITS: string[] = [
  'feat: ship the galaxy',
  'fix: stabilize the orbit',
  'chore: prettier sweep',
  'refactor: lighten the loop',
  'docs: update the field guide',
  'style: tighten the type ramp',
  'feat: add scroll trigger',
  'fix: clamp camera bounds',
];

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
  const commitMessages =
    opts.commitMessages && opts.commitMessages.length > 0
      ? opts.commitMessages
      : FALLBACK_COMMITS;

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
  // After the entrance, the rim only fires when galaxies collide — no
  // random sweep, no idle baseline. The chrome's resting look is carried
  // by ambient + fill + envMap; the rim is reserved for synced events.
  const RIM_BASE_INTENSITY = 0;
  // Orbiting rim — drives the dramatic entrance burst only. After
  // entrance it sits at 0 intensity and just slowly orbits in case it's
  // ever wired up again.
  const rimLight = new DirectionalLight(0xa6c2ff, RIM_BASE_INTENSITY);
  rimLight.position.set(-8, -2, -4);
  scene.add(rimLight);

  // Dedicated camera-facing flash light for galaxy collisions. The
  // orbiting rim spends roughly half its time behind the title (z < 0),
  // and a DirectionalLight from behind only lights the back faces — so
  // every other collision was producing a "real but invisible" rim
  // flash. This light is locked above-and-in-front of the title (camera
  // is at +18 looking at the origin), so it always hits the front
  // faces the user actually sees.
  const collisionRimLight = new DirectionalLight(0xc8e0ff, 0);
  collisionRimLight.position.set(2, 2, 6);
  scene.add(collisionRimLight);

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

  // World-space center of the spiral galaxy. Meteors converge on this
  // point; the collision-flash light moves to each impact as it fires.
  const GALAXY_CENTER: [number, number, number] = [-7, -3.5, -12];
  const galaxyCenter = new Vector3(...GALAXY_CENTER);

  // Dedicated collision-flash PointLight. Steady at 0; pulses bright on
  // each meteor impact and decays back over ~0.25 s, painting the
  // chrome with a brief bright flash that agrees with the sparks.
  const collisionFlashLight = new PointLight(0xeaf5ff, 0, 32);
  collisionFlashLight.position.copy(galaxyCenter);
  scene.add(collisionFlashLight);

  // ── Horizon glow plate (sun-side halo behind the title) ──────────────
  const horizon: HorizonGlowHandle = buildHorizonGlow();
  scene.add(horizon.mesh);

  // ── Galaxy ───────────────────────────────────────────────────────────
  // Single focal spiral galaxy — meteors converge on it from all
  // directions and detonate on impact, driving the sparks + rim flash +
  // commit-message popup below.
  const galaxy: GalaxyLayerHandle = buildGalaxyLayer({
    starCount: 900,
    position: GALAXY_CENTER,
  });
  scene.add(galaxy.group);

  // ── Collision flash sprites ──────────────────────────────────────────
  // Bright additive sprites that scale up and fade out at the moment of
  // each meteor impact. Reads as a clean "flash of light" matching the
  // text rim flashes, not a debris explosion.
  const sparks: CollisionSparksHandle = buildCollisionSparks();
  scene.add(sparks.group);

  // ── Impact text popups ───────────────────────────────────────────────
  // RPG-style damage popups in terminal monospace, one per meteor impact.
  // Each pop renders a recent commit subject at the impact point, drifts
  // upward, and fades. Tinted by the meteor's world color so the popup
  // carries the meteor's signature into the explosion.
  const impactText: ImpactTextHandle = buildImpactText();
  scene.add(impactText.group);

  // Random commit pick with no immediate repeat — sequential indexing
  // would cycle through the 50-message pool in the same order forever.
  let lastCommitIdx = -1;
  const pickCommit = (): string => {
    if (commitMessages.length === 0) return '';
    if (commitMessages.length === 1) return commitMessages[0]!;
    let idx = Math.floor(Math.random() * commitMessages.length);
    if (idx === lastCommitIdx) idx = (idx + 1) % commitMessages.length;
    lastCommitIdx = idx;
    return commitMessages[idx]!;
  };

  // Impact-flash energies are read/written by the meteor onImpact closure
  // below. Declared up here so the closure captures already-initialized
  // bindings — moving them after the buildMeteors call would TDZ if
  // anything ever fires onImpact during init.
  let collisionFlashEnergy = 0;
  let collisionRimEnergy = 0;
  // Bumped from 4.0 — the dedicated front-facing collision light hits
  // a different surface than the old orbiting rim, so it needs more
  // intensity to read as the same "bright moment" the user expects.
  const COLLISION_RIM_PEAK = 6.0;

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

  // ── Per-letter zone decor (text is a landscape) ──────────────────────
  // Each letter zone of the title becomes a tiny embedded scene
  // representing one of the four pages. Single-letter targets (M, O)
  // keep each decor visually contained and let the chrome letters
  // between them breathe. The home zone covers the back half of
  // NUMMINEN with subtle drifting dust only.
  //   M       → Experience (single ridge + drifting snow + goat)
  //   I-K-K   → (no decor — quiet chrome between the loud zones)
  //   O       → Projects   (Saturn ring + orbiting planet)
  //   NUMMINEN → Home      (dust drifting across the bottom line)
  //
  // The contact zone is no longer in the 3D scene — it lives as a
  // "data feed" widget under the editorial coords in the top-right
  // corner of the page, so the matrix cascade doesn't block scene
  // elements (galaxies, etc).
  const wMIKKO = measureTextWidth(font, 'MIKKO');
  const wM = measureTextWidth(font, 'M');
  const wMIKK = measureTextWidth(font, 'MIKK');

  // Each line's geometry was translated by -lineWidth/2, so a mesh-local
  // x = 0 sits at the line center. Substring centers in pre-translation
  // coords are midpoints of cumulative widths; subtracting lineWidth/2
  // maps them into mesh-local space.
  const xCenterM = wM / 2 - wMIKKO / 2;
  const xCenterO = wMIKK / 2; // = (wMIKK + wMIKKO)/2 - wMIKKO/2

  const mikkoMesh = title.meshes[0];
  const nummMesh = title.meshes[1];
  if (!mikkoMesh || !nummMesh) {
    throw new Error('homeScene: title is missing a line — TITLE expected to be 2 lines.');
  }
  // Letter top in mesh-local Y — derived from the geometry's bbox so the
  // mountain placement tracks any future change to TextGeometry SIZE
  // or bevel. buildTitle always calls computeBoundingBox before the
  // centering translate, and Three.js's BufferGeometry.translate updates
  // the box in place, so it is always set here.
  const mikkoTopY = mikkoMesh.geometry.boundingBox!.max.y;

  // Each zone module's "design width" at scale=1, used to pick a scale
  // that fills the targeted letter span.
  const EXPERIENCE_DESIGN_WIDTH = 2.2; // single ridge spans ±1.1 ≈ M width
  const HOME_DESIGN_WIDTH = 6;

  const experienceDecor: ExperienceZoneDecorHandle = buildExperienceZoneDecor({
    envMap: env.envMap,
    scale: wM / EXPERIENCE_DESIGN_WIDTH,
  });
  const projectsDecor: ProjectsZoneDecorHandle = buildProjectsZoneDecor({
    envMap: env.envMap,
    // Scale tuned so the ring outer radius (1.12 * scale ≈ 0.78) sits
    // just outside the O's letter outline with a small breathing gap.
    scale: 0.7,
  });
  // Home dust spans the whole NUMMINEN line — scale to the line width
  // (≈ wMIKKO is a reasonable proxy for the bottom line, but use the
  // bottom mesh's actual bbox so this tracks future line changes).
  const nummWidth =
    nummMesh.geometry.boundingBox!.max.x - nummMesh.geometry.boundingBox!.min.x;
  const homeDecor: HomeZoneDecorHandle = buildHomeZoneDecor({
    envMap: env.envMap,
    scale: nummWidth / HOME_DESIGN_WIDTH,
  });

  // Parent each decor under the appropriate line mesh so it inherits
  // the title's floats / sway / entrance offset for free.
  mikkoMesh.add(experienceDecor.group);
  mikkoMesh.add(projectsDecor.group);
  nummMesh.add(homeDecor.group);

  // Mountain rises ABOVE the M's letter top so the silhouette is
  // visible against the dark background, not embedded in the letter
  // solid. Anchored at the actual letter top from the bbox.
  experienceDecor.group.position.set(xCenterM, mikkoTopY, TITLE_DEPTH / 2);
  projectsDecor.group.position.set(xCenterO, 0, TITLE_DEPTH / 2);
  // Home dust spans the full bottom line, centered on it.
  homeDecor.group.position.set(0, 0, TITLE_DEPTH / 2);

  /**
   * One row per zone. `boost` is mutable (lerps toward 1 on hover) and
   * drives subtle visual response in the per-zone decor. The title is
   * NOT clickable — navigation goes through the visible <nav> only.
   * `hotRadiusBase` sets the hover radius in pixels before responsive
   * title scaling; sized to each zone's screen footprint.
   */
  interface ZoneEntry {
    decor: ExperienceZoneDecorHandle | ProjectsZoneDecorHandle | HomeZoneDecorHandle;
    parent: Mesh;
    boost: number;
    hotRadiusBase: number;
  }
  const zones: ZoneEntry[] = [
    {
      decor: experienceDecor,
      parent: mikkoMesh,
      boost: 0,
      hotRadiusBase: 160,
    },
    {
      decor: projectsDecor,
      parent: mikkoMesh,
      boost: 0,
      hotRadiusBase: 110,
    },
    {
      decor: homeDecor,
      parent: nummMesh,
      boost: 0,
      hotRadiusBase: 240,
    },
  ];

  // Reused each frame to avoid allocating Vector3 in the hot path.
  const projectedDecorPos = new Vector3();

  /**
   * Returns the screen-pixel position of the zone's world center plus a
   * hover hot-radius. Used by the per-frame hover-boost lerp.
   */
  const zoneScreenHotspot = (entry: ZoneEntry): { x: number; y: number; r: number } => {
    entry.decor.group.getWorldPosition(projectedDecorPos);
    projectedDecorPos.project(camera);
    const x = (projectedDecorPos.x + 1) * 0.5 * window.innerWidth;
    const y = (1 - projectedDecorPos.y) * 0.5 * window.innerHeight;
    // Hot radius scales with the title (responsive layouts shrink it).
    const r = entry.hotRadiusBase * title.group.scale.x;
    return { x, y, r };
  };

  // ── Meteors (converge on the galaxy and detonate on impact) ─────────
  const meteors: MeteorsHandle = buildMeteors({
    galaxyCenter,
    onImpact: (impactWorldPos, color) => {
      sparks.spawn(impactWorldPos.x, impactWorldPos.y, impactWorldPos.z);
      // Brighten the chrome rim and the per-impact point light in sync
      // with the visible spark — same wiring that the old galaxy-vs-
      // galaxy collision drove.
      collisionFlashEnergy = 1;
      collisionRimEnergy = 1;
      collisionFlashLight.position.copy(impactWorldPos);
      impactText.spawn(
        pickCommit(),
        impactWorldPos.x,
        impactWorldPos.y,
        impactWorldPos.z,
        color,
      );
    },
  });
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
  // True after the first pointermove. Hover hit-tests treat the
  // pre-move state as "no hover" — otherwise the (0, 0) defaults map
  // to screen center and would falsely trigger hover on any decor
  // that happens to project near the middle of the viewport.
  let mouseSeen = false;

  const onPointerMove = (e: PointerEvent): void => {
    targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    mouseSeen = true;
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

    // Orbiting rim drives the entrance burst (angle determines drama
    // direction during the stroboscopic arrival).
    const rimAngle = (elapsed * Math.PI * 2) / 14;
    rimLight.position.set(
      Math.cos(rimAngle) * 9,
      2 + Math.sin(rimAngle * 0.5) * 1.5,
      Math.sin(rimAngle) * 9 - 2,
    );
    rimLight.intensity = reducedMotion
      ? RIM_BASE_INTENSITY
      : RIM_BASE_INTENSITY + entranceFlashEnvelope(elapsed);

    // Galaxy-collision flash uses a separate, camera-facing light so
    // every collision lights the front faces of the title regardless
    // of where the orbiting rim happens to be at that moment.
    collisionRimLight.intensity = reducedMotion
      ? 0
      : collisionRimEnergy * COLLISION_RIM_PEAK;

    // Horizon glow has a small pulse — kept narrow (0.04 amplitude, slower
    // 0.3 Hz) so it reads as atmospheric, not as a beat.
    horizon.material.opacity = reducedMotion
      ? 0.85
      : 0.82 + Math.sin(elapsed * 0.3) * 0.04;

    // The galaxy spins gently in place; meteors do all the spatial work.
    // Each meteor impact (handled in buildMeteors → onImpact) bumps the
    // collision-flash energy and the title rim-flash energy; both decay
    // here every frame.
    if (!reducedMotion) {
      galaxy.group.rotation.z = elapsed * 0.04;

      // Decay the collision-flash pulse each frame; bright on hit, fades
      // smoothly to zero.
      collisionFlashEnergy = Math.max(0, collisionFlashEnergy - delta * 4);
      collisionFlashLight.intensity = collisionFlashEnergy * 4.5;
      // Rim flash decays a touch faster than the point light so the
      // title's bright moment is sharp rather than a lingering wash.
      collisionRimEnergy = Math.max(0, collisionRimEnergy - delta * 5);

      sparks.tick(delta);
      impactText.tick(delta);
    }

    // Per-zone hover/boost/tick. Each zone's hover hot-zone lerps its
    // boost toward 1 when the cursor is in range; the boost only drives
    // visual response inside each decor module (the title is not
    // clickable — navigation goes through the visible nav only).
    {
      const mxPx = (targetMouseX * 0.5 + 0.5) * window.innerWidth;
      const myPx = (targetMouseY * 0.5 + 0.5) * window.innerHeight;
      for (const entry of zones) {
        const { x: hx, y: hy, r: hr } = zoneScreenHotspot(entry);
        const hovering = mouseSeen && Math.hypot(mxPx - hx, myPx - hy) < hr;
        const targetBoost = hovering ? 1 : 0;
        entry.boost += (targetBoost - entry.boost) * delta * 6;
        entry.decor.tick(reducedMotion ? 0 : delta, entry.boost);
      }
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
        // Particles drift DOWN (subtract from y) — matches the snow
        // direction in the mountain decor so the whole scene reads as a
        // single weather system.
        const next = arr[i3 + 1]! - speeds[i]! * delta;
        arr[i3 + 1] = next < -25 ? 25 : next;
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

      for (const entry of zones) {
        entry.parent.remove(entry.decor.group);
        entry.decor.dispose();
      }

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
        collisionRimLight,
        fillLight,
        horizon.mesh,
        galaxy.group,
        sparks.group,
        impactText.group,
        meteors.group,
      );
      ambient.dispose();
      keyLight.dispose();
      rimLight.dispose();
      collisionRimLight.dispose();
      collisionFlashLight.dispose();
      fillLight.dispose();
      horizon.geometry.dispose();
      horizon.material.dispose();
      horizon.texture.dispose();

      galaxy.starsGeometry.dispose();
      galaxy.starsMaterial.dispose();

      sparks.dispose();
      impactText.dispose();
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
