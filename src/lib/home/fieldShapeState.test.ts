import { afterEach, describe, expect, it } from 'vitest';
import { FIELD_SHAPE_ATTR, shapeAttrValue, trackFieldShape } from './fieldShapeState';
import { emitFieldLog } from './fieldLogEvents';
import { SHAPES } from '../three/field/tuning';

const CV = SHAPES.indexOf('cv');
const NAME = SHAPES.indexOf('name');

describe('shapeAttrValue', () => {
  it('names every lane the field can hold', () => {
    // Checked against SHAPES, which the module deliberately does not import:
    // the CSS selector that lights the CV controls matches on this exact
    // string, so a rename that stopped at the shape list would silently stop
    // matching. Same shape as `fieldLog.test`'s label case, and the length
    // assertion is the half that catches a SIXTH lane — a per-lane loop over
    // five entries passes happily while the new one publishes nothing.
    expect(shapeAttrValue(SHAPES.length), 'a lane was added to SHAPES').toBeNull();
    SHAPES.forEach((shape, index) => {
      expect(shapeAttrValue(index), `lane ${index}`).toBe(shape);
    });
  });

  it('returns null for a lane it does not know', () => {
    // Null clears the attribute. Writing `undefined` into the DOM instead
    // would leave `[data-field-shape]` matching on the literal string.
    expect(shapeAttrValue(99)).toBeNull();
    expect(shapeAttrValue(-1)).toBeNull();
  });
});

describe('trackFieldShape', () => {
  const live: { el: HTMLElement; dispose: () => void }[] = [];

  const mount = (): { el: HTMLElement; dispose: () => void } => {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const handle = { el, dispose: trackFieldShape(el) };
    live.push(handle);
    return handle;
  };

  // Teardown here rather than at the end of each case, because `field:log` is
  // a DOCUMENT-level channel: a case that fails before reaching its own
  // `dispose()` would leave a live subscriber for the rest of the file,
  // writing onto a detached node on every later `emitFieldLog`. Disposing a
  // second time is a no-op, so the one case that disposes on purpose is safe.
  afterEach(() => {
    for (const { el, dispose } of live.splice(0)) {
      dispose();
      el.remove();
    }
  });

  it('publishes the held shape onto the element', () => {
    const { el } = mount();
    expect(el.hasAttribute(FIELD_SHAPE_ATTR)).toBe(false);

    emitFieldLog({ kind: 'shape', shape: CV });
    expect(el.getAttribute(FIELD_SHAPE_ATTR)).toBe('cv');

    // Leaving the CV shape must clear the highlight, which is the half that
    // matters: a stuck 'cv' would leave the controls lit for the whole lap.
    emitFieldLog({ kind: 'shape', shape: NAME });
    expect(el.getAttribute(FIELD_SHAPE_ATTR)).toBe('name');
  });

  it('ignores the log events that are not shape changes', () => {
    // The same event channel carries ripples, impulses and gate phases. A
    // handler that read `event.shape` off all of them would write undefined.
    const { el } = mount();
    emitFieldLog({ kind: 'shape', shape: CV });
    emitFieldLog({ kind: 'impulse', x: 10, y: 20 });
    emitFieldLog({ kind: 'dissolve', direction: 'out' });
    expect(el.getAttribute(FIELD_SHAPE_ATTR)).toBe('cv');
  });

  it('clears the attribute for an unknown lane rather than writing undefined', () => {
    const { el } = mount();
    emitFieldLog({ kind: 'shape', shape: CV });
    emitFieldLog({ kind: 'shape', shape: 99 });
    expect(el.hasAttribute(FIELD_SHAPE_ATTR)).toBe(false);
  });

  it('stops listening and clears up on dispose', () => {
    // Under client-side routing the hero is swapped out while the scene is
    // torn down. A listener that outlived the element would keep a detached
    // node alive and could write a shape onto the next page's hero.
    const { el, dispose } = mount();
    emitFieldLog({ kind: 'shape', shape: CV });
    dispose();

    expect(el.hasAttribute(FIELD_SHAPE_ATTR)).toBe(false);
    emitFieldLog({ kind: 'shape', shape: CV });
    expect(el.hasAttribute(FIELD_SHAPE_ATTR)).toBe(false);
  });
});
