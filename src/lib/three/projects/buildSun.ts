/**
 * The central sun of the projects "solar system": an emissive core sphere, a
 * Fresnel-glow shell, and additive corona sprites (halo + flare) that breathe
 * on independent sine pulses. `SunHandle.tick` drives the per-frame pulsing.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';
import { createGlowMaterial } from '../createGlowMaterial';

export interface SunHandle {
  group: Group;
  core: Mesh;
  coreMaterial: MeshBasicMaterial;
  coreGeometry: SphereGeometry;
  glow: Mesh;
  glowMaterial: ShaderMaterial;
  glowGeometry: SphereGeometry;
  halo: Sprite;
  haloMaterial: SpriteMaterial;
  haloTexture: Texture;
  flare: Sprite;
  flareMaterial: SpriteMaterial;
  flareTexture: Texture;
}

function makeRadialTexture(stops: Array<[number, string]>, size = 256): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for sun halo');
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  for (const [stop, color] of stops) gradient.addColorStop(stop, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function buildSun(): SunHandle {
  const group = new Group();

  // Near-white-hot core. Pure cream (#fff0c8) read as a beige disc once
  // tone mapping compressed it; pushing the core toward white lets the
  // additive corona/flare layers paint the warm amber halo around it
  // without the body itself looking dull.
  const coreGeometry = new SphereGeometry(1.85, 48, 48);
  const coreMaterial = new MeshBasicMaterial({ color: 0xfff8e0 });
  const core = new Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const glowMaterial = createGlowMaterial({
    color: 0xffb858,
    falloff: 0.55,
    intensity: 1.75,
  });
  const glowGeometry = new SphereGeometry(3.1, 48, 48);
  const glow = new Mesh(glowGeometry, glowMaterial);
  group.add(glow);

  // Wide, hot halo. Saturated amber inner stop with an extra warm-white
  // inner ring gives the sun a real corona presence rather than a thin
  // fringe.
  const haloTexture = makeRadialTexture([
    [0, 'rgba(255, 240, 200, 1)'],
    [0.18, 'rgba(255, 210, 140, 0.85)'],
    [0.45, 'rgba(255, 170, 90, 0.35)'],
    [0.75, 'rgba(255, 140, 70, 0.10)'],
    [1, 'rgba(255, 130, 70, 0)'],
  ]);
  const haloMaterial = new SpriteMaterial({
    map: haloTexture,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 1.0,
  });
  const halo = new Sprite(haloMaterial);
  halo.scale.set(11.5, 11.5, 1);
  group.add(halo);

  // Tight white-hot flare bloom over the core — pushes the visible
  // brightness past the core's tone-mapped ceiling so the sun reads
  // as actively radiating, not just a coloured ball.
  const flareTexture = makeRadialTexture([
    [0, 'rgba(255, 254, 245, 1)'],
    [0.22, 'rgba(255, 235, 195, 0.7)'],
    [0.5, 'rgba(255, 200, 140, 0.18)'],
    [1, 'rgba(255, 180, 120, 0)'],
  ]);
  const flareMaterial = new SpriteMaterial({
    map: flareTexture,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 1.0,
  });
  const flare = new Sprite(flareMaterial);
  flare.scale.set(5.6, 5.6, 1);
  group.add(flare);

  return {
    group,
    core,
    coreMaterial,
    coreGeometry,
    glow,
    glowMaterial,
    glowGeometry,
    halo,
    haloMaterial,
    haloTexture,
    flare,
    flareMaterial,
    flareTexture,
  };
}
