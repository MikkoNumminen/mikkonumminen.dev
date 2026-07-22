/**
 * Client-side-routing lifecycle helper.
 *
 * Under Astro's `<ClientRouter />`, a bundled module `<script>` executes ONCE per
 * session (browsers dedupe module URLs), and `DOMContentLoaded` / `beforeunload`
 * no longer fire on a client-side navigation — only `astro:page-load` (after every
 * swap, and on the initial load) and `astro:before-swap` (before every swap) do.
 *
 * `onRoute` bridges a page enhancement to that lifecycle: it registers ONE
 * `astro:page-load` (mount) and ONE `astro:before-swap` (dispose) listener,
 * mounts only when the route's marker is present (so a home enhancement no-ops on
 * `/projects`), and disposes whatever is mounted before the next swap.
 *
 * Async mounts are guarded by a generation token: if a swap happens while an
 * async `mount()` is still resolving, the late-arriving disposer runs immediately
 * instead of being stored — a scene can never end up alive on a page that has
 * already been swapped away (a real race for the deferred `/projects` boot).
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
  // Bumped on every mount attempt AND every teardown. An async mount whose token
  // no longer matches when it resolves is disposed on arrival, not stored.
  let generation = 0;

  const store = (gen: number, d: Disposer | void): void => {
    if (gen !== generation) {
      runDispose(d ?? null);
      return;
    }
    current = d ?? null;
  };

  const doMount = (): void => {
    if (current || !shouldMount()) return;
    const gen = ++generation;
    let result: Disposer | void | Promise<Disposer | void>;
    try {
      result = mount();
    } catch {
      // A synchronous mount failure must not wedge the lifecycle — the page
      // simply renders without its enhancement.
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
    const d = current;
    current = null;
    runDispose(d);
  };

  document.addEventListener('astro:page-load', doMount);
  document.addEventListener('astro:before-swap', doDispose);

  // A page's bundled module script is deferred, so it may execute AFTER the
  // `astro:page-load` for its own arrival has already fired (especially the
  // first time a route is swapped in). Attempt a mount immediately on
  // registration too; the `current` guard makes the later page-load a no-op if
  // this already mounted, and the marker check no-ops when we're off-route.
  doMount();
}
