/**
 * Pauses an animation loop when the observed element is fully off-screen
 * and resumes it on first re-intersection. Used wherever a long-lived
 * `requestAnimationFrame` loop drives a single element that the user
 * may scroll past — there's no reason to keep rendering pixels nobody
 * sees, and rAF doesn't pause on its own outside the document-hidden
 * (tab-switch) case.
 *
 * The pauser starts with `visible = true` so the caller's loop can boot
 * normally — the first IntersectionObserver callback corrects to the
 * actual state on the next microtask. If the element happens to mount
 * already off-screen the loop renders at most one frame before pausing,
 * which is below user-perceptible cost.
 */
export interface OffscreenPauserOptions {
  /** Element to observe; the loop pauses when it has zero intersection. */
  target: Element;
  /** Called when the element re-enters the viewport (no-op if loop already running). */
  onResume: () => void;
  /** Called when the element leaves the viewport (no-op if loop already paused). */
  onPause: () => void;
}

export interface OffscreenPauserHandle {
  /** Most recent visibility state. Used by callers that gate other resume paths (e.g. document.visibilitychange) on viewport state. */
  isVisible: () => boolean;
  dispose: () => void;
}

export function createOffscreenPauser(opts: OffscreenPauserOptions): OffscreenPauserHandle {
  let visible = true;
  const observer = new IntersectionObserver(
    (entries) => {
      const next = entries.some((e) => e.isIntersecting);
      if (next === visible) return;
      visible = next;
      if (visible) opts.onResume();
      else opts.onPause();
    },
    { threshold: 0 },
  );
  observer.observe(opts.target);
  return {
    isVisible: (): boolean => visible,
    dispose: (): void => observer.disconnect(),
  };
}
