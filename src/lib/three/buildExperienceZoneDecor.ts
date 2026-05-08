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
  dispose: () => void;
}

export interface ExperienceZoneDecorOptions {
  envMap?: Texture | null;
  /** Overall scale relative to a 2.2-unit-tall letter. */
  scale?: number;
}

const SNOW_COUNT = 32;
const SNOW_TEX_SIZE = 32;
const GOAT_TEX_SIZE = 64;
const SNOW_FIELD_HEIGHT = 1.4;
const SNOW_FIELD_HALF_WIDTH = 1.2;

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
      (0.15 + Math.random() * SNOW_FIELD_HEIGHT) * scale - 0.1 * scale;
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
  goat.scale.setScalar(0.55 * scale);
  // Perched on the hero peak (RIDGE_PEAKS[3] apex at x=0.45, y=0.95).
  // Y nudged so hooves sit on, not above, the peak.
  const goatHomeX = 0.45 * scale;
  const goatHomeY = 1.12 * scale;
  goat.position.set(goatHomeX, goatHomeY, 0.12 * scale);
  group.add(goat);

  let snowT = 0;
  let goatT = 0;

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
      if (y < -0.2 * scale) {
        y = (SNOW_FIELD_HEIGHT - 0.05) * scale;
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
  };

  const dispose = (): void => {
    ridgeGeo.dispose();
    ridgeMat.dispose();
    snowGeo.dispose();
    snowMat.dispose();
    snowTex.dispose();
    goatMat.dispose();
    goatTex.dispose();
  };

  return { group, tick, dispose };
}
