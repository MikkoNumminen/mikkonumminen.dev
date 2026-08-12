/**
 * CV-state target positions: the top of the CV rasterised as real prose
 * and distributed over the field's particles, so the formation a visitor
 * sees IS the document rather than a picture of one.
 *
 * WHY THIS IS LEGIBLE AT ALL. Body text costs far fewer particles than the
 * name does. Measured against the name's own raster, the two-line
 * "MIKKO NUMMINEN" is ~94k ink pixels; this whole block is ~6.5k sampled
 * points, because a 40px stroke is thick and a 2.5px one is not. The
 * particle budget was never the constraint. Sprite SIZE is: at the field's
 * default 13px the glow bleeds ~5px past a body-text stroke, the counters
 * of a, e and o fill in and words merge into a ribbon. `shapeSize` in
 * tuning.ts drops this shape to ~6px, which is the size that reads.
 *
 * SCALE, AND WHY THE CANVAS IS WIDER THAN THE NAME'S. World-per-pixel is
 * shared with nameTargets.ts, so a canvas pixel is a fixed world distance
 * and therefore a fixed on-screen size (~0.6 screen px at a 1080-tall
 * viewport). Readable body text therefore needs a ~40px canvas font, and a
 * line of prose at 40px does not fit the name's 1400px canvas. The canvas
 * is widened instead of the type being shrunk, keeping WORLD_PER_PX
 * identical: the block spans ~37 world units where the name spans 20.
 *
 * THE BLUR IS THE POINT, NOT A FALLBACK. Below `sharpLines` the sample
 * positions are progressively scattered and dimmed, so the document keeps
 * going past what can be read and dissolves into unresolved cloud. That is
 * the honest picture of running out of resolution, and it is what the
 * scatter is FOR: the alternative, cutting the text off at a hard edge,
 * would read as a bug.
 *
 * ORDERING: synchronous, and does NOT await `document.fonts.ready` — it
 * relies on `rasterizeNameTargets` having awaited it already, exactly as
 * wordmarkTargets.ts does. Call it after that, never before, or the block
 * rasterises in the fallback face while the name uses Inter.
 *
 * Failure returns null and the cycle skips the shape. A blob is a
 * reasonable stand-in for a name that must appear; it is nothing at all as
 * a stand-in for a CV.
 */
import { distributeNameTargets, type NameTargetSet } from './nameDistribution';

/** Shared with nameTargets.ts so `WORLD_PER_PX` is identical. */
const NAME_CANVAS_W = 1400;
const NAME_WORLD_WIDTH = 20;
const WORLD_PER_PX = NAME_WORLD_WIDTH / NAME_CANVAS_W;

const CANVAS_W = 2600;
const CANVAS_H = 1080;
/** Design half-width in world units, for the fit scale homeScene computes. */
export const CV_DESIGN_HALF_WIDTH = (CANVAS_W * WORLD_PER_PX) / 2;

const MARGIN_X = 70;
const CENTER_Y = 0.5;
const ALPHA_THRESHOLD = 128;
/**
 * 1px, where every other shape samples at 2px.
 *
 * Not a quality knob, a coverage one. At 2px this block yields ~6.5k sample
 * points against ~21k glyph particle slots, and `distributeNameTargets`
 * resolves that surplus by CYCLING: three particles land on the same point,
 * differing only in depth jitter. The strokes end up thinly covered and the
 * whole block reads dim no matter how far its brightness is pushed. At 1px
 * there are ~26k distinct points, so the surplus flips to a stride
 * subsample and the particles spread across the letterforms instead of
 * stacking on them.
 */
const SAMPLE_STEP = 1;

const FONT_STACK = 'Inter, system-ui, -apple-system, sans-serif';
const NAME_FONT_PX = 104;
const TITLE_FONT_PX = 46;
const CONTACT_FONT_PX = 38;
const BODY_FONT_PX = 40;
const BODY_LINE_PX = 58;

/**
 * The block's copy.
 *
 * Held here rather than read from `content/cv.md` because this module is
 * bundled into the browser and the markdown is a build-time file, and
 * because the field can only ever show the first few hundred characters:
 * pulling in the whole document to discard 95% of it would ship the CV
 * twice to every visitor. The `/cv` page renders the real thing.
 */
const NAME_LINE = 'Mikko Numminen';
const TITLE_LINE = 'Full-Stack Developer · Finland';
const CONTACT_LINE = 'numminen.mikko.petteri@gmail.com · github.com/MikkoNumminen';
const SHARP_BODY =
  'I work on systems built around language models, with a focus on what happens when the model is wrong. I keep deterministic work deterministic, put the model only where language genuinely cannot be rule-coded, and enforce grounding through validation rather than prompt wording.';
const FADING_BODY =
  'Underneath that is ordinary full-stack work, end to end, SQL to ops. Thirteen projects carry it: a multi-tenant community platform serving a live WoW guild, a browser game built from an empty repo to live in 12 days, a Windows desktop app for audiobook generation, a reading tracker built twice in two ecosystems, a zero-knowledge password manager in Rust, and this site.';

/** Peak scatter at the very bottom of the block, canvas px. */
const MAX_SCATTER_PX = 30;
/** How dim the least-resolved text gets. 1 would erase it entirely. */
const MAX_FADE = 0.82;

export interface RasterizeCvOptions {
  count: number;
  random?: () => number;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Returns null if the block can't be rasterised — callers skip the shape. */
export function rasterizeCvTargets(opts: RasterizeCvOptions): NameTargetSet | null {
  const { count, random = Math.random } = opts;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D context unavailable');

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const maxWidth = CANVAS_W - MARGIN_X * 2;
    let y = 120;

    ctx.font = `700 ${NAME_FONT_PX}px ${FONT_STACK}`;
    ctx.fillText(NAME_LINE, MARGIN_X, y);
    y += 74;

    ctx.font = `500 ${TITLE_FONT_PX}px ${FONT_STACK}`;
    ctx.fillText(TITLE_LINE, MARGIN_X, y);
    y += 64;

    ctx.font = `400 ${CONTACT_FONT_PX}px ${FONT_STACK}`;
    ctx.fillText(CONTACT_LINE, MARGIN_X, y);
    y += 96;

    ctx.font = `400 ${BODY_FONT_PX}px ${FONT_STACK}`;
    for (const line of wrapLines(ctx, SHARP_BODY, maxWidth)) {
      ctx.fillText(line, MARGIN_X, y);
      y += BODY_LINE_PX;
    }

    // Everything below this line is the part that cannot resolve.
    const blurStartY = y - BODY_LINE_PX * 0.5;
    y += 26;
    for (const line of wrapLines(ctx, FADING_BODY, maxWidth)) {
      if (y > CANVAS_H - 10) break;
      ctx.fillText(line, MARGIN_X, y);
      y += BODY_LINE_PX;
    }

    // Where the ink actually is, vertically. Mapping around the canvas
    // centre put the block in the upper half of the frame with dead space
    // below it, because the copy does not fill the canvas it is drawn on.
    // Centring on the TEXT rather than on the canvas also keeps the block
    // clear of the hero masthead, which sits at the top of the same frame.
    const inkTop = 120 - NAME_FONT_PX;
    const inkBottom = y;
    const inkCenterY = (inkTop + inkBottom) / 2;

    const image = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    const maxCandidates =
      Math.ceil(CANVAS_W / SAMPLE_STEP) * Math.ceil(CANVAS_H / SAMPLE_STEP);
    const candidates = new Float32Array(maxCandidates * 2);
    const candidateDim = new Float32Array(maxCandidates);
    // Measured against the ink, not the canvas: a span that ran to the
    // bottom edge would spend most of the ramp on empty rows and leave the
    // fading text barely faded.
    const blurSpan = Math.max(1, inkBottom - blurStartY);
    let n = 0;

    for (let py = 0; py < CANVAS_H; py += SAMPLE_STEP) {
      // Quadratic so the transition from crisp to unreadable is gradual at
      // the top of the fading block and decisive by the bottom. A linear
      // ramp made the first fading line look like a rendering fault rather
      // than a deliberate fade.
      const depth = Math.max(0, py - blurStartY) / blurSpan;
      const scatter = depth * depth * MAX_SCATTER_PX;
      const fade = Math.min(MAX_FADE, depth * depth * MAX_FADE * 1.15);

      for (let px = 0; px < CANVAS_W; px += SAMPLE_STEP) {
        const alpha = image[(py * CANVAS_W + px) * 4 + 3] ?? 0;
        if (alpha < ALPHA_THRESHOLD) continue;
        // Sub-step jitter so the sample grid never reads as a lattice,
        // plus the depth scatter that dissolves the tail.
        const jx = (random() - 0.5) * (SAMPLE_STEP + scatter);
        const jy = (random() - 0.5) * (SAMPLE_STEP + scatter);
        candidates[n * 2] = (px + jx - CANVAS_W / 2) * WORLD_PER_PX;
        candidates[n * 2 + 1] = -(py + jy - inkCenterY) * WORLD_PER_PX + CENTER_Y;
        candidateDim[n] = fade;
        n++;
      }
    }
    if (n < 400) throw new Error(`cv sampling found only ${n} points`);

    return distributeNameTargets({
      candidates: candidates.subarray(0, n * 2),
      candidateDim: candidateDim.subarray(0, n),
      count,
      // Low, unlike the wordmark's 0.55: this block fills the frame, so
      // there is little room left for surrounding dust and every particle
      // spent on dust is one not spent on a letterform.
      dustFraction: 0.12,
      // Flatter than the name's 0.35. Depth on a thin stroke reads as
      // blur once the sprite is small, and this shape has to stay sharp.
      glyphDepth: 0.12,
      random,
    });
  } catch (err) {
    console.warn('cvTargets: rasterisation failed, skipping the shape', err);
    return null;
  }
}

/**
 * On-screen height in CSS px of the block's body text at a given viewport
 * and fit scale.
 *
 * The legibility gate reads this. The field maps a fixed world span onto
 * the viewport, so body text shrinks with the window: at a 700px-tall
 * viewport a 40px canvas font lands near 16px on screen, and below that
 * the formation is a smear rather than a document. The name never needed
 * this check because it is enormous at any size.
 */
export function cvBodyTextPx(
  viewportHeight: number,
  worldHeightAtZ0: number,
  cvScale: number,
): number {
  if (worldHeightAtZ0 <= 0) return 0;
  return BODY_FONT_PX * WORLD_PER_PX * (viewportHeight / worldHeightAtZ0) * cvScale;
}
