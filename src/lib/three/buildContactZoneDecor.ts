import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Texture,
} from 'three';

export interface ContactZoneDecorHandle {
  group: Group;
  /**
   * Advance matrix cascade and scan-line scroll.
   *
   * `boost` ∈ [0, 1] intensifies the zone — cascade speeds up, scan
   * lines brighten — used by the caller to react to hover.
   */
  tick: (delta: number, boost: number) => void;
  dispose: () => void;
}

export interface ContactZoneDecorOptions {
  envMap?: Texture | null;
  /** Overall scale relative to a 2.2-unit-tall letter. */
  scale?: number;
}

const MATRIX_TEX_W = 256;
const MATRIX_TEX_H = 256;
const MATRIX_COLS = 14;
const MATRIX_ROWS = 22;
const MATRIX_REDRAW_INTERVAL = 0.085;

const SCAN_TEX_W = 4;
const SCAN_TEX_H = 128;

const MATRIX_GLYPHS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789{}<>/\\$#*+=';

interface Column {
  head: number;
  speed: number;
  chars: string[];
}

function pickGlyph(): string {
  const i = Math.floor(Math.random() * MATRIX_GLYPHS.length);
  return MATRIX_GLYPHS.charAt(i);
}

function makeColumns(): Column[] {
  const cols: Column[] = [];
  for (let i = 0; i < MATRIX_COLS; i++) {
    const chars: string[] = [];
    for (let r = 0; r < MATRIX_ROWS; r++) chars.push(pickGlyph());
    cols.push({
      head: Math.floor(Math.random() * MATRIX_ROWS),
      speed: 0.5 + Math.random() * 1.4,
      chars,
    });
  }
  return cols;
}

/**
 * Repaint the matrix canvas. Background is a near-opaque dark teal so
 * the previous frame's glyphs slightly bleed through, giving the
 * cascade a faint trail without a separate compositing pass.
 */
function paintMatrix(
  ctx: CanvasRenderingContext2D,
  cols: Column[],
  brightness: number,
): void {
  ctx.fillStyle = 'rgba(2, 8, 18, 0.92)';
  ctx.fillRect(0, 0, MATRIX_TEX_W, MATRIX_TEX_H);

  const cellW = MATRIX_TEX_W / MATRIX_COLS;
  const cellH = MATRIX_TEX_H / MATRIX_ROWS;
  ctx.font = `${Math.floor(cellH * 0.95)}px "Courier New", monospace`;
  ctx.textBaseline = 'top';

  for (let c = 0; c < cols.length; c++) {
    const col = cols[c];
    if (!col) continue;
    const x = c * cellW;
    for (let r = 0; r < MATRIX_ROWS; r++) {
      const dist = (col.head - r + MATRIX_ROWS) % MATRIX_ROWS;
      const ch = col.chars[r];
      if (!ch) continue;
      let alpha = 0;
      // Cool cyan / electric blue palette — Tron-ish sci-fi terminal,
      // not phosphor green (which the brief explicitly rejected as a
      // letter color).
      let color = '95, 200, 230';
      if (dist === 0) {
        alpha = 1;
        color = '230, 248, 255';
      } else if (dist < 4) {
        alpha = 0.85 - dist * 0.18;
      } else if (dist < 10) {
        alpha = 0.45 - (dist - 4) * 0.06;
      }
      if (alpha <= 0) continue;
      ctx.fillStyle = `rgba(${color}, ${(alpha * brightness).toFixed(3)})`;
      ctx.fillText(ch, x, r * cellH);
    }
  }
}

function makeScanTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = SCAN_TEX_W;
  c.height = SCAN_TEX_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeScanTexture: 2D context unavailable');
  for (let y = 0; y < SCAN_TEX_H; y++) {
    const stripe = y % 3 === 0 ? 0.5 : 0;
    ctx.fillStyle = `rgba(170, 220, 255, ${stripe})`;
    ctx.fillRect(0, y, SCAN_TEX_W, 1);
  }
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Matrix-cascade panel + scan-line overlay, sized to wrap a single
 * letter. Drives the contact zone of the hero title — sits centered on
 * a single letter's face and reacts to hover via `boost` on `tick`.
 *
 * Panel is wider than tall (1.5×scale) so the cascade reads as a
 * "screen embedded in the letter" rather than a square HUD that
 * spills above and below the line. The bottom green glow from earlier
 * iterations was dropped because it leaked outside the letter
 * footprint and visually competed with the galaxy collisions in the
 * lower-left of the scene.
 */
export function buildContactZoneDecor(
  opts: ContactZoneDecorOptions = {},
): ContactZoneDecorHandle {
  const scale = opts.scale ?? 1;
  const group = new Group();

  const panelW = 2.4 * scale;
  const panelH = 1.5 * scale;

  const matrixCanvas = document.createElement('canvas');
  matrixCanvas.width = MATRIX_TEX_W;
  matrixCanvas.height = MATRIX_TEX_H;
  const matrixCtx = matrixCanvas.getContext('2d');
  if (!matrixCtx) {
    throw new Error('buildContactZoneDecor: 2D context unavailable');
  }
  const columns = makeColumns();
  paintMatrix(matrixCtx, columns, 1);

  const matrixTex = new CanvasTexture(matrixCanvas);
  matrixTex.needsUpdate = true;
  const matrixMat = new MeshBasicMaterial({
    map: matrixTex,
    transparent: true,
    // Lower opacity so the chrome letter and the scene behind both read
    // through the cascade — the matrix is decoration on the letter,
    // not a discrete UI panel.
    opacity: 0.55,
    depthWrite: false,
  });
  const matrixGeo = new PlaneGeometry(panelW, panelH);
  const matrixPlane = new Mesh(matrixGeo, matrixMat);
  matrixPlane.position.z = 0.02 * scale;
  group.add(matrixPlane);

  const scanTex = makeScanTexture();
  const scanMat = new MeshBasicMaterial({
    map: scanTex,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const scanGeo = new PlaneGeometry(panelW, panelH);
  const scanPlane = new Mesh(scanGeo, scanMat);
  scanPlane.position.z = 0.04 * scale;
  group.add(scanPlane);

  let redrawAccum = 0;
  let scanScrollT = 0;

  const tick = (delta: number, boost: number): void => {
    redrawAccum += delta;
    scanScrollT += delta * (0.35 + boost * 0.9);

    if (redrawAccum >= MATRIX_REDRAW_INTERVAL) {
      const steps = Math.floor(redrawAccum / MATRIX_REDRAW_INTERVAL);
      redrawAccum -= steps * MATRIX_REDRAW_INTERVAL;
      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          if (!col) continue;
          if (Math.random() < 0.18 * col.speed * (1 + boost * 0.8)) {
            col.head = (col.head + 1) % MATRIX_ROWS;
            const idx = Math.floor(Math.random() * MATRIX_ROWS);
            col.chars[idx] = pickGlyph();
          }
        }
      }
      paintMatrix(matrixCtx, columns, 0.85 + boost * 0.45);
      matrixTex.needsUpdate = true;
    }

    scanTex.offset.y = scanScrollT % 1;
    scanMat.opacity = 0.14 + boost * 0.22;
  };

  const dispose = (): void => {
    matrixGeo.dispose();
    matrixMat.dispose();
    matrixTex.dispose();
    scanGeo.dispose();
    scanMat.dispose();
    scanTex.dispose();
  };

  return { group, tick, dispose };
}
