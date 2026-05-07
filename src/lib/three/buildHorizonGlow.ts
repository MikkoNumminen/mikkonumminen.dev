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
 * Soft additive glow plate placed behind the title to suggest a sun-side
 * horizon. Cheap proxy for volumetric god-rays — the additive blend lifts
 * the deep-blue background into a warm glow without bloom-chain cost.
 *
 * Position is chosen to roughly align with the warm spot in the envMap, so
 * the metal's reflected sun and the in-scene halo agree.
 */
export function buildHorizonGlow(): HorizonGlowHandle {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildHorizonGlow: 2D context unavailable');

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(255, 178, 110, 0.55)');
  grad.addColorStop(0.35, 'rgba(255, 130, 70, 0.22)');
  grad.addColorStop(0.7, 'rgba(255, 100, 60, 0.06)');
  grad.addColorStop(1, 'rgba(255, 100, 60, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });

  const geometry = new PlaneGeometry(34, 34);
  const mesh = new Mesh(geometry, material);
  // Behind and slightly upper-right of the title so the warm halo agrees
  // with the warm sun in the envMap reflection.
  mesh.position.set(6, 2, -10);

  return { mesh, material, texture, geometry };
}
