import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Points,
  PointsMaterial,
  type Texture,
} from 'three';

export interface HomeZoneDecorHandle {
  group: Group;
  /**
   * Advance dust drift.
   *
   * `boost` ∈ [0, 1] intensifies the zone — slightly denser, slightly
   * brighter dust — used by the caller to react to hover.
   */
  tick: (delta: number, boost: number) => void;
  dispose: () => void;
}

export interface HomeZoneDecorOptions {
  envMap?: Texture | null;
  /** Overall scale relative to a 2.2-unit-tall letter. */
  scale?: number;
}

const DUST_COUNT = 130;
const DUST_TEX_SIZE = 64;
const DUST_HALF_WIDTH = 3.0;
const DUST_HALF_HEIGHT = 0.85;
const DUST_HALF_DEPTH = 0.55;

function makeDustTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = DUST_TEX_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeDustTexture: 2D context unavailable');

  const cx = DUST_TEX_SIZE / 2;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(240, 240, 250, 0.55)');
  grad.addColorStop(1, 'rgba(220, 220, 235, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, DUST_TEX_SIZE, DUST_TEX_SIZE);

  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/**
 * Drifting dust cloud — pre-distributed in the constructor so reduced-
 * motion clients see a populated cloud, not a blank zone. Restraint is
 * the goal: the home zone is the calmest of the four. Earlier rim
 * sprites and a horizontal mist plane were dropped after they read as
 * a "boxed divider" framing the letters rather than as ambient depth.
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
  // Per-particle base column lets the lateral sway sample sin directly
  // (oscillating around base) instead of integrating it (which would
  // drift the column away from its starting x over time).
  const baseX = new Float32Array(DUST_COUNT);
  const driftSpeeds = new Float32Array(DUST_COUNT);
  const phases = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    const i3 = i * 3;
    const x = (Math.random() * 2 - 1) * halfW;
    positions[i3] = x;
    baseX[i] = x;
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
    color: 0xeef0fa,
    size: 0.07 * scale,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    // Additive blending — dust is atmospheric ambient light, not a
    // discrete object. Adding to the background reads as a soft glow
    // around the letters rather than dots painted on top.
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const dust = new Points(dustGeo, dustMat);
  group.add(dust);

  let breatheT = 0;

  const tick = (delta: number, boost: number): void => {
    const speedMul = 1 + boost * 0.9;
    breatheT += delta * 0.6;

    const arr = dustGeo.attributes.position!.array as Float32Array;
    const wrapTop = halfH;
    const span = halfH * 2;
    for (let i = 0; i < DUST_COUNT; i++) {
      const i3 = i * 3;
      const speed = driftSpeeds[i]!;
      const phase = phases[i]!;
      let y = arr[i3 + 1]! + delta * speed * speedMul;
      if (y > wrapTop) y -= span;
      arr[i3 + 1] = y;
      arr[i3] = baseX[i]! + Math.sin(breatheT + phase) * 0.06 * scale;
    }
    dustGeo.attributes.position!.needsUpdate = true;

    dustMat.opacity = 0.65 + boost * 0.3;
  };

  const dispose = (): void => {
    dustGeo.dispose();
    dustMat.dispose();
    dustTex.dispose();
  };

  return { group, tick, dispose };
}
