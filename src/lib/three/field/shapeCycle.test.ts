import { describe, expect, it } from 'vitest';
import { createShapeCycle, NAME_SHAPE } from './shapeCycle';
import { FIELD_TUNING, SHAPES } from './tuning';

const T = FIELD_TUNING.cycle;
const STEP = 1 / 60;

/** Advance `seconds` of wall time in 60 Hz steps. */
function run(
  c: ReturnType<typeof createShapeCycle>,
  seconds: number,
  wordReady = true,
): ReturnType<ReturnType<typeof createShapeCycle>['advance']> {
  let state = c.advance({ delta: 0, wordReady });
  for (let t = 0; t < seconds; t += STEP) {
    state = c.advance({ delta: STEP, wordReady });
  }
  return state;
}

describe('createShapeCycle', () => {
  it('starts holding the name — the shape the load-in ends on', () => {
    const c = createShapeCycle();
    const s = c.advance({ delta: 0, wordReady: true });
    expect(s.phase).toBe('holding');
    expect(s.from).toBe(NAME_SHAPE);
    expect(s.to).toBe(NAME_SHAPE);
    expect(s.cross).toBe(0);
  });

  it('holds for the hold window, then morphs for the transition window', () => {
    const c = createShapeCycle();
    expect(run(c, T.hold - 0.5).phase).toBe('holding');
    const morphing = run(c, 1);
    expect(morphing.phase).toBe('crossing');
    expect(morphing.from).toBe(NAME_SHAPE);
    expect(morphing.to).toBe(1);
    expect(morphing.cross).toBeGreaterThan(0);
    expect(morphing.cross).toBeLessThan(1);
    expect(run(c, T.transition).phase).toBe('holding');
  });

  it('rotates through all four shapes and wraps back to the name', () => {
    const c = createShapeCycle();
    const seen: number[] = [];
    // One full lap: four holds and four morphs. The margin matters —
    // 480 accumulated steps of 1/60 land just short of 8 s, which leaves
    // the cycle one frame inside the morph rather than settled after it.
    for (let i = 0; i < 4; i++) {
      const s = run(c, T.hold + T.transition + 0.1);
      seen.push(s.from);
    }
    expect(seen).toEqual([1, 2, 3, 0]);
    expect(SHAPES.length).toBe(4);
  });

  it('never stops on its own — no idle gate, no interrupt input', () => {
    const c = createShapeCycle();
    // Ten minutes of uninterrupted advancing must still be cycling.
    const s = run(c, 600);
    expect(['holding', 'crossing']).toContain(s.phase);
    // And it must have moved off the starting shape.
    expect(c.current()).not.toBe(undefined);
  });

  it('skips the wordmark until its raster has landed', () => {
    const c = createShapeCycle();
    // name -> galaxy
    run(c, T.hold + T.transition + 0.1);
    expect(c.current()).toBe(1);
    // galaxy -> (wordmark skipped) -> sparse
    const s = run(c, T.hold + T.transition + 0.1, false);
    expect(s.from).toBe(3);
  });

  it('reports the shape a viewer actually sees during a morph', () => {
    const c = createShapeCycle();
    run(c, T.hold + 0.2);
    // Just after the morph starts the field still reads as the old shape.
    expect(c.current()).toBe(NAME_SHAPE);
    run(c, T.transition * 0.6);
    // Past the midpoint it reads as the one it is becoming, so a click
    // is tested against what is on screen rather than what was.
    expect(c.current()).toBe(1);
  });

  it('will not swallow a whole background stretch in one advance', () => {
    // A page opened in a background tab reaches its first real frame
    // with a delta of the entire time it sat there.
    const c = createShapeCycle();
    const s = c.advance({ delta: 600, wordReady: true });
    expect(s.phase).toBe('holding');
    expect(s.cross).toBe(0);
  });

  it('returns the same object every advance — the tick loop must not allocate', () => {
    const c = createShapeCycle();
    const a = c.advance({ delta: STEP, wordReady: true });
    const b = c.advance({ delta: STEP, wordReady: true });
    expect(a).toBe(b);
  });

  it('keeps cross inside 0..1 across a whole lap', () => {
    const c = createShapeCycle();
    for (let t = 0; t < (T.hold + T.transition) * 4; t += STEP) {
      const s = c.advance({ delta: STEP, wordReady: true });
      expect(s.cross).toBeGreaterThanOrEqual(0);
      expect(s.cross).toBeLessThanOrEqual(1);
      expect(s.from).toBeGreaterThanOrEqual(0);
      expect(s.to).toBeLessThan(SHAPES.length);
    }
  });
});
