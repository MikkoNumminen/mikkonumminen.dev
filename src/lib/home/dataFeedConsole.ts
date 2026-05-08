/**
 * "Someone is typing in a console" widget for the hero's editorial
 * corner. Renders short shell-style lines being typed character-by-
 * character with a blinking block cursor and a scrolling buffer of
 * recent commands. Strict cool-cyan palette — no green tint anywhere.
 *
 * Standalone DOM canvas (not Three.js) — the widget is screen-space
 * UI, so keeping it out of the scene graph lets it stay precisely
 * positioned regardless of camera sway.
 */

export interface DataFeedConsoleHandle {
  dispose: () => void;
}

type LineKind = 'cmd' | 'out' | 'status';

interface ConsoleLine {
  text: string;
  kind: LineKind;
  /** Number of chars typed so far. Equal to text.length when complete. */
  typed: number;
}

interface LineSpec {
  text: string;
  kind: LineKind;
}

/**
 * Loop of fake shell activity. Cycles indefinitely so the corner reads
 * as "this terminal is alive". Mix of $ commands, > responses, and
 * occasional * status lines. Kept short so the cascade fits the canvas.
 */
const SCRIPT: ReadonlyArray<LineSpec> = [
  { text: '$ probe geo', kind: 'cmd' },
  { text: '> 61° N · 24° E', kind: 'out' },
  { text: '> rtt 14ms', kind: 'out' },
  { text: '$ stream open ch-01', kind: 'cmd' },
  { text: '> handshake ok', kind: 'out' },
  { text: '* receiving', kind: 'status' },
  { text: '$ buffer flush', kind: 'cmd' },
  { text: '> 0x4f2a ok', kind: 'out' },
  { text: '$ ping 24°E', kind: 'cmd' },
  { text: '> ack 14ms', kind: 'out' },
  { text: '$ render hero', kind: 'cmd' },
  { text: '> 6 sections ok', kind: 'out' },
  { text: '$ track scroll', kind: 'cmd' },
  { text: '> bound (0..1)', kind: 'out' },
  { text: '* idle', kind: 'status' },
];

const FONT_SIZE = 10;
const LINE_HEIGHT = 13;
const MAX_LINES = 5;
const PAD_X = 6;
const PAD_TOP = 4;
const CHAR_MIN_MS = 28;
const CHAR_MAX_MS = 64;
const PAUSE_MIN_MS = 380;
const PAUSE_MAX_MS = 720;
const CURSOR_BLINK_MS = 520;

function colorsFor(kind: LineKind, opacity: number): {
  prompt: string;
  text: string;
} {
  switch (kind) {
    case 'cmd':
      return {
        prompt: `rgba(111, 207, 224, ${opacity})`,
        text: `rgba(220, 240, 255, ${opacity})`,
      };
    case 'out':
      return {
        prompt: `rgba(95, 200, 230, ${opacity * 0.85})`,
        text: `rgba(180, 220, 240, ${opacity * 0.85})`,
      };
    case 'status':
      return {
        prompt: `rgba(140, 200, 220, ${opacity * 0.7})`,
        text: `rgba(200, 220, 240, ${opacity * 0.7})`,
      };
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  line: ConsoleLine,
  y: number,
  opacity: number,
): void {
  const shown = line.text.slice(0, line.typed);
  if (shown.length === 0) return;

  const { prompt, text } = colorsFor(line.kind, opacity);
  const promptChar = shown.charAt(0);
  ctx.fillStyle = prompt;
  ctx.fillText(promptChar, PAD_X, y);
  if (shown.length > 1) {
    const promptWidth = ctx.measureText(promptChar).width;
    ctx.fillStyle = text;
    ctx.fillText(shown.slice(1), PAD_X + promptWidth, y);
  }
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  buffer: ConsoleLine[],
  active: ConsoleLine | null,
  cursorVisible: boolean,
): void {
  // Pure dark navy — no green channel above blue, so the panel stays
  // strictly cool. Slight transparency lets the page bg bleed through.
  ctx.fillStyle = 'rgba(3, 7, 18, 0.94)';
  ctx.fillRect(0, 0, w, h);

  ctx.font = `${FONT_SIZE}px "Courier New", monospace`;
  ctx.textBaseline = 'top';

  // Visible window: most recent MAX_LINES total (active counts as one).
  // When active exists and the buffer is full, the oldest buffer line
  // slides out of view at the top.
  const all: ConsoleLine[] = active ? [...buffer, active] : buffer;
  const visible = all.slice(-MAX_LINES);

  for (let i = 0; i < visible.length; i++) {
    const line = visible[i]!;
    const y = PAD_TOP + i * LINE_HEIGHT;
    const isActive = line === active;
    // Older lines fade by row; the active line is always full opacity.
    const ageOffset = visible.length - 1 - i;
    const opacity = isActive ? 1 : Math.max(0.25, 0.85 - ageOffset * 0.13);
    drawLine(ctx, line, y, opacity);

    if (isActive && cursorVisible) {
      const shown = line.text.slice(0, line.typed);
      const tw = shown.length > 0 ? ctx.measureText(shown).width : 0;
      ctx.fillStyle = 'rgba(111, 207, 224, 0.9)';
      ctx.fillRect(PAD_X + tw + 2, y + 1, 5, LINE_HEIGHT - 4);
    }
  }
}

export function buildDataFeedConsole(
  canvas: HTMLCanvasElement,
  reducedMotion: boolean,
): DataFeedConsoleHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dispose: (): void => {} };

  // Match the canvas backing store to the displayed CSS size × DPR so
  // the small text renders crisp on retina/3× displays.
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.scale(dpr, dpr);

  // Pre-fill with MAX_LINES-1 fully-typed lines so the widget is never
  // blank on first paint (and reduced-motion clients see a populated
  // terminal, not an empty box waiting on an animation that won't run).
  const buffer: ConsoleLine[] = [];
  const preFill = Math.min(MAX_LINES - 1, SCRIPT.length);
  for (let i = 0; i < preFill; i++) {
    const spec = SCRIPT[i]!;
    buffer.push({ text: spec.text, kind: spec.kind, typed: spec.text.length });
  }
  let scriptIdx = preFill % SCRIPT.length;

  let active: ConsoleLine | null = null;
  let nextCharAt = 0;
  let pauseUntil = 0;

  paint(ctx, cssW, cssH, buffer, null, false);

  if (reducedMotion) {
    return { dispose: (): void => {} };
  }

  let raf = 0;

  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);

    const cursorOn = Math.floor(now / CURSOR_BLINK_MS) % 2 === 0;

    if (!active) {
      if (now < pauseUntil) {
        // Still pausing between lines; repaint for cursor blink only.
        paint(ctx, cssW, cssH, buffer, null, cursorOn);
        return;
      }
      const spec = SCRIPT[scriptIdx]!;
      active = { text: spec.text, kind: spec.kind, typed: 0 };
      scriptIdx = (scriptIdx + 1) % SCRIPT.length;
      nextCharAt = now;
    }

    while (active.typed < active.text.length && now >= nextCharAt) {
      active.typed++;
      nextCharAt += CHAR_MIN_MS + Math.random() * (CHAR_MAX_MS - CHAR_MIN_MS);
    }

    if (active.typed >= active.text.length) {
      buffer.push(active);
      while (buffer.length > MAX_LINES) buffer.shift();
      active = null;
      pauseUntil = now + PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
    }

    paint(ctx, cssW, cssH, buffer, active, cursorOn);
  };
  raf = requestAnimationFrame(tick);

  return {
    dispose: (): void => {
      cancelAnimationFrame(raf);
    },
  };
}
