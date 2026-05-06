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
  const ctx = canvas.getContext('2d')!;
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

  const coreGeometry = new SphereGeometry(1.6, 48, 48);
  const coreMaterial = new MeshBasicMaterial({ color: 0xfff0c8 });
  const core = new Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const glowMaterial = createGlowMaterial({
    color: 0xffc865,
    falloff: 0.7,
    intensity: 1.4,
  });
  const glowGeometry = new SphereGeometry(2.6, 48, 48);
  const glow = new Mesh(glowGeometry, glowMaterial);
  group.add(glow);

  // Soft warm halo extending well beyond the Fresnel shell — gives the sun
  // a corona-like atmospheric falloff.
  const haloTexture = makeRadialTexture([
    [0, 'rgba(255, 220, 150, 0.95)'],
    [0.35, 'rgba(255, 180, 100, 0.45)'],
    [0.7, 'rgba(255, 150, 80, 0.12)'],
    [1, 'rgba(255, 140, 80, 0)'],
  ]);
  const haloMaterial = new SpriteMaterial({
    map: haloTexture,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.85,
  });
  const halo = new Sprite(haloMaterial);
  halo.scale.set(9, 9, 1);
  group.add(halo);

  // Tighter, brighter flare for the sun's hot center. Pulses at a
  // different frequency than the halo for a sense of life.
  const flareTexture = makeRadialTexture([
    [0, 'rgba(255, 250, 230, 1)'],
    [0.25, 'rgba(255, 220, 160, 0.5)'],
    [0.6, 'rgba(255, 180, 120, 0.08)'],
    [1, 'rgba(255, 180, 120, 0)'],
  ]);
  const flareMaterial = new SpriteMaterial({
    map: flareTexture,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  });
  const flare = new Sprite(flareMaterial);
  flare.scale.set(4.5, 4.5, 1);
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
