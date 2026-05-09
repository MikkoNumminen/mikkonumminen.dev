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
// Slow upward drift in world units per second — popup floats away from
// the impact like a terminal log line scrolling out of view.
const RISE_SPEED = 1.2;
// World-space size of the sprite at scale = 1. Deliberately small — the
// popup is an accent label, not the headline. The galaxy and the chrome
// title carry the composition; commit prefixes are a quiet rhythm.
const BASE_WORLD_WIDTH = 3;
const BASE_WORLD_HEIGHT = 0.56;
// Off-screen canvas resolution. Aspect matches BASE_WORLD (5.33:1).
// Sized to comfortably fit the longest realistic scope ("feat(observability)"
// at 19 chars × ~33 px per glyph ≈ 630 px) inside 768 px of canvas with
// margin for the drop-shadow blur. 768×144 stays sharp on Retina at the
// popup's small on-screen size.
const CANVAS_W = 768;
const CANVAS_H = 144;

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

  ctx.font = `500 56px "JetBrains Mono", "SFMono-Regular", ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Tight dark drop-shadow — barely visible against dark space, holds
  // the type readable when it crosses bright spark sprites or the
  // galaxy halo. No glow, no halo — this should read as terminal text
  // on a console, not a videogame damage popup.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 1.5;
  ctx.shadowOffsetY = 1.5;

  // Plain meteor-tint fill — saturation comes from the tint itself, no
  // brightening hack toward white. Preserves the four-worlds color
  // signature on every popup.
  const r = Math.round(tint.r * 255);
  const g = Math.round(tint.g * 255);
  const b = Math.round(tint.b * 255);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillText(text, cx, cy);
}

/**
 * Pool of camera-facing text sprites that pop up at meteor impact points
 * with a short conventional-commit prefix (e.g. "fix(projects)"). Each
 * slot owns an offscreen canvas + CanvasTexture; on spawn we redraw the
 * canvas in plain terminal monospace, tint-matched to the meteor that
 * hit. Animation is intentionally simple: a small scale-in pop, slow
 * upward drift, late opacity fade — terminal log line, not RPG popup.
 *
 * Sized at 6 slots so closely-spaced impacts don't queue up and lose
 * messages. Lifetime ~1.8 s gives the user time to read each prefix.
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
      // Always render on top — popups originate at the galaxy (z=-13),
      // behind the title (z≈0). Without disabling the depth test the
      // popup gets z-occluded by the chrome letters.
      depthTest: false,
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
    idle.sprite.scale.set(BASE_WORLD_WIDTH * 0.7, BASE_WORLD_HEIGHT * 0.7, 1);
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

      // Scale: small pop-in (0.7 → 1.0) over the first 18 %, then hold.
      // No overshoot — terminal log lines don't bounce.
      const scaleMul = t < 0.18 ? 0.7 + (t / 0.18) * 0.3 : 1.0;
      p.sprite.scale.set(BASE_WORLD_WIDTH * scaleMul, BASE_WORLD_HEIGHT * scaleMul, 1);

      // Slow upward drift — popup floats away from the impact like a
      // terminal log line scrolling out of view.
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
