import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeFooterInView } from './observeFooterInView';

/**
 * jsdom ships no IntersectionObserver, so the tests drive one by hand.
 *
 * Note the module treats the observer as a TRIGGER, not as the answer:
 * every callback re-measures, because `isIntersecting` alone cannot say
 * whether a visible footer is one the visitor could ever scroll away
 * from. So these tests move the geometry and then fire, the way a real
 * scroll does — firing on its own proves nothing.
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

const VIEWPORT = 768; // jsdom's default innerHeight

function setRect(el: Element, top: number, height = 80): void {
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

/** A footer on a normal, scrollable page: below the fold at rest. */
function scrollableFooter(): Element {
  const el = document.createElement('footer');
  setRect(el, VIEWPORT + 200);
  setScrollY(0);
  return el;
}

/** Simulate scrolling until the footer's top sits at `top`. */
function scrollFooterTo(el: Element, top: number): void {
  setScrollY(VIEWPORT + 200 - top);
  setRect(el, top);
}

beforeEach(() => {
  disconnected = 0;
  observed = [];
  vi.stubGlobal('IntersectionObserver', StubIO);
  setViewport(VIEWPORT);
  setScrollY(0);
  document.documentElement.removeAttribute('data-footer-in-view');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setViewport(VIEWPORT);
  document.documentElement.removeAttribute('data-footer-in-view');
});

describe('observeFooterInView', () => {
  it('starts with the flag off when the footer is below the fold', () => {
    const h = observeFooterInView({ target: scrollableFooter() });
    expect(h.isInView()).toBe(false);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
  });

  it('observes the element it was given', () => {
    const el = scrollableFooter();
    observeFooterInView({ target: el });
    expect(observed).toEqual([el]);
  });

  it('seeds synchronously when the page loads already scrolled to the footer', () => {
    // IntersectionObserver's first callback is async, so without the
    // synchronous seed the chrome renders visible and animates away.
    const el = scrollableFooter();
    scrollFooterTo(el, 100);
    const h = observeFooterInView({ target: el });
    expect(h.isInView()).toBe(true);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(true);
  });

  it('sets the flag when the footer is scrolled in and clears it on the way back', () => {
    const el = scrollableFooter();
    const h = observeFooterInView({ target: el });

    scrollFooterTo(el, 100);
    fire([{ isIntersecting: true }]);
    expect(h.isInView()).toBe(true);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(true);

    scrollFooterTo(el, VIEWPORT + 200);
    fire([{ isIntersecting: false }]);
    expect(h.isInView()).toBe(false);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
  });

  it('NEVER hides chrome behind a footer the visitor cannot scroll away', () => {
    // /404 is min-height:80vh plus a 6rem footer margin, so its footer is
    // on screen at scroll 0 and the page barely scrolls. Latching here
    // took the only audio control on the site away for the whole visit,
    // while persisted music kept playing.
    const el = document.createElement('footer');
    setRect(el, VIEWPORT - 100);
    setScrollY(0);

    const h = observeFooterInView({ target: el });
    expect(h.isInView()).toBe(false);

    fire([{ isIntersecting: true }]);
    expect(h.isInView()).toBe(false);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
  });

  it('ignores repeats of the state it is already in', () => {
    const root = document.createElement('html');
    const el = scrollableFooter();
    observeFooterInView({ target: el, root });
    // Spied after construction: the synchronous seed writes by design.
    const spy = vi.spyOn(root, 'toggleAttribute');

    scrollFooterTo(el, 100);
    fire([{ isIntersecting: true }]);
    fire([{ isIntersecting: true }]);
    fire([{ isIntersecting: true }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('disconnects and clears the flag on dispose', () => {
    // A stale flag would leave the next page's chrome hidden for no
    // reason under client-side routing.
    const el = scrollableFooter();
    const h = observeFooterInView({ target: el });
    scrollFooterTo(el, 100);
    fire([{ isIntersecting: true }]);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(true);

    h.dispose();
    expect(disconnected).toBe(1);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
  });

  it('writes to a caller-supplied root instead of <html> when asked', () => {
    const root = document.createElement('div');
    const el = scrollableFooter();
    observeFooterInView({ target: el, root });
    scrollFooterTo(el, 100);
    fire([{ isIntersecting: true }]);
    expect(root.hasAttribute('data-footer-in-view')).toBe(true);
    expect(document.documentElement.hasAttribute('data-footer-in-view')).toBe(false);
  });

  it('re-evaluates on resize, since escapability depends on viewport height', () => {
    const el = scrollableFooter();
    const h = observeFooterInView({ target: el });
    expect(h.isInView()).toBe(false);

    // The visitor scrolls to the bottom, but only a resize fires — the
    // handler must still reach the right answer from the geometry.
    scrollFooterTo(el, 100);
    window.dispatchEvent(new Event('resize'));
    expect(h.isInView()).toBe(true);
  });
});
