import { Mesh, PointLight } from 'three';

export interface LetterFlashesHandle {
  /** Trigger a burst of staggered, random per-letter flashes. */
  trigger: () => void;
  /** Drive the flash decays from the parent's tick loop. */
  tick: (delta: number) => void;
  dispose: () => void;
}

export interface LetterFlashLine {
  /** The line mesh. Flash lights are parented to it so they inherit
   *  the title's float / sway / responsive scale automatically. */
  mesh: Mesh;
  /** World-units width of the line at scale=1. Used to randomize x. */
  width: number;
}

export interface BuildLetterFlashesOptions {
  lines: LetterFlashLine[];
  /** Number of flash slots per line. Must accommodate the burst count. */
  perLine?: number;
  /** Light radius, in world units. Roughly the size of one letter's
   *  bright halo on the chrome. */
  radius?: number;
}

const DEFAULT_PER_LINE = 3;
const DEFAULT_RADIUS = 4;
// Bright pale-chrome — the same family as the existing collisionRimLight,
// so the per-letter highlights agree with the whole-title rim flash that
// fires alongside them.
const FLASH_COLOR = 0xeaf5ff;

interface FlashState {
  light: PointLight;
  parent: Mesh;
  parentWidth: number;
  active: boolean;
  /** Negative pre-life delay (counts up to 0 before the flash starts). */
  delay: number;
  age: number;
  lifetime: number;
  peak: number;
}

/**
 * Stroboscopic per-letter flash highlights. Each impact triggers 3-5
 * brief PointLights at random x positions along the title lines; each
 * light has its own random delay (0-90 ms), lifetime (140-310 ms), and
 * peak intensity (5-11). The result is a stutter of bright spots
 * rippling across the chrome — visually richer than a single uniform
 * rim flash, and echoes the multi-peak strobing of the entrance burst.
 *
 * Lights are parented to the line meshes so they inherit the title's
 * responsive scale / float / sway without any per-frame syncing.
 */
export function buildLetterFlashes(
  options: BuildLetterFlashesOptions,
): LetterFlashesHandle {
  const perLine = options.perLine ?? DEFAULT_PER_LINE;
  const radius = options.radius ?? DEFAULT_RADIUS;
  const states: FlashState[] = [];

  for (const line of options.lines) {
    for (let i = 0; i < perLine; i++) {
      const light = new PointLight(FLASH_COLOR, 0, radius);
      light.visible = false;
      line.mesh.add(light);
      states.push({
        light,
        parent: line.mesh,
        parentWidth: line.width,
        active: false,
        delay: 0,
        age: 0,
        lifetime: 0,
        peak: 0,
      });
    }
  }

  const trigger = (): void => {
    // 3-5 flashes per impact. With 6 slots in the pool that leaves
    // headroom for back-to-back impacts without losing the strobe.
    const count = 3 + Math.floor(Math.random() * 3);
    let triggered = 0;
    for (const s of states) {
      if (triggered >= count) break;
      if (s.active) continue;
      // Random x within the line, biased to the central 90 % so the
      // halo doesn't poke out past the line's edges.
      s.light.position.set(
        (Math.random() - 0.5) * s.parentWidth * 0.9,
        (Math.random() - 0.5) * 1.2,
        1.2,
      );
      s.light.visible = true;
      s.delay = Math.random() * 0.09;
      s.age = 0;
      s.lifetime = 0.14 + Math.random() * 0.17;
      s.peak = 5 + Math.random() * 6;
      s.active = true;
      triggered++;
    }
  };

  const tick = (delta: number): void => {
    for (const s of states) {
      if (!s.active) continue;
      if (s.delay > 0) {
        s.delay -= delta;
        s.light.intensity = 0;
        continue;
      }
      s.age += delta;
      if (s.age >= s.lifetime) {
        s.active = false;
        s.light.intensity = 0;
        s.light.visible = false;
        continue;
      }
      const t = s.age / s.lifetime;
      // Sharp rise (first 18 %) then a power-curve fall — a satisfying
      // "snap then dim" envelope, not a slow lingering glow.
      const env = t < 0.18 ? t / 0.18 : Math.pow(1 - (t - 0.18) / 0.82, 1.7);
      s.light.intensity = s.peak * Math.max(0, env);
    }
  };

  const dispose = (): void => {
    for (const s of states) {
      s.parent.remove(s.light);
      s.light.dispose();
    }
  };

  return { trigger, tick, dispose };
}
