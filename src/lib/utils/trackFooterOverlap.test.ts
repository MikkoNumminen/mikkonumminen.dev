import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackFooterOverlap } from './trackFooterOverlap';

/**
 * Handles attach window listeners, so an undisposed one from an earlier
 * test keeps responding to scroll events and writing to the same root —
 * which silently inflates every later assertion about writes.
 */
const live: { dispose: () => void }[] = [];
function track(...args: Parameters<typeof trackFooterOverlap>) {
  const h = trackFooterOverlap(...args);
  live.push(h);
  return h;
}

const VIEWPORT = 768;

/** rAF is queued, so tests flush it rather than waiting on a frame. */
let frames: FrameRequestCallback[] = [];
function flush(): void {
  const queued = frames;
  frames = [];
  for (const cb of queued) cb(0);
}

function setRect(el: HTMLElement, top: number, height = 90): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function setScrollY(value: number): void {
  Object.defineProperty(window, 'scrollY', { value, configurable: true });
}

function setViewport(height: number): void {
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

/** Footer 200px below the fold on a scrollable page. */
function footer(): HTMLElement {
  const el = document.createElement('footer');
  setRect(el, VIEWPORT + 200);
  setScrollY(0);
  return el;
}

/** Scroll so the footer's top sits at `top` in the viewport. */
function scrollFooterTo(el: HTMLElement, top: number): void {
  setScrollY(VIEWPORT + 200 - top);
  setRect(el, top);
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  setViewport(VIEWPORT);
  setScrollY(0);
  document.documentElement.style.removeProperty('--footer-lift');
});

afterEach(() => {
  for (const h of live.splice(0)) h.dispose();
  vi.unstubAllGlobals();
  setViewport(VIEWPORT);
  document.documentElement.style.removeProperty('--footer-lift');
});

const lifted = (): string =>
  document.documentElement.style.getPropertyValue('--footer-lift');

describe('trackFooterOverlap', () => {
  it('publishes no lift while the footer is below the fold', () => {
    const h = track({ target: footer() });
    expect(h.lift()).toBe(0);
    expect(lifted()).toBe('');
  });

  it('lifts by exactly how far the footer has entered the viewport', () => {
    const el = footer();
    const h = track({ target: el });

    // Footer top 100px above the viewport bottom → 100px of intrusion.
    scrollFooterTo(el, VIEWPORT - 100);
    window.dispatchEvent(new Event('scroll'));
    flush();
    expect(h.lift()).toBe(100);
    expect(lifted()).toBe('100px');
  });

  it('seeds synchronously for a page that loads already at its footer', () => {
    // Otherwise the chrome renders over the footer and then slides off.
    const el = footer();
    scrollFooterTo(el, VIEWPORT - 250);
    const h = track({ target: el });
    expect(h.lift()).toBe(250);
    expect(lifted()).toBe('250px');
  });

  it('returns to zero when the footer is scrolled back out', () => {
    const el = footer();
    const h = track({ target: el });
    scrollFooterTo(el, VIEWPORT - 100);
    window.dispatchEvent(new Event('scroll'));
    flush();
    expect(h.lift()).toBe(100);

    scrollFooterTo(el, VIEWPORT + 200);
    window.dispatchEvent(new Event('scroll'));
    flush();
    expect(h.lift()).toBe(0);
  });

  it('never lifts by a negative amount', () => {
    const el = footer();
    setRect(el, VIEWPORT * 3);
    const h = track({ target: el });
    expect(h.lift()).toBe(0);
  });

  it('keeps chrome in place on a page too short to scroll its footer away', () => {
    // /404 shows its footer at scroll 0. The earlier hide-based approach
    // latched here and removed the only audio control for the whole
    // visit; lifting has no such failure mode — the chrome simply rests
    // above the footer and stays interactive.
    const el = document.createElement('footer');
    setRect(el, VIEWPORT - 120);
    setScrollY(0);
    const h = track({ target: el });
    expect(h.lift()).toBe(120);
    // Still a real, finite offset — nothing is hidden or unreachable.
    expect(Number.isFinite(h.lift())).toBe(true);
  });

  it('coalesces a burst of scroll events into one write', () => {
    const el = footer();
    track({ target: el });
    const spy = vi.spyOn(document.documentElement.style, 'setProperty');

    scrollFooterTo(el, VIEWPORT - 50);
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('scroll'));
    flush();
    const ours = spy.mock.calls.filter(([name]) => name === '--footer-lift');
    expect(ours).toHaveLength(1);
  });

  it('holds a steady value when nothing has moved', () => {
    const el = footer();
    const h = track({ target: el });
    scrollFooterTo(el, VIEWPORT - 50);
    window.dispatchEvent(new Event('scroll'));
    flush();
    expect(h.lift()).toBe(50);

    // Same geometry, more events: the published value must not drift.
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('scroll'));
    flush();
    expect(h.lift()).toBe(50);
    expect(lifted()).toBe('50px');
  });

  it('re-measures on resize, since the footer moves in document space', () => {
    const el = footer();
    const h = track({ target: el });
    expect(h.lift()).toBe(0);

    // Content reflows and the footer ends up on screen.
    setRect(el, VIEWPORT - 80);
    window.dispatchEvent(new Event('resize'));
    expect(h.lift()).toBe(80);
  });

  it('clears the property on dispose', () => {
    // A stale lift would displace the next page's chrome under
    // client-side routing.
    const el = footer();
    scrollFooterTo(el, VIEWPORT - 100);
    const h = track({ target: el });
    expect(lifted()).toBe('100px');

    h.dispose();
    expect(lifted()).toBe('');
  });

  it('writes to a caller-supplied root when asked', () => {
    const root = document.createElement('div');
    const el = footer();
    scrollFooterTo(el, VIEWPORT - 60);
    track({ target: el, root });
    expect(root.style.getPropertyValue('--footer-lift')).toBe('60px');
    expect(lifted()).toBe('');
  });
});
