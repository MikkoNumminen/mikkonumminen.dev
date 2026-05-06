/**
 * Particle-burst page transition.
 *
 * On internal link clicks: particles burst outward from random points until
 * they cover the screen, then the browser navigates. On the destination page,
 * particles converge inward and fade away, revealing the new page.
 *
 * Particle color matches the destination page's theme. Detection happens
 * via a `data-nav-theme` attribute on the link.
 */

import type { Theme } from '../theme';

// Make the type available to the globalThis augmentation below.
declare global {
  // eslint-disable-next-line no-var
  var __pageTransitionAbortController: AbortController | undefined;
}

interface Particle {
  x: number;
  y: number;
  /** Origin and target positions for the current animation */
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  size: number;
  color: string;
  delay: number;
}

const SESSION_KEY = '__mn_transition_in';
const SESSION_THEME_KEY = '__mn_transition_theme';

const PALETTES: Record<Theme, string[]> = {
  home: ['#ffffff', '#c4d4ff', '#80a8ff'],
  projects: ['#80a8ff', '#5b8def', '#c4d4ff', '#ffffff'],
  experience: ['#d4ff80', '#a8d480', '#f5b87a', '#ffe070'],
  contact: ['#4ade80', '#86efac', '#67e8f9', '#ffffff'],
};

const PARTICLE_COUNT = 240;
const DEFAULT_THEME: Theme = 'home';

function pickTheme(href: string): Theme {
  // Match URL prefixes against our four pages
  const path = new URL(href, window.location.origin).pathname;
  if (path.startsWith('/projects')) return 'projects';
  if (path.startsWith('/experience')) return 'experience';
  if (path.startsWith('/contact')) return 'contact';
  return 'home';
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

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

class TransitionRunner {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[];
  private raf = 0;
  private overlay: HTMLElement;
  // Stored as a bound field so it's removable in dispose(). The previous
  // inline arrow form was permanently leaked on every init.
  private onResize: () => void;

  private constructor(
    overlay: HTMLElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ) {
    this.overlay = overlay;
    this.canvas = canvas;
    this.ctx = ctx;
    // Pre-allocate the particle pool once and mutate fields in place during
    // spawnParticles. Cuts GC churn during the most performance-critical moment.
    this.particles = new Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles[i] = {
        x: 0,
        y: 0,
        ox: 0,
        oy: 0,
        tx: 0,
        ty: 0,
        size: 0,
        color: '#ffffff',
        delay: 0,
      };
    }
    this.onResize = (): void => this.resize();
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Constructor that returns null on locked-down browsers / extensions that
   * block 2D canvas. Callers must early-return on null.
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

  private spawnParticles(theme: Theme, mode: 'out' | 'in'): void {
    const palette = PALETTES[theme];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    const maxDim = Math.max(w, h);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Distribute targets across the screen with some clustering toward
      // the centre so the animation feels organic.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * maxDim * 0.85;
      const tx = cx + Math.cos(angle) * radius;
      const ty = cy + Math.sin(angle) * radius;
      // noUncheckedIndexedAccess-friendly: palette[..] is `string | undefined`,
      // so fall back to a known safe color when the random index lands oddly.
      const color = palette[Math.floor(Math.random() * palette.length)] ?? '#ffffff';
      const size = 6 + Math.random() * 16;
      const delay = Math.random() * 0.25;

      // Origin depends on mode: 'out' bursts from a tight cluster near the
      // centre, 'in' converges from outside the viewport. Everything else is
      // identical, so compute (ox, oy) once and reuse the assignment block.
      const oa = Math.random() * Math.PI * 2;
      const or =
        mode === 'out' ? Math.random() * 60 : maxDim * (0.6 + Math.random() * 0.4);
      const ox = cx + Math.cos(oa) * or;
      const oy = cy + Math.sin(oa) * or;

      const p = this.particles[i];
      // Pool is pre-allocated in the constructor; this assignment is unreachable.
      if (!p) continue;
      p.x = ox;
      p.y = oy;
      p.ox = ox;
      p.oy = oy;
      p.tx = tx;
      p.ty = ty;
      p.size = size;
      p.color = color;
      p.delay = delay;
    }
  }

  /**
   * Burst outward animation. Resolves when complete.
   */
  burstOut(theme: Theme): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.dataset.state = 'animating';
      this.spawnParticles(theme, 'out');

      const duration = 650;
      const start = performance.now();

      const tick = (now: number): void => {
        const t = Math.min(1, (now - start) / duration);
        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        // Draw a darkening backdrop that grows with progress
        this.ctx.fillStyle = `rgba(5, 6, 14, ${easeOutCubic(t) * 0.95})`;
        this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        for (const p of this.particles) {
          const local = Math.max(0, Math.min(1, (t - p.delay) / (1 - p.delay)));
          const e = easeOutCubic(local);
          const px = p.ox + (p.tx - p.ox) * e;
          const py = p.oy + (p.ty - p.oy) * e;
          const alpha = 1 - Math.pow(local, 4) * 0.2; // stay mostly bright
          this.ctx.globalAlpha = alpha * (local > 0 ? 1 : 0);
          this.ctx.fillStyle = p.color;
          this.ctx.beginPath();
          this.ctx.arc(px, py, p.size * (0.4 + e * 0.6), 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;

        if (t < 1) {
          this.raf = requestAnimationFrame(tick);
        } else {
          // Hold a fully opaque cover for navigation
          this.ctx.fillStyle = '#05060e';
          this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
          resolve();
        }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  /**
   * Converge inward animation. Used on the destination page after navigation.
   */
  convergeIn(theme: Theme): Promise<void> {
    return new Promise((resolve) => {
      this.overlay.dataset.state = 'animating';
      this.spawnParticles(theme, 'in');

      // Pre-fill the screen so there's no flash before the first frame
      this.ctx.fillStyle = '#05060e';
      this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      const duration = 800;
      const start = performance.now();

      const tick = (now: number): void => {
        const t = Math.min(1, (now - start) / duration);
        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        // The backdrop fades from full to transparent
        this.ctx.fillStyle = `rgba(5, 6, 14, ${1 - easeInCubic(t)})`;
        this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        for (const p of this.particles) {
          const local = Math.max(0, Math.min(1, (t - p.delay) / (1 - p.delay)));
          const e = easeOutCubic(local);
          const px = p.ox + (p.tx - p.ox) * e;
          const py = p.oy + (p.ty - p.oy) * e;
          // Particles fade out as they reach their target so the page is revealed
          const alpha = 1 - Math.pow(local, 1.4);
          this.ctx.globalAlpha = alpha;
          this.ctx.fillStyle = p.color;
          this.ctx.beginPath();
          this.ctx.arc(px, py, p.size * (1 - local * 0.4), 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;

        if (t < 1) {
          this.raf = requestAnimationFrame(tick);
        } else {
          this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
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

  // Abort any previous listener registration (handles HMR re-evaluation and
  // accidental double-calls cleanly without stacking duplicate listeners).
  globalThis.__pageTransitionAbortController?.abort();
  const controller = new AbortController();
  globalThis.__pageTransitionAbortController = controller;
  const { signal } = controller;

  // Guard against a second click firing while a burstOut is already running.
  let navigating = false;

  // ── Inbound: if a previous page set the session marker, run convergeIn ──
  try {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      const stored = sessionStorage.getItem(SESSION_THEME_KEY);
      // Validate the stored theme against PALETTES rather than blindly casting.
      // Stale storage from a previous deploy could otherwise yield an
      // undefined palette downstream.
      const theme: Theme =
        stored && stored in PALETTES ? (stored as Theme) : DEFAULT_THEME;
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_THEME_KEY);
      overlay.dataset.state = 'animating';
      runner.convergeIn(theme);
    }
  } catch {
    /* sessionStorage may be unavailable; ignore */
  }

  // ── Outbound: intercept link clicks ──────────────────────────────────
  document.addEventListener(
    'click',
    (e) => {
      // Ignore clicks while a transition is already in flight.
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
      const theme = pickTheme(href);

      try {
        sessionStorage.setItem(SESSION_KEY, '1');
        sessionStorage.setItem(SESSION_THEME_KEY, theme);
      } catch {
        /* ignore */
      }

      navigating = true;
      runner.burstOut(theme).then(() => {
        window.location.href = href;
      });
    },
    { capture: true, signal },
  );

  // Clean up if the user uses bfcache
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
