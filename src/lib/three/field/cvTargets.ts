/**
 * CV-state target positions: the top of the CV rasterised as real prose
 * and distributed over the field's particles, so the formation a visitor
 * sees IS the document rather than a picture of one.
 *
 * WHY THIS IS LEGIBLE AT ALL, AND WHAT THE CONSTRAINT ACTUALLY IS.
 * Measured in a browser at the shared 2px stride: this block yields ~36.1k
 * sample points, the name's raster ~30.3k, the wordmark's ~5.5k. So a page
 * of body text is NOT cheap relative to the name; it needs about a fifth
 * more points. It works anyway because both text shapes already have more
 * candidate points than the field has glyph particles (~21.1k of 24k), so
 * both are stride-subsampled and neither is limited by the budget.
 *
 * Sprite SIZE is the real constraint. At the field's default 13px the glow
 * bleeds ~5px past a body-text stroke, the counters of a, e and o fill in
 * and words merge into a ribbon. Compared at 13px, 6px and 2.6px; 6px is
 * the size that reads, so `shapeSize` in tuning.ts drops this shape to
 * 0.45. Bloom comes down with it, since bloom is what smears a thin stroke,
 * and brightness goes up to pay for the light a smaller sprite loses.
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
 *
 * PARALLEL TO `nameTargets.ts` and `wordmarkTargets.ts`: all three run the
 * same raster → alpha-threshold sample loop → `distributeNameTargets`
 * pipeline, with different canvases, copy and sampling. Left duplicated
 * rather than extracted because each one's differences are in the middle of
 * the loop (this one carries a per-row fade and scatter, the name carries a
 * blob fallback); a fix to the shared sample logic has to be mirrored into
 * all three by hand.
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
/** Baseline of the name line, canvas px. Leaves room above for the cap
 *  height and ascent of a 104px face, whatever face that turns out to be. */
const FIRST_BASELINE_Y = 120;
const CENTER_Y = 0.5;
const ALPHA_THRESHOLD = 128;
/**
 * 2px, the same as the other two rasters.
 *
 * There is a floor under this, and it is worth knowing where: the stride has
 * to leave MORE candidate points than the field has glyph particles (~21.1k
 * of 24k). At 2px this block yields ~36.1k and `distributeNameTargets`
 * stride-subsamples them, which spreads the particles over the letterforms.
 * At 3px it yields ~15.9k, the distributor switches to CYCLING, and several
 * particles pile onto each point differing only in depth jitter, leaving the
 * strokes thinly covered. Sampling finer than 2px was tried and is
 * indistinguishable on screen at four times the work.
 */
const SAMPLE_STEP = 2;

const FONT_STACK = 'Inter, system-ui, -apple-system, sans-serif';
const NAME_FONT_PX = 104;
const TITLE_FONT_PX = 46;
const CONTACT_FONT_PX = 38;
const BODY_FONT_PX = 40;
const BODY_LINE_PX = 58;

/**
 * The block's copy, quoted verbatim from the opening of `content/cv.md`.
 *
 * Held here rather than read from that file because this module is bundled
 * into the browser and the markdown is a build-time file, and because the
 * field can only ever show the first few hundred characters: pulling in the
 * whole document to discard 95% of it would ship the CV twice to every
 * visitor. The `/cv` page renders the real thing.
 *
 * COPIED, THEREFORE GUARDED. A copy is only defensible while it agrees with
 * its source, and it did not: the CV was rewritten and this block went on
 * rasterising the previous one, so the formation that is supposed to BE the
 * document showed a title, a contact line and two paragraphs that no longer
 * appeared anywhere in it. `cvTargets.test.ts` now holds every constant below
 * to the markdown.
 */
const NAME_LINE = 'Mikko Numminen';
const TITLE_LINE = 'AI engineering and full-stack development';
const CONTACT_LINE =
  'Tampere, Finland · numminen.mikko.petteri@gmail.com · github.com/MikkoNumminen';
const SHARP_BODY =
  'I build systems around language models and design them for what happens when the model is wrong. Deterministic work stays deterministic, the model is used only where language genuinely cannot be rule-coded, and grounding is enforced by validation rather than by prompt wording.';
const FADING_BODY =
  'Underneath that is ordinary full-stack work, end to end, SQL to ops, in TypeScript, C#, Python and Rust, moving data between APIs, databases, documents and files: PDF and EPUB through OCR, CSV and JSON open data, and code and prose chunked for retrieval.';

/**
 * Scatter and fade at the very last row of ink, which the ramp below now
 * actually reaches.
 *
 * Lower than the 30 / 0.82 first written here, and deliberately so: those
 * were never achieved. The ramp measured against a span a fifth longer than
 * the text, so the deepest row only ever got to ~0.79 of the way through a
 * quadratic and peaked at 18px of scatter and 0.58 of fade. Those are the
 * numbers that were tuned by eye in a browser, so they are the numbers kept
 * here now that the span is exact. Raising them is a look change, not a fix.
 */
const MAX_SCATTER_PX = 18.5;
/** How dim the least-resolved text gets. 1 would erase it entirely. */
const MAX_FADE = 0.58;

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
    let y = FIRST_BASELINE_Y;

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

    // The readable half must fit. It does with Inter, with ~350px to spare,
    // but a fallback face that wraps it to more lines would push baselines
    // past the canvas: the lines drawn beyond it are simply absent from
    // getImageData, and `blurStartY` would land past CANVAS_H, which makes
    // `depth` zero everywhere and disables the fade. The block would render
    // truncated AND completely sharp, and nothing would report it. Failing
    // here hands the decision to the null-means-skip contract instead.
    if (y > CANVAS_H - BODY_LINE_PX) {
      throw new Error(`cv sharp body overflows the canvas (last baseline ${y})`);
    }

    // Everything below this line is the part that cannot resolve.
    const blurStartY = y - BODY_LINE_PX * 0.5;
    y += 26;
    for (const line of wrapLines(ctx, FADING_BODY, maxWidth)) {
      if (y > CANVAS_H - 10) break;
      ctx.fillText(line, MARGIN_X, y);
      y += BODY_LINE_PX;
    }

    const image = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    // Counted first, then allocated exactly. Sizing from the sample GRID
    // the way the other two rasters do would reserve 2.8M slots to hold
    // ~26k points: 34 MB of scratch on the main thread, inside the
    // load-in's critical path. The extra alpha read is over a buffer
    // already in cache and touches no `random()`, so the sampled result is
    // identical.
    //
    // The same pass measures where the ink actually STARTS and ENDS, which
    // two things below need and neither can get from the layout variables.
    // Baselines are not ink: the first baseline sits below the cap line by
    // an ascent this module does not know, and the final `y` is a full line
    // height past the last baseline. Estimating from them put the block in
    // the upper half of the frame, and left the fade ramp measuring against
    // a span ~21% longer than the text, so the tail could never reach the
    // scatter and fade the constants below name.
    let inkCount = 0;
    let inkTop = CANVAS_H;
    let inkBottom = 0;
    for (let py = 0; py < CANVAS_H; py += SAMPLE_STEP) {
      let rowHasInk = false;
      for (let px = 0; px < CANVAS_W; px += SAMPLE_STEP) {
        if ((image[(py * CANVAS_W + px) * 4 + 3] ?? 0) >= ALPHA_THRESHOLD) {
          inkCount++;
          rowHasInk = true;
        }
      }
      if (rowHasInk) {
        if (py < inkTop) inkTop = py;
        inkBottom = py;
      }
    }
    const candidates = new Float32Array(inkCount * 2);
    const candidateDim = new Float32Array(inkCount);
    // Centred on the ink, which is what keeps the block clear of the hero
    // masthead at the top of the same frame.
    const inkCenterY = (inkTop + inkBottom) / 2;
    // Spans the fading text exactly, so the ramp below reaches its ends.
    const blurSpan = Math.max(1, inkBottom - blurStartY);
    let n = 0;

    for (let py = 0; py < CANVAS_H; py += SAMPLE_STEP) {
      // Quadratic so the transition from crisp to unreadable is gradual at
      // the top of the fading block and decisive by the bottom. A linear
      // ramp made the first fading line look like a rendering fault rather
      // than a deliberate fade.
      const depth = Math.max(0, py - blurStartY) / blurSpan;
      const scatter = depth * depth * MAX_SCATTER_PX;
      // No overshoot factor: it existed to let the fade reach MAX_FADE
      // before the end of a span that ran past the text, and against an
      // exact span it would only clip the last rows flat.
      const fade = depth * depth * MAX_FADE;

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
