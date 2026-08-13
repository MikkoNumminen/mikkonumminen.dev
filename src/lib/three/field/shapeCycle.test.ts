import { describe, expect, it } from 'vitest';
import { createShapeCycle, NAME_SHAPE } from './shapeCycle';
import { CYCLE_ORDER, FIELD_TUNING, SHAPES } from './tuning';

const T = FIELD_TUNING.cycle;
const STEP = 1 / 60;

const NAME = 0;
const GALAXY = 1;
const WORD = 2;
const SPARSE = 3;
const CV = 4;

/** Hold window for a given lane, since the CV shape holds far longer. */
const holdOf = (shape: number): number => T.shapeHold[shape] ?? T.hold;

interface Ready {
  wordReady?: boolean;
  cvReady?: boolean;
}

/** Advance `seconds` of wall time in 60 Hz steps. */
function run(
  c: ReturnType<typeof createShapeCycle>,
  seconds: number,
  ready: Ready = {},
): ReturnType<ReturnType<typeof createShapeCycle>['advance']> {
  const input = { wordReady: ready.wordReady ?? true, cvReady: ready.cvReady ?? true };
  let state = c.advance({ delta: 0, ...input });
  for (let t = 0; t < seconds; t += STEP) {
    state = c.advance({ delta: STEP, ...input });
  }
  return state;
}

/** Advance past the hold of whatever is on screen, plus its morph. */
function step(
  c: ReturnType<typeof createShapeCycle>,
  ready: Ready = {},
): ReturnType<ReturnType<typeof createShapeCycle>['advance']> {
  return run(c, holdOf(c.current()) + T.transition + 0.1, ready);
}

describe('createShapeCycle', () => {
  it('starts holding the name — the shape the load-in ends on', () => {
    const c = createShapeCycle();
    const s = c.advance({ delta: 0, wordReady: true, cvReady: true });
    expect(s.phase).toBe('holding');
    expect(s.from).toBe(NAME_SHAPE);
    expect(s.to).toBe(NAME_SHAPE);
    expect(s.cross).toBe(0);
  });

  it('holds for the hold window, then morphs for the transition window', () => {
    const c = createShapeCycle();
    expect(run(c, holdOf(NAME) - 0.5).phase).toBe('holding');
    const morphing = run(c, 1);
    expect(morphing.phase).toBe('crossing');
    expect(morphing.from).toBe(NAME_SHAPE);
    expect(morphing.to).toBe(GALAXY);
    expect(morphing.cross).toBeGreaterThan(0);
    expect(morphing.cross).toBeLessThan(1);
    expect(run(c, T.transition).phase).toBe('holding');
  });

  it('rotates in CYCLE_ORDER, not lane order, and wraps back to the name', () => {
    const c = createShapeCycle();
    const seen: number[] = [];
    // One full lap: five holds and five morphs. The margin matters — the
    // accumulated steps otherwise land just short of the window, leaving
    // the cycle one frame inside the morph rather than settled after it.
    for (let i = 0; i < CYCLE_ORDER.length; i++) {
      seen.push(step(c).from);
    }
    // Show order is name, galaxy, cv, word, sparse, then back to the name.
    // Asserted against the shapes THEMSELVES rather than against a rotated
    // CYCLE_ORDER, so reordering the cycle has to be a deliberate edit here
    // too: which shape the CV arrives out of is a design decision, not an
    // implementation detail.
    expect(seen).toEqual([GALAXY, CV, WORD, SPARSE, NAME]);
    expect(SHAPES.length).toBe(5);
    expect(CYCLE_ORDER.length).toBe(SHAPES.length);
  });

  it('holds the CV block far longer than the other shapes', () => {
    // 5 seconds is ample for a wordmark and nowhere near enough to read a
    // paragraph, which is the only reason `shapeHold` is a table at all.
    expect(holdOf(CV)).toBeGreaterThan(holdOf(WORD) * 1.5);

    const c = createShapeCycle();
    step(c); // name -> galaxy
    step(c); // galaxy -> cv
    expect(c.current()).toBe(CV);
    // Still holding past the window every other shape would have left by,
    // which is the property a reader depends on.
    expect(run(c, holdOf(WORD) + 0.5).phase).toBe('holding');
    expect(c.current()).toBe(CV);
  });

  it('leaves the CV early if it stops being showable while it is held', () => {
    // A window dragged narrow mid-hold takes the block below the size its
    // body text needs. Gating only the NEXT target would leave an unreadable
    // smear up for the rest of an 11 second window.
    const c = createShapeCycle();
    step(c); // name -> galaxy
    step(c); // galaxy -> cv
    expect(c.current()).toBe(CV);
    expect(run(c, 1).phase).toBe('holding');

    // One advance with the shape no longer showable is enough to start the
    // morph away from it, well inside its hold window.
    const s = c.advance({ delta: STEP, wordReady: true, cvReady: false });
    expect(s.phase).toBe('crossing');
    expect(s.from).toBe(CV);
    expect(s.to).not.toBe(CV);
  });

  it('does not cut a shape short while it is still showable', () => {
    // The other half of the same branch: the early exit must not fire on
    // the ordinary path, or every shape would morph on its first frame.
    const c = createShapeCycle();
    expect(run(c, holdOf(NAME) - 0.5).phase).toBe('holding');
    expect(c.current()).toBe(NAME);
  });

  it('skips the CV block when it is not ready, and still reaches the wordmark', () => {
    const c = createShapeCycle();
    step(c); // name -> galaxy
    expect(c.current()).toBe(GALAXY);
    // galaxy -> (cv skipped) -> word
    expect(step(c, { cvReady: false }).from).toBe(WORD);
  });

  it('skips both text shapes when neither is available', () => {
    // This is why skipping is a bounded scan rather than a single hop: with
    // the wordmark raster failed AND the viewport too narrow for the CV, one
    // step lands on the other unavailable shape and morphs the field into a
    // zero-filled attribute, collapsing it onto the origin.
    const c = createShapeCycle();
    step(c); // name -> galaxy
    expect(step(c, { wordReady: false, cvReady: false }).from).toBe(SPARSE);
  });

  it('holds its ground when every other shape is unavailable', () => {
    // Reachable: a narrow window plus a failed wordmark raster leaves only
    // name, galaxy and sparse. Asserts the scan cannot fall through to a
    // bogus index.
    const c = createShapeCycle();
    for (let i = 0; i < 12; i++) {
      const s = step(c, { wordReady: false, cvReady: false });
      expect([NAME, GALAXY, SPARSE]).toContain(s.from);
      expect([NAME, GALAXY, SPARSE]).toContain(s.to);
    }
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
    step(c); // name -> galaxy
    expect(c.current()).toBe(GALAXY);
    step(c); // galaxy -> cv
    expect(c.current()).toBe(CV);
    // cv -> (wordmark skipped) -> sparse
    expect(step(c, { wordReady: false }).from).toBe(SPARSE);
  });

  it('reports the shape a viewer actually sees during a morph', () => {
    const c = createShapeCycle();
    run(c, holdOf(NAME) + 0.2);
    // Just after the morph starts the field still reads as the old shape.
    expect(c.current()).toBe(NAME_SHAPE);
    run(c, T.transition * 0.6);
    // Past the midpoint it reads as the one it is becoming, so a click
    // is tested against what is on screen rather than what was.
    expect(c.current()).toBe(GALAXY);
  });

  it('will not swallow a whole background stretch in one advance', () => {
    // A page opened in a background tab reaches its first real frame
    // with a delta of the entire time it sat there.
    const c = createShapeCycle();
    const s = c.advance({ delta: 600, wordReady: true, cvReady: true });
    expect(s.phase).toBe('holding');
    expect(s.cross).toBe(0);
  });

  it('returns the same object every advance — the tick loop must not allocate', () => {
    const c = createShapeCycle();
    const a = c.advance({ delta: STEP, wordReady: true, cvReady: true });
    const b = c.advance({ delta: STEP, wordReady: true, cvReady: true });
    expect(a).toBe(b);
  });

  it('keeps cross inside 0..1 across a whole lap', () => {
    const c = createShapeCycle();
    const lap =
      T.shapeHold.reduce((a, b) => a + b, 0) + T.transition * CYCLE_ORDER.length;
    for (let t = 0; t < lap; t += STEP) {
      const s = c.advance({ delta: STEP, wordReady: true, cvReady: true });
      expect(s.cross).toBeGreaterThanOrEqual(0);
      expect(s.cross).toBeLessThanOrEqual(1);
      expect(s.from).toBeGreaterThanOrEqual(0);
      expect(s.to).toBeLessThan(SHAPES.length);
    }
  });
});
