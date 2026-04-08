import * as THREE from 'three';
import { buildPointCloud } from '../buildPointCloud';

export interface Starfield {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
}

const STAR_COUNT = 1800;
const STAR_RADIUS_MIN = 60;
const STAR_RADIUS_RANGE = 140;
const STAR_PALETTE: readonly THREE.Color[] = [
  new THREE.Color(0xffffff),
  new THREE.Color(0xc8d8ff),
  new THREE.Color(0xfff0c8),
];

export function buildStarfield(): Starfield {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);

  for (let i = 0; i < STAR_COUNT; i++) {
    const i3 = i * 3;
    const radius = STAR_RADIUS_MIN + Math.random() * STAR_RADIUS_RANGE;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);
    // Random integer in [0, STAR_PALETTE.length); the array is non-empty
    // so the lookup is always defined.
    const color = STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)]!;
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
  }

  const material = new THREE.PointsMaterial({
    size: 0.18,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  return buildPointCloud({ positions, colors, material });
}
