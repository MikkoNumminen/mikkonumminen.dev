import { describe, it, expect } from 'vitest';
import { packLabels, type LabelBox } from './labelLayout';

/** Anchor is bottom-centre, so a box spans x +/- w/2 and y - h .. y. */
function box(x: number, y: number, depth: number, width = 100, height = 20): LabelBox {
  return { x, y, width, height, depth };
}

describe('packLabels', () => {
  it('keeps every label when none overlap', () => {
    const boxes = [box(0, 0, 5), box(500, 0, 3), box(1000, 0, 9)];
    expect(packLabels(boxes, 0).sort()).toEqual([0, 1, 2]);
  });

  it('drops the farther of two overlapping labels', () => {
    const near = box(100, 100, 2);
    const far = box(110, 100, 40);
    expect(packLabels([far, near], 0)).toEqual([1]);
  });

  it('does not depend on input order', () => {
    const near = box(100, 100, 2);
    const far = box(110, 100, 40);
    expect(packLabels([near, far], 0)).toEqual([0]);
    expect(packLabels([far, near], 0)).toEqual([1]);
  });

  it('lets a third label through if it clears both survivors', () => {
    const a = box(100, 100, 1);
    const b = box(110, 100, 2); // collides with a, loses
    const c = box(600, 100, 3); // clear of both
    const visible = packLabels([a, b, c], 0);
    expect(visible).toContain(0);
    expect(visible).not.toContain(1);
    expect(visible).toContain(2);
  });

  it('measures overlap against survivors, not against dropped labels', () => {
    // b loses to a. c overlaps b but not a, so c must still be drawn —
    // otherwise one collision cascades into hiding an innocent third label.
    const a = box(100, 100, 1);
    const b = box(150, 100, 2);
    const c = box(215, 100, 3);
    const visible = packLabels([a, b, c], 0);
    expect(visible).toContain(0);
    expect(visible).not.toContain(1);
    expect(visible).toContain(2);
  });

  it('separates on the vertical axis too', () => {
    const near = box(100, 100, 1);
    const sameColumnBelow = box(100, 118, 2); // its top edge is inside `near`
    const clearBelow = box(100, 400, 3);
    const visible = packLabels([near, sameColumnBelow, clearBelow], 0);
    expect(visible).toContain(0);
    expect(visible).not.toContain(1);
    expect(visible).toContain(2);
  });

  it('applies the gutter, so labels that merely touch still count as clashing', () => {
    const a = box(100, 100, 1);
    const b = box(201, 100, 2); // 1px clear, inside a 4px gutter
    expect(packLabels([a, b], 4)).toEqual([0]);
    expect(packLabels([a, b], 0).sort()).toEqual([0, 1]);
  });

  it('never culls an unmeasured label', () => {
    // Width 0 means the webfont has not settled yet. Culling on a zero box
    // would hide labels during load and they would never come back, because
    // a hidden element keeps reporting zero.
    const measured = box(100, 100, 1);
    const unmeasured = box(100, 100, 50, 0, 0);
    expect(packLabels([measured, unmeasured], 4)).toContain(1);
  });

  it('handles an empty set', () => {
    expect(packLabels([])).toEqual([]);
  });
});
