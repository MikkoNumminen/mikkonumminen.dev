/**
 * Deferred WebGL boot for the projects scene.
 *
 * Waits for the first real user interaction (scroll / pointer / key) or a
 * configurable passive fallback timer before importing and starting the
 * Three.js scene. Visitors who bounce immediately never pay the download
 * or parse cost; engaged visitors trigger it on their first movement.
 */

export interface BootOpts {
  /** Called when boot should actually run. */
  onBoot: () => Promise<void> | void;
  /** Milliseconds before the fallback timer fires. Default: 2000. */
  fallbackMs?: number;
}

export interface BootHandle {
  /** Cancels the scheduled boot (if it hasn't fired yet). */
  cancel: () => void;
}

const INTERACTION_EVENTS = [
  'scroll',
  'mousemove',
  'touchstart',
  'keydown',
  'pointerdown',
] as const;

/**
 * Schedule the projects scene boot on first user interaction or after
 * `fallbackMs` milliseconds, whichever comes first.
 *
 * Returns a handle with a `cancel()` method that prevents the boot from
 * firing (useful if the component unmounts before the timer fires).
 */
export function scheduleProjectsSceneBoot(opts: BootOpts): BootHandle {
  const { onBoot, fallbackMs = 2000 } = opts;

  let started = false;
  let abortInteractions: AbortController | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerBoot = () => {
    if (started) return;
    started = true;
    abortInteractions?.abort();
    if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    void onBoot();
  };

  const schedule = () => {
    if (started) return;
    abortInteractions = new AbortController();
    for (const ev of INTERACTION_EVENTS) {
      window.addEventListener(ev, triggerBoot, {
        once: true,
        passive: true,
        signal: abortInteractions.signal,
      });
    }
    fallbackTimer = setTimeout(triggerBoot, fallbackMs);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }

  return {
    cancel: () => {
      started = true; // prevents triggerBoot from running
      abortInteractions?.abort();
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    },
  };
}
