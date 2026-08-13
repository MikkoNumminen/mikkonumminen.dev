/**
 * The home field's shape cycle: which of the five shapes the particles
 * are holding, and how far through a morph they are.
 *
 * This is NOT idle behaviour. It runs continuously while the lander is
 * mounted, because reshaping IS what the field does — it is not a
 * screensaver waiting for the visitor to go away. Nothing here reads
 * pointer state, scroll state, or a clock of inactivity.
 *
 * Pure and delta-driven: it advances on a delta the caller supplies and
 * returns only numbers. That keeps the whole schedule unit-testable, and
 * it makes the cycle pause automatically whenever the caller's rAF loop
 * pauses — a hidden tab must not run morphs off-screen, and this is the
 * mechanism that guarantees it (not a visibility check).
 *
 * It deliberately emits `from`/`to`/`cross` rather than a blended weight
 * vector: the per-particle stagger that makes every morph in this scene
 * sweep through the field instead of moving as a rigid unit lives in the
 * SHADER, and it can only be applied if the shader sees the raw progress
 * of the crossfade. Blending on the CPU would flatten every transition
 * the page shows.
 */
import { CYCLE_ORDER, FIELD_TUNING } from './tuning';

const T = FIELD_TUNING.cycle;

/** LANE index into SHAPES: 0 name, 1 galaxy, 2 wordmark, 3 sparse, 4 cv.
 *  Lane order is not show order — that is CYCLE_ORDER in tuning.ts. */
export const NAME_SHAPE = 0;
const WORD_SHAPE = 2;
const CV_SHAPE = 4;

/**
 * Seconds the given lane is held. Per-shape because the CV block has to be
 * readable, and 5 seconds is not long enough to read a paragraph.
 */
function holdFor(shape: number): number {
  return T.shapeHold[shape] ?? T.hold;
}

/**
 * Can this lane be shown right now? One place, so a lane that grows a
 * readiness gate cannot be wired into the scan and forgotten here.
 *
 * Takes the advance input rather than a predicate closure: the scan runs
 * inside the tick loop, which is required to be allocation-free (ADR
 * 0014), and a closure built per shape change is an allocation.
 */
function laneReady(shape: number, input: CycleAdvanceInput): boolean {
  if (shape === WORD_SHAPE) return input.wordReady;
  if (shape === CV_SHAPE) return input.cvReady;
  return true;
}

export type CyclePhase = 'holding' | 'crossing';

export interface CycleAdvanceInput {
  /** Seconds since the previous advance. */
  delta: number;
  /** False until the wordmark raster has landed. Its attribute is
   *  zero-filled until then, so the shape must be skipped, not shown. */
  wordReady: boolean;
  /**
   * False when the CV block must not be shown. Two different reasons, both
   * of which have to skip the shape: the raster failed (attribute is
   * zero-filled, morphing into it would collapse the field onto the
   * origin), or the viewport is too small for the block's body text to be
   * legible. The second is why this is read every advance rather than
   * captured once: a window resize can change the answer mid-cycle, and it
   * is acted on mid-cycle too — a shape that stops being showable while it
   * is ON SCREEN is left early, not held out to the end of its window. That
   * matters most for exactly this shape, whose window is 11 seconds.
   */
  cvReady: boolean;
}

export interface CycleState {
  /** Shape index the current morph starts from. */
  from: number;
  /** Shape index it ends at. Equal to `from` while holding. */
  to: number;
  /** RAW morph progress 0→1. Handed to the shader unstaggered on
   *  purpose — see the module note. 0 while holding. */
  cross: number;
  phase: CyclePhase;
}

export interface ShapeCycle {
  advance: (input: CycleAdvanceInput) => CycleState;
  /** Shape index currently held or being left. Used by the click
   *  hit-test so it and the renderer cannot disagree about what is on
   *  screen. */
  current: () => number;
}

export interface ShapeCycleOptions {
  /** Shape the cycle starts holding. The load-in ends on the name, so
   *  that is the only sane default — starting anywhere else would make
   *  the field jump the instant the formation completes. */
  startShape?: number;
}

export function createShapeCycle(opts: ShapeCycleOptions = {}): ShapeCycle {
  const { startShape = NAME_SHAPE } = opts;

  let phase: CyclePhase = 'holding';
  let t = 0;
  let from = startShape;
  let to = startShape;

  // One mutable result object, reused every frame. The tick loop is
  // required to be allocation-free (ADR 0014), and this runs in it.
  const state: CycleState = { from, to, cross: 0, phase };

  // Walks CYCLE_ORDER (show order), not SHAPES (lane order). Skipping is a
  // bounded scan rather than a single hop because two of the five shapes
  // can be unavailable at once: with both the wordmark raster failed and
  // the viewport too narrow for the CV block, a one-step skip would land
  // on the other unavailable shape and show a collapsed field.
  const nextShape = (after: number, input: CycleAdvanceInput): number => {
    const at = CYCLE_ORDER.indexOf(after);
    for (let step = 1; step <= CYCLE_ORDER.length; step++) {
      const candidate = CYCLE_ORDER[(at + step) % CYCLE_ORDER.length];
      if (candidate === undefined) continue;
      if (laneReady(candidate, input)) return candidate;
    }
    // Every other shape unavailable: hold what we have rather than morph
    // into a zero-filled attribute.
    return after;
  };

  return {
    advance: (input): CycleState => {
      // No single advance may skip more than one hitched frame's worth
      // of schedule, whoever is driving.
      const delta = Math.min(input.delta, T.maxAdvance);
      t += delta;

      if (phase === 'holding') {
        // A shape can stop being showable WHILE it is held: dragging the
        // window narrow takes the CV block below the size its body text
        // needs. Gating only the next target would leave an unreadable
        // smear on screen for the rest of an 11-second hold, so the hold is
        // cut short instead. `nextShape` will not pick it again while it
        // stays unavailable, and cannot pick a different unavailable one.
        const heldStillShowable = laneReady(to, input);
        if (t >= holdFor(to) || !heldStillShowable) {
          from = to;
          to = nextShape(from, input);
          phase = 'crossing';
          t = 0;
        }
      } else {
        if (t >= T.transition) {
          from = to;
          phase = 'holding';
          t = 0;
        }
      }

      state.from = from;
      state.to = to;
      state.cross = phase === 'crossing' ? Math.min(1, t / T.transition) : 0;
      state.phase = phase;
      return state;
    },

    // Mid-morph the field reads as the shape it is heading INTO for most
    // of the transition, and the hit test should agree with what a
    // visitor sees rather than flipping at an arbitrary midpoint.
    current: () => (phase === 'crossing' && t / T.transition > 0.5 ? to : from),
  };
}
