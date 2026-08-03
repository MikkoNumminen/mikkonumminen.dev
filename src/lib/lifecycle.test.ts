import { describe, it, expect, vi } from 'vitest';
import { onRoute, type Disposer } from './lifecycle';

// lifecycle.ts is a generation-token race guard, not orchestration glue: it
// keeps a page enhancement from mounting twice across the deferred-script /
// astro:page-load race, and — the subtler case — keeps an async mount that
// resolves AFTER an astro:before-swap from installing itself onto a page
// that has already been swapped away. Both races are exercised here with
// manually-controlled promises and dispatched events rather than real
// navigation, since neither guard touches the DOM beyond listening.

function fireEvent(name: string): void {
  document.dispatchEvent(new Event(name));
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('onRoute', () => {
  it('does not mount when the route marker is absent', () => {
    const mount = vi.fn();
    onRoute(() => false, mount);
    fireEvent('astro:page-load');
    expect(mount).not.toHaveBeenCalled();
  });

  it('is idempotent: the registration-time mount and the trailing astro:page-load collapse to one mount', () => {
    const mount = vi.fn();
    onRoute(() => true, mount);
    // onRoute itself attempts a mount immediately (the deferred-script race guard).
    expect(mount).toHaveBeenCalledTimes(1);
    fireEvent('astro:page-load');
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it('disposes an async mount that resolves after a swap instead of storing it', async () => {
    let resolveMount!: (d: Disposer) => void;
    const dispose = vi.fn();
    onRoute(
      () => true,
      () => new Promise<Disposer>((resolve) => (resolveMount = resolve)),
    );

    // The swap fires while the mount promise is still in flight.
    fireEvent('astro:before-swap');
    resolveMount(dispose);
    await flush();

    // The late disposer must run immediately on arrival, never get stored.
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('runs the dispose path on the swap event exactly once', () => {
    const dispose = vi.fn();
    onRoute(
      () => true,
      () => dispose,
    );

    fireEvent('astro:before-swap');
    expect(dispose).toHaveBeenCalledTimes(1);

    // Nothing is mounted anymore, so a second swap must not re-invoke it.
    fireEvent('astro:before-swap');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('lets a newer generation win: a stale in-flight mount is disposed, not the fresh one', async () => {
    let resolveFirst!: (d: Disposer) => void;
    const disposeFirst = vi.fn();
    const disposeSecond = vi.fn();
    let calls = 0;

    onRoute(
      () => true,
      () => {
        calls += 1;
        if (calls === 1) {
          return new Promise<Disposer>((resolve) => (resolveFirst = resolve));
        }
        return disposeSecond;
      },
    );

    // Swap away before the first (async) mount resolves — bumps the generation
    // and clears `mounted`, allowing a fresh mount attempt below.
    fireEvent('astro:before-swap');
    fireEvent('astro:page-load');

    // The stale first mount resolves late, after the newer generation is live.
    resolveFirst(disposeFirst);
    await flush();

    expect(disposeFirst).toHaveBeenCalledTimes(1);
    expect(disposeSecond).not.toHaveBeenCalled();

    // The fresh (second-generation) disposer is the one a further swap tears down.
    fireEvent('astro:before-swap');
    expect(disposeSecond).toHaveBeenCalledTimes(1);
    expect(disposeFirst).toHaveBeenCalledTimes(1);
  });
});
