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

/** Shared no-op for the early-return paths (no 2D context, reduced motion). */
const NOOP_HANDLE: DataFeedConsoleHandle = { dispose: (): void => {} };

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
/** Slide-up animation duration when a new line bumps the oldest off the top. */
const SLIDE_DURATION_MS = 140;

function colorsFor(kind: LineKind, opacity: number): { prompt: string; text: string } {
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
  slideOffset: number,
): void {
  // Pure dark navy — no green channel above blue, so the panel stays
  // strictly cool. Slight transparency lets the page bg bleed through.
  ctx.fillStyle = 'rgba(3, 7, 18, 0.94)';
  ctx.fillRect(0, 0, w, h);

  ctx.font = `${FONT_SIZE}px "Courier New", monospace`;
  ctx.textBaseline = 'top';

  // Visible window: most recent MAX_LINES total (active counts as one).
  // When active exists and the buffer is full, the oldest buffer line
  // slides out of view at the top via slideOffset.
  const all: ConsoleLine[] = active ? [...buffer, active] : buffer;
  const visible = all.slice(-MAX_LINES);

  for (let i = 0; i < visible.length; i++) {
    const line = visible[i]!;
    const y = PAD_TOP + i * LINE_HEIGHT + slideOffset;
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
  if (!ctx) return NOOP_HANDLE;

  // Backing-store sizing. Re-runs if devicePixelRatio changes mid-session
  // (window dragged between monitors with different DPR).
  let cssW = canvas.clientWidth || canvas.width;
  let cssH = canvas.clientHeight || canvas.height;
  let lastDpr = window.devicePixelRatio || 1;

  const setupBackingStore = (): void => {
    cssW = canvas.clientWidth || canvas.width;
    cssH = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cssW * lastDpr);
    canvas.height = Math.round(cssH * lastDpr);
    // Setting canvas.width clears the 2D context state, so re-scale.
    ctx.scale(lastDpr, lastDpr);
  };
  setupBackingStore();

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
  let slideOffset = 0;
  let slideStartedAt = 0;

  paint(ctx, cssW, cssH, buffer, null, false, 0);

  if (reducedMotion) return NOOP_HANDLE;

  // Last-painted state — skip redundant paints when nothing visible
  // changed. Scrolls / typing / cursor blink / DPR change all flip this.
  let lastTyped = -1;
  let lastBufferLen = -1;
  let lastCursorOn = false;
  let lastSlideOffset = -1;
  let lastActive: ConsoleLine | null = null;

  let raf = 0;

  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);

    // DPR can change when the window moves between monitors; resync the
    // backing store and force a repaint when it does.
    const dpr = window.devicePixelRatio || 1;
    if (dpr !== lastDpr) {
      lastDpr = dpr;
      setupBackingStore();
      lastTyped = -2; // sentinel that never matches typedNow → forces paint
    }

    // Advance slide animation toward 0.
    if (slideOffset > 0) {
      const elapsed = now - slideStartedAt;
      const t = Math.min(1, elapsed / SLIDE_DURATION_MS);
      // easeOutCubic — fast at start, settles smoothly at the end.
      const eased = 1 - Math.pow(1 - t, 3);
      slideOffset = LINE_HEIGHT * (1 - eased);
      if (t >= 1) slideOffset = 0;
    }

    const cursorOn = Math.floor(now / CURSOR_BLINK_MS) % 2 === 0;

    if (!active) {
      if (now < pauseUntil) {
        // Pausing between lines — only repaint if the cursor blink
        // toggled or a slide is still in progress.
        if (cursorOn !== lastCursorOn || slideOffset !== lastSlideOffset) {
          paint(ctx, cssW, cssH, buffer, null, cursorOn, slideOffset);
          lastCursorOn = cursorOn;
          lastSlideOffset = slideOffset;
        }
        return;
      }
      // Start a new active line. If the buffer is already full, the new
      // line will displace the oldest from view — animate that.
      const spec = SCRIPT[scriptIdx]!;
      if (buffer.length >= MAX_LINES) {
        slideOffset = LINE_HEIGHT;
        slideStartedAt = now;
      }
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

    // Dirty-check before painting — at the cadence of typing (~50 ms per
    // char) most rAF frames don't change visible state, so this skips
    // ~2/3 of the per-frame paint work.
    const typedNow = active?.typed ?? -1;
    const dirty =
      lastActive !== active ||
      typedNow !== lastTyped ||
      buffer.length !== lastBufferLen ||
      cursorOn !== lastCursorOn ||
      slideOffset !== lastSlideOffset;
    if (dirty) {
      paint(ctx, cssW, cssH, buffer, active, cursorOn, slideOffset);
      lastActive = active;
      lastTyped = typedNow;
      lastBufferLen = buffer.length;
      lastCursorOn = cursorOn;
      lastSlideOffset = slideOffset;
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    dispose: (): void => {
      cancelAnimationFrame(raf);
    },
  };
}
