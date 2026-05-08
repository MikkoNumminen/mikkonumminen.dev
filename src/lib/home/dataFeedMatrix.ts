/**
 * Matrix-style char cascade rendered to a 2D canvas, used as a "data
 * feed" widget tucked under the editorial corner coords. Conveys
 * "this location is where data flows" — the cascade animates
 * continuously, occasionally a column advances and a glyph mutates.
 *
 * Standalone DOM canvas (not Three.js) — the widget is screen-space
 * UI, not part of the 3D scene, so keeping it out of the scene graph
 * lets it stay precisely positioned regardless of camera sway.
 */

export interface DataFeedMatrixHandle {
  dispose: () => void;
}

interface Column {
  head: number;
  speed: number;
  chars: string[];
}

const GLYPHS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789{}<>/\\$#*+=';
const COLS = 16;
const ROWS = 8;
/** Repaint cadence — every ~90 ms is plenty for the cascade feel and
 *  cheap (the canvas is small). */
const REDRAW_INTERVAL_MS = 90;

function pickGlyph(): string {
  return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
}

function makeColumns(): Column[] {
  const cols: Column[] = [];
  for (let i = 0; i < COLS; i++) {
    const chars: string[] = [];
    for (let r = 0; r < ROWS; r++) chars.push(pickGlyph());
    cols.push({
      head: Math.floor(Math.random() * ROWS),
      speed: 0.5 + Math.random() * 1.4,
      chars,
    });
  }
  return cols;
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cols: Column[],
): void {
  // Near-opaque dark teal — old glyphs slightly bleed through, giving
  // the cascade a faint trail without a separate compositing pass.
  ctx.fillStyle = 'rgba(2, 8, 20, 0.92)';
  ctx.fillRect(0, 0, w, h);

  const cellW = w / COLS;
  const cellH = h / ROWS;
  ctx.font = `${Math.floor(cellH * 0.92)}px "Courier New", monospace`;
  ctx.textBaseline = 'top';

  for (let c = 0; c < cols.length; c++) {
    const col = cols[c]!;
    const x = c * cellW;
    for (let r = 0; r < ROWS; r++) {
      const dist = (col.head - r + ROWS) % ROWS;
      let alpha = 0;
      let color = '95, 200, 230';
      if (dist === 0) {
        alpha = 1;
        color = '230, 248, 255';
      } else if (dist < 3) {
        alpha = 0.7 - dist * 0.15;
      } else if (dist < 6) {
        alpha = 0.35 - (dist - 3) * 0.1;
      }
      if (alpha <= 0) continue;
      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.fillText(col.chars[r]!, x, r * cellH);
    }
  }

  // Faint horizontal scan lines on top — gives the cascade a CRT feel.
  ctx.fillStyle = 'rgba(170, 220, 255, 0.045)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

export function buildDataFeedMatrix(
  canvas: HTMLCanvasElement,
  reducedMotion: boolean,
): DataFeedMatrixHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dispose: (): void => {} };

  // Match the canvas backing store to the displayed CSS size × devicePixelRatio
  // so the cascade renders crisp on retina displays. Falls back to the HTML
  // attribute size if clientWidth is 0 (canvas not yet laid out).
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.scale(dpr, dpr);

  const columns = makeColumns();
  paint(ctx, cssW, cssH, columns);

  if (reducedMotion) {
    return { dispose: (): void => {} };
  }

  let lastTick = performance.now();
  let raf = 0;

  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const elapsed = now - lastTick;
    if (elapsed < REDRAW_INTERVAL_MS) return;
    const steps = Math.max(1, Math.floor(elapsed / REDRAW_INTERVAL_MS));
    lastTick = now - (elapsed % REDRAW_INTERVAL_MS);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]!;
        if (Math.random() < 0.18 * col.speed) {
          col.head = (col.head + 1) % ROWS;
          const idx = Math.floor(Math.random() * ROWS);
          col.chars[idx] = pickGlyph();
        }
      }
    }
    paint(ctx, cssW, cssH, columns);
  };
  raf = requestAnimationFrame(tick);

  return {
    dispose: (): void => {
      cancelAnimationFrame(raf);
    },
  };
}
