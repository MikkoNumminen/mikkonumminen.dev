import { gsap, ScrollTrigger, createScope, prefersReducedMotion } from './setup';

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

// Goat positioning constants. The goat anchors to the timeline entry
// currently closest to the vertical center of the viewport, sitting just
// to the LEFT of that card. State lerps toward the target each frame
// (gsap.ticker) so changes between cards feel buttery rather than snapping.
const GOAT_GAP_PX = 56; // visual gap between goat center and card's left edge
const GOAT_DAMPING = 0.14; // higher = snappier; lower = more glide
const GOAT_LEFT_CLAMP_PX = 44; // never let the goat go off the viewport left
const GOAT_VERTICAL_PADDING = 80; // keep the goat at least this far from top/bottom
// How far above an anchor's lower edge a `foot` anchor parks the goat. Base
// camp is a full-height block with its text vertically centred, so its centre
// is exactly where the title is — on a narrow viewport there is no room to sit
// beside it and the goat lands on the words. Its lower third is empty on every
// viewport, which is also where a goat would actually stand.
const GOAT_FOOT_INSET_PX = 140;

// Inline custom properties written by the goat ticker. Tracked so dispose
// can `removeProperty` each one and not leak inline state across HMR /
// SPA navigation.
const GOAT_PROPS = ['--goat-x', '--goat-y'] as const;

/**
 * Color phases mapped to CLIMB progress — 0 at base camp, 1 at the summit.
 *
 * Climb progress is NOT scroll progress. The page is read from the bottom up,
 * so ScrollTrigger's 0-at-the-top progress runs backwards relative to the
 * climb. `climbProgress` does that inversion once and everything downstream
 * consumes it rather than `self.progress`.
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
  const bChannel = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${bChannel})`;
}

function lerpRgba(a: string, b: string, t: number): string {
  const ra = a.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  const rb = b.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  const [r0 = 0, g0 = 0, b0 = 0, a0 = 1] = ra;
  const [r1 = 0, g1 = 0, b1 = 0, a1 = 1] = rb;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const bChannel = Math.round(b0 + (b1 - b0) * t);
  const al = a0 + (a1 - a0) * t;
  return `rgba(${r}, ${g}, ${bChannel}, ${al.toFixed(3)})`;
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

/**
 * Keep the goat at least `GOAT_VERTICAL_PADDING` away from the top and
 * bottom edges of the viewport. Useful when the active card is well past
 * the viewport edge — without this clamp the goat would translate
 * off-screen along with the card.
 */
/**
 * Scroll progress (0 at the top of the document) to climb progress (0 at the
 * bottom, where the reader starts). One place, so nothing downstream has to
 * remember which way round the page runs.
 */
function climbProgress(scrollProgress: number): number {
  return 1 - scrollProgress;
}

function clampGoatY(y: number): number {
  const min = GOAT_VERTICAL_PADDING;
  const max = window.innerHeight - GOAT_VERTICAL_PADDING;
  if (y < min) return min;
  if (y > max) return max;
  return y;
}

export function initExperienceTimeline(
  options: ExperienceTimelineOptions = {},
): ExperienceTimelineHandle {
  const sceneRoot = document.querySelector<HTMLElement>('[data-mountain-scene]');
  // Goat is optional — the page can be rendered without it. When it's
  // absent, the goat-driving code below is skipped but the rest of the
  // parallax + timeline reveal logic continues to run.
  const goat = document.querySelector<HTMLElement>('[data-goat]');
  const track = document.querySelector<HTMLElement>('[data-experience-track]');
  // The climb is the timeline, not the whole track — the Technologies box
  // sits below base camp as an appendix and must not stretch the phase
  // mapping, or the sky would still be brightening while the reader is
  // reading a stack list.
  const climb = document.querySelector<HTMLElement>('[data-timeline]') ?? track;
  const timelineEntries = Array.from(
    document.querySelectorAll<HTMLElement>('[data-timeline-entry]'),
  );
  // The goat tracks one more thing than the active-card highlight does: base
  // camp. The reader arrives with the full-height header filling the viewport
  // and no card on screen at all, so tracking cards alone would clamp the goat
  // to the top edge — leaving it standing in the star field above the
  // mountains. Base camp gives it ground to stand on at the one scroll
  // position where nothing else is in view.
  const goatAnchors = [
    ...timelineEntries,
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-goat-anchor]')),
  ];
  if (!sceneRoot || !track || !climb) {
    return { dispose: (): void => {} };
  }

  const { reducedMotion = prefersReducedMotion() } = options;

  // ── Start at base camp ────────────────────────────────────────────────
  // The climb runs upward, so the opening view is the FOOT of the document.
  // Three things otherwise decide the scroll position for us and all three
  // have to be handled:
  //
  //   - the browser's own scroll restoration on reload / back, which is why
  //     `scrollRestoration` is taken over and handed back in dispose;
  //   - a deep link to `#some-id`, which the reader asked for explicitly and
  //     must win over base camp;
  //   - late layout growth (web fonts, images) landing after the first jump,
  //     which leaves an "at the bottom" scroll no longer at the bottom. The
  //     `load` re-pin covers it, and stops the moment the reader takes over.
  //
  // `scrollTo` is instant on purpose: smooth-scrolling a whole page on
  // arrival would look like a bug, and would fight the reader's first gesture.
  const previousRestoration = history.scrollRestoration;
  const honourDeepLink = window.location.hash.length > 1;
  let readerHasScrolled = false;
  const noteReaderScrolled = (): void => {
    readerHasScrolled = true;
  };
  const goToBaseCamp = (): void => {
    if (honourDeepLink || readerHasScrolled) return;
    // Base camp is the FOOT OF THE CLIMB, not the foot of the document — the
    // Technologies box sits below it. Land with the climb's last screen
    // filling the viewport and the stack appendix just out of sight.
    const climbBottom = climb.offsetTop + climb.offsetHeight;
    window.scrollTo({
      top: Math.max(0, climbBottom - window.innerHeight),
      behavior: 'instant',
    });
  };

  if (!honourDeepLink) {
    try {
      history.scrollRestoration = 'manual';
    } catch {
      // Safari private mode throws on the setter; the jump below still works.
    }
    goToBaseCamp();
    window.addEventListener('load', goToBaseCamp, { once: true });
    window.addEventListener('wheel', noteReaderScrolled, { passive: true });
    window.addEventListener('touchstart', noteReaderScrolled, { passive: true });
    window.addEventListener('keydown', noteReaderScrolled);
  }

  const restoreScrollOwnership = (): void => {
    window.removeEventListener('load', goToBaseCamp);
    window.removeEventListener('wheel', noteReaderScrolled);
    window.removeEventListener('touchstart', noteReaderScrolled);
    window.removeEventListener('keydown', noteReaderScrolled);
    try {
      history.scrollRestoration = previousRestoration;
    } catch {
      // See above.
    }
  };

  // ── Reduced-motion static fallback ────────────────────────────────────
  // Drop the user into a sensible mid-morning state with timeline cards
  // statically visible. No ScrollTriggers, no IntersectionObserver, no
  // continuous goat ticker — but we still pin the goat to the FIRST
  // entry once so it sits in a sensible place.
  if (reducedMotion) {
    applyPhase(0.6, sceneRoot);
    timelineEntries.forEach((el) => el.classList.add('is-visible'));

    // Base camp is the bottom of the page, and where the reader starts.
    // Prefer the base-camp anchor over the last card: the card sits a full
    // screen above the arrival view, so pinning to it clamps the goat to the
    // top edge and leaves it standing in the sky. Pinning to `[0]` would be
    // worse still — that is the summit, a whole page away.
    const baseCampEntry =
      goatAnchors[goatAnchors.length - 1] ?? timelineEntries[timelineEntries.length - 1];
    if (goat && baseCampEntry) {
      const positionGoat = (): void => {
        const rect = baseCampEntry.getBoundingClientRect();
        const x = Math.max(GOAT_LEFT_CLAMP_PX, rect.left - GOAT_GAP_PX);
        const y = clampGoatY(
          baseCampEntry.dataset.goatAnchor === 'foot'
            ? rect.bottom - GOAT_FOOT_INSET_PX
            : rect.top + rect.height / 2,
        );
        goat.style.setProperty('--goat-x', `${x}px`);
        goat.style.setProperty('--goat-y', `${y}px`);
      };
      positionGoat();

      // The static placement above is computed against the current layout; a
      // resize (or orientation change) shifts the first card, so recompute on
      // a debounced resize and clean the listener + props up in dispose.
      let resizeTimer = 0;
      const onResize = (): void => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(positionGoat, 150);
      };
      window.addEventListener('resize', onResize);

      return {
        dispose: (): void => {
          window.clearTimeout(resizeTimer);
          window.removeEventListener('resize', onResize);
          GOAT_PROPS.forEach((prop) => goat.style.removeProperty(prop));
          restoreScrollOwnership();
        },
      };
    }

    return { dispose: restoreScrollOwnership };
  }

  // Initialize with phase 0
  applyPhase(0, sceneRoot);

  // Track inline custom properties we set on layer elements so dispose can
  // strip every leftover --{layer}-y. (Goat props are a fixed list above.)
  const touchedLayers = new Set<HTMLElement>();

  // Cache parallax layer elements once — re-querying inside onUpdate runs a
  // DOM traversal on every scroll frame, which is unnecessary since the set
  // of layers is static for the lifetime of this ScrollTrigger.
  const layers = Array.from(
    sceneRoot.querySelectorAll<HTMLElement>('[data-parallax-speed]'),
  );

  const scope = createScope(() => {
    // ── Master scroll progress: drives color phase, sun, parallax, goat ──
    ScrollTrigger.create({
      trigger: climb,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const progress = climbProgress(self.progress);
        applyPhase(progress, sceneRoot);

        // Layer parallax — each layer drifts down faster than the last so the
        // foreground feels closer.
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

  // ── Active card + goat tracking ─────────────────────────────────
  // Both share the same "find the entry closest to viewport centre"
  // logic. The active entry gets `data-active="true"` (CSS lights up its
  // accent border and ghost-year); the goat anchors to its left edge
  // with a lerp so both feel coordinated rather than parallel.
  let goatCurrentX = 0;
  let goatCurrentY = 0;
  let goatTargetX = 0;
  let goatTargetY = 0;
  let goatInitialized = false;
  let activeEntry: HTMLElement | null = null;

  /**
   * Where on an anchor the goat stands. Cards get their centre; a block marked
   * `data-goat-anchor="foot"` gets its lower edge, because such a block is
   * full-height with centred text and the centre is occupied.
   */
  const anchorY = (el: HTMLElement, rect: DOMRect): number =>
    el.dataset.goatAnchor === 'foot'
      ? rect.bottom - GOAT_FOOT_INSET_PX
      : rect.top + rect.height / 2;

  /** Element whose centre is nearest the viewport centre, with its rect. */
  const nearestToViewportCentre = (
    candidates: HTMLElement[],
  ): { el: HTMLElement; rect: DOMRect } | null => {
    const viewportCenter = window.innerHeight / 2;
    let closest: HTMLElement | null = null;
    let closestRect: DOMRect | null = null;
    let closestDist = Infinity;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = el;
        closestRect = rect;
      }
    }
    return closest && closestRect ? { el: closest, rect: closestRect } : null;
  };

  const tickActiveAndGoat = (): void => {
    if (timelineEntries.length === 0) return;

    // The highlight only ever lands on a real card; the goat may also stand at
    // base camp. Two scans, because they answer different questions.
    const active = nearestToViewportCentre(timelineEntries);
    if (!active) return;

    // Update the active-entry attribute only when it actually changes,
    // so the CSS transitions on the card glow / dot scale aren't being
    // restarted every frame.
    if (active.el !== activeEntry) {
      activeEntry?.removeAttribute('data-active');
      active.el.setAttribute('data-active', 'true');
      activeEntry = active.el;
    }

    if (!goat) return;

    const anchor = nearestToViewportCentre(goatAnchors) ?? active;
    goatTargetX = Math.max(GOAT_LEFT_CLAMP_PX, anchor.rect.left - GOAT_GAP_PX);
    goatTargetY = clampGoatY(anchorY(anchor.el, anchor.rect));

    if (!goatInitialized) {
      // First frame: snap to target so we don't see the goat fly in from
      // (0, 0).
      goatCurrentX = goatTargetX;
      goatCurrentY = goatTargetY;
      goatInitialized = true;
    } else {
      // Once the goat has settled within a sub-pixel of its target on both
      // axes, skip the lerp + setProperty writes entirely so an idle page
      // isn't repainting the goat's custom properties every frame.
      if (
        Math.abs(goatTargetX - goatCurrentX) < 0.1 &&
        Math.abs(goatTargetY - goatCurrentY) < 0.1
      ) {
        return;
      }
      goatCurrentX += (goatTargetX - goatCurrentX) * GOAT_DAMPING;
      goatCurrentY += (goatTargetY - goatCurrentY) * GOAT_DAMPING;
    }

    goat.style.setProperty('--goat-x', `${goatCurrentX.toFixed(1)}px`);
    goat.style.setProperty('--goat-y', `${goatCurrentY.toFixed(1)}px`);
  };

  if (timelineEntries.length > 0) {
    gsap.ticker.add(tickActiveAndGoat);
  }

  // ── Timeline entry reveals (intersection-based, simpler than ScrollTrigger
  //     since each just toggles a class) ─────────────────────────────────────
  const entries = document.querySelectorAll<HTMLElement>('[data-timeline-entry]');
  const io = new IntersectionObserver(
    (records) => {
      // Stagger reveals by position WITHIN THIS callback's intersecting set so
      // a batch scrolling into view together cascades top-to-bottom. Indexing
      // a module-level counter instead would give an entry that reveals late
      // (long after earlier ones) a huge transition-delay, leaving it
      // invisible for up to ~1s. Sort the intersecting entries by their top
      // edge so the cascade reads top-down regardless of observer order.
      // Bottom-most first: the reader climbs upward, so a batch entering
      // together cascades in the direction of travel.
      const intersecting = records
        .filter((rec) => rec.isIntersecting)
        .sort((a, b) => b.boundingClientRect.top - a.boundingClientRect.top);
      intersecting.forEach((rec, i) => {
        const target = rec.target as HTMLElement;
        target.style.transitionDelay = `${Math.min(i, 4) * 80}ms`;
        target.classList.add('is-visible');
        io.unobserve(target);
      });
    },
    // Shrink the TOP of the root, not the bottom: cards arrive over the top
    // edge on an upward scroll, and this margin exists to hold the reveal
    // until a card is properly on screen.
    { rootMargin: '-20% 0px 0px 0px', threshold: 0.1 },
  );
  entries.forEach((e) => io.observe(e));

  return {
    dispose: (): void => {
      // Detach the active/goat ticker before scope.dispose() so no further
      // frames try to write to the DOM.
      if (timelineEntries.length > 0) {
        gsap.ticker.remove(tickActiveAndGoat);
      }

      // Kill tweens + ScrollTriggers + revert any GSAP-set inline styles.
      scope.dispose();
      io.disconnect();

      // Strip the inline custom properties we wrote (parallax layer Y and
      // goat XY) and the data-active flag set on the closest card. GSAP
      // doesn't track raw `style.setProperty` / attribute mutations, so
      // we clean up by hand.
      if (goat) {
        GOAT_PROPS.forEach((prop) => goat.style.removeProperty(prop));
      }
      activeEntry?.removeAttribute('data-active');
      activeEntry = null;
      touchedLayers.forEach((layer) => {
        const layerName = layer.dataset.layer;
        if (layerName) layer.style.removeProperty(`--${layerName}-y`);
      });

      // Clear stagger delays applied during reveal so a remount starts clean.
      entries.forEach((entry) => {
        entry.style.removeProperty('transition-delay');
      });

      restoreScrollOwnership();
    },
  };
}
