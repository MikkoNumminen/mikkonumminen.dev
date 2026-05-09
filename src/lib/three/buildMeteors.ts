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
const METEOR_COUNT = 5;
// Spawn-radius sphere around the galaxy center. Meteors come from any
// direction on this sphere and head inward toward the galaxy.
const SPAWN_RADIUS = 22;
// Distance from galaxy center at which a meteor detonates. Sits well
// inside the galaxy's 8-unit star disk but far enough from the core that
// successive impacts visibly scatter across the disk rather than all
// landing dead-center.
const IMPACT_RADIUS = 4;
// World-space speed range. Some meteors crawl in, others streak fast —
// the variance is the point of "some are faster than others".
const SPEED_MIN = 8;
const SPEED_MAX = 22;
// After triggering onImpact, fade the meteor over this short window so
// the tail visibly dies into the explosion rather than vanishing flat.
const POST_IMPACT_FADE = 0.12;

interface MeteorState {
  line: Line;
  geometry: BufferGeometry;
  material: LineBasicMaterial;
  positionsAttr: BufferAttribute;
  colorsAttr: BufferAttribute;
  active: boolean;
  velocity: Vector3;
  spawnTime: number;
  /** Fail-safe lifetime; if impact detection somehow misses, the meteor still expires. */
  lifetime: number;
  tint: Color;
  /** Set true when the meteor head crosses IMPACT_RADIUS. */
  impacted: boolean;
  impactedAt: number;
}

export interface BuildMeteorsOptions {
  /** World-space center the meteors converge on. Read each frame. */
  galaxyCenter: Vector3;
  /** Fired once per meteor when its head reaches the galaxy. */
  onImpact: (impactWorldPos: Vector3) => void;
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
 * Meteors that converge on the home hero galaxy. Each meteor is a Line
 * with N tail segments updated per-frame as a position queue: every frame
 * the trail shifts back by one and a new head position is computed from
 * the meteor's velocity. AdditiveBlending + a per-vertex brightness
 * gradient (1.0 at head → 0.0 at tail) gives a clean fading streak.
 *
 * Spawned every 5–10 s from a random direction on a sphere around the
 * galaxy center, at a random speed (some noticeably faster than others).
 * When the head crosses IMPACT_RADIUS, fires the supplied onImpact
 * callback — the parent scene uses that to spawn a flash, pulse the
 * collision rim light, and pop a commit-message text popup.
 */
export function buildMeteors(options: BuildMeteorsOptions): MeteorsHandle {
  const { galaxyCenter, onImpact } = options;
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
      tint: new Color(),
      impacted: false,
      impactedAt: 0,
    });
  }

  // First meteor lands quickly so the user sees a strike soon after the
  // entrance settles. Subsequent intervals: 5–10 s.
  let nextSpawnTime = 1.5;

  // Reused each frame to avoid Vector3 allocations in the hot path.
  const tmpDir = new Vector3();
  const tmpHead = new Vector3();
  const tmpImpactPos = new Vector3();

  function spawnMeteor(meteor: MeteorState, elapsed: number): void {
    const positions = meteor.positionsAttr.array as Float32Array;
    const colors = meteor.colorsAttr.array as Float32Array;

    // Pick a random direction on the unit sphere — meteor origin = galaxy
    // center + dir * SPAWN_RADIUS. Targeting back at the galaxy with a
    // small jitter creates a near-miss tolerance so impacts don't all
    // land dead-center.
    const cosPhi = 2 * Math.random() - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const theta = Math.random() * Math.PI * 2;
    tmpDir.set(sinPhi * Math.cos(theta), cosPhi, sinPhi * Math.sin(theta));

    const startX = galaxyCenter.x + tmpDir.x * SPAWN_RADIUS;
    const startY = galaxyCenter.y + tmpDir.y * SPAWN_RADIUS;
    const startZ = galaxyCenter.z + tmpDir.z * SPAWN_RADIUS;

    // Aim back at the galaxy with a small lateral jitter so impacts
    // scatter across the disk rather than always hitting the dead center.
    const jitterX = (Math.random() - 0.5) * 0.9;
    const jitterY = (Math.random() - 0.5) * 0.9;
    const jitterZ = (Math.random() - 0.5) * 0.9;
    const targetX = galaxyCenter.x + jitterX;
    const targetY = galaxyCenter.y + jitterY;
    const targetZ = galaxyCenter.z + jitterZ;

    // Direction from start → target, normalized.
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dz = targetZ - startZ;
    const len = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    meteor.velocity.set((dx / len) * speed, (dy / len) * speed, (dz / len) * speed);

    // Hard fallback lifetime in case impact detection misses (shouldn't
    // happen with the targeting above, but keeps a slot from sticking).
    meteor.lifetime = (len / speed) * 1.4 + 0.5;

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
    meteor.tint.copy(tint);
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
    meteor.material.opacity = 1;
    meteor.active = true;
    meteor.impacted = false;
    meteor.impactedAt = 0;
  }

  function tickMeteor(meteor: MeteorState, delta: number, elapsed: number): void {
    if (!meteor.active) return;

    const age = elapsed - meteor.spawnTime;

    // Hard expiry — fail-safe so a slot is never permanently lost.
    if (age >= meteor.lifetime) {
      meteor.active = false;
      meteor.material.opacity = 0;
      return;
    }

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

    if (!meteor.impacted) {
      positions[0]! += meteor.velocity.x * delta;
      positions[1]! += meteor.velocity.y * delta;
      positions[2]! += meteor.velocity.z * delta;

      tmpHead.set(positions[0]!, positions[1]!, positions[2]!);
      const dist = tmpHead.distanceTo(galaxyCenter);
      if (dist < IMPACT_RADIUS) {
        meteor.impacted = true;
        meteor.impactedAt = elapsed;
        // Snap the head onto the impact point so the flash reads as
        // landing exactly where the meteor stops.
        tmpImpactPos.copy(tmpHead);
        onImpact(tmpImpactPos);
      }
    }

    // Fade envelope:
    //   - Pre-impact: ramp in over first 6 % of lifetime, then hold full.
    //   - Post-impact: ramp opacity to 0 over POST_IMPACT_FADE seconds.
    let alpha: number;
    if (meteor.impacted) {
      const since = elapsed - meteor.impactedAt;
      alpha = 1 - since / POST_IMPACT_FADE;
      if (alpha <= 0) {
        meteor.active = false;
        meteor.material.opacity = 0;
        return;
      }
    } else {
      const t = age / meteor.lifetime;
      alpha = t < 0.06 ? t / 0.06 : 1;
    }
    meteor.material.opacity = Math.max(0, Math.min(1, alpha));

    meteor.positionsAttr.needsUpdate = true;
  }

  return {
    group,
    tick: (elapsed: number, delta: number): void => {
      // Spawn next meteor when the timer fires and a slot is free.
      // Wait time is drawn from an exponential distribution (mean ≈ 5 s)
      // so impacts cluster organically — sometimes two strikes land
      // close together, sometimes there's a longer lull. Reads as
      // "random" instead of a steady drumbeat.
      if (elapsed >= nextSpawnTime) {
        const idle = meteors.find((m) => !m.active);
        if (idle) {
          spawnMeteor(idle, elapsed);
        }
        // Inverse-CDF sampling of Exponential(λ = 1/5).
        // 1 - random() to avoid log(0) when random() returns 0; clamp
        // both ends so a tiny u doesn't stack two meteors on the same
        // frame and a huge u doesn't leave the user staring at silence.
        const u = 1 - Math.random();
        const wait = Math.max(0.5, Math.min(16, -5 * Math.log(u)));
        nextSpawnTime = elapsed + wait;
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
