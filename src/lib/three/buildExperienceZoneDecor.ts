import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  Points,
  PointsMaterial,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';

export interface ExperienceZoneDecorHandle {
  group: Group;
  /**
   * Advance snowfall, ridge breathe, goat bob.
   *
   * `boost` ∈ [0, 1] intensifies the zone — denser snow, brighter peak,
   * livelier goat — used by the caller to react to hover.
   */
  tick: (delta: number, boost: number) => void;
  /**
   * Trigger a one-shot goat bleat — the goat hops with a scale pulse and
   * a small dust puff blooms at its hooves. Reads as "the goat reacted",
   * the friendliest Easter egg of the lot.
   */
  play: () => void;
  dispose: () => void;
}

export interface ExperienceZoneDecorOptions {
  envMap?: Texture | null;
  /** Overall scale relative to a 2.2-unit-tall letter. */
  scale?: number;
}

const SNOW_COUNT = 60;
const SNOW_TEX_SIZE = 32;
const GOAT_TEX_SIZE = 64;
// Snow drifts from `SNOW_FIELD_TOP` (just above the peaks) down to
// `SNOW_FIELD_BOTTOM` before wrapping back to the top. The bottom was
// originally -0.2 (snow stopped just below the ridge base); user asked
// for snow to fall lower onto MIKKO NUMMINEN, so the band now extends
// well past the M letter into the line gap above NUMMINEN. Count was
// also bumped (32 → 60) so the larger area doesn't read as sparser.
const SNOW_FIELD_TOP = 1.45;
const SNOW_FIELD_BOTTOM = -3.0;
const SNOW_FIELD_HEIGHT = SNOW_FIELD_TOP - SNOW_FIELD_BOTTOM;
const SNOW_FIELD_HALF_WIDTH = 1.2;

// Background-meteor streaks above the mountain. Sparse on purpose — three
// at a time, each with a random post-death delay before respawn, so the
// sky reads as "occasional shooting stars" rather than a constant
// procession. Placed slightly behind the ridge (z < 0 in decor space) so
// the silhouette occludes them as they cross.
const METEOR_COUNT = 3;
const METEOR_TEX_W = 64;
const METEOR_TEX_H = 12;
const METEOR_FIELD_HALF_WIDTH = 2.0;
const METEOR_Y_MIN = 1.4;
const METEOR_Y_MAX = 2.8;
const METEOR_SPEED_MIN = 0.8;
const METEOR_SPEED_MAX = 1.6;
const METEOR_LIFE_MIN = 1.2;
const METEOR_LIFE_MAX = 2.5;
const METEOR_RESPAWN_DELAY_MIN = 0.5;
const METEOR_RESPAWN_DELAY_MAX = 2.5;
// Streak dimensions in decor-local units before scale.
const METEOR_LENGTH = 0.5;
const METEOR_THICKNESS = 0.05;
// Fade-in occupies the first 15% of life, fade-out the last 25%. Outside
// those bands the streak is at full opacity.
const METEOR_FADE_IN_FRACTION = 0.15;
const METEOR_FADE_OUT_FRACTION = 0.25;

// Click-response constants. Goat scale tops out at 1 + 0.18 ≈ 1.18 at
// the apex of the bleat; dust puff lives ~600 ms and grows from a tiny
// dot to ~0.55× scale before fading out.
const GOAT_PULSE_PEAK = 0.18;
const GOAT_PULSE_HOP = 0.05;
const CLICK_DECAY = 1.6;
const DUST_LIFE = 0.6;
const DUST_TEX_SIZE = 64;

/**
 * Single mountain ridge — solo silhouette so the M doesn't get crowded
 * with three parallax layers. Hero peak at x≈0.45, secondary peak at
 * x≈-0.6, gentler shoulders elsewhere.
 */
const RIDGE_PEAKS: ReadonlyArray<readonly [number, number]> = [
  [-1.1, -0.05],
  [-0.6, 0.6],
  [-0.15, 0.42],
  [0.45, 0.95],
  [0.95, 0.5],
  [1.1, 0.55],
  [1.1, -0.05],
];

function makeRidgeGeometry(scale: number): ShapeGeometry {
  const shape = new Shape();
  const first = RIDGE_PEAKS[0];
  if (!first) throw new Error('makeRidgeGeometry: peaks must be non-empty');
  shape.moveTo(first[0] * scale, first[1] * scale);
  for (let i = 1; i < RIDGE_PEAKS.length; i++) {
    const p = RIDGE_PEAKS[i];
    if (!p) continue;
    shape.lineTo(p[0] * scale, p[1] * scale);
  }
  shape.closePath();
  return new ShapeGeometry(shape);
}

function makeMeteorTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = METEOR_TEX_W;
  c.height = METEOR_TEX_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeMeteorTexture: 2D context unavailable');

  // Horizontal streak: head bright on the right, fading tail toward the
  // left. Drawn as a horizontal gradient then masked with a vertical
  // gradient via destination-in for soft top/bottom edges.
  const horiz = ctx.createLinearGradient(0, 0, METEOR_TEX_W, 0);
  horiz.addColorStop(0, 'rgba(180, 210, 255, 0)');
  horiz.addColorStop(0.6, 'rgba(220, 235, 255, 0.35)');
  horiz.addColorStop(0.95, 'rgba(255, 255, 255, 0.95)');
  horiz.addColorStop(1, 'rgba(255, 255, 255, 1)');
  ctx.fillStyle = horiz;
  ctx.fillRect(0, 0, METEOR_TEX_W, METEOR_TEX_H);

  ctx.globalCompositeOperation = 'destination-in';
  const vert = ctx.createLinearGradient(0, 0, 0, METEOR_TEX_H);
  vert.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vert.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
  vert.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = vert;
  ctx.fillRect(0, 0, METEOR_TEX_W, METEOR_TEX_H);

  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function makeSnowflakeTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = SNOW_TEX_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeSnowflakeTexture: 2D context unavailable');

  const cx = SNOW_TEX_SIZE / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.35, 'rgba(240, 248, 255, 0.55)');
  g.addColorStop(1, 'rgba(220, 235, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SNOW_TEX_SIZE, SNOW_TEX_SIZE);

  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function makeDustTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = DUST_TEX_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeDustTexture: 2D context unavailable');
  const cx = DUST_TEX_SIZE / 2;
  // Soft, warm-grey radial cloud — reads as kicked-up dust rather than
  // snow (the snowflakes already in the scene are cool-white).
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  g.addColorStop(0, 'rgba(225, 220, 210, 0.7)');
  g.addColorStop(0.4, 'rgba(200, 190, 175, 0.32)');
  g.addColorStop(1, 'rgba(170, 160, 145, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, DUST_TEX_SIZE, DUST_TEX_SIZE);
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function makeGoatTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = GOAT_TEX_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeGoatTexture: 2D context unavailable');

  ctx.clearRect(0, 0, GOAT_TEX_SIZE, GOAT_TEX_SIZE);
  ctx.strokeStyle = 'rgba(245, 248, 255, 0.95)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(14, 44);
  ctx.lineTo(18, 36);
  ctx.lineTo(24, 32);
  ctx.lineTo(40, 32);
  ctx.lineTo(46, 28);
  ctx.lineTo(50, 22);
  ctx.lineTo(54, 26);
  ctx.lineTo(50, 30);
  ctx.lineTo(44, 32);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(20, 38);
  ctx.lineTo(20, 46);
  ctx.moveTo(26, 38);
  ctx.lineTo(26, 46);
  ctx.moveTo(38, 38);
  ctx.lineTo(38, 46);
  ctx.moveTo(44, 38);
  ctx.lineTo(44, 46);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(48, 22);
  ctx.quadraticCurveTo(46, 14, 42, 14);
  ctx.moveTo(50, 21);
  ctx.quadraticCurveTo(50, 13, 46, 12);
  ctx.stroke();

  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/**
 * Single mountain ridge + drifting snow + perched goat, sized to fill
 * one letter (~2.2 units wide). Drives the experience zone of the hero
 * title — sits over the M of MIKKO and reacts to hover via `boost` on
 * `tick`. Reduced from 3 ridges + mist to keep the silhouette legible
 * at single-letter scale.
 *
 * The decor expects to be positioned ABOVE the letter (positive Y in
 * mesh-local space); ridge base sits at y ≈ -0.05 in decor-local so
 * the silhouette grows upward from the placement Y.
 */
export function buildExperienceZoneDecor(
  opts: ExperienceZoneDecorOptions = {},
): ExperienceZoneDecorHandle {
  const scale = opts.scale ?? 1;
  const group = new Group();

  const ridgeGeo = makeRidgeGeometry(scale);
  const ridgeBaseEmissive = 0.08;
  const ridgeColor = 0x6b7689;
  const ridgeMat = new MeshStandardMaterial({
    color: ridgeColor,
    roughness: 0.95,
    metalness: 0.05,
    emissive: new Color(ridgeColor),
    emissiveIntensity: ridgeBaseEmissive,
    envMap: opts.envMap ?? null,
    envMapIntensity: 0.25,
  });
  const ridge = new Mesh(ridgeGeo, ridgeMat);
  group.add(ridge);

  const snowTex = makeSnowflakeTexture();
  const snowGeo = new BufferGeometry();
  const snowPositions = new Float32Array(SNOW_COUNT * 3);
  // Per-particle base column lets the lateral sway sample sin directly
  // (oscillating around base) instead of integrating it (which would
  // drift the column away from its starting x over time).
  const snowBaseX = new Float32Array(SNOW_COUNT);
  const snowSpeeds = new Float32Array(SNOW_COUNT);
  const snowPhases = new Float32Array(SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) {
    const x0 = (Math.random() * 2 - 1) * SNOW_FIELD_HALF_WIDTH * scale;
    snowBaseX[i] = x0;
    snowPositions[i * 3 + 0] = x0;
    snowPositions[i * 3 + 1] =
      (SNOW_FIELD_BOTTOM + Math.random() * SNOW_FIELD_HEIGHT) * scale;
    snowPositions[i * 3 + 2] = (Math.random() * 2 - 1) * 0.18 * scale;
    snowSpeeds[i] = 0.05 + Math.random() * 0.12;
    snowPhases[i] = Math.random() * Math.PI * 2;
  }
  snowGeo.setAttribute('position', new Float32BufferAttribute(snowPositions, 3));
  const snowMat = new PointsMaterial({
    map: snowTex,
    size: 0.09 * scale,
    color: 0xf2f7ff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    sizeAttenuation: true,
    // Normal blending — snow flakes are discrete white objects that
    // occlude the background, not atmospheric haze. Additive would
    // make them disappear into bright areas of the scene.
    blending: NormalBlending,
  });
  const snow = new Points(snowGeo, snowMat);
  snow.position.z = 0.02 * scale;
  group.add(snow);

  const goatTex = makeGoatTexture();
  const goatMat = new SpriteMaterial({
    map: goatTex,
    color: 0xe8eef8,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const goat = new Sprite(goatMat);
  // Roughly 2× the earlier draft so the goat reads at single-letter
  // scale rather than disappearing into the silhouette.
  const GOAT_BASE_SCALE = 0.55 * scale;
  goat.scale.setScalar(GOAT_BASE_SCALE);
  // Perched on the hero peak (RIDGE_PEAKS[3] apex at x=0.45, y=0.95).
  // Y nudged so hooves sit on, not above, the peak.
  const goatHomeX = 0.45 * scale;
  const goatHomeY = 1.12 * scale;
  goat.position.set(goatHomeX, goatHomeY, 0.12 * scale);
  group.add(goat);

  // Dust puff at the goat's hooves on click. One sprite, recycled each
  // play — sits invisible at rest, gets reset to a tiny dot, then expands
  // + fades over DUST_LIFE seconds. Cheaper than a particle burst, and
  // visually reads as the same "hop kicked up dust" idea.
  const dustTex = makeDustTexture();
  const dustMat = new SpriteMaterial({
    map: dustTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const dust = new Sprite(dustMat);
  dust.position.set(goatHomeX, goatHomeY - 0.12 * scale, 0.08 * scale);
  dust.scale.setScalar(0.15 * scale);
  dust.visible = false;
  group.add(dust);
  let dustLife = 0;

  // Background meteors — sprite pool with per-instance rotation so each
  // streak aligns with its own velocity vector. Texture is shared; each
  // sprite owns its own material because SpriteMaterial.rotation is per-
  // material in three.js.
  const meteorTex = makeMeteorTexture();
  interface MeteorState {
    sprite: Sprite;
    material: SpriteMaterial;
    velX: number;
    velY: number;
    life: number;
    maxLife: number;
    delayUntilRespawn: number;
  }
  const meteors: MeteorState[] = [];
  for (let i = 0; i < METEOR_COUNT; i++) {
    const mat = new SpriteMaterial({
      map: meteorTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new Sprite(mat);
    sprite.scale.set(METEOR_LENGTH * scale, METEOR_THICKNESS * scale, 1);
    sprite.position.z = -0.05 * scale;
    group.add(sprite);
    meteors.push({
      sprite,
      material: mat,
      velX: 0,
      velY: 0,
      life: 0,
      maxLife: 0,
      // The 0.5–2.5s random spread already separates the three initial
      // spawns without a deterministic index offset.
      delayUntilRespawn:
        METEOR_RESPAWN_DELAY_MIN +
        Math.random() * (METEOR_RESPAWN_DELAY_MAX - METEOR_RESPAWN_DELAY_MIN),
    });
  }

  const respawnMeteor = (m: MeteorState): void => {
    const sign = Math.random() < 0.5 ? 1 : -1;
    const x = (Math.random() * 2 - 1) * METEOR_FIELD_HALF_WIDTH * scale;
    const y = (METEOR_Y_MIN + Math.random() * (METEOR_Y_MAX - METEOR_Y_MIN)) * scale;
    m.sprite.position.x = x;
    m.sprite.position.y = y;
    // Angle: -30° to -10° below horizontal. `sign` flips the direction
    // (left vs right) so meteors travel both ways across the sky.
    const angle = -Math.PI / 6 + Math.random() * (Math.PI / 9);
    const speed =
      METEOR_SPEED_MIN + Math.random() * (METEOR_SPEED_MAX - METEOR_SPEED_MIN);
    m.velX = Math.cos(angle) * speed * sign;
    m.velY = Math.sin(angle) * speed;
    // For leftward meteors, mirror the rotation so the bright head stays
    // at the leading edge of motion.
    m.material.rotation = sign > 0 ? angle : Math.PI - angle;
    m.maxLife = METEOR_LIFE_MIN + Math.random() * (METEOR_LIFE_MAX - METEOR_LIFE_MIN);
    m.life = m.maxLife;
  };

  let snowT = 0;
  let goatT = 0;
  let clickImpulse = 0;

  const tick = (delta: number, boost: number): void => {
    const speedMul = 1 + boost * 1.4;
    snowT += delta * speedMul;
    goatT += delta * (0.6 + boost * 0.4);

    const posAttr = snowGeo.getAttribute('position');
    const fall = delta * speedMul;
    for (let i = 0; i < SNOW_COUNT; i++) {
      const speed = snowSpeeds[i]!;
      const phase = snowPhases[i]!;
      let y = posAttr.getY(i) - speed * fall;
      if (y < SNOW_FIELD_BOTTOM * scale) {
        y = SNOW_FIELD_TOP * scale;
        const nx = (Math.random() * 2 - 1) * SNOW_FIELD_HALF_WIDTH * scale;
        snowBaseX[i] = nx;
      }
      const baseX = snowBaseX[i]!;
      posAttr.setX(i, baseX + Math.sin(snowT * 0.8 + phase) * 0.05 * scale);
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;

    snowMat.opacity = 0.7 + boost * 0.25;
    ridgeMat.emissiveIntensity = ridgeBaseEmissive + boost * 0.18;

    goat.position.y = goatHomeY + Math.sin(goatT * 1.3) * 0.012 * scale;
    goat.position.x = goatHomeX + Math.sin(goatT * 0.7) * 0.008 * scale;

    // Click impulse: a brief "hop" — scale pops up then settles, plus a
    // small Y bump on top of the resting bob. Sine of (impulse * π) gives
    // a smooth in-out curve over the decay so the apex hits at the
    // midpoint of the impulse's life, not the start.
    if (clickImpulse > 0) {
      clickImpulse = Math.max(0, clickImpulse - delta * CLICK_DECAY);
      const env = Math.sin(clickImpulse * Math.PI);
      goat.scale.setScalar(GOAT_BASE_SCALE * (1 + env * GOAT_PULSE_PEAK));
      goat.position.y += env * GOAT_PULSE_HOP * scale;
    } else if (goat.scale.x !== GOAT_BASE_SCALE) {
      goat.scale.setScalar(GOAT_BASE_SCALE);
    }

    // Dust puff lifecycle — grows and fades over DUST_LIFE seconds. Lives
    // independently of the impulse decay so it can outlast the goat's
    // visible hop (the puff lingers slightly, like real kicked-up dust).
    if (dustLife > 0) {
      dustLife = Math.max(0, dustLife - delta);
      const t = 1 - dustLife / DUST_LIFE; // 0 → 1 over its life
      dust.scale.setScalar((0.15 + t * 0.45) * scale);
      // Opacity: ramps in over the first 20% of life, then fades to 0.
      const opacityEnv = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      dustMat.opacity = Math.max(0, opacityEnv * 0.7);
      if (dustLife <= 0) {
        dust.visible = false;
        dustMat.opacity = 0;
      }
    }

    // Meteor pool — each streak is either alive (life > 0, advancing along
    // its velocity vector with a fade-in/out envelope) or dead (counting
    // down a random delay before respawning at a fresh position).
    const meteorBoost = 0.7 + boost * 0.3;
    for (const m of meteors) {
      if (m.life > 0) {
        m.life -= delta;
        if (m.life <= 0) {
          m.material.opacity = 0;
          m.delayUntilRespawn =
            METEOR_RESPAWN_DELAY_MIN +
            Math.random() * (METEOR_RESPAWN_DELAY_MAX - METEOR_RESPAWN_DELAY_MIN);
          continue;
        }
        m.sprite.position.x += m.velX * delta;
        m.sprite.position.y += m.velY * delta;
        // Fade envelope: ramp up over the first METEOR_FADE_IN_FRACTION of
        // life, hold at full, then ramp down over the last
        // METEOR_FADE_OUT_FRACTION of life. Prevents pop-in / pop-out.
        const age = m.maxLife - m.life;
        const fadeIn = Math.min(1, age / (METEOR_FADE_IN_FRACTION * m.maxLife));
        const fadeOut = Math.min(1, m.life / (METEOR_FADE_OUT_FRACTION * m.maxLife));
        m.material.opacity = Math.min(fadeIn, fadeOut) * 0.85 * meteorBoost;
      } else {
        m.delayUntilRespawn -= delta;
        if (m.delayUntilRespawn <= 0) {
          respawnMeteor(m);
        }
      }
    }
  };

  const play = (): void => {
    clickImpulse = 1;
    dustLife = DUST_LIFE;
    dust.visible = true;
    // Reset dust to its starting pose so back-to-back clicks each begin
    // with a fresh tiny dot rather than picking up mid-expansion.
    dust.scale.setScalar(0.15 * scale);
    dustMat.opacity = 0;
  };

  const dispose = (): void => {
    ridgeGeo.dispose();
    ridgeMat.dispose();
    snowGeo.dispose();
    snowMat.dispose();
    snowTex.dispose();
    goatMat.dispose();
    goatTex.dispose();
    dustMat.dispose();
    dustTex.dispose();
    for (const m of meteors) {
      m.material.dispose();
    }
    meteorTex.dispose();
  };

  return { group, tick, play, dispose };
}
