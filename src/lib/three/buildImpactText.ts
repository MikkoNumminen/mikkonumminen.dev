import {
  CanvasTexture,
  Color,
  Group,
  NormalBlending,
  Sprite,
  SpriteMaterial,
} from 'three';

export interface ImpactTextHandle {
  group: Group;
  /** Pop a commit-message text at the given world position, tinted by `color`. */
  spawn: (text: string, x: number, y: number, z: number, color: Color) => void;
  tick: (delta: number) => void;
  dispose: () => void;
}

const POOL_SIZE = 6;
const LIFETIME = 1.8;
const RISE_SPEED = 1.2;
// World-space size of the sprite at scale = 1. The sprite billboards a
// canvas texture, so this maps the entire texture rectangle to this world
// size. Sized so a typical commit subject reads cleanly at the meteor
// impact distance (~12-16 units from the camera).
const BASE_WORLD_WIDTH = 7.5;
const BASE_WORLD_HEIGHT = 1.4;
// Off-screen canvas resolution. Wider than tall so monospace lines have
// room to breathe; matches the BASE_WORLD aspect ratio. Halved from the
// original 1024×192 — text still reads sharp at the popup's screen size
// and the 6-slot pool fits in ~1.2 MB of texture memory instead of ~9 MB.
const CANVAS_W = 512;
const CANVAS_H = 96;

interface PopupState {
  sprite: Sprite;
  material: SpriteMaterial;
  texture: CanvasTexture;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  active: boolean;
  age: number;
  tint: Color;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  tint: Color,
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Faint scanline backdrop — almost invisible, just enough CRT vibe to
  // sell the terminal aesthetic without hurting legibility.
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = `rgb(${Math.round(tint.r * 255)}, ${Math.round(
    tint.g * 255,
  )}, ${Math.round(tint.b * 255)})`;
  for (let y = 2; y < canvas.height; y += 4) {
    ctx.fillRect(0, y, canvas.width, 1);
  }
  ctx.restore();

  // Truncate excessively long subjects so the sprite doesn't shrink to
  // illegibility. Common conventional commits fit comfortably under 80.
  const display = text.length > 72 ? text.slice(0, 69) + '…' : text;

  ctx.font = `700 48px "JetBrains Mono", "SFMono-Regular", ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Outer halo — wide soft stroke at low alpha, gives the popup a glow
  // that reads against bright sparks underneath.
  const tintCss = `rgb(${Math.round(tint.r * 255)}, ${Math.round(
    tint.g * 255,
  )}, ${Math.round(tint.b * 255)})`;
  ctx.save();
  ctx.shadowColor = tintCss;
  ctx.shadowBlur = 12;
  ctx.lineJoin = 'round';

  // Black ink stroke for legibility against any backdrop.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.lineWidth = 6;
  ctx.strokeText(display, cx, cy);

  // Tinted core fill — brightened toward white so the body of the text
  // pops without losing the meteor's color signature.
  const r = Math.min(255, Math.round(tint.r * 255 * 1.15 + 30));
  const g = Math.min(255, Math.round(tint.g * 255 * 1.15 + 30));
  const b = Math.min(255, Math.round(tint.b * 255 * 1.15 + 30));
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillText(display, cx, cy);
  ctx.restore();
}

/**
 * Pool of camera-facing text sprites that pop up at meteor impact points.
 * Each slot owns an offscreen canvas + CanvasTexture; on spawn we redraw
 * the canvas with the new commit subject in terminal-styled monospace,
 * tint-matched to the meteor that hit. Animation is RPG damage-popup
 * shaped: snappy scale overshoot, slow upward drift, late opacity fade.
 *
 * Sized at 6 slots so closely-spaced impacts don't queue up and lose
 * messages. Lifetime ~1.8 s gives the user time to read each subject.
 */
export function buildImpactText(): ImpactTextHandle {
  const group = new Group();
  const popups: PopupState[] = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('buildImpactText: 2D context unavailable');

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      opacity: 0,
    });
    const sprite = new Sprite(material);
    sprite.scale.set(BASE_WORLD_WIDTH, BASE_WORLD_HEIGHT, 1);
    sprite.visible = false;
    group.add(sprite);

    popups.push({
      sprite,
      material,
      texture,
      canvas,
      ctx,
      active: false,
      age: 0,
      tint: new Color(),
    });
  }

  const spawn = (text: string, x: number, y: number, z: number, color: Color): void => {
    const idle = popups.find((p) => !p.active);
    if (!idle || !text) return;

    idle.tint.copy(color);
    drawText(idle.ctx, idle.canvas, text, idle.tint);
    idle.texture.needsUpdate = true;

    idle.sprite.position.set(x, y, z);
    idle.sprite.scale.set(BASE_WORLD_WIDTH * 0.6, BASE_WORLD_HEIGHT * 0.6, 1);
    idle.sprite.visible = true;
    idle.material.opacity = 0;
    idle.active = true;
    idle.age = 0;
  };

  const tick = (delta: number): void => {
    for (const p of popups) {
      if (!p.active) continue;
      p.age += delta;
      if (p.age >= LIFETIME) {
        p.active = false;
        p.sprite.visible = false;
        p.material.opacity = 0;
        continue;
      }

      const t = p.age / LIFETIME;

      // Scale: pop in fast (overshoot at t≈12 %), settle by t≈25 %, hold,
      // then ease down a touch at the end so the fade reads as collapse.
      let scaleMul: number;
      if (t < 0.12) {
        scaleMul = 0.6 + (t / 0.12) * 0.55; // 0.6 → 1.15
      } else if (t < 0.25) {
        scaleMul = 1.15 - ((t - 0.12) / 0.13) * 0.15; // 1.15 → 1.0
      } else if (t < 0.8) {
        scaleMul = 1.0;
      } else {
        scaleMul = 1.0 - ((t - 0.8) / 0.2) * 0.08; // 1.0 → 0.92
      }
      p.sprite.scale.set(BASE_WORLD_WIDTH * scaleMul, BASE_WORLD_HEIGHT * scaleMul, 1);

      // Drift upward in world space — popup floats away from the impact.
      p.sprite.position.y += RISE_SPEED * delta;

      // Opacity: fast pop in, hold, late fade.
      let alpha: number;
      if (t < 0.08) alpha = t / 0.08;
      else if (t < 0.65) alpha = 1;
      else alpha = 1 - (t - 0.65) / 0.35;
      p.material.opacity = Math.max(0, Math.min(1, alpha));
    }
  };

  return {
    group,
    spawn,
    tick,
    dispose: (): void => {
      for (const p of popups) {
        p.material.dispose();
        p.texture.dispose();
      }
    },
  };
}
