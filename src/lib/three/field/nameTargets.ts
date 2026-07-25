/**
 * Name-state target positions for the unified particle field: rasterise
 * "MIKKO NUMMINEN" on a hidden 2D canvas (same-document canvas — no
 * OffscreenCanvas, the CSP forbids workers), sample the filled glyph
 * pixels into world-space points, and distribute the field's particles
 * over them via nameDistribution.ts. The particles ARE the name — there
 * is no text mesh.
 *
 * Uses the site's own heading stack (--font-sans at weight 800, i.e. the
 * same face the DOM fallback title renders in), so the formed name and
 * the reduced-motion fallback agree. `document.fonts.ready` is raced
 * against a short timeout — a hung font must never block the field; the
 * system fallback face rasterises fine.
 *
 * Failure of any canvas step falls back to a soft ellipsoid blob at the
 * name's position (generateNameTargetsStub) rather than breaking the
 * scene.
 */
import { distributeNameTargets, type NameTargetSet } from './nameDistribution';

export interface NameTargetStubOptions {
  count: number;
  /** Ellipsoid semi-axes, world units. */
  semiX?: number;
  semiY?: number;
  semiZ?: number;
  /** World-space centre of the name block. */
  centerY?: number;
  random?: () => number;
}

const STUB_SEMI_X = 9;
const STUB_SEMI_Y = 3.5;
const STUB_CENTER_Y = 0.5;

/** Fallback shape when the rasteriser can't run: a flat ellipsoid where
 *  the name would sit, so a degenerate environment still shows a soft
 *  blob at the right screen position. */
export function generateNameTargetsStub(opts: NameTargetStubOptions): Float32Array {
  const {
    count,
    semiX = STUB_SEMI_X,
    semiY = STUB_SEMI_Y,
    semiZ = 1.2,
    centerY = STUB_CENTER_Y,
    random = Math.random,
  } = opts;

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform direction, centre-biased radius — reads as a dense soft
    // blob rather than a hollow shell.
    const r = Math.pow(random(), 0.55);
    const cosPhi = 2 * random() - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const theta = random() * Math.PI * 2;

    const i3 = i * 3;
    positions[i3] = sinPhi * Math.cos(theta) * r * semiX;
    positions[i3 + 1] = cosPhi * r * semiY + centerY;
    positions[i3 + 2] = sinPhi * Math.sin(theta) * r * semiZ;
  }
  return positions;
}

// Raster geometry. WORLD_WIDTH must agree with homeScene's
// NAME_DESIGN_HALF_WIDTH * 2 — the resize fit math scales the block down
// from exactly this design width.
//
// Line sizes differ on purpose: at equal sizes the 8-glyph NUMMINEN
// packs its letters so tight that the particle spread (point radius +
// shimmer) closes the inter-letter gaps and the line reads as blocks.
// A smaller size plus explicit letter-spacing keeps the counters and
// gaps open at particle resolution. (ctx.letterSpacing is ignored by
// older engines — the text just sets a touch tighter there.)
const CANVAS_W = 1400;
const CANVAS_H = 560;
const WORLD_WIDTH = 20;
const WORLD_PER_PX = WORLD_WIDTH / CANVAS_W;
const CENTER_Y = 0.5;
const LINE1_FONT_PX = 190;
const LINE2_FONT_PX = 150;
const LINE1_Y = 165;
const LINE2_Y = 415;
const LETTER_SPACING = '0.08em';
/** Alpha above which a pixel counts as glyph interior. */
const ALPHA_THRESHOLD = 128;
/** Sample grid step in canvas px — 2px across a ~22px stroke keeps the
 *  letterforms solid at the field's particle budget. */
const SAMPLE_STEP = 2;
const FONT_READY_TIMEOUT_MS = 800;

export interface RasterizeNameTargetsOptions {
  count: number;
  random?: () => number;
}

export async function rasterizeNameTargets(
  opts: RasterizeNameTargetsOptions,
): Promise<NameTargetSet> {
  const { count, random = Math.random } = opts;

  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, FONT_READY_TIMEOUT_MS)),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D context unavailable');

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = LETTER_SPACING;
    ctx.font = `800 ${LINE1_FONT_PX}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText('MIKKO', CANVAS_W / 2, LINE1_Y);
    ctx.font = `800 ${LINE2_FONT_PX}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.fillText('NUMMINEN', CANVAS_W / 2, LINE2_Y);

    const image = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    // Generous upper bound: every sampled cell a glyph pixel.
    const maxCandidates =
      Math.ceil(CANVAS_W / SAMPLE_STEP) * Math.ceil(CANVAS_H / SAMPLE_STEP);
    const candidates = new Float32Array(maxCandidates * 2);
    let n = 0;
    for (let y = 0; y < CANVAS_H; y += SAMPLE_STEP) {
      for (let x = 0; x < CANVAS_W; x += SAMPLE_STEP) {
        const alpha = image[(y * CANVAS_W + x) * 4 + 3] ?? 0;
        if (alpha < ALPHA_THRESHOLD) continue;
        // Sub-step jitter so the sample grid never reads as a lattice.
        candidates[n * 2] =
          (x + (random() - 0.5) * SAMPLE_STEP - CANVAS_W / 2) * WORLD_PER_PX;
        candidates[n * 2 + 1] =
          -(y + (random() - 0.5) * SAMPLE_STEP - CANVAS_H / 2) * WORLD_PER_PX + CENTER_Y;
        n++;
      }
    }
    if (n < 200) throw new Error(`glyph sampling found only ${n} points`);

    return distributeNameTargets({
      candidates: candidates.subarray(0, n * 2),
      count,
      random,
    });
  } catch (err) {
    console.warn('nameTargets: rasterisation failed, using blob fallback', err);
    // The blob fallback is still "the name" as far as the click
    // hit-test is concerned, so hand back its own extents rather than a
    // degenerate box — otherwise a degraded environment silently loses
    // the impulse too.
    return {
      positions: generateNameTargetsStub({ count, random }),
      dim: new Float32Array(count),
      bounds: {
        minX: -STUB_SEMI_X,
        maxX: STUB_SEMI_X,
        minY: STUB_CENTER_Y - STUB_SEMI_Y,
        maxY: STUB_CENTER_Y + STUB_SEMI_Y,
      },
    };
  }
}
