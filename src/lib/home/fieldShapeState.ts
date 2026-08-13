/**
 * Publishes which shape the field is holding onto an element, as a
 * `data-field-shape` attribute, so CSS can react to the scene.
 *
 * WHY IT EXISTS. The CV formation shows the top of the CV as readable prose
 * for eleven seconds of every lap, and the two controls that actually let a
 * visitor take or read that document are sitting in the hero masthead the
 * whole time. Brightening them while the formation is up connects the two.
 *
 * WHY NOT A CLICKABLE FORMATION. The original plan put a transparent
 * `<a download>` over the formation's projected bounds, mounted only while
 * the shape held, because `.field-canvas` is `pointer-events: none`. That is
 * a tab stop which exists for part of every lap and not the rest, which is
 * worse for a keyboard user than no control at all. The hero's anchors are
 * already permanent, focusable and named; pointing attention at them costs
 * nothing and takes nothing away.
 *
 * It rides the existing `field:log` event rather than adding a second
 * channel. That event already fires the moment the cycle COMMITS to a new
 * target, which is the start of the morph rather than the end, so the
 * highlight rises with the formation instead of snapping on once it has
 * finished assembling. It also means the two cases where the CV shape is cut
 * short (a resize that makes it illegible, a failed raster) turn the
 * highlight off for free, because both of them make the cycle commit to a
 * different target.
 *
 * The attribute carries the shape NAME for every shape, not a boolean for
 * this one. Same cost, and it leaves the other four a hook if they ever want
 * one.
 */
import { onFieldLog } from './fieldLogEvents';
import { SHAPES } from '../three/field/tuning';

export const FIELD_SHAPE_ATTR = 'data-field-shape';

/**
 * Lane index to attribute value. Returns null for an index the shape list
 * does not know, so an out-of-range value clears the attribute rather than
 * writing `undefined` into the DOM and leaving a selector matching on it.
 */
export function shapeAttrValue(shape: number): string | null {
  return SHAPES[shape] ?? null;
}

/**
 * Mirror the field's current shape onto `target`. Returns a disposer that
 * unsubscribes and removes the attribute, so a client-side navigation cannot
 * leave a stale shape name behind on an element the next page reuses.
 */
export function trackFieldShape(target: HTMLElement): () => void {
  const unsubscribe = onFieldLog((event) => {
    if (event.kind !== 'shape') return;
    const name = shapeAttrValue(event.shape);
    if (name === null) target.removeAttribute(FIELD_SHAPE_ATTR);
    else target.setAttribute(FIELD_SHAPE_ATTR, name);
  });

  return () => {
    unsubscribe();
    target.removeAttribute(FIELD_SHAPE_ATTR);
  };
}
