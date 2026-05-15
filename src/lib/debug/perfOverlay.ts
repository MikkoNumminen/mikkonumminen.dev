/**
 * Minimal FPS / frame-time overlay mounted in the top-left corner.
 * Activated by `?debug=perf` (see readPerfFlags). Updates ~2 times per
 * second from a 30-frame rolling average so the numbers settle long
 * enough to read.
 *
 * The overlay is text-only, no chrome — keep it cheap so the act of
 * measuring doesn't itself dominate the frame budget.
 */

export interface PerfOverlayHandle {
  /** Call once per rendered frame, passing the frame's delta in seconds. */
  tick: (deltaSec: number) => void;
  dispose: () => void;
}

const SAMPLE_SIZE = 30;
const UPDATE_INTERVAL_MS = 500;

export function mountPerfOverlay(label: string): PerfOverlayHandle {
  const el = document.createElement('div');
  el.dataset.perfOverlay = '1';
  el.style.position = 'fixed';
  el.style.top = '12px';
  el.style.left = '12px';
  el.style.zIndex = '99999';
  el.style.padding = '6px 10px';
  el.style.background = 'rgba(0,0,0,0.7)';
  el.style.color = '#9fc0ff';
  el.style.font = '12px ui-monospace, SFMono-Regular, monospace';
  el.style.borderRadius = '4px';
  el.style.pointerEvents = 'none';
  el.style.whiteSpace = 'pre';
  el.textContent = `${label}\n— measuring —`;
  document.body.appendChild(el);

  const samples: number[] = [];
  let lastUpdate = performance.now();

  return {
    tick: (deltaSec: number): void => {
      samples.push(deltaSec);
      if (samples.length > SAMPLE_SIZE) samples.shift();

      const now = performance.now();
      if (now - lastUpdate < UPDATE_INTERVAL_MS) return;
      lastUpdate = now;

      let sum = 0;
      for (const s of samples) sum += s;
      const avg = sum / samples.length; // seconds per frame
      const fps = avg > 0 ? 1 / avg : 0;
      const ms = avg * 1000;
      el.textContent = `${label}\nfps ${fps.toFixed(1)}  ${ms.toFixed(1)}ms`;
    },
    dispose: (): void => {
      el.remove();
    },
  };
}
