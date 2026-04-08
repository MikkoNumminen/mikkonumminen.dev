import { ScrollTrigger, createScope, prefersReducedMotion } from './setup';

export interface ExperienceTimelineOptions {
  reducedMotion?: boolean;
}

export interface ExperienceTimelineHandle {
  dispose: () => void;
}

interface ColorPhase {
  /** Scroll progress, 0..1 */
  at: number;
  vars: Record<string, string>;
}

// Goat sway constants — frequency × amplitude shape the wobble while climbing.
const SWAY_FREQ = 6;
const SWAY_AMPLITUDE_PX = 30;

// Inline custom properties written by the master scroll handler. We track
// these so dispose can `removeProperty` each one and not leak inline state
// across HMR / SPA navigation.
const GOAT_PROPS = ['--goat-bottom', '--goat-x'] as const;

/**
 * Color phases mapped to scroll progress.
 *
 *   0.00  pre-dawn (deep purple, stars visible, sun below horizon)
 *   0.30  dawn     (pink/orange horizon, sun rising)
 *   0.60  morning  (warm light, mountains catching sun)
 *   1.00  day      (bright cool blue, no stars, sun high)
 */
const PHASES: ColorPhase[] = [
  {
    at: 0.0,
    vars: {
      '--sky-top': '#0e0820',
      '--sky-mid': '#241540',
      '--sky-bottom': '#3d1f3a',
      '--horizon': '#5a2735',
      '--far-top': '#3a2d4a',
      '--far-bottom': '#1f1830',
      '--mid-top': '#2c2238',
      '--mid-bottom': '#171121',
      '--near-top': '#1c1426',
      '--near-bottom': '#0a0612',
      '--trees-color': '#0c0814',
      '--fg-top': '#0a0612',
      '--fg-bottom': '#020106',
      '--stars-opacity': '0.95',
      '--sun-y': '-12%',
      '--sun-core-1': '#ff9468',
      '--sun-core-2': '#cc4a3a',
      '--sun-glow': 'rgba(255, 130, 80, 0.45)',
      '--sun-halo': 'rgba(255, 120, 70, 0.18)',
    },
  },
  {
    at: 0.3,
    vars: {
      '--sky-top': '#1f1840',
      '--sky-mid': '#5b2a52',
      '--sky-bottom': '#c8593a',
      '--horizon': '#e08855',
      '--far-top': '#5d4866',
      '--far-bottom': '#3a2c44',
      '--mid-top': '#4a3854',
      '--mid-bottom': '#2a1f30',
      '--near-top': '#332538',
      '--near-bottom': '#170f1c',
      '--trees-color': '#150e1a',
      '--fg-top': '#13091c',
      '--fg-bottom': '#04020a',
      '--stars-opacity': '0.5',
      '--sun-y': '8%',
      '--sun-core-1': '#ffc080',
      '--sun-core-2': '#ff7a3a',
      '--sun-glow': 'rgba(255, 160, 90, 0.55)',
      '--sun-halo': 'rgba(255, 180, 100, 0.22)',
    },
  },
  {
    at: 0.6,
    vars: {
      '--sky-top': '#345585',
      '--sky-mid': '#6a8db8',
      '--sky-bottom': '#e8b585',
      '--horizon': '#f2c69a',
      '--far-top': '#7c8aaa',
      '--far-bottom': '#4d5878',
      '--mid-top': '#5a6c8c',
      '--mid-bottom': '#33425e',
      '--near-top': '#3e4862',
      '--near-bottom': '#1c2238',
      '--trees-color': '#1a2230',
      '--fg-top': '#161c2c',
      '--fg-bottom': '#070912',
      '--stars-opacity': '0.1',
      '--sun-y': '32%',
      '--sun-core-1': '#fff0c0',
      '--sun-core-2': '#ffc070',
      '--sun-glow': 'rgba(255, 220, 140, 0.55)',
      '--sun-halo': 'rgba(255, 230, 160, 0.25)',
    },
  },
  {
    at: 1.0,
    vars: {
      '--sky-top': '#4f8bd1',
      '--sky-mid': '#8cb6e2',
      '--sky-bottom': '#cfdff0',
      '--horizon': '#e8eef6',
      '--far-top': '#9eb2cf',
      '--far-bottom': '#6a82a8',
      '--mid-top': '#7892b8',
      '--mid-bottom': '#4e6488',
      '--near-top': '#566a8a',
      '--near-bottom': '#2c3a56',
      '--trees-color': '#26334a',
      '--fg-top': '#202b3e',
      '--fg-bottom': '#0a0f1a',
      '--stars-opacity': '0',
      '--sun-y': '60%',
      '--sun-core-1': '#ffffff',
      '--sun-core-2': '#ffe6a0',
      '--sun-glow': 'rgba(255, 240, 180, 0.6)',
      '--sun-halo': 'rgba(255, 240, 180, 0.3)',
    },
  },
];

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Linearly interpolate two hex colors. `t` is 0..1.
 */
function lerpColor(a: string, b: string, t: number): string {
  const [ra, ga, ba] = parseHex(a);
  const [rb, gb, bb] = parseHex(b);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function lerpRgba(a: string, b: string, t: number): string {
  const ra = a.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  const rb = b.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  const [r0 = 0, g0 = 0, b0 = 0, a0 = 1] = ra;
  const [r1 = 0, g1 = 0, b1 = 0, a1 = 1] = rb;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const bl = Math.round(b0 + (b1 - b0) * t);
  const al = a0 + (a1 - a0) * t;
  return `rgba(${r}, ${g}, ${bl}, ${al.toFixed(3)})`;
}

function lerpString(a: string, b: string, t: number): string {
  if (a.startsWith('#') && b.startsWith('#')) return lerpColor(a, b, t);
  if (a.startsWith('rgba') && b.startsWith('rgba')) return lerpRgba(a, b, t);
  // Numeric percentages like "-12%" or unitless numbers — interpolate the leading number.
  const reA = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(a);
  const reB = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(b);
  if (reA && reB) {
    const [, na = '0', unitA = ''] = reA;
    const [, nb = '0'] = reB;
    const naNum = parseFloat(na);
    const nbNum = parseFloat(nb);
    const v = naNum + (nbNum - naNum) * t;
    return `${v.toFixed(2)}${unitA}`;
  }
  return t < 0.5 ? a : b;
}

function applyPhase(progress: number, root: HTMLElement): void {
  // Find the two surrounding phases. PHASES is non-empty by construction.
  const first = PHASES[0];
  const last = PHASES[PHASES.length - 1];
  if (!first || !last) return;
  let lower = first;
  let upper = last;
  for (let i = 0; i < PHASES.length - 1; i++) {
    const a = PHASES[i];
    const b = PHASES[i + 1];
    if (a && b && progress >= a.at && progress <= b.at) {
      lower = a;
      upper = b;
      break;
    }
  }
  const span = upper.at - lower.at || 1;
  const t = (progress - lower.at) / span;

  for (const key of Object.keys(lower.vars)) {
    const a = lower.vars[key];
    if (a === undefined) continue;
    const b = upper.vars[key] ?? a;
    root.style.setProperty(key, lerpString(a, b, t));
  }
}

export function initExperienceTimeline(
  options: ExperienceTimelineOptions = {},
): ExperienceTimelineHandle {
  const sceneRoot = document.querySelector<HTMLElement>('[data-mountain-scene]');
  const goat = document.querySelector<HTMLElement>('[data-goat]');
  const trigger = document.querySelector<HTMLElement>('[data-experience-track]');
  if (!sceneRoot || !goat || !trigger) {
    return { dispose: (): void => {} };
  }

  const { reducedMotion = prefersReducedMotion() } = options;

  // ── Reduced-motion static fallback ────────────────────────────────────
  // Drop the user into a sensible mid-morning state with timeline cards
  // statically visible. No ScrollTriggers, no IntersectionObserver, no
  // scroll-driven sun / parallax / goat sway.
  if (reducedMotion) {
    applyPhase(0.6, sceneRoot);
    document
      .querySelectorAll<HTMLElement>('[data-timeline-entry]')
      .forEach((el) => el.classList.add('is-visible'));
    return { dispose: (): void => {} };
  }

  // Initialize with phase 0
  applyPhase(0, sceneRoot);

  // Track inline custom properties we set on layer elements so dispose can
  // strip every leftover --{layer}-y. (Goat props are a fixed list above.)
  const touchedLayers = new Set<HTMLElement>();

  const scope = createScope(() => {
    // ── Master scroll progress: drives color phase, sun, parallax, goat ──
    ScrollTrigger.create({
      trigger,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const progress = self.progress;
        applyPhase(progress, sceneRoot);

        // Goat climbs from bottom up. Bottom = 18vh, summit = 70vh.
        const bottomVH = 18 + progress * 52;
        goat.style.setProperty('--goat-bottom', `${bottomVH}vh`);

        // Slight horizontal sway as the goat climbs
        const sway = Math.sin(progress * SWAY_FREQ) * SWAY_AMPLITUDE_PX;
        goat.style.setProperty('--goat-x', `${sway}px`);

        // Layer parallax — each layer drifts down faster than the last so the
        // foreground feels closer.
        const layers = sceneRoot.querySelectorAll<HTMLElement>('[data-parallax-speed]');
        layers.forEach((layer) => {
          const speed = parseFloat(layer.dataset.parallaxSpeed ?? '0');
          const offset = progress * speed * 200;
          const layerName = layer.dataset.layer;
          if (!layerName) return;
          layer.style.setProperty(`--${layerName}-y`, `${offset}px`);
          touchedLayers.add(layer);
        });
      },
    });
  });

  // ── Timeline entry reveals (intersection-based, simpler than ScrollTrigger
  //     since each just toggles a class) ─────────────────────────────────────
  const entries = document.querySelectorAll<HTMLElement>('[data-timeline-entry]');
  let revealOrder = 0;
  const io = new IntersectionObserver(
    (records) => {
      records.forEach((rec) => {
        if (!rec.isIntersecting) return;
        const target = rec.target as HTMLElement;
        // Stagger reveals by intersection order so a batch of entries scrolling
        // into view together cascade rather than landing in the same frame.
        target.style.transitionDelay = `${revealOrder * 80}ms`;
        revealOrder += 1;
        target.classList.add('is-visible');
        io.unobserve(target);
      });
    },
    { rootMargin: '0px 0px -20% 0px', threshold: 0.1 },
  );
  entries.forEach((e) => io.observe(e));

  return {
    dispose: (): void => {
      // Kill tweens + ScrollTriggers + revert any GSAP-set inline styles.
      scope.dispose();
      io.disconnect();

      // Strip the inline custom properties we wrote in onUpdate. GSAP doesn't
      // track raw `style.setProperty` calls, so we have to clean up by hand.
      GOAT_PROPS.forEach((prop) => goat.style.removeProperty(prop));
      touchedLayers.forEach((layer) => {
        const layerName = layer.dataset.layer;
        if (layerName) layer.style.removeProperty(`--${layerName}-y`);
      });

      // Clear stagger delays applied during reveal so a remount starts clean.
      entries.forEach((entry) => {
        entry.style.removeProperty('transition-delay');
      });
    },
  };
}
