/**
 * The home field's shape cycle: which of the four shapes the particles
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
import { FIELD_TUNING, SHAPES } from './tuning';

const T = FIELD_TUNING.cycle;

/** Index into SHAPES: 0 name, 1 galaxy, 2 wordmark, 3 sparse. */
export const NAME_SHAPE = 0;
const WORD_SHAPE = 2;

export type CyclePhase = 'holding' | 'crossing';

export interface CycleAdvanceInput {
  /** Seconds since the previous advance. */
  delta: number;
  /** False until the wordmark raster has landed. Its attribute is
   *  zero-filled until then, so the shape must be skipped, not shown. */
  wordReady: boolean;
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

  const nextShape = (after: number, wordReady: boolean): number => {
    let next = (after + 1) % SHAPES.length;
    // The wordmark raster can fail; its attribute is zero-filled then,
    // and morphing into it would collapse the field onto the origin.
    if (next === WORD_SHAPE && !wordReady) next = (next + 1) % SHAPES.length;
    return next;
  };

  return {
    advance: (input): CycleState => {
      // No single advance may skip more than one hitched frame's worth
      // of schedule, whoever is driving.
      const delta = Math.min(input.delta, T.maxAdvance);
      t += delta;

      if (phase === 'holding') {
        if (t >= T.hold) {
          from = to;
          to = nextShape(from, input.wordReady);
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
