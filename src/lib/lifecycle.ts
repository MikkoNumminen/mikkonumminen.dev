/**
 * Client-side-routing lifecycle helper.
 *
 * Under Astro's `<ClientRouter />`, a bundled module `<script>` executes ONCE per
 * session (browsers dedupe module URLs), and `DOMContentLoaded` / `beforeunload`
 * no longer fire on a client-side navigation — only `astro:page-load` (after every
 * swap, and on the initial load) and `astro:before-swap` (before every swap) do.
 *
 * `onRoute` bridges a page enhancement to that lifecycle: it registers ONE
 * `astro:page-load` (mount) and ONE `astro:before-swap` (dispose) listener, mounts
 * only when the route's marker is present (so a home enhancement no-ops on
 * `/projects`), and disposes whatever is mounted before the next swap.
 *
 * It deliberately does NOT touch the bfcache freeze/restore cycle
 * (`pagehide` / `pageshow`). Re-running a mount on a `pageshow` restore is unsafe
 * in general: an append-render enhancement (the terminals) would render a second
 * copy over the DOM bfcache preserved, and a WebGL scene would re-init a canvas
 * whose context was force-lost on freeze. Instead a bfcache-restored page simply
 * resumes its frozen JS, and any enhancement that must survive a freeze does so by
 * not tearing itself down on `pagehide` (e.g. the mobile chat wiring).
 *
 * Two guards keep mounting correct:
 *   - `mounted` makes a single arrival idempotent. A route's deferred module
 *     script runs — and calls the registration `doMount()` below — BEFORE Astro
 *     fires `astro:page-load` for that arrival, so both would otherwise mount. For
 *     an async mount `current` isn't set until the promise resolves, and a
 *     void-returning mount never sets it at all, so keying the guard on `current`
 *     would let the trailing page-load mount a duplicate. `mounted` is set the
 *     moment a mount is attempted and cleared only on dispose, collapsing the pair
 *     to one. (The registration call is kept as a safety net for browsers that
 *     fall back to a non-view-transition navigation.)
 *   - the generation token guards the separate race where a swap happens while an
 *     async `mount()` is still resolving: the late-arriving disposer runs
 *     immediately instead of being stored, so a scene can't end up alive on a page
 *     already swapped away (the deferred `/projects` boot).
 */

export type Disposer = (() => void) | { dispose: () => void };

function runDispose(d: Disposer | null | undefined): void {
  if (!d) return;
  if (typeof d === 'function') d();
  else d.dispose();
}

export function onRoute(
  shouldMount: () => boolean,
  mount: () => Disposer | void | Promise<Disposer | void>,
): void {
  let current: Disposer | null = null;
  // True from the moment a mount is attempted for the current arrival until the
  // next dispose. Distinct from `current` (the stored disposer, which is null for
  // an async mount still in flight or a void-returning mount) so neither can be
  // re-invoked by the trailing `astro:page-load`.
  let mounted = false;
  // Bumped on every mount attempt AND every dispose. An async mount whose token no
  // longer matches when it resolves is disposed on arrival, not stored.
  let generation = 0;

  const store = (gen: number, d: Disposer | void): void => {
    if (gen !== generation) {
      runDispose(d ?? null);
      return;
    }
    current = d ?? null;
  };

  const doMount = (): void => {
    if (mounted || !shouldMount()) return;
    mounted = true;
    const gen = ++generation;
    let result: Disposer | void | Promise<Disposer | void>;
    try {
      result = mount();
    } catch {
      // A synchronous mount failure must not wedge the lifecycle — it just won't
      // retry until the next dispose; the page renders without its enhancement.
      return;
    }
    if (result && typeof (result as Promise<Disposer | void>).then === 'function') {
      (result as Promise<Disposer | void>).then(
        (d) => store(gen, d),
        () => {
          /* mount rejected — nothing to store */
        },
      );
    } else {
      store(gen, result as Disposer | void);
    }
  };

  const doDispose = (): void => {
    generation++; // invalidate any in-flight async mount
    mounted = false;
    const d = current;
    current = null;
    runDispose(d);
  };

  document.addEventListener('astro:page-load', doMount);
  document.addEventListener('astro:before-swap', doDispose);

  // The deferred module script may run before OR after `astro:page-load` for its
  // own arrival; attempt a mount now too. The `mounted` guard makes whichever
  // fires second a no-op, and the marker check no-ops when we're off-route.
  doMount();
}
