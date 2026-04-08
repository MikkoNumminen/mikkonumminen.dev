import * as THREE from 'three';
import { buildPointCloud } from './buildPointCloud';

export interface ParticleField {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  texture: THREE.Texture;
  positions: Float32Array;
  speeds: Float32Array;
  count: number;
}

export function buildParticleField(count: number): ParticleField {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 80;
    positions[i3 + 1] = (Math.random() - 0.5) * 50;
    positions[i3 + 2] = (Math.random() - 0.5) * 60 - 5;
    speeds[i] = 0.0008 + Math.random() * 0.0025;
  }

  const texture = makeCircleTexture();
  const material = new THREE.PointsMaterial({
    size: 0.08,
    sizeAttenuation: true,
    color: 0xc8d8ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: texture,
  });

  const cloud = buildPointCloud({ positions, material });
  return {
    points: cloud.points,
    geometry: cloud.geometry,
    material,
    texture,
    positions,
    speeds,
    count,
  };
}

function makeCircleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Inside this module the canvas is freshly created, so 2D context is
  // always available — only blocked-canvas browser extensions could fail,
  // which the renderer would have already failed on.
  if (!ctx) throw new Error('makeCircleTexture: 2D context unavailable');
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
