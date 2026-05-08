import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Horizontal gradient texture used as the title material's color map.
 * Multiplies the chrome's specular envMap reflections so each letter
 * picks up a tint at its horizontal position. All-cool sci-fi palette:
 * slate-blue (mountain side) → chrome plateau (projects/home) → cool
 * silver → electric cyan (matrix accent on the right edge). No phosphor
 * green and no warm bronze — both rejected as not-tech / not-sci-fi.
 *
 * The chrome plateau covers the middle 40-55 % so most of the title
 * stays neutral metal and the tints only show at the edges.
 */
export function buildTitleColorMap(): CanvasTexture {
  const w = 2048;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildTitleColorMap: 2D context unavailable');

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0.0, '#88a8d8'); // slate-blue (mountain side)
  grad.addColorStop(0.2, '#c8d8f0');
  grad.addColorStop(0.4, '#ffffff'); // chrome plateau (projects / home)
  grad.addColorStop(0.55, '#ecf0ff');
  grad.addColorStop(0.75, '#cdd6f0'); // silver-blue
  grad.addColorStop(0.92, '#a8d4e8');
  grad.addColorStop(1.0, '#6fcfe0'); // electric cyan (matrix accent)
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
