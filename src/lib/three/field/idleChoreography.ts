/**
 * The home field's idle choreography: what the particle field does when
 * nobody is doing anything.
 *
 * After a stretch of stillness on the formed name, the field cycles
 * through alternative formations — the galaxy again but turned to face
 * you, the site's own wordmark, a calm sparse field — and comes back to
 * the name. Any user input returns it to the name promptly and restarts
 * the clock, so the name is what an interrupting visitor gets, always.
 *
 * Pure and delta-driven: it advances on a delta the caller supplies and
 * returns only numbers. That keeps the whole schedule unit-testable, and
 * it makes the clock pause automatically whenever the caller's rAF loop
 * pauses — a hidden tab must not run transitions off-screen, and this is
 * the mechanism that guarantees it (not a visibility check).
 */
import { easeInOutCubic, easeOutCubic } from '../easing';
import { FIELD_TUNING } from './tuning';

const T = FIELD_TUNING.idle;

export type IdleShape = 'galaxy' | 'word' | 'sparse';

/** Cycle order. Always ends by returning to the name. */
const CYCLE: readonly IdleShape[] = ['galaxy', 'word', 'sparse'];

/** Position of each shape in the weight vector the shader reads. */
const SHAPE_INDEX: Record<IdleShape, number> = { galaxy: 0, word: 1, sparse: 2 };

export type IdlePhase = 'waiting' | 'entering' | 'holding' | 'crossing' | 'returning';

export interface IdleAdvanceInput {
  /** Seconds since the previous advance. */
  delta: number;
  /** Whether the field is in a state idle may run in at all: the name
   *  fully formed, at the top of the page. */
  armed: boolean;
  /** True on any frame a user input arrived (pointer, click, scroll,
   *  key) or the tab regained focus. */
  interrupted: boolean;
  /** False until the wordmark raster has landed. The attribute is
   *  zero-filled until then, so the shape must be skipped, not shown. */
  wordReady: boolean;
}

export interface IdleState {
  /** 0 = the name, 1 = fully in the current idle formation. */
  mix: number;
  /** Weights over [galaxy, word, sparse]; sums to 1. */
  weights: readonly [number, number, number];
  /** Exposed for tests and debugging; nothing renders from it. */
  phase: IdlePhase;
}

export interface IdleChoreographer {
  advance: (input: IdleAdvanceInput) => IdleState;
  /** Ease back to the name and restart the clock, without a frame of
   *  input having arrived. The tab-focus path uses this. */
  reset: () => void;
}

function oneHot(index: number): [number, number, number] {
  return [index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0];
}

export interface IdleChoreographerOptions {
  /** Injectable so the randomised hold windows are deterministic under
   *  test. */
  random?: () => number;
}

export function createIdleChoreographer(
  opts: IdleChoreographerOptions = {},
): IdleChoreographer {
  const { random = Math.random } = opts;

  let phase: IdlePhase = 'waiting';
  /** Seconds inside the current transition. */
  let t = 0;
  /** Seconds of continuous stillness, counted while waiting or holding. */
  let clock = 0;
  /** How long the current wait/hold lasts. Annotated because the tuning
   *  block is `as const`, which would otherwise pin this to the literal
   *  first-delay value. */
  let waitFor: number = T.firstDelay;
  let weights: readonly [number, number, number] = oneHot(0);
  let mix = 0;
  /** Mix at the moment a return started, so an interruption mid-entry
   *  eases down from where it actually was rather than snapping to 1. */
  let mixAtReturn = 0;
  let returnRate = 1;
  let from = 0;
  let to = 0;
  /** Index into CYCLE of the formation currently held; -1 when on the name. */
  let cycleAt = -1;

  const pickHold = (): number => T.holdMin + random() * (T.holdMax - T.holdMin);

  /**
   * Next formation after `after`, skipping the wordmark until its raster
   * has landed. Returns CYCLE.length when the cycle is done.
   */
  const nextIndex = (after: number, wordReady: boolean): number => {
    let i = after + 1;
    while (i < CYCLE.length && CYCLE[i] === 'word' && !wordReady) i++;
    return i;
  };

  const beginReturn = (rate: number, resumeAfter: number): void => {
    waitFor = resumeAfter;
    if (phase === 'waiting') return;
    if (phase === 'returning') {
      // A scrub arriving mid-return only ever speeds it up.
      returnRate = Math.max(returnRate, rate);
      return;
    }
    phase = 'returning';
    mixAtReturn = mix;
    returnRate = rate;
    t = 0;
  };

  return {
    advance: (input): IdleState => {
      const { armed, interrupted, wordReady } = input;
      // Clamped here rather than at the call site: no single advance may
      // skip more than one hitched frame's worth of schedule, whoever is
      // driving. A page opened in a background tab reaches its first
      // real frame with a delta of the whole time it sat there.
      const delta = Math.min(input.delta, T.maxAdvance);

      if (interrupted) beginReturn(1, T.firstDelay);
      // Scroll wins outright: the dissolve is already taking the field
      // somewhere else, so collapse the idle contribution fast rather
      // than letting two owners of the morph overlap.
      if (!armed) beginReturn(T.scrubCatchup, T.firstDelay);
      if (interrupted || !armed) clock = 0;

      switch (phase) {
        case 'waiting': {
          if (!armed) break;
          clock += delta;
          if (clock < waitFor) break;
          const first = nextIndex(-1, wordReady);
          // Nothing showable yet (wordmark still rasterising and it is
          // the only remaining shape) — keep waiting rather than
          // entering an empty formation.
          if (first >= CYCLE.length) break;
          cycleAt = first;
          weights = oneHot(SHAPE_INDEX[CYCLE[first]!]!);
          phase = 'entering';
          t = 0;
          break;
        }
        case 'entering': {
          t += delta;
          const p = Math.min(1, t / T.transition);
          mix = easeOutCubic(p);
          if (p >= 1) {
            phase = 'holding';
            clock = 0;
            waitFor = pickHold();
          }
          break;
        }
        case 'holding': {
          mix = 1;
          clock += delta;
          if (clock < waitFor) break;
          const next = nextIndex(cycleAt, wordReady);
          if (next >= CYCLE.length) {
            // Cycle complete. Back to the name, then pick the sequence
            // up again on the hold cadence rather than the (shorter)
            // first-visit delay — the visitor has already been shown one.
            beginReturn(1, pickHold());
            break;
          }
          from = SHAPE_INDEX[CYCLE[cycleAt]!]!;
          to = SHAPE_INDEX[CYCLE[next]!]!;
          cycleAt = next;
          phase = 'crossing';
          t = 0;
          break;
        }
        case 'crossing': {
          t += delta;
          const p = Math.min(1, t / T.transition);
          // Ease-in-out: nothing launches a shape-to-shape move, so an
          // ease-out's fast start would read as a jolt.
          const e = easeInOutCubic(p);
          const a = oneHot(from);
          const b = oneHot(to);
          weights = [
            a[0] + (b[0] - a[0]) * e,
            a[1] + (b[1] - a[1]) * e,
            a[2] + (b[2] - a[2]) * e,
          ];
          mix = 1;
          if (p >= 1) {
            phase = 'holding';
            clock = 0;
            waitFor = pickHold();
          }
          break;
        }
        case 'returning': {
          t += delta * returnRate;
          const p = Math.min(1, t / T.returnDuration);
          mix = mixAtReturn * (1 - easeOutCubic(p));
          if (p >= 1) {
            phase = 'waiting';
            mix = 0;
            clock = 0;
            cycleAt = -1;
            returnRate = 1;
          }
          break;
        }
      }

      return { mix, weights, phase };
    },

    reset: (): void => {
      beginReturn(1, T.firstDelay);
      clock = 0;
    },
  };
}
