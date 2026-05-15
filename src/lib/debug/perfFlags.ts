/**
 * Perf knobs. URL flags first, then auto-detection by display pixel
 * budget so high-resolution monitors (4K, or 1440p+OS-scaling) get the
 * cheap path automatically. Raw GPU/CPU power doesn't help here — the
 * per-frame bloom + post chain scales with pixel area, and driver-side
 * setup of those passes is CPU work no matter how fast the silicon is.
 *
 *   ?perf=low      — force the cheap path: DPR clamped at 1, bloom off,
 *                    half the particles. Use to verify the workaround.
 *   ?perf=high     — force the full-quality path, bypassing auto-detect.
 *                    Use on a slow laptop to opt into the full visual.
 *   ?debug=perf    — mount the FPS / frame-time overlay (top-left).
 *
 * Without any URL flag, `lowPerf` is true when the viewport's pre-DPR-cap
 * pixel count crosses LOW_PERF_PIXEL_BUDGET. The threshold is tuned to
 * trigger on 1440p+DPR=2 (Windows 200% on QHD) and standard 4K monitors,
 * while leaving 1080p and 1440p at DPR=1 on full quality.
 */

/**
 * Total physical-device-pixel count above which we assume the bloom +
 * post chain will dominate. `innerWidth × innerHeight × DPR²` reduces
 * to physical pixels in the viewport regardless of OS scaling, so the
 * gate is essentially "panel resolution" — DPR only changes the number
 * on Mac retina (where the browser reports DPR=2 while CSS pixels are
 * halved). Calibration:
 *
 *   1080p panel              →  2.1M ⇒ full quality
 *   1440p panel              →  3.7M ⇒ full quality
 *   1440p ultrawide (3440)   →  4.9M ⇒ full quality
 *   Mac retina "1440×900"    →  5.2M ⇒ full quality
 *   4K panel                 →  8.3M ⇒ lite (the tester case)
 *   Mac retina "1920×1080"   →  8.3M ⇒ lite
 *   5K2K ultrawide (5120)    → 11M   ⇒ lite
 *   Mac retina "2560×1440"   → 14.7M ⇒ lite
 *
 * Windows OS scaling does NOT change the budget: `innerWidth` shrinks
 * proportionally as DPR rises, so the product is constant for a given
 * physical panel. The gate fires from physical 4K-and-up, period.
 */
const LOW_PERF_PIXEL_BUDGET = 6_000_000;

export type LowPerfReason = 'none' | 'url' | 'auto';

export interface PerfFlags {
  /** True if any of the lite-path triggers fired (URL or auto-detect). */
  lowPerf: boolean;
  /** Why `lowPerf` is what it is — surfaced on the perf overlay so a tester can tell at a glance whether auto-detect kicked in. */
  lowPerfReason: LowPerfReason;
  /** Measured pre-cap pixel budget (width × height × DPR²) at boot. Useful for tuning the threshold from real reports. */
  pixelBudget: number;
  /** True when `?debug=perf` is present. Callers should mount the perf overlay. */
  debugOverlay: boolean;
}

let cached: PerfFlags | null = null;

function measurePixelBudget(): number {
  const dpr = window.devicePixelRatio || 1;
  return window.innerWidth * window.innerHeight * dpr * dpr;
}

export function readPerfFlags(): PerfFlags {
  if (cached) return cached;
  if (typeof window === 'undefined') {
    cached = {
      lowPerf: false,
      lowPerfReason: 'none',
      pixelBudget: 0,
      debugOverlay: false,
    };
    return cached;
  }
  const params = new URLSearchParams(window.location.search);
  const perfParam = params.get('perf');
  const pixelBudget = measurePixelBudget();

  let lowPerf: boolean;
  let lowPerfReason: LowPerfReason;
  if (perfParam === 'low') {
    lowPerf = true;
    lowPerfReason = 'url';
  } else if (perfParam === 'high') {
    lowPerf = false;
    lowPerfReason = 'none';
  } else if (pixelBudget > LOW_PERF_PIXEL_BUDGET) {
    lowPerf = true;
    lowPerfReason = 'auto';
  } else {
    lowPerf = false;
    lowPerfReason = 'none';
  }

  cached = {
    lowPerf,
    lowPerfReason,
    pixelBudget,
    debugOverlay: params.get('debug') === 'perf',
  };
  return cached;
}
