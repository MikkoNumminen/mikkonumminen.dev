import {
  AdditiveBlending,
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
   * Advance snowfall drift, ridge sway, and goat bob.
   *
   * `boost` ∈ [0, 1] intensifies the zone — denser snow, brighter peaks,
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

const SNOW_COUNT = 90;
const SNOW_TEX_SIZE = 32;
const GOAT_TEX_SIZE = 64;
/** Vertical span the snow occupies above the ridges, in scale-units. */
const SNOW_FIELD_HEIGHT = 1.4;
/** Half-width of the snow field — matches the ~2.4-unit zone budget. */
const SNOW_FIELD_HALF_WIDTH = 1.2;

interface RidgeSpec {
  /** Triangular peak vertices in (x, y) pairs, walked left-to-right. */
  peaks: ReadonlyArray<readonly [number, number]>;
  z: number;
  color: number;
  opacity: number;
}

const RIDGES: ReadonlyArray<RidgeSpec> = [
  {
    // Back ridge — softest, dustiest, sits furthest from the camera.
    peaks: [
      [-1.2, -0.05],
      [-0.7, 0.55],
      [-0.25, 0.32],
      [0.2, 0.7],
      [0.65, 0.35],
      [1.2, 0.5],
      [1.2, -0.05],
    ],
    z: -0.18,
    color: 0x8a96a8,
    opacity: 0.78,
  },
  {
    // Mid ridge — the hero peaks, snow-capped and crisper.
    peaks: [
      [-1.1, -0.1],
      [-0.55, 0.78],
      [-0.1, 0.45],
      [0.45, 0.95],
      [0.95, 0.4],
      [1.1, 0.55],
      [1.1, -0.1],
    ],
    z: -0.05,
    color: 0x5d6776,
    opacity: 1,
  },
  {
    // Foreground spurs — small, dark, in front of the letter face.
    peaks: [
      [-1.05, -0.18],
      [-0.75, 0.18],
      [-0.4, -0.04],
      [0.05, 0.22],
      [0.55, 0.05],
      [0.95, 0.28],
      [1.05, -0.18],
    ],
    z: 0.08,
    color: 0x3d4452,
    opacity: 1,
  },
];

function makeRidgeGeometry(
  peaks: ReadonlyArray<readonly [number, number]>,
  scale: number,
): ShapeGeometry {
  const shape = new Shape();
  const first = peaks[0];
  if (!first) throw new Error('makeRidgeGeometry: peaks must be non-empty');
  shape.moveTo(first[0] * scale, first[1] * scale);
  for (let i = 1; i < peaks.length; i++) {
    const p = peaks[i];
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

  // Body: low-slung goat profile. Coordinates picked by eye in a
  // 64x64 box; tweaking these shifts the silhouette only.
  ctx.beginPath();
  ctx.moveTo(14, 44); // rear hoof
  ctx.lineTo(18, 36); // rear haunch
  ctx.lineTo(24, 32); // back
  ctx.lineTo(40, 32); // shoulders
  ctx.lineTo(46, 28); // neck
  ctx.lineTo(50, 22); // head top
  ctx.lineTo(54, 26); // muzzle
  ctx.lineTo(50, 30); // chin
  ctx.lineTo(44, 32); // throat back to body
  ctx.stroke();

  // Front + rear legs — short stubs so the silhouette reads as standing.
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

  // Horns — the vuohiliitto wink. Two short curved sweeps off the head.
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
 * Three parallax mountain ridges + drifting snow + a tiny goat perched
 * on the hero peak. Sized to fill ~2.4 units across, drives the
 * experience-zone of the hero title — sits over the M-I of MIKKO and
 * reacts to hover via the `boost` parameter on `tick`.
 */
export function buildExperienceZoneDecor(
  opts: ExperienceZoneDecorOptions = {},
): ExperienceZoneDecorHandle {
  const scale = opts.scale ?? 1;
  const group = new Group();

  const ridgeGeos: ShapeGeometry[] = [];
  const ridgeMats: MeshStandardMaterial[] = [];
  const ridgeBaseEmissive: number[] = [];

  for (let i = 0; i < RIDGES.length; i++) {
    const spec = RIDGES[i];
    if (!spec) continue;
    const geo = makeRidgeGeometry(spec.peaks, scale);
    // Matte stone — picks up scene lighting but stays flat enough to
    // read as a silhouette rather than a sculpted volume.
    const baseEmissive = 0.05 + i * 0.02;
    const mat = new MeshStandardMaterial({
      color: spec.color,
      roughness: 0.95,
      metalness: 0.05,
      emissive: new Color(spec.color),
      emissiveIntensity: baseEmissive,
      transparent: spec.opacity < 1,
      opacity: spec.opacity,
      envMap: opts.envMap ?? null,
      envMapIntensity: 0.25,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.z = spec.z * scale;
    group.add(mesh);
    ridgeGeos.push(geo);
    ridgeMats.push(mat);
    ridgeBaseEmissive.push(baseEmissive);
  }

  const snowTex = makeSnowflakeTexture();
  const snowGeo = new BufferGeometry();
  const snowPositions = new Float32Array(SNOW_COUNT * 3);
  // Per-particle drift parameters, kept off the GPU side so the CPU
  // tick can sway each flake on its own phase without uniform updates.
  const snowSpeeds = new Float32Array(SNOW_COUNT);
  const snowPhases = new Float32Array(SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) {
    const x = (Math.random() * 2 - 1) * SNOW_FIELD_HALF_WIDTH * scale;
    const y = (0.15 + Math.random() * SNOW_FIELD_HEIGHT) * scale - 0.1 * scale;
    const z = (Math.random() * 2 - 1) * 0.18 * scale;
    snowPositions[i * 3 + 0] = x;
    snowPositions[i * 3 + 1] = y;
    snowPositions[i * 3 + 2] = z;
    snowSpeeds[i] = 0.05 + Math.random() * 0.12;
    snowPhases[i] = Math.random() * Math.PI * 2;
  }
  snowGeo.setAttribute('position', new Float32BufferAttribute(snowPositions, 3));
  const snowMat = new PointsMaterial({
    map: snowTex,
    size: 0.08 * scale,
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

  // Faint mist hugging the ridge bases — a single additive sprite so it
  // brightens the snowline without a second particle pass.
  const mistMat = new SpriteMaterial({
    map: snowTex,
    color: 0xc8d4e6,
    transparent: true,
    opacity: 0.35,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const mist = new Sprite(mistMat);
  mist.scale.set(2.4 * scale, 0.5 * scale, 1);
  mist.position.set(0, 0.08 * scale, -0.02 * scale);
  group.add(mist);

  const goatTex = makeGoatTexture();
  const goatMat = new SpriteMaterial({
    map: goatTex,
    color: 0xe8eef8,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const goat = new Sprite(goatMat);
  goat.scale.setScalar(0.28 * scale);
  // Perched on the mid-ridge's hero peak (matches RIDGES[1] apex at
  // x=0.45, y=0.95). Y nudged so hooves sit on, not above, the peak.
  const goatHomeX = 0.45 * scale;
  const goatHomeY = 1.04 * scale;
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
      const speed = snowSpeeds[i] ?? 0.08;
      const phase = snowPhases[i] ?? 0;
      let y = posAttr.getY(i) - speed * fall;
      // Recycle off the bottom — wrap to the top of the field at a
      // fresh x so columns don't visibly streak.
      if (y < -0.2 * scale) {
        y = (SNOW_FIELD_HEIGHT - 0.05) * scale;
        const nx = (Math.random() * 2 - 1) * SNOW_FIELD_HALF_WIDTH * scale;
        posAttr.setX(i, nx);
      }
      const sway = Math.sin(snowT * 0.8 + phase) * 0.018 * scale;
      posAttr.setX(i, posAttr.getX(i) + sway * delta * 4);
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;

    snowMat.opacity = 0.7 + boost * 0.25;
    mistMat.opacity = 0.3 + Math.sin(snowT * 0.5) * 0.05 + boost * 0.2;

    for (let i = 0; i < ridgeMats.length; i++) {
      const mat = ridgeMats[i];
      const base = ridgeBaseEmissive[i];
      if (!mat || base === undefined) continue;
      mat.emissiveIntensity = base + boost * 0.18;
    }

    // Goat bob — small head-up / head-down sway. Stays within a few
    // pixels of its perch so the silhouette doesn't slide off the peak.
    goat.position.y = goatHomeY + Math.sin(goatT * 1.3) * 0.012 * scale;
    goat.position.x = goatHomeX + Math.sin(goatT * 0.7) * 0.008 * scale;
  };

  const dispose = (): void => {
    for (const g of ridgeGeos) g.dispose();
    for (const m of ridgeMats) m.dispose();
    snowGeo.dispose();
    snowMat.dispose();
    snowTex.dispose();
    mistMat.dispose();
    goatMat.dispose();
    goatTex.dispose();
  };

  return { group, tick, dispose };
}
