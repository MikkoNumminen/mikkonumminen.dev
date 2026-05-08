import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';

export interface HomeZoneDecorHandle {
  group: Group;
  /**
   * Advance dust drift / rim breathing animations.
   *
   * `boost` ∈ [0, 1] intensifies the zone — more dust visible, brighter
   * rim sprites, mist gains a touch of opacity — used by the caller to
   * react to hover.
   */
  tick: (delta: number, boost: number) => void;
  dispose: () => void;
}

export interface HomeZoneDecorOptions {
  envMap?: Texture | null;
  /** Overall scale relative to a 2.2-unit-tall letter. */
  scale?: number;
}

const DUST_COUNT = 96;
const DUST_TEX_SIZE = 64;
const RIM_TEX_SIZE = 64;

/** Half-width of the dust volume around the zone center, in scale-units. */
const DUST_HALF_WIDTH = 3.0;
/** Half-height of the dust volume — particles wrap around this band. */
const DUST_HALF_HEIGHT = 1.4;
/** Half-depth of the dust volume — keeps drift in front of the letters. */
const DUST_HALF_DEPTH = 0.55;

function makeDustTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = DUST_TEX_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeDustTexture: 2D context unavailable');

  const cx = DUST_TEX_SIZE / 2;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(240, 240, 238, 0.55)');
  grad.addColorStop(1, 'rgba(220, 220, 220, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, DUST_TEX_SIZE, DUST_TEX_SIZE);

  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function makeRimTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = RIM_TEX_SIZE;
  c.height = RIM_TEX_SIZE * 4;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeRimTexture: 2D context unavailable');

  const w = c.width;
  const h = c.height;
  // Vertical streak: bright spine fading to nothing on the long axis,
  // soft falloff on the short axis — reads as a brushed-metal highlight
  // catching ambient light rather than a discrete object.
  const spine = ctx.createLinearGradient(w / 2, 0, w / 2, h);
  spine.addColorStop(0, 'rgba(255, 255, 255, 0)');
  spine.addColorStop(0.5, 'rgba(252, 250, 246, 0.9)');
  spine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = spine;
  ctx.fillRect(0, 0, w, h);

  const lateral = ctx.createLinearGradient(0, 0, w, 0);
  lateral.addColorStop(0, 'rgba(0, 0, 0, 1)');
  lateral.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  lateral.addColorStop(1, 'rgba(0, 0, 0, 1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = lateral;
  ctx.fillRect(0, 0, w, h);

  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function makeMistTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeMistTexture: 2D context unavailable');

  const grad = ctx.createRadialGradient(128, 32, 0, 128, 32, 128);
  grad.addColorStop(0, 'rgba(245, 244, 240, 0.55)');
  grad.addColorStop(0.5, 'rgba(230, 228, 222, 0.18)');
  grad.addColorStop(1, 'rgba(210, 208, 200, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 64);

  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/**
 * Floating dust + soft vertical rim highlights + faint horizontal mist,
 * sized to wrap the back half of the title (~6 units wide). Drives the
 * home / cinematic zone of the hero — sits over M-I-N-E-N of NUMMINEN
 * and reacts to hover via the `boost` parameter on `tick`.
 *
 * This is the "calm" zone — restraint over flash. Off-white palette,
 * additive blending kept gentle, no rotating geometry.
 */
export function buildHomeZoneDecor(
  opts: HomeZoneDecorOptions = {},
): HomeZoneDecorHandle {
  const scale = opts.scale ?? 1;
  const group = new Group();

  const halfW = DUST_HALF_WIDTH * scale;
  const halfH = DUST_HALF_HEIGHT * scale;
  const halfD = DUST_HALF_DEPTH * scale;

  const positions = new Float32Array(DUST_COUNT * 3);
  const driftSpeeds = new Float32Array(DUST_COUNT);
  const phases = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    const i3 = i * 3;
    // Distribute along the full volume up-front so reduced-motion clients
    // (where tick runs with delta=0) see a populated dust field rather
    // than a blank zone.
    positions[i3] = (Math.random() * 2 - 1) * halfW;
    positions[i3 + 1] = (Math.random() * 2 - 1) * halfH;
    positions[i3 + 2] = (Math.random() * 2 - 1) * halfD;
    driftSpeeds[i] = 0.04 + Math.random() * 0.09;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(positions, 3));
  const dustTex = makeDustTexture();
  const dustMat = new PointsMaterial({
    map: dustTex,
    color: 0xf2efe8,
    size: 0.08 * scale,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const dust = new Points(dustGeo, dustMat);
  group.add(dust);

  const rimTex = makeRimTexture();
  const rimMatLeft = new SpriteMaterial({
    map: rimTex,
    color: 0xfaf7f0,
    blending: AdditiveBlending,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const rimMatRight = new SpriteMaterial({
    map: rimTex,
    color: 0xfaf7f0,
    blending: AdditiveBlending,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const rimLeft = new Sprite(rimMatLeft);
  rimLeft.scale.set(0.55 * scale, 2.6 * scale, 1);
  rimLeft.position.set(-2.85 * scale, 0, -0.05 * scale);
  group.add(rimLeft);

  const rimRight = new Sprite(rimMatRight);
  rimRight.scale.set(0.55 * scale, 2.6 * scale, 1);
  rimRight.position.set(2.85 * scale, 0, -0.05 * scale);
  group.add(rimRight);

  const mistTex = makeMistTexture();
  const mistGeo = new PlaneGeometry(6.4 * scale, 0.9 * scale);
  const mistMat = new MeshBasicMaterial({
    map: mistTex,
    color: 0xefece4,
    transparent: true,
    opacity: 0.14,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const mist = new Mesh(mistGeo, mistMat);
  mist.position.set(0, -0.55 * scale, 0.6 * scale);
  group.add(mist);

  let breatheT = 0;

  const tick = (delta: number, boost: number): void => {
    const speedMul = 1 + boost * 0.9;
    breatheT += delta * 0.6;

    const pos = dustGeo.attributes.position;
    if (pos) {
      const arr = pos.array as Float32Array;
      const wrapTop = halfH;
      const span = halfH * 2;
      for (let i = 0; i < DUST_COUNT; i++) {
        const i3 = i * 3;
        const speed = driftSpeeds[i] ?? 0.05;
        const phase = phases[i] ?? 0;
        const yi = i3 + 1;
        const xi = i3;
        const y0 = arr[yi] ?? 0;
        const x0 = arr[xi] ?? 0;
        let y = y0 + delta * speed * speedMul;
        if (y > wrapTop) y -= span;
        arr[yi] = y;
        // Tiny lateral sway so the field doesn't look like a vertical
        // conveyor — amplitude small enough to stay subliminal.
        arr[xi] = x0 + Math.sin(breatheT + phase) * delta * 0.05 * scale;
      }
      pos.needsUpdate = true;
    }

    dustMat.opacity = 0.5 + boost * 0.35;

    const breathe = 0.5 + 0.5 * Math.sin(breatheT * 0.7);
    const rimBase = 0.28 + breathe * 0.08 + boost * 0.35;
    rimMatLeft.opacity = rimBase;
    rimMatRight.opacity = rimBase * 0.95;

    mistMat.opacity = 0.12 + boost * 0.12;
  };

  const dispose = (): void => {
    dustGeo.dispose();
    dustMat.dispose();
    dustTex.dispose();
    rimMatLeft.dispose();
    rimMatRight.dispose();
    rimTex.dispose();
    mistGeo.dispose();
    mistMat.dispose();
    mistTex.dispose();
  };

  return { group, tick, dispose };
}
