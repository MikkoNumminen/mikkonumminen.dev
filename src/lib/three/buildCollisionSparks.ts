import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';

export interface CollisionSparksHandle {
  group: Group;
  /** Activate one flash at the given world position. `count` is ignored. */
  spawn: (x: number, y: number, z: number, count?: number) => void;
  /** Advance active flashes by `delta` seconds. */
  tick: (delta: number) => void;
  dispose: () => void;
}

const POOL_SIZE = 4;
const LIFETIME = 0.45;
const SCALE_START = 1.6;
const SCALE_END = 6.5;

interface FlashState {
  sprite: Sprite;
  material: SpriteMaterial;
  active: boolean;
  age: number;
}

function makeFlashTexture(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('makeFlashTexture: 2D context unavailable');

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.14, 'rgba(232, 245, 255, 0.88)');
  grad.addColorStop(0.4, 'rgba(180, 215, 255, 0.32)');
  grad.addColorStop(0.75, 'rgba(140, 180, 255, 0.07)');
  grad.addColorStop(1, 'rgba(140, 180, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Pool of camera-facing flash sprites used for galaxy collisions. Each
 * spawn activates an idle sprite at a world position; the sprite scales
 * up from a small starting size to a much larger end size while its
 * opacity ramps in fast and then fades out — the visual is a brief
 * bright flash of light, not a debris particle scatter. Mirrors the
 * stroboscopic "bright moment, then gone" feel of the title rim flashes.
 *
 * Pool size of 4 lets close-spaced collisions overlap without one flash
 * cancelling the next; once active, the per-flash lifetime is short
 * (~0.45 s) so the pool turns over quickly.
 */
export function buildCollisionSparks(): CollisionSparksHandle {
  const group = new Group();
  const flashes: FlashState[] = [];
  const texture = makeFlashTexture();

  for (let i = 0; i < POOL_SIZE; i++) {
    const material = new SpriteMaterial({
      map: texture,
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.scale.setScalar(SCALE_START);
    sprite.visible = false;
    group.add(sprite);
    flashes.push({ sprite, material, active: false, age: 0 });
  }

  const spawn = (x: number, y: number, z: number): void => {
    const idle = flashes.find((f) => !f.active);
    if (!idle) return;
    idle.sprite.position.set(x, y, z);
    idle.sprite.scale.setScalar(SCALE_START);
    idle.sprite.visible = true;
    idle.material.opacity = 0;
    idle.active = true;
    idle.age = 0;
  };

  const tick = (delta: number): void => {
    for (const flash of flashes) {
      if (!flash.active) continue;
      flash.age += delta;
      if (flash.age >= LIFETIME) {
        flash.active = false;
        flash.sprite.visible = false;
        flash.material.opacity = 0;
        continue;
      }
      const t = flash.age / LIFETIME;
      // Scale grows fast at first then plateaus — sqrt curve gives a
      // satisfying "blooms outward" feel without overshooting.
      flash.sprite.scale.setScalar(
        SCALE_START + Math.sqrt(t) * (SCALE_END - SCALE_START),
      );
      // Opacity: ramp in over the first 8 % then fade out with a power
      // curve so the flash is briefly fully-bright then dies smoothly.
      const alpha = t < 0.08 ? t / 0.08 : Math.pow(1 - (t - 0.08) / 0.92, 1.5);
      flash.material.opacity = alpha;
    }
  };

  return {
    group,
    spawn,
    tick,
    dispose: (): void => {
      for (const f of flashes) f.material.dispose();
      texture.dispose();
    },
  };
}
