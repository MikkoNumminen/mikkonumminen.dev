import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Points,
  PointsMaterial,
  type Texture,
} from 'three';

export interface CollisionSparksHandle {
  points: Points;
  geometry: BufferGeometry;
  material: PointsMaterial;
  texture: Texture;
  /** Activate `count` sparks emanating from the given world position. */
  spawn: (x: number, y: number, z: number, count?: number) => void;
  /** Advance active sparks by `delta` seconds. */
  tick: (delta: number) => void;
  dispose: () => void;
}

const POOL_SIZE = 140;
const OFFSCREEN = 9999;

interface Spark {
  active: boolean;
  age: number;
  lifetime: number;
  startX: number;
  startY: number;
  startZ: number;
  velX: number;
  velY: number;
  velZ: number;
}

function makeSparkTexture(): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('makeSparkTexture: 2D context unavailable');
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.55)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.12)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Pool of additive-blended sparks used for the periodic galaxy-collision
 * fireworks. `spawn(x, y, z, count)` activates up to `count` idle sparks
 * at the given position with random outward velocities; each spark fades
 * via per-vertex color brightness (additive blending makes black = no
 * contribution, so RGB encodes alpha for free).
 *
 * One pool serves all explosions — caller drives `tick(delta)` from the
 * main animation loop.
 */
export function buildCollisionSparks(): CollisionSparksHandle {
  const positions = new Float32Array(POOL_SIZE * 3);
  const colors = new Float32Array(POOL_SIZE * 3);
  const sparks: Spark[] = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const i3 = i * 3;
    positions[i3] = OFFSCREEN;
    positions[i3 + 1] = OFFSCREEN;
    positions[i3 + 2] = OFFSCREEN;
    colors[i3] = 0;
    colors[i3 + 1] = 0;
    colors[i3 + 2] = 0;
    sparks.push({
      active: false,
      age: 0,
      lifetime: 0,
      startX: 0,
      startY: 0,
      startZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
    });
  }

  const geometry = new BufferGeometry();
  const positionsAttr = new BufferAttribute(positions, 3);
  const colorsAttr = new BufferAttribute(colors, 3);
  geometry.setAttribute('position', positionsAttr);
  geometry.setAttribute('color', colorsAttr);

  const texture = makeSparkTexture();
  const material = new PointsMaterial({
    size: 1.05,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: AdditiveBlending,
    map: texture,
    vertexColors: true,
  });

  const points = new Points(geometry, material);

  const spawn = (x: number, y: number, z: number, count = 10): void => {
    let spawned = 0;
    for (let i = 0; i < POOL_SIZE && spawned < count; i++) {
      const spark = sparks[i]!;
      if (spark.active) continue;

      spark.active = true;
      spark.age = 0;
      spark.lifetime = 0.7 + Math.random() * 0.85;
      spark.startX = x;
      spark.startY = y;
      spark.startZ = z;

      // Random outward 3D velocity — uniform sphere via cos/sin spherical.
      const speed = 2.0 + Math.random() * 3.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      spark.velX = Math.sin(phi) * Math.cos(theta) * speed;
      spark.velY = Math.cos(phi) * speed;
      spark.velZ = Math.sin(phi) * Math.sin(theta) * speed;

      const i3 = i * 3;
      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
      // Slight blue-white spark tint for the sci-fi vibe.
      colors[i3] = 0.95;
      colors[i3 + 1] = 0.98;
      colors[i3 + 2] = 1.0;
      spawned++;
    }
    positionsAttr.needsUpdate = true;
    colorsAttr.needsUpdate = true;
  };

  const tick = (delta: number): void => {
    let dirty = false;
    for (let i = 0; i < POOL_SIZE; i++) {
      const spark = sparks[i]!;
      if (!spark.active) continue;

      spark.age += delta;
      const i3 = i * 3;

      if (spark.age >= spark.lifetime) {
        spark.active = false;
        positions[i3] = OFFSCREEN;
        positions[i3 + 1] = OFFSCREEN;
        positions[i3 + 2] = OFFSCREEN;
        colors[i3] = 0;
        colors[i3 + 1] = 0;
        colors[i3 + 2] = 0;
        dirty = true;
        continue;
      }

      positions[i3] = spark.startX + spark.velX * spark.age;
      positions[i3 + 1] = spark.startY + spark.velY * spark.age;
      positions[i3 + 2] = spark.startZ + spark.velZ * spark.age;

      // Brightness envelope: rapid ramp-up over the first 12 % then a long
      // fade. With additive blending, low brightness = low contribution,
      // so this drives the per-spark alpha for free.
      const lifeT = spark.age / spark.lifetime;
      const alpha =
        lifeT < 0.12 ? lifeT / 0.12 : Math.pow(1 - (lifeT - 0.12) / 0.88, 1.4);
      colors[i3] = 0.95 * alpha;
      colors[i3 + 1] = 0.98 * alpha;
      colors[i3 + 2] = 1.0 * alpha;
      dirty = true;
    }
    if (dirty) {
      positionsAttr.needsUpdate = true;
      colorsAttr.needsUpdate = true;
    }
  };

  return {
    points,
    geometry,
    material,
    texture,
    spawn,
    tick,
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
