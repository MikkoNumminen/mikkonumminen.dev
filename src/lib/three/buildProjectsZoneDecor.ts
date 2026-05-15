import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Texture,
  TorusGeometry,
} from 'three';

export interface ProjectsZoneDecorHandle {
  group: Group;
  /**
   * Advance orbit / spin / flare animations.
   *
   * `boost` ∈ [0, 1] intensifies the zone — orbit accelerates, ring spins
   * faster, flare brightens — used by the caller to react to hover.
   */
  tick: (delta: number, boost: number) => void;
  /**
   * Trigger a one-shot ring spin burst — angular velocity triples for
   * ~600 ms and a small handful of sparkle motes shoot off the ring
   * tangentially before fading. Reads as "the ring kicked".
   */
  play: () => void;
  dispose: () => void;
}

export interface ProjectsZoneDecorOptions {
  envMap?: Texture | null;
  /** Overall scale relative to a 2.2-unit-tall letter. */
  scale?: number;
}

const FLARE_TEX_SIZE = 128;
/** Orbit radius of the planet around the ring center, in scale-units. */
const ORBIT_RADIUS = 1.22;
/** Outer radius of the ring (scale-units) — sparkle motes spawn here. */
const RING_OUTER_RADIUS = 1.12;
/** Number of sparkle motes that fire on each click — sparse so the
 *  burst reads as a clean accent, not a fireworks blast. */
const SPARKLE_COUNT = 4;
/** Lifetime of each sparkle in seconds. Lined up with the ~600 ms
 *  cohesion budget across the scene's click responses. */
const SPARKLE_LIFE = 0.6;
/** Multiplier applied to ring angular velocity at impulse=1 — triples
 *  the spin briefly so the click reads as a "kick". */
const SPIN_PEAK_MULT = 3;
/** Per-second decay of the spin impulse; ~550 ms back to baseline. */
const SPIN_DECAY = 1.8;

function makeFlareTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = FLARE_TEX_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeFlareTexture: 2D context unavailable');

  const cx = FLARE_TEX_SIZE / 2;
  const halo = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  halo.addColorStop(0, 'rgba(255, 255, 255, 1)');
  halo.addColorStop(0.16, 'rgba(220, 235, 255, 0.7)');
  halo.addColorStop(0.5, 'rgba(150, 195, 255, 0.18)');
  halo.addColorStop(1, 'rgba(120, 170, 240, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, FLARE_TEX_SIZE, FLARE_TEX_SIZE);
  // Cross streak — gives the planet's specular peak a brief lens-flare
  // moment when it crosses the camera-facing apex of its orbit.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(0, cx, FLARE_TEX_SIZE, 1);
  ctx.fillRect(cx, 0, 1, FLARE_TEX_SIZE);

  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/**
 * Saturn-style ring + small orbiting planet + lens-flare sprite, sized
 * to wrap a single round letter (the O of MIKKO). Drives the projects
 * zone of the hero title — the round letter becomes the "planet" at the
 * center, the chrome ring crosses through it, and a small body orbits.
 * Reacts to hover via the `boost` parameter on `tick`.
 */
export function buildProjectsZoneDecor(
  opts: ProjectsZoneDecorOptions = {},
): ProjectsZoneDecorHandle {
  const scale = opts.scale ?? 1;
  const group = new Group();

  // Saturn-style ring — thin torus, tilted off-axis so it reads as a
  // planet's ring system rather than a flat halo. Chrome material so it
  // matches the title's metal and picks up the same envMap.
  const ringGeo = new TorusGeometry(1.12 * scale, 0.045 * scale, 14, 96);
  const ringMat = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.95,
    roughness: 0.18,
    envMap: opts.envMap ?? null,
    envMapIntensity: 1.6,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const ring = new Mesh(ringGeo, ringMat);
  ring.rotation.set(Math.PI * 0.42, 0, Math.PI / 14);
  group.add(ring);

  // Small planet orbiting in the XZ plane around the ring center.
  const planetGeo = new SphereGeometry(0.13 * scale, 24, 16);
  const planetMat = new MeshPhysicalMaterial({
    color: 0xc0d8ff,
    emissive: 0x4a8fff,
    emissiveIntensity: 0.55,
    metalness: 0.35,
    roughness: 0.45,
    envMap: opts.envMap ?? null,
    envMapIntensity: 0.9,
  });
  const planet = new Mesh(planetGeo, planetMat);
  // Park the planet at a clean apex of the orbit so reduced-motion
  // clients (where tick is called with delta=0 and the position never
  // updates) see it sitting on the ring rather than at the dead center.
  planet.position.set(ORBIT_RADIUS * scale, 0, 0);
  group.add(planet);

  const flareTex = makeFlareTexture();
  const flareMat = new SpriteMaterial({
    map: flareTex,
    blending: AdditiveBlending,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const flare = new Sprite(flareMat);
  flare.scale.setScalar(0.55 * scale);
  group.add(flare);

  // Sparkle pool — small additive sprites that fire off the ring on
  // click, fly tangentially while fading + shrinking, then go dormant.
  // Sharing the flare texture keeps the asset budget at one canvas.
  interface SparkleState {
    sprite: Sprite;
    material: SpriteMaterial;
    velX: number;
    velY: number;
    life: number;
  }
  const sparkles: SparkleState[] = [];
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const mat = new SpriteMaterial({
      map: flareTex,
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new Sprite(mat);
    sprite.scale.setScalar(0.18 * scale);
    sprite.visible = false;
    group.add(sprite);
    sparkles.push({ sprite, material: mat, velX: 0, velY: 0, life: 0 });
  }

  let orbitT = 0;
  let ringSpinT = 0;
  let spinImpulse = 0;

  const tick = (delta: number, boost: number): void => {
    const speedMul = 1 + boost * 1.6;
    orbitT += delta * 0.7 * speedMul;
    // Click-impulse layer: while spinImpulse > 0 the ring's angular rate
    // is multiplied by (1 + impulse * (SPIN_PEAK_MULT-1)), so a fresh
    // click triples the spin and it decays back over ~550 ms.
    if (spinImpulse > 0) {
      spinImpulse = Math.max(0, spinImpulse - delta * SPIN_DECAY);
    }
    const spinBoost = 1 + spinImpulse * (SPIN_PEAK_MULT - 1);
    ringSpinT += delta * 0.18 * speedMul * spinBoost;

    const r = ORBIT_RADIUS * scale;
    planet.position.set(
      Math.cos(orbitT) * r,
      Math.sin(orbitT * 0.4) * 0.06 * scale,
      Math.sin(orbitT) * r,
    );
    flare.position.copy(planet.position);

    // Flare spikes when the planet is on the camera-facing side of the
    // orbit (z > 0). Squared so the flare is sharp at the apex and dim
    // elsewhere — reads as a lens flare on a passing reflective body.
    const camFace = Math.max(0, planet.position.z / r);
    flareMat.opacity = Math.pow(camFace, 2) * (0.55 + boost * 0.5);

    ring.rotation.z = Math.PI / 14 + ringSpinT * 0.4;

    // Sparkle pool — each active mote drifts along its tangent vector
    // while fading + shrinking. Goes invisible once its life hits 0.
    for (const s of sparkles) {
      if (s.life <= 0) continue;
      s.life -= delta;
      if (s.life <= 0) {
        s.material.opacity = 0;
        s.sprite.visible = false;
        continue;
      }
      s.sprite.position.x += s.velX * delta;
      s.sprite.position.y += s.velY * delta;
      const t = s.life / SPARKLE_LIFE;
      s.material.opacity = t * 0.9;
      // Slight shrink as it fades — reads as a spent spark rather than
      // a sustained particle.
      s.sprite.scale.setScalar((0.12 + t * 0.1) * scale);
    }
  };

  const play = (): void => {
    spinImpulse = 1;
    // Fire all sparkle slots from points around the ring rim. The ring
    // is tilted ~0.42*PI on X, so its plane is mostly facing the camera
    // along Y — we spawn in the group's XY plane (the ring's apparent
    // ring shape from the camera) and let them drift outward + tangent.
    for (let i = 0; i < sparkles.length; i++) {
      const s = sparkles[i]!;
      const angle = (i / sparkles.length) * Math.PI * 2 + Math.random() * 0.6;
      const r = RING_OUTER_RADIUS * scale * (0.95 + Math.random() * 0.1);
      const cx = Math.cos(angle);
      const sy = Math.sin(angle);
      s.sprite.position.set(cx * r, sy * r, 0.02 * scale);
      // Velocity = mostly tangent to the ring + small outward radial
      // component, so the motes streak around the rim rather than fly
      // straight out — reads as a "ring kick" rather than an explosion.
      const tangentSpeed = 1.4 + Math.random() * 0.6;
      const radialSpeed = 0.25 + Math.random() * 0.2;
      s.velX = -sy * tangentSpeed + cx * radialSpeed;
      s.velY = cx * tangentSpeed + sy * radialSpeed;
      s.life = SPARKLE_LIFE;
      s.sprite.visible = true;
      s.sprite.scale.setScalar(0.22 * scale);
      s.material.opacity = 0.9;
    }
  };

  const dispose = (): void => {
    ringGeo.dispose();
    ringMat.dispose();
    planetGeo.dispose();
    planetMat.dispose();
    flareMat.dispose();
    for (const s of sparkles) s.material.dispose();
    flareTex.dispose();
  };

  return { group, tick, play, dispose };
}
