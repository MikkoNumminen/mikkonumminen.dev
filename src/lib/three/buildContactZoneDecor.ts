import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';

export interface ContactZoneDecorHandle {
  group: Group;
  /**
   * Advance matrix cascade / scan-line scroll / glow pulse.
   *
   * `boost` ∈ [0, 1] intensifies the zone — cascade speeds up, scan
   * lines brighten, glow strengthens — used by the caller to react to
   * hover.
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
const MATRIX_COLS = 18;
const MATRIX_ROWS = 22;
const MATRIX_REDRAW_INTERVAL = 0.075;

const SCAN_TEX_W = 4;
const SCAN_TEX_H = 128;

const GLOW_TEX_SIZE = 128;

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

function paintMatrix(
  ctx: CanvasRenderingContext2D,
  cols: Column[],
  brightness: number,
): void {
  ctx.fillStyle = 'rgba(2, 10, 8, 0.92)';
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
      let color = '74, 222, 128';
      if (dist === 0) {
        alpha = 1;
        color = '220, 255, 230';
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
    const stripe = y % 3 === 0 ? 0.55 : 0;
    ctx.fillStyle = `rgba(180, 255, 200, ${stripe})`;
    ctx.fillRect(0, y, SCAN_TEX_W, 1);
  }
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeGlowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = GLOW_TEX_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('makeGlowTexture: 2D context unavailable');
  const cx = GLOW_TEX_SIZE / 2;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, 'rgba(180, 255, 200, 0.95)');
  grad.addColorStop(0.25, 'rgba(74, 222, 128, 0.55)');
  grad.addColorStop(0.6, 'rgba(34, 140, 90, 0.18)');
  grad.addColorStop(1, 'rgba(0, 40, 20, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GLOW_TEX_SIZE, GLOW_TEX_SIZE);
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/**
 * Matrix-cascade panel + scan-line overlay + green base-glow sprite,
 * sized to wrap two letters ~2.4 units wide. Drives the contact-zone
 * of the hero title — sits centered over the N-U of NUMMINEN and reacts
 * to hover via the `boost` parameter on `tick`.
 */
export function buildContactZoneDecor(
  opts: ContactZoneDecorOptions = {},
): ContactZoneDecorHandle {
  const scale = opts.scale ?? 1;
  const group = new Group();

  const panelW = 2.4 * scale;
  const panelH = 2.4 * scale;

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
    opacity: 0.92,
    depthWrite: false,
  });
  const matrixGeo = new PlaneGeometry(panelW, panelH);
  const matrixPlane = new Mesh(matrixGeo, matrixMat);
  matrixPlane.position.z = 0.04 * scale;
  group.add(matrixPlane);

  const scanTex = makeScanTexture();
  const scanMat = new MeshBasicMaterial({
    map: scanTex,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const scanGeo = new PlaneGeometry(panelW, panelH);
  const scanPlane = new Mesh(scanGeo, scanMat);
  scanPlane.position.z = 0.06 * scale;
  group.add(scanPlane);

  const glowTex = makeGlowTexture();
  const glowMat = new SpriteMaterial({
    map: glowTex,
    color: 0x4ade80,
    blending: AdditiveBlending,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const glow = new Sprite(glowMat);
  glow.scale.set(panelW * 1.1, panelH * 0.45, 1);
  glow.position.set(0, -panelH * 0.5, 0.02 * scale);
  group.add(glow);

  let cascadeT = 0;
  let redrawAccum = 0;
  let scanScrollT = 0;
  let pulseT = 0;

  const tick = (delta: number, boost: number): void => {
    const speedMul = 1 + boost * 1.8;
    cascadeT += delta * speedMul;
    redrawAccum += delta;
    scanScrollT += delta * (0.35 + boost * 0.9);
    pulseT += delta * (1.2 + boost * 1.4);

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
            const next = pickGlyph();
            col.chars[idx] = next;
          }
        }
      }
      paintMatrix(matrixCtx, columns, 0.85 + boost * 0.45);
      matrixTex.needsUpdate = true;
    }

    const offset = (scanScrollT % 1) - Math.floor(scanScrollT % 1);
    scanTex.offset.y = offset;
    scanMat.opacity = 0.18 + boost * 0.22;

    const pulse = 0.5 + 0.5 * Math.sin(pulseT);
    glowMat.opacity = 0.42 + pulse * 0.18 + boost * 0.35;
  };

  const dispose = (): void => {
    matrixGeo.dispose();
    matrixMat.dispose();
    matrixTex.dispose();
    scanGeo.dispose();
    scanMat.dispose();
    scanTex.dispose();
    glowMat.dispose();
    glowTex.dispose();
  };

  return { group, tick, dispose };
}
