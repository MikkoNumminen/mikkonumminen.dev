import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Vector3,
} from 'three';

const TAIL_SEGMENTS = 28;
const METEOR_COUNT = 2;

interface MeteorState {
  line: Line;
  geometry: BufferGeometry;
  material: LineBasicMaterial;
  positionsAttr: BufferAttribute;
  colorsAttr: BufferAttribute;
  active: boolean;
  velocity: Vector3;
  spawnTime: number;
  lifetime: number;
}

export interface MeteorsHandle {
  group: Group;
  /** Drive the meteor system from the parent's tick loop. */
  tick: (elapsed: number, delta: number) => void;
  dispose: () => void;
}

const METEOR_TINTS: Color[] = [
  new Color(0xfff8e8), // home — chrome white
  new Color(0xa8c4ff), // projects — galaxy blue
  new Color(0xffd2a0), // experience — warm amber
  new Color(0x9df0a8), // contact — phosphor green
];

/**
 * Occasional shooting stars across the hero scene. Each meteor is a Line
 * with N tail segments updated per-frame as a position queue: every frame
 * the trail shifts back by one and a new head position is computed from
 * the meteor's velocity. AdditiveBlending + a per-vertex brightness
 * gradient (1.0 at head → 0.0 at tail) gives a clean fading streak
 * without needing a custom shader.
 *
 * Spawned at random intervals (every 10-18 s) from off-screen positions
 * heading across-and-down through the visible scene; each shot picks one
 * of the four world tints so the meteors also carry the four-worlds story.
 */
export function buildMeteors(): MeteorsHandle {
  const group = new Group();
  const meteors: MeteorState[] = [];

  for (let i = 0; i < METEOR_COUNT; i++) {
    const positions = new Float32Array(TAIL_SEGMENTS * 3);
    const colors = new Float32Array(TAIL_SEGMENTS * 3);

    const geometry = new BufferGeometry();
    const positionsAttr = new BufferAttribute(positions, 3);
    const colorsAttr = new BufferAttribute(colors, 3);
    geometry.setAttribute('position', positionsAttr);
    geometry.setAttribute('color', colorsAttr);

    const material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    });

    const line = new Line(geometry, material);
    group.add(line);

    meteors.push({
      line,
      geometry,
      material,
      positionsAttr,
      colorsAttr,
      active: false,
      velocity: new Vector3(),
      spawnTime: 0,
      lifetime: 0,
    });
  }

  // First meteor spawns 4 s after page boot to give the entrance animation
  // room to land before adding more motion.
  let nextSpawnTime = 4;

  function spawnMeteor(meteor: MeteorState, elapsed: number): void {
    const positions = meteor.positionsAttr.array as Float32Array;
    const colors = meteor.colorsAttr.array as Float32Array;

    const lifetime = 1.4 + Math.random() * 0.7;
    // Spawn from the upper hemisphere; head down-and-across. Z range is
    // around the title's z so meteors look like they pass at title depth.
    const startX = (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 6);
    const startY = 9 + Math.random() * 6;
    const startZ = -3 + Math.random() * 6;
    // End on the opposite side, slightly below the title
    const endX = -Math.sign(startX) * (22 + Math.random() * 6);
    const endY = -9 - Math.random() * 4;
    const endZ = startZ + (Math.random() - 0.5) * 4;

    meteor.velocity.set(
      (endX - startX) / lifetime,
      (endY - startY) / lifetime,
      (endZ - startZ) / lifetime,
    );

    // Initialize all trail vertices at the start point so the first frame
    // doesn't render a stale line from the meteor's previous run.
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const i3 = i * 3;
      positions[i3] = startX;
      positions[i3 + 1] = startY;
      positions[i3 + 2] = startZ;
    }

    // Pick a world tint and bake the brightness gradient into vertex colors.
    const tint = METEOR_TINTS[Math.floor(Math.random() * METEOR_TINTS.length)]!;
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const t = i / (TAIL_SEGMENTS - 1);
      // Sharper falloff than linear so the head reads as a bright point
      // and the tail dies away quickly — feels more like a streak than
      // a worm.
      const brightness = Math.pow(1 - t, 1.6);
      const i3 = i * 3;
      colors[i3] = tint.r * brightness;
      colors[i3 + 1] = tint.g * brightness;
      colors[i3 + 2] = tint.b * brightness;
    }

    meteor.colorsAttr.needsUpdate = true;
    meteor.positionsAttr.needsUpdate = true;
    meteor.spawnTime = elapsed;
    meteor.lifetime = lifetime;
    meteor.material.opacity = 1;
    meteor.active = true;
  }

  function tickMeteor(meteor: MeteorState, delta: number, elapsed: number): void {
    if (!meteor.active) return;

    const age = elapsed - meteor.spawnTime;
    if (age >= meteor.lifetime) {
      meteor.active = false;
      meteor.material.opacity = 0;
      return;
    }

    // Soft alpha envelope: ramp in over the first 10 %, hold, ramp out
    // over the last 18 %. Hides the abrupt appearance of the streak.
    const t = age / meteor.lifetime;
    let alpha = 1;
    if (t < 0.1) alpha = t / 0.1;
    else if (t > 0.82) alpha = (1 - t) / 0.18;
    meteor.material.opacity = Math.max(0, Math.min(1, alpha));

    const positions = meteor.positionsAttr.array as Float32Array;

    // Shift all trail samples back by one so positions[1] takes the value
    // of positions[0], etc. positions[0] keeps the OLD head value, then
    // we advance it by velocity*delta below to get the NEW head.
    for (let i = TAIL_SEGMENTS - 1; i > 0; i--) {
      const ic = i * 3;
      const ip = (i - 1) * 3;
      positions[ic] = positions[ip]!;
      positions[ic + 1] = positions[ip + 1]!;
      positions[ic + 2] = positions[ip + 2]!;
    }
    positions[0]! += meteor.velocity.x * delta;
    positions[1]! += meteor.velocity.y * delta;
    positions[2]! += meteor.velocity.z * delta;

    meteor.positionsAttr.needsUpdate = true;
  }

  return {
    group,
    tick: (elapsed: number, delta: number): void => {
      // Spawn next meteor when the timer fires and a slot is free.
      if (elapsed >= nextSpawnTime) {
        const idle = meteors.find((m) => !m.active);
        if (idle) {
          spawnMeteor(idle, elapsed);
        }
        nextSpawnTime = elapsed + 10 + Math.random() * 8;
      }

      for (const meteor of meteors) {
        tickMeteor(meteor, delta, elapsed);
      }
    },
    dispose: (): void => {
      for (const meteor of meteors) {
        meteor.geometry.dispose();
        meteor.material.dispose();
      }
    },
  };
}
