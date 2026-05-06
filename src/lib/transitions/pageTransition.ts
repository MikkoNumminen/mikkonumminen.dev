/**
 * Three-phase page transition.
 *
 *  Phase A — Departure (~350 ms).  Streaks pulled inward from random points
 *            around the viewport, motion-blurred via per-frame backdrop
 *            fade. Coloured with the SOURCE page's accent so the dissolve
 *            feels like the current page exhaling.
 *  Phase B — Glyph flash (~250 ms).  A single-line glyph specific to the
 *            destination is drawn at canvas centre with a radial bloom in
 *            the destination's accent. Tells the user where they are
 *            going before the new HTML even loads.
 *  Phase C — Arrival (~450 ms).  Streaks burst outward from centre in the
 *            destination's accent. Backdrop fades out; the new page is
 *            revealed underneath.
 *
 * Outbound flow on a link click: phase A → phase B → window.location.href.
 * Inbound flow on the destination page load: phase C runs once if a
 * sessionStorage marker is present.
 *
 * All colours are read at runtime from CSS custom properties on
 * `document.documentElement` (`--color-{theme}-accent`), so the transition
 * stays in sync with the design tokens defined in `global.css`. No
 * separate palette table to drift.
 */

import type { Theme } from '../theme';
// Deep import (`/routing` rather than the `/i18n` barrel) — we only need
// path manipulation, not the locale dictionaries. Importing from the
// barrel would force en / fi / sv translation maps into every page's
// runtime bundle since the page-transition module loads on all routes.
import { stripLocale } from '../../i18n/routing';

declare global {
  // eslint-disable-next-line no-var
  var __pageTransitionAbortController: AbortController | undefined;
}

const SESSION_KEY = '__mn_transition_in';
const SESSION_THEME_KEY = '__mn_transition_theme';

/**
 * Fallback accents in case `getComputedStyle` returns an empty string
 * (e.g. style sheet hasn't applied yet, browser quirk). These match the
 * `--color-{theme}-accent` tokens defined in `src/styles/global.css`.
 */
const FALLBACK_ACCENT: Record<Theme, string> = {
  home: '#c4d4ff',
  projects: '#80a8ff',
  experience: '#d4ff80',
  contact: '#b5f5c8',
};

const STREAK_COUNT = 180;
const PHASE_A_MS = 350;
const PHASE_B_MS = 250;
const PHASE_C_MS = 450;
const DEFAULT_THEME: Theme = 'home';
const BACKDROP = '#05060e';

interface Streak {
  /** Where the streak starts (constant for the duration of the phase). */
  ox: number;
  oy: number;
  /** Where the streak ends. */
  tx: number;
  ty: number;
  /** Stroke width in CSS pixels. */
  size: number;
  /** Per-streak time offset in [0, 1) so the swarm doesn't move in lockstep. */
  delay: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t: number): number {
  return t * t * t;
}

function pickTheme(href: string): Theme {
  // Strip the locale prefix so a click from `/fi/` to `/fi/projects` resolves
  // to the projects theme (not the default home), giving fi / sv users the
  // correct destination glyph.
  const path = stripLocale(new URL(href, window.location.origin).pathname);
  if (path.startsWith('/projects')) return 'projects';
  if (path.startsWith('/experience')) return 'experience';
  if (path.startsWith('/contact')) return 'contact';
  return 'home';
}

function isValidTheme(value: string | null): value is Theme {
  return (
    value === 'home' ||
    value === 'projects' ||
    value === 'experience' ||
    value === 'contact'
  );
}

function readAccent(theme: Theme): string {
  const styles = getComputedStyle(document.documentElement);
  const value = styles.getPropertyValue(`--color-${theme}-accent`).trim();
  return value || FALLBACK_ACCENT[theme];
}

function currentTheme(): Theme {
  const raw = document.body.dataset.theme ?? null;
  return isValidTheme(raw) ? raw : DEFAULT_THEME;
}

function isInternalLink(anchor: HTMLAnchorElement): boolean {
  if (anchor.hasAttribute('download')) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.dataset.transition === 'false') return false;
  if (anchor.rel && anchor.rel.split(/\s+/).includes('external')) return false;
  const url = new URL(anchor.href, window.location.origin);
  // Explicit allow-list — relying on `origin` mismatch to filter mailto:/tel:/
  // javascript: links was fragile and easy to regress on. Reject anything
  // that isn't a navigable HTTP(S) URL.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────────
// Glyphs — one per destination theme. Drawn at canvas centre during
// phase B as a single-colour line drawing that hints at the destination
// page's identity. Each takes a progress 0..1 and an accent colour and
// renders into the current ctx state (caller handles translate/scale/
// shadowBlur). All of them honour `t` so the strokes "draw in" rather
// than popping.
// ────────────────────────────────────────────────────────────────────

type GlyphFn = (
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
  accent: string,
) => void;

/** Home: concentric rings expanding around a bright centre dot. */
function drawGlyphHome(
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
  accent: string,
): void {
  const draw = Math.min(1, t * 1.4);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.5, size * 0.012);
  for (let i = 0; i < 3; i++) {
    const r = size * (0.18 + i * 0.16) * draw;
    ctx.globalAlpha = 1 - i * 0.22;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.045 * draw, 0, Math.PI * 2);
  ctx.fill();
}

/** Projects: tilted orbit ring with a planet at centre + a satellite on the orbit. */
function drawGlyphProjects(
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
  accent: string,
): void {
  const draw = Math.min(1, t * 1.4);
  // Orbit
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.5, size * 0.012);
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    size * 0.5 * draw,
    size * 0.18 * draw,
    -0.35,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  // Planet
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.13 * draw, 0, Math.PI * 2);
  ctx.fill();
  // Satellite — sits on the orbit at a fixed angle for a stable silhouette.
  const satAngle = -0.4;
  const sx = Math.cos(satAngle) * size * 0.5 * draw;
  const sy = Math.sin(satAngle) * size * 0.18 * draw;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sx, sy, size * 0.035 * draw, 0, Math.PI * 2);
  ctx.fill();
}

/** Experience: mountain peak (white line) + sun (filled accent). */
function drawGlyphExperience(
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
  accent: string,
): void {
  const draw = Math.min(1, t * 1.4);
  // Sun behind/above the peak.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(size * 0.18, -size * 0.18, size * 0.13 * draw, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Mountain — single triangle stroke, line-joined for clean peak.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, size * 0.018);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const peakY = -size * 0.42 * draw;
  const baseY = size * 0.24;
  const halfBase = size * 0.42;
  ctx.moveTo(-halfBase, baseY);
  ctx.lineTo(0, peakY);
  ctx.lineTo(halfBase, baseY);
  ctx.stroke();
}

/** Contact: terminal prompt — chevron `>` followed by a blinking underscore. */
function drawGlyphContact(
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
  accent: string,
): void {
  const draw = Math.min(1, t * 1.4);
  // Chevron `>`
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, size * 0.022);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cxPos = -size * 0.16;
  const cs = size * 0.18 * draw;
  ctx.beginPath();
  ctx.moveTo(cxPos - cs * 0.7, -cs * 0.75);
  ctx.lineTo(cxPos + cs * 0.5, 0);
  ctx.lineTo(cxPos - cs * 0.7, cs * 0.75);
  ctx.stroke();
  // Blinking underscore — one full cycle (~4 Hz) across the 250 ms phase
  // so it reads as a deliberate cursor blink, not a shimmer.
  const blink = 0.55 + Math.sin(t * Math.PI * 2) * 0.45;
  ctx.globalAlpha = blink;
  ctx.fillStyle = accent;
  ctx.fillRect(size * 0.06, -size * 0.025, size * 0.2 * draw, size * 0.06);
  ctx.globalAlpha = 1;
}

const GLYPHS: Record<Theme, GlyphFn> = {
  home: drawGlyphHome,
  projects: drawGlyphProjects,
  experience: drawGlyphExperience,
  contact: drawGlyphContact,
};

// ────────────────────────────────────────────────────────────────────
// Runtime
// ────────────────────────────────────────────────────────────────────

class TransitionRunner {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private overlay: HTMLElement;
  private streaks: Streak[];
  private raf = 0;
  // Stored as a bound field so it's removable in dispose().
  private onResize: () => void;

  private constructor(
    overlay: HTMLElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ) {
    this.overlay = overlay;
    this.canvas = canvas;
    this.ctx = ctx;
    // Pre-allocate the streak pool once and mutate fields in place during
    // each phase's spawn step. Cuts GC churn during the most performance-
    // critical moment.
    this.streaks = new Array(STREAK_COUNT);
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streaks[i] = { ox: 0, oy: 0, tx: 0, ty: 0, size: 0, delay: 0 };
    }
    this.onResize = (): void => this.resize();
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Constructor that returns null on locked-down browsers / extensions
   * that block 2D canvas. Callers must early-return on null.
   */
  static create(
    overlay: HTMLElement,
    canvas: HTMLCanvasElement,
  ): TransitionRunner | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return new TransitionRunner(overlay, canvas, ctx);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Configure streaks for "departure": from edges → toward centre. */
  private spawnStreaksInward(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    const maxDim = Math.hypot(w, h) * 0.6;

    for (let i = 0; i < STREAK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = maxDim * (0.7 + Math.random() * 0.4);
      const ox = cx + Math.cos(angle) * r;
      const oy = cy + Math.sin(angle) * r;
      // Target near centre with a slight angular offset so trails
      // don't all converge on a single pixel.
      const ta = angle + (Math.random() - 0.5) * 0.4;
      const tr = Math.random() * 80;
      const tx = cx + Math.cos(ta) * tr;
      const ty = cy + Math.sin(ta) * tr;
      const s = this.streaks[i];
      // Pool is pre-allocated so this guard is unreachable, but it
      // satisfies noUncheckedIndexedAccess.
      if (!s) continue;
      s.ox = ox;
      s.oy = oy;
      s.tx = tx;
      s.ty = ty;
      s.size = 1.5 + Math.random() * 3;
      s.delay = Math.random() * 0.3;
    }
  }

  /** Configure streaks for "arrival": from centre → out to edges. */
  private spawnStreaksOutward(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    const maxDim = Math.hypot(w, h) * 0.6;

    for (let i = 0; i < STREAK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Origin: small cluster near centre.
      const or = Math.random() * 60;
      const ox = cx + Math.cos(angle) * or;
      const oy = cy + Math.sin(angle) * or;
      // Target: well past the viewport edge so streaks fly off-screen.
      const tr = maxDim * (0.85 + Math.random() * 0.5);
      const tx = cx + Math.cos(angle) * tr;
      const ty = cy + Math.sin(angle) * tr;
      const s = this.streaks[i];
      if (!s) continue;
      s.ox = ox;
      s.oy = oy;
      s.tx = tx;
      s.ty = ty;
      s.size = 1.5 + Math.random() * 3;
      s.delay = Math.random() * 0.3;
    }
  }

  /**
   * Draw all streaks at the given phase progress. Each streak is rendered
   * as a tapered line from a tail point (offset behind the head along the
   * direction of travel) to the current head position. The tail length
   * grows with the easing derivative — fast = long streak, slow = short.
   */
  private drawStreaks(progress: number, color: string, alphaMul: number): void {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;

    for (const s of this.streaks) {
      const local = Math.max(0, Math.min(1, (progress - s.delay) / (1 - s.delay)));
      if (local <= 0) continue;
      const e = easeOutCubic(local);
      const px = s.ox + (s.tx - s.ox) * e;
      const py = s.oy + (s.ty - s.oy) * e;
      // Tail length scales with the derivative of easeOutCubic so streaks
      // are longest at the start of motion and shrink to a dot as they
      // settle. (d/dt of 1-(1-t)^3 = 3(1-t)^2.)
      const speed = 3 * (1 - local) * (1 - local);
      const tailLen = 28 + speed * 95;
      const dx = s.tx - s.ox;
      const dy = s.ty - s.oy;
      const dlen = Math.hypot(dx, dy);
      if (dlen < 0.01) continue;
      const ux = dx / dlen;
      const uy = dy / dlen;
      const tailX = px - ux * tailLen;
      const tailY = py - uy * tailLen;

      const alpha = (1 - Math.pow(local, 3)) * alphaMul;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ─── Phase A — Departure ─────────────────────────────────────
  phaseA(srcTheme: Theme): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.dataset.state = 'animating';
      this.spawnStreaksInward();
      const accent = readAccent(srcTheme);
      const start = performance.now();

      const tick = (now: number): void => {
        const t = Math.min(1, (now - start) / PHASE_A_MS);
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Backdrop alpha grows from light wash to near-opaque as the
        // streaks gather in. The semi-transparent fill replaces clearRect
        // so previous frames' streaks linger as a motion blur trail.
        this.ctx.fillStyle = `rgba(5, 6, 14, ${0.18 + easeOutCubic(t) * 0.7})`;
        this.ctx.fillRect(0, 0, w, h);

        this.drawStreaks(t, accent, 1);

        // Subtle inward radial bloom that intensifies with progress —
        // visual cue that energy is collecting at the centre.
        const grad = this.ctx.createRadialGradient(
          w / 2,
          h / 2,
          0,
          w / 2,
          h / 2,
          Math.hypot(w, h) * 0.4,
        );
        const bloomA = easeInCubic(t) * 0.1;
        grad.addColorStop(0, `rgba(255, 255, 255, ${bloomA})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, w, h);

        if (t < 1) {
          this.raf = requestAnimationFrame(tick);
        } else {
          // Lock in a fully opaque cover before phase B takes over.
          this.ctx.fillStyle = BACKDROP;
          this.ctx.fillRect(0, 0, w, h);
          resolve();
        }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  // ─── Phase B — Glyph flash ───────────────────────────────────
  // Streak pool retains phase A coordinates but is intentionally not drawn
  // here — phase A's last frame leaves an opaque BACKDROP fill, and phase B
  // only renders the bloom + glyph on top of that solid backdrop.
  phaseB(dstTheme: Theme): Promise<void> {
    return new Promise((resolve) => {
      const accent = readAccent(dstTheme);
      // Parse the accent ONCE so the per-frame gradient stops can do a
      // cheap string concatenation instead of regex + parseInt × 3 each
      // tick. The prefix string holds everything except the alpha; the
      // tick appends `${alpha})` per stop.
      const rgb = parseAccentRgb(accent, this.ctx);
      const rgbPrefix = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, `;
      const glyph = GLYPHS[dstTheme];
      const start = performance.now();

      const tick = (now: number): void => {
        const t = Math.min(1, (now - start) / PHASE_B_MS);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = w / 2;
        const cy = h / 2;
        const size = Math.min(w, h) * 0.4;

        // Backdrop: solid black underneath everything.
        this.ctx.fillStyle = BACKDROP;
        this.ctx.fillRect(0, 0, w, h);

        // Radial bloom in the destination accent. Peaks at t=0.5 and
        // fades back to a soft halo at t=1 so the next phase opens
        // without a jarring intensity drop.
        const bloomT = Math.sin(t * Math.PI);
        const radius = size * (1.2 + bloomT * 0.4);
        const bloom = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        bloom.addColorStop(0, `${rgbPrefix}${0.55 * bloomT})`);
        bloom.addColorStop(0.5, `${rgbPrefix}${0.18 * bloomT})`);
        bloom.addColorStop(1, `${rgbPrefix}0)`);
        this.ctx.fillStyle = bloom;
        this.ctx.fillRect(0, 0, w, h);

        // Glyph centred, scaled with the same sin-pulse so it punches
        // visually at the same beat as the bloom.
        this.ctx.save();
        this.ctx.translate(cx, cy);
        const scale = 0.78 + bloomT * 0.28;
        this.ctx.scale(scale, scale);
        this.ctx.shadowColor = accent;
        // shadowBlur is software-rasterised on Canvas 2D in most browsers
        // — keep it modest so low-end devices don't stutter during phase B.
        this.ctx.shadowBlur = 16;
        glyph(this.ctx, size, t, accent);
        this.ctx.restore();

        if (t < 1) {
          this.raf = requestAnimationFrame(tick);
        } else {
          // Cover with backdrop so navigation lands on a clean canvas.
          this.ctx.fillStyle = BACKDROP;
          this.ctx.fillRect(0, 0, w, h);
          resolve();
        }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  // ─── Phase C — Arrival ───────────────────────────────────────
  phaseC(dstTheme: Theme): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.dataset.state = 'animating';
      this.spawnStreaksOutward();
      const accent = readAccent(dstTheme);
      const start = performance.now();

      // Pre-fill so the very first frame doesn't flash an empty canvas.
      this.ctx.fillStyle = BACKDROP;
      this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      const tick = (now: number): void => {
        const t = Math.min(1, (now - start) / PHASE_C_MS);
        const w = window.innerWidth;
        const h = window.innerHeight;

        this.ctx.clearRect(0, 0, w, h);
        // Backdrop fades from opaque to transparent as the new page
        // is revealed beneath the canvas.
        this.ctx.fillStyle = `rgba(5, 6, 14, ${1 - easeInCubic(t)})`;
        this.ctx.fillRect(0, 0, w, h);

        // Streaks fade slightly with progress so they don't fight the
        // new page's content for attention as they leave the viewport.
        this.drawStreaks(t, accent, 1 - t * 0.3);

        if (t < 1) {
          this.raf = requestAnimationFrame(tick);
        } else {
          this.ctx.clearRect(0, 0, w, h);
          this.overlay.dataset.state = 'idle';
          resolve();
        }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  cancel(): void {
    cancelAnimationFrame(this.raf);
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    this.overlay.dataset.state = 'idle';
  }

  /** Tear down listeners and any in-flight animation. */
  dispose(): void {
    this.cancel();
    window.removeEventListener('resize', this.onResize);
  }
}

interface AccentRgb {
  r: number;
  g: number;
  b: number;
}

const FALLBACK_RGB: AccentRgb = { r: 255, g: 255, b: 255 };

/**
 * Parse a CSS colour value to a concrete `{ r, g, b }` triple. Called once
 * per phase (not per frame) so the bloom gradient's stops can interpolate
 * alpha cheaply via string concatenation against a pre-built
 * `rgba(r, g, b, ` prefix — no regex or `parseInt` in the tick loop.
 *
 * Fast path handles the hex formats our `--color-*-accent` tokens use
 * today (`#rrggbb`, `#rgb`). Slow path delegates to the canvas's own
 * colour normalisation: setting `fillStyle` to any valid CSS colour and
 * reading it back returns `#rrggbb` or `rgba(r, g, b, a)`. This makes
 * the function tolerant of future token formats (named colours, `rgb()`,
 * `oklch()`, …) without code changes here. Returns white on parse
 * failure so the gradient never silently goes invisible.
 */
function parseAccentRgb(
  input: string,
  ctx: CanvasRenderingContext2D,
): AccentRgb {
  const hex6 = /^#([0-9a-f]{6})$/i.exec(input);
  if (hex6) {
    const h = hex6[1] ?? '';
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(input);
  if (hex3) {
    const r = hex3[1] ?? '0';
    const g = hex3[2] ?? '0';
    const b = hex3[3] ?? '0';
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  // Slow path: canvas-delegated normalisation. Invalid input doesn't
  // update `fillStyle`, so we set a sentinel first and fall back to
  // white if the read-back still equals it.
  const SENTINEL = '#010203';
  const previousFillStyle = ctx.fillStyle;
  ctx.fillStyle = SENTINEL;
  ctx.fillStyle = input;
  const normalised = ctx.fillStyle;
  // Restore so the parse has no observable side effect on the caller.
  ctx.fillStyle = previousFillStyle;
  if (typeof normalised !== 'string' || normalised === SENTINEL) {
    return FALLBACK_RGB;
  }
  const fromHex = /^#([0-9a-f]{6})$/i.exec(normalised);
  if (fromHex) {
    const h = fromHex[1] ?? '';
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const fromRgb =
    /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/i.exec(
      normalised,
    );
  if (fromRgb) {
    return {
      r: Math.round(parseFloat(fromRgb[1] ?? '0')),
      g: Math.round(parseFloat(fromRgb[2] ?? '0')),
      b: Math.round(parseFloat(fromRgb[3] ?? '0')),
    };
  }
  return FALLBACK_RGB;
}

export function initPageTransitions(): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  const overlay = document.getElementById('page-transition-overlay');
  const canvas = document.getElementById(
    'page-transition-canvas',
  ) as HTMLCanvasElement | null;
  if (!overlay || !canvas) return;

  const runner = TransitionRunner.create(overlay, canvas);
  // Locked-down browsers and Canvas-blocking extensions return null here.
  // We early-return rather than crash the entire transition layer.
  if (!runner) return;

  // Abort any previous listener registration (handles HMR re-evaluation
  // and accidental double-calls cleanly without stacking duplicate
  // listeners).
  globalThis.__pageTransitionAbortController?.abort();
  const controller = new AbortController();
  globalThis.__pageTransitionAbortController = controller;
  const { signal } = controller;

  // Guard against a second click firing while a transition is already
  // running. A second click would otherwise start a parallel phase A
  // and orphan the first one's RAF.
  let navigating = false;

  // ── Inbound: if a previous page set the session marker, run phase C ──
  try {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      const stored = sessionStorage.getItem(SESSION_THEME_KEY);
      const theme: Theme = isValidTheme(stored) ? stored : DEFAULT_THEME;
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_THEME_KEY);
      overlay.dataset.state = 'animating';
      runner.phaseC(theme);
    }
  } catch {
    /* sessionStorage may be unavailable; ignore */
  }

  // ── Outbound: intercept link clicks and run phase A → B → navigate ──
  document.addEventListener(
    'click',
    (e) => {
      if (navigating) return;
      // Modifier keys → let the browser handle normally (open in new tab, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
      if (!isInternalLink(anchor)) return;

      e.preventDefault();
      const href = anchor.href;
      const dstTheme = pickTheme(href);
      const srcTheme = currentTheme();

      try {
        sessionStorage.setItem(SESSION_KEY, '1');
        sessionStorage.setItem(SESSION_THEME_KEY, dstTheme);
      } catch {
        /* ignore */
      }

      navigating = true;
      runner
        .phaseA(srcTheme)
        .then(() => runner.phaseB(dstTheme))
        .then(() => {
          window.location.href = href;
        });
    },
    { capture: true, signal },
  );

  // bfcache: a back-forward cached page restoration shouldn't leave the
  // overlay stuck in "animating" state.
  window.addEventListener(
    'pageshow',
    (e) => {
      if (e.persisted) {
        navigating = false;
        runner.cancel();
      }
    },
    { signal },
  );
}
