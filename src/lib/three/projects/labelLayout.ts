/**
 * Screen-space deconfliction for the floating body labels.
 *
 * Twelve labels track twelve moving bodies, and whenever two line up from the
 * camera's angle their names land on top of each other — "READLOG", "PORTFOLIO"
 * and "READLOG .NET" stack into an unreadable smear near the centre for a good
 * part of every orbit.
 *
 * Nudging them apart would break the one thing a floating label has to do,
 * which is point unambiguously at its own body. So the rule is: nearest body
 * wins, and a label that would overlap one already placed is dropped for that
 * frame. Nearest is the right tiebreak because the nearer body is the one
 * drawn on top, so its label is the one the eye expects to find.
 *
 * Pure and framework-free so the packing rule is testable without a camera.
 */

export interface LabelBox {
  /** Screen position of the label's anchor (its bottom centre). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Distance from the camera; smaller wins a collision. */
  depth: number;
}

/** Extra space required between two labels before they count as clear. */
export const LABEL_GUTTER = 4;

function overlaps(a: LabelBox, b: LabelBox, gutter: number): boolean {
  // Anchors are bottom-centre: the box spans [x - w/2, x + w/2] and [y - h, y].
  const ax0 = a.x - a.width / 2 - gutter;
  const ax1 = a.x + a.width / 2 + gutter;
  const ay0 = a.y - a.height - gutter;
  const ay1 = a.y + gutter;
  const bx0 = b.x - b.width / 2;
  const bx1 = b.x + b.width / 2;
  const by0 = b.y - b.height;
  const by1 = b.y;
  return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
}

/**
 * Decide which labels are drawn this frame.
 *
 * Returns the indices of `boxes` that should be visible, nearest-first. A box
 * with a non-positive width is treated as unmeasured and always kept — a label
 * whose size is not known yet must not be culled by a comparison against zero.
 */
export function packLabels(boxes: LabelBox[], gutter = LABEL_GUTTER): number[] {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a]!.depth - boxes[b]!.depth);
  const placed: LabelBox[] = [];
  const visible: number[] = [];
  for (const i of order) {
    const box = boxes[i]!;
    if (box.width <= 0 || box.height <= 0) {
      visible.push(i);
      continue;
    }
    if (placed.some((p) => overlaps(box, p, gutter))) continue;
    placed.push(box);
    visible.push(i);
  }
  return visible;
}
