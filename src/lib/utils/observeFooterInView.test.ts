import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeFooterInView } from './observeFooterInView';

/**
 * jsdom ships no IntersectionObserver, so the tests drive one by hand.
 * The stub keeps the real contract that matters here: the callback
 * receives entries and the caller can disconnect.
 */
let fire: (entries: { isIntersecting: boolean }[]) => void = () => {};
let disconnected = 0;
let observed: Element[] = [];

class StubIO {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    fire = cb;
  }
  observe(el: Element): void {
    observed.push(el);
  }
  disconnect(): void {
    disconnected++;
  }
  unobserve(): void {}
  takeRecords(): [] {
    return [];
  }
}

beforeEach(() => {
  disconnected = 0;
  observed = [];
  vi.stubGlobal('IntersectionObserver', StubIO);
  document.documentElement.removeAttribute('data-footer-in-view');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-footer-in-view');
});

const target = (): Element => document.createElement('footer');

describe('observeFooterInView', () => {
  it('starts with the flag off when the footer is below the fold', () => {
    // jsdom reports an all-zero rect for a detached node, which reads as
    // "not on screen" — the same answer a real below-the-fold footer gives.
    const h = observeFooterInView({ target: target() });
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
    expect(h.isInView()).toBe(false);
  });

  it('seeds synchronously when the footer is already on screen', () => {
    // Otherwise the chrome renders visible and animates away on load, on
    // any page short enough to show its footer immediately.
    const el = target();
    el.getBoundingClientRect = () =>
      ({
        top: 10,
        bottom: 90,
        left: 0,
        right: 100,
        width: 100,
        height: 80,
        x: 0,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect;
    const h = observeFooterInView({ target: el });
    expect(h.isInView()).toBe(true);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(true);
  });

  it('observes the element it was given', () => {
    const el = target();
    observeFooterInView({ target: el });
    expect(observed).toEqual([el]);
  });

  it('sets the flag when the footer intersects and clears it when it leaves', () => {
    const h = observeFooterInView({ target: target() });

    fire([{ isIntersecting: true }]);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(true);
    expect(h.isInView()).toBe(true);

    fire([{ isIntersecting: false }]);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
    expect(h.isInView()).toBe(false);
  });

  it('ignores repeats of the state it is already in', () => {
    const root = document.createElement('html');
    observeFooterInView({ target: target(), root });
    // Spy AFTER construction: the synchronous seed writes once by
    // design, and this test is about redundant writes from the observer.
    const spy = vi.spyOn(root, 'toggleAttribute');

    fire([{ isIntersecting: true }]);
    fire([{ isIntersecting: true }]);
    fire([{ isIntersecting: true }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('treats any intersecting entry as in view', () => {
    const h = observeFooterInView({ target: target() });
    fire([{ isIntersecting: false }, { isIntersecting: true }]);
    expect(h.isInView()).toBe(true);
  });

  it('disconnects and clears the flag on dispose', () => {
    // A stale flag would leave the next page's chrome hidden for no
    // reason under client-side routing.
    const h = observeFooterInView({ target: target() });
    fire([{ isIntersecting: true }]);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(true);

    h.dispose();
    expect(disconnected).toBe(1);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
  });

  it('writes to a caller-supplied root instead of <html> when asked', () => {
    const root = document.createElement('div');
    observeFooterInView({ target: target(), root });
    fire([{ isIntersecting: true }]);
    expect(root.hasAttribute('data-footer-in-view')).toBe(true);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
  });
});
