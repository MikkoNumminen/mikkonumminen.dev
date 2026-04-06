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

type Theme = 'home' | 'projects' | 'experience' | 'contact';

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
  const url = new URL(anchor.href, window.location.origin);
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
  private particles: Particle[] = [];
  private raf = 0;
  private overlay: HTMLElement;

  constructor(overlay: HTMLElement, canvas: HTMLCanvasElement) {
    this.overlay = overlay;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private spawnParticles(theme: Theme, mode: 'out' | 'in') {
    const palette = PALETTES[theme];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;

    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Distribute targets across the screen with some clustering toward
      // the centre so the animation feels organic.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * Math.max(w, h) * 0.85;
      const sx = cx + Math.cos(angle) * radius;
      const sy = cy + Math.sin(angle) * radius;
      const color = palette[Math.floor(Math.random() * palette.length)]!;
      const size = 6 + Math.random() * 16;
      const delay = Math.random() * 0.25;

      if (mode === 'out') {
        // burst from clustered origins toward random screen positions
        const oa = Math.random() * Math.PI * 2;
        const or = Math.random() * 60;
        this.particles.push({
          x: cx + Math.cos(oa) * or,
          y: cy + Math.sin(oa) * or,
          ox: cx + Math.cos(oa) * or,
          oy: cy + Math.sin(oa) * or,
          tx: sx,
          ty: sy,
          size,
          color,
          delay,
        });
      } else {
        // converge from outside the screen toward random positions, then fade
        const oa = Math.random() * Math.PI * 2;
        const or = Math.max(w, h) * (0.6 + Math.random() * 0.4);
        this.particles.push({
          x: cx + Math.cos(oa) * or,
          y: cy + Math.sin(oa) * or,
          ox: cx + Math.cos(oa) * or,
          oy: cy + Math.sin(oa) * or,
          tx: sx,
          ty: sy,
          size,
          color,
          delay,
        });
      }
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

      const tick = (now: number) => {
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

      const tick = (now: number) => {
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

  cancel() {
    cancelAnimationFrame(this.raf);
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    this.overlay.dataset.state = 'idle';
  }
}

export function initPageTransitions() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  const overlay = document.getElementById('page-transition-overlay');
  const canvas = document.getElementById('page-transition-canvas') as HTMLCanvasElement | null;
  if (!overlay || !canvas) return;

  const runner = new TransitionRunner(overlay, canvas);

  // ── Inbound: if a previous page set the session marker, run convergeIn ──
  try {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      const theme = (sessionStorage.getItem(SESSION_THEME_KEY) as Theme) ?? 'home';
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

      runner.burstOut(theme).then(() => {
        window.location.href = href;
      });
    },
    { capture: true },
  );

  // Clean up if the user uses bfcache
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      runner.cancel();
    }
  });
}
