/**
 * URL-driven perf knobs. Read once at scene boot so the tester can A/B
 * test without redeploying, and so we don't have to ship a settings UI.
 *
 *   ?perf=low      — cap DPR at 1, disable bloom, reduce particle count.
 *                    Use to verify whether the bloom pass / pixel-ratio
 *                    work is the bottleneck on a slow machine.
 *   ?debug=perf    — mount the FPS / frame-time overlay (top-left).
 *                    Read once, no live update — re-load the page to
 *                    flip the flag.
 *
 * Both flags default to off (full-quality desktop experience).
 */

export interface PerfFlags {
  /** True when `?perf=low` is present. Callers should disable bloom and cap DPR/particles. */
  lowPerf: boolean;
  /** True when `?debug=perf` is present. Callers should mount the perf overlay. */
  debugOverlay: boolean;
}

let cached: PerfFlags | null = null;

export function readPerfFlags(): PerfFlags {
  if (cached) return cached;
  if (typeof window === 'undefined') {
    cached = { lowPerf: false, debugOverlay: false };
    return cached;
  }
  const params = new URLSearchParams(window.location.search);
  cached = {
    lowPerf: params.get('perf') === 'low',
    debugOverlay: params.get('debug') === 'perf',
  };
  return cached;
}
