/**
 * Wordmark-state target positions: "mikkonumminen.dev" rasterised on a
 * hidden 2D canvas and distributed over the field's particles, exactly
 * as nameTargets.ts does for "MIKKO NUMMINEN". One of the formations the
 * idle choreography cycles through.
 *
 * Deliberately shares nameDistribution's placement logic and the name's
 * canvas-to-world mapping, so `uNameScale` — which the resize fit math
 * computes from the name block's design width — fits this line too
 * without a second fit path.
 *
 * Unlike the name, failure returns null rather than a blob fallback: a
 * soft ellipsoid IS a reasonable stand-in for a name that must appear,
 * but it is nothing at all as a stand-in for a wordmark. The
 * choreography skips the formation instead.
 *
 * ORDERING: this is synchronous and does NOT await `document.fonts.ready`
 * — it relies on `rasterizeNameTargets` having already awaited it. Call
 * it after that, never before, or the mark silently rasterises in the
 * fallback face while the name uses Inter.
 */
import { distributeNameTargets, type NameTargetSet } from './nameDistribution';

// Canvas geometry mirrors nameTargets.ts so both rasters land in the
// same world-space frame: WORLD_PER_PX must match, or uNameScale would
// mean two different things.
const CANVAS_W = 1400;
const CANVAS_H = 200;
const WORLD_WIDTH = 20;
const WORLD_PER_PX = WORLD_WIDTH / CANVAS_W;
const CENTER_Y = 0.5;
// Small enough to read as a different typographic register from the
// masthead-scale name, large enough that the counters in "e" and "o"
// survive at particle resolution.
const FONT_PX = 96;
const LETTER_SPACING = '0.02em';
const TEXT = 'mikkonumminen.dev';
const ALPHA_THRESHOLD = 128;
const SAMPLE_STEP = 2;

export interface RasterizeWordmarkOptions {
  count: number;
  random?: () => number;
}

/** Returns null if the wordmark can't be rasterised — callers skip the
 *  formation rather than substituting something that isn't the mark. */
export function rasterizeWordmarkTargets(
  opts: RasterizeWordmarkOptions,
): NameTargetSet | null {
  const { count, random = Math.random } = opts;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D context unavailable');

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = LETTER_SPACING;
    ctx.font = `600 ${FONT_PX}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText(TEXT, CANVAS_W / 2, CANVAS_H / 2);

    const image = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    const maxCandidates =
      Math.ceil(CANVAS_W / SAMPLE_STEP) * Math.ceil(CANVAS_H / SAMPLE_STEP);
    const candidates = new Float32Array(maxCandidates * 2);
    let n = 0;
    for (let y = 0; y < CANVAS_H; y += SAMPLE_STEP) {
      for (let x = 0; x < CANVAS_W; x += SAMPLE_STEP) {
        const alpha = image[(y * CANVAS_W + x) * 4 + 3] ?? 0;
        if (alpha < ALPHA_THRESHOLD) continue;
        candidates[n * 2] =
          (x + (random() - 0.5) * SAMPLE_STEP - CANVAS_W / 2) * WORLD_PER_PX;
        candidates[n * 2 + 1] =
          -(y + (random() - 0.5) * SAMPLE_STEP - CANVAS_H / 2) * WORLD_PER_PX + CENTER_Y;
        n++;
      }
    }
    if (n < 200) throw new Error(`wordmark sampling found only ${n} points`);

    return distributeNameTargets({
      candidates: candidates.subarray(0, n * 2),
      count,
      // A single small line leaves far more of the frame empty than the
      // two-line name does, so more of the field becomes surrounding
      // dust and the mark itself stays a thin, deliberate object.
      dustFraction: 0.55,
      glyphDepth: 0.2,
      random,
    });
  } catch (err) {
    console.warn('wordmarkTargets: rasterisation failed, skipping the shape', err);
    return null;
  }
}
