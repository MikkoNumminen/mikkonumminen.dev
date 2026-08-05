/**
 * Shared three.js helpers — small utilities reused across the scene
 * builders so the same boilerplate doesn't get hand-rolled per file.
 */

import { CanvasTexture } from 'three';

/**
 * Build a square sprite texture filled with a centered radial gradient
 * (transparent or coloured falloff from the canvas centre to its edge).
 *
 * Several scene builders need exactly this: a `size`×`size` canvas, a
 * radial gradient from the centre (radius 0) out to the half-width edge,
 * one `addColorStop` per `[offset, css]` entry, a single fill, and a
 * `CanvasTexture` with `needsUpdate` set. Centralising it keeps every
 * flash / flare / snowflake / dust / pulse sprite byte-identical to its
 * previous inline version while removing the repeated canvas plumbing.
 *
 * `stops` is passed straight to `addColorStop` in order, so callers keep
 * full control over their exact offsets and colours.
 */
export function makeRadialSpriteTexture(
  size: number,
  stops: ReadonlyArray<readonly [number, string]>,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('makeRadialSpriteTexture: 2D context unavailable');

  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
