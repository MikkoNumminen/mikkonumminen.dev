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
 * This runs every frame, so it allocates nothing: the caller owns both the
 * output and the scratch ordering, and they are reused across frames. The
 * sibling connection code goes to the same trouble for the same reason.
 */

export interface LabelBox {
  /** Screen position of the label's anchor (its bottom centre). */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Distance from the camera; smaller wins a collision. Use `Infinity` to mark
   * a label that is not on screen this frame — those sort to the end and are
   * skipped rather than needing a separate list.
   */
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
 * Writes into `visible`, parallel to `boxes`. `order` is scratch, also parallel;
 * both are caller-owned so this allocates nothing.
 *
 * A box with a non-positive size is treated as unmeasured and always kept — a
 * label whose size is not known yet must not be culled by a comparison against
 * zero, or it would be hidden while the webfont loads and stay hidden, since a
 * hidden element keeps reporting zero.
 */
export function packLabels(
  boxes: LabelBox[],
  visible: boolean[],
  order: number[],
  gutter = LABEL_GUTTER,
): void {
  const n = boxes.length;
  order.length = n;
  for (let i = 0; i < n; i++) {
    order[i] = i;
    visible[i] = false;
  }
  // INVARIANT for every `!` below: `order` was just filled with exactly the
  // indices 0..n-1 of `boxes`, and both arrays are length n. Sorting permutes
  // those indices, it does not introduce new ones — so `boxes[order[k]]` is
  // always populated. The assertions encode that, rather than hiding a maybe.
  order.sort((a, b) => boxes[a]!.depth - boxes[b]!.depth);

  for (let oi = 0; oi < n; oi++) {
    const i = order[oi]!;
    const box = boxes[i]!;
    // Off-screen labels sort to the end, so the first one ends the pass.
    if (!Number.isFinite(box.depth)) break;
    if (box.width <= 0 || box.height <= 0) {
      visible[i] = true;
      continue;
    }
    let clash = false;
    // Compared against labels already kept, never against ones already
    // dropped — otherwise one collision cascades and hides an innocent third.
    for (let oj = 0; oj < oi; oj++) {
      const j = order[oj]!;
      if (!visible[j]) continue;
      if (overlaps(box, boxes[j]!, gutter)) {
        clash = true;
        break;
      }
    }
    visible[i] = !clash;
  }
}
