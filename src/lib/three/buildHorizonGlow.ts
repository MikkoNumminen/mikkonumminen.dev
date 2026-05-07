import {
  AdditiveBlending,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Texture,
} from 'three';

export interface HorizonGlowHandle {
  mesh: Mesh;
  material: MeshBasicMaterial;
  texture: Texture;
  geometry: PlaneGeometry;
}

/**
 * A bright, distant star in the upper-right background — sci-fi keynote
 * look. The visual budget is split intentionally:
 *
 * - Halo is small and tight (~90 px radius in a 512 px texture) so the
 *   source reads as a discrete point of light, not a horizon wash.
 * - Core is even tighter — a bright white-blue pinpoint.
 * - Horizontal anamorphic streak runs the full texture width with a thin
 *   Gaussian vertical falloff. The streak is what sells "lens" — it's
 *   what makes a bright distant point look like a star instead of a blob.
 * - A faint perpendicular vertical streak gives the flare a subtle
 *   4-point cross.
 *
 * Plane is parked further back in z so perspective shrinks the angular
 * size — reads as "distant".
 */
const TEX_SIZE = 512;
const HALO_RADIUS = 88;
const CORE_RADIUS = 24;
const PLANE_SIZE = 14;

export function buildHorizonGlow(): HorizonGlowHandle {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildHorizonGlow: 2D context unavailable');

  const cx = TEX_SIZE / 2;
  const cy = TEX_SIZE / 2;

  // Tight cool halo — small radius so the star reads as a point, not a wash.
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, HALO_RADIUS);
  halo.addColorStop(0, 'rgba(225, 240, 255, 0.7)');
  halo.addColorStop(0.18, 'rgba(195, 220, 255, 0.42)');
  halo.addColorStop(0.5, 'rgba(160, 200, 255, 0.12)');
  halo.addColorStop(1, 'rgba(140, 180, 240, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Bright tight core — the pinpoint.
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, CORE_RADIUS);
  core.addColorStop(0, 'rgba(255, 255, 255, 1)');
  core.addColorStop(0.45, 'rgba(235, 245, 255, 0.85)');
  core.addColorStop(1, 'rgba(225, 240, 255, 0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Anamorphic horizontal streak — the cinema-lens look. Bright at the
  // center, fading to transparent at the texture edges, drawn into a thin
  // vertical Gaussian band so the streak is a tight horizontal line.
  const streakGrad = ctx.createLinearGradient(0, 0, TEX_SIZE, 0);
  streakGrad.addColorStop(0, 'rgba(180, 210, 255, 0)');
  streakGrad.addColorStop(0.3, 'rgba(210, 230, 255, 0.5)');
  streakGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  streakGrad.addColorStop(0.7, 'rgba(210, 230, 255, 0.5)');
  streakGrad.addColorStop(1, 'rgba(180, 210, 255, 0)');
  ctx.save();
  ctx.fillStyle = streakGrad;
  for (let y = -6; y <= 6; y++) {
    ctx.globalAlpha = Math.exp(-(y * y) / 5);
    ctx.fillRect(0, cy + y, TEX_SIZE, 1);
  }
  ctx.restore();

  // Faint perpendicular vertical streak — gives the flare a subtle
  // 4-point cross without becoming a full diffraction spike.
  const vGrad = ctx.createLinearGradient(0, 0, 0, TEX_SIZE);
  vGrad.addColorStop(0, 'rgba(220, 235, 255, 0)');
  vGrad.addColorStop(0.4, 'rgba(220, 235, 255, 0.18)');
  vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
  vGrad.addColorStop(0.6, 'rgba(220, 235, 255, 0.18)');
  vGrad.addColorStop(1, 'rgba(220, 235, 255, 0)');
  ctx.save();
  ctx.fillStyle = vGrad;
  for (let x = -2; x <= 2; x++) {
    ctx.globalAlpha = Math.exp(-(x * x) / 2);
    ctx.fillRect(cx + x, 0, 1, TEX_SIZE);
  }
  ctx.restore();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });

  const geometry = new PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
  const mesh = new Mesh(geometry, material);
  // Upper-right, far behind the title so perspective makes the star read
  // as a distant point of light rather than something looming over the
  // letters. Same bearing as the envMap's bright zone so the chrome
  // reflection and the visible star agree.
  mesh.position.set(12, 4.5, -15);

  return { mesh, material, texture, geometry };
}
