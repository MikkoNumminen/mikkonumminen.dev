import { describe, expect, it } from 'vitest';
import { createIdleChoreographer, type IdleAdvanceInput } from './idleChoreography';
import { FIELD_TUNING } from './tuning';

const T = FIELD_TUNING.idle;

/** Mid-range hold windows, so assertions never depend on Math.random. */
const halfRandom = (): number => 0.5;
const HOLD = T.holdMin + 0.5 * (T.holdMax - T.holdMin);

const IDLE_FRAME: IdleAdvanceInput = {
  delta: 1 / 60,
  armed: true,
  interrupted: false,
  wordReady: true,
};

/** Run `seconds` of undisturbed idle time and return the final state. */
function run(
  c: ReturnType<typeof createIdleChoreographer>,
  seconds: number,
  over: Partial<IdleAdvanceInput> = {},
): ReturnType<ReturnType<typeof createIdleChoreographer>['advance']> {
  const step = 1 / 60;
  let state = c.advance({ ...IDLE_FRAME, ...over, delta: 0 });
  for (let t = 0; t < seconds; t += step) {
    state = c.advance({ ...IDLE_FRAME, ...over });
  }
  return state;
}

describe('createIdleChoreographer', () => {
  it('stays on the name until the first delay has elapsed', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    const before = run(c, T.firstDelay - 1);
    expect(before.phase).toBe('waiting');
    expect(before.mix).toBe(0);
  });

  it('enters the first formation after the first delay and reaches it fully', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    const entering = run(c, T.firstDelay + 0.5);
    expect(entering.phase).toBe('entering');
    expect(entering.mix).toBeGreaterThan(0);
    expect(entering.mix).toBeLessThan(1);
    // Galaxy is first in the cycle.
    expect(entering.weights).toEqual([1, 0, 0]);

    const held = run(c, T.transition);
    expect(held.phase).toBe('holding');
    expect(held.mix).toBe(1);
  });

  it('never counts idle time while the field is not armed', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    // Ten times the first delay, spent scrolled away from the top.
    const state = run(c, T.firstDelay * 10, { armed: false });
    expect(state.phase).toBe('waiting');
    expect(state.mix).toBe(0);
  });

  it('cycles galaxy to wordmark to sparse, then back to the name', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    run(c, T.firstDelay + T.transition + 0.1);
    expect(run(c, 0).weights).toEqual([1, 0, 0]);

    // Each subsequent formation arrives one hold + one transition later.
    run(c, HOLD + T.transition);
    expect(run(c, 0).weights).toEqual([0, 1, 0]);

    run(c, HOLD + T.transition);
    expect(run(c, 0).weights).toEqual([0, 0, 1]);

    // The cycle always ends on the name.
    const after = run(c, HOLD + T.returnDuration + 0.1);
    expect(after.phase).toBe('waiting');
    expect(after.mix).toBe(0);
  });

  it('crossfades between consecutive formations without passing through the name', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    run(c, T.firstDelay + T.transition + HOLD + T.transition / 2);
    const mid = run(c, 0);
    expect(mid.phase).toBe('crossing');
    // Mid-crossfade the field is fully committed to SOME idle formation —
    // it must not dip back toward the name between shapes.
    expect(mid.mix).toBe(1);
    expect(mid.weights[0]).toBeGreaterThan(0);
    expect(mid.weights[1]).toBeGreaterThan(0);
    const sum = mid.weights[0] + mid.weights[1] + mid.weights[2];
    expect(sum).toBeCloseTo(1, 6);
  });

  it('returns to the name on interruption and restarts the clock', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    run(c, T.firstDelay + T.transition + 1);
    expect(run(c, 0).mix).toBe(1);

    c.advance({ ...IDLE_FRAME, interrupted: true });
    const returned = run(c, T.returnDuration + 0.1);
    expect(returned.phase).toBe('waiting');
    expect(returned.mix).toBe(0);

    // And the full first delay has to elapse again before anything moves.
    expect(run(c, T.firstDelay - 1).mix).toBe(0);
    expect(run(c, 2).phase).toBe('entering');
  });

  it('eases down from wherever it was, not from a snap to full', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    // Interrupt one third of the way into the entry transition.
    run(c, T.firstDelay + T.transition / 3);
    const atInterrupt = c.advance({ ...IDLE_FRAME, interrupted: true });
    expect(atInterrupt.mix).toBeLessThan(1);
    const half = run(c, T.returnDuration / 2);
    expect(half.mix).toBeLessThan(atInterrupt.mix);
    expect(half.mix).toBeGreaterThan(0);
  });

  it('collapses faster when the scrub has taken over than on a plain interrupt', () => {
    const scrubbed = createIdleChoreographer({ random: halfRandom });
    const interrupted = createIdleChoreographer({ random: halfRandom });
    for (const c of [scrubbed, interrupted]) run(c, T.firstDelay + T.transition + 1);

    // Same elapsed time, two different reasons to leave.
    const window = T.returnDuration / 3;
    const a = run(scrubbed, window, { armed: false });
    interrupted.advance({ ...IDLE_FRAME, interrupted: true });
    const b = run(interrupted, window);
    expect(a.mix).toBeLessThan(b.mix);
  });

  it('skips the wordmark until its raster has landed', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    run(c, T.firstDelay + T.transition + 0.1, { wordReady: false });
    expect(run(c, 0, { wordReady: false }).weights).toEqual([1, 0, 0]);
    // Galaxy hands straight to sparse; the zero-filled wordmark
    // attribute would collapse the field to the origin.
    run(c, HOLD + T.transition, { wordReady: false });
    expect(run(c, 0, { wordReady: false }).weights).toEqual([0, 0, 1]);
  });

  it('will not swallow a whole background stretch in one advance', () => {
    // A page opened in a background tab reaches its first real frame
    // with a delta of the entire time it sat there. Without a clamp the
    // clock crosses the first delay instantly and the visitor's arrival
    // is greeted by a transition they never idled for.
    const c = createIdleChoreographer({ random: halfRandom });
    const after = c.advance({ ...IDLE_FRAME, delta: 600 });
    expect(after.phase).toBe('waiting');
    expect(after.mix).toBe(0);
    // And the normal wait still has to elapse from there.
    expect(run(c, T.firstDelay - 1).phase).toBe('waiting');
    expect(run(c, 2).phase).toBe('entering');
  });

  it('reset() eases back to the name without an input frame', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    run(c, T.firstDelay + T.transition + 1);
    expect(run(c, 0).mix).toBe(1);
    c.reset();
    expect(run(c, T.returnDuration + 0.1).mix).toBe(0);
  });

  it('picks the hold cadence, not the first delay, after a completed cycle', () => {
    const c = createIdleChoreographer({ random: halfRandom });
    // Through the whole cycle and back to the name.
    run(
      c,
      T.firstDelay +
        T.transition +
        (HOLD + T.transition) * 2 +
        HOLD +
        T.returnDuration +
        1,
    );
    expect(run(c, 0).phase).toBe('waiting');
    // A visitor who has already been shown the sequence waits the longer
    // hold window before it repeats, not the shorter first-visit delay.
    expect(run(c, T.firstDelay + 1).phase).toBe('waiting');
    // Cumulative: the run above already spent firstDelay + 1 of the wait.
    expect(run(c, HOLD - T.firstDelay - 0.5).phase).toBe('entering');
  });
});
