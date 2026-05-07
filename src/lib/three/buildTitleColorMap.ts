import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Horizontal four-world gradient texture used as the title material's
 * color map. The chrome metal multiplies its specular envMap reflections
 * by this color, so each letter takes on the world tint at its horizontal
 * position — galaxy blue on the left, chrome white in the middle-left,
 * warm bronze in the middle-right, phosphor green on the right.
 *
 * Stops are placed slightly off the linear midpoints so the chrome and
 * bronze "rest zones" each get a wider plateau and the four-world story
 * reads as four distinct colors rather than four imperceptible thirds.
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
  // Galaxy blue (projects)
  grad.addColorStop(0.0, '#a8c4ff');
  grad.addColorStop(0.18, '#c7d8ff');
  // Chrome white (home) — wider plateau in the middle-left
  grad.addColorStop(0.34, '#ffffff');
  grad.addColorStop(0.46, '#fff4dc');
  // Warm bronze (experience)
  grad.addColorStop(0.62, '#d4a373');
  grad.addColorStop(0.76, '#c69b6a');
  // Phosphor green (contact)
  grad.addColorStop(0.9, '#9def9d');
  grad.addColorStop(1.0, '#7df090');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
