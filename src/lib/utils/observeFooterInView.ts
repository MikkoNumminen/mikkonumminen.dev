/**
 * Marks `<html>` with `data-footer-in-view` while the site footer is on
 * screen, so fixed bottom-corner chrome can get out of its way.
 *
 * The bottom-left and bottom-right corners are occupied by elements that
 * are `position: fixed` and therefore do not scroll away: the audio
 * toggle and, on the home page, the field log. The footer arrives in
 * that same band at the end of every page, underneath them. The audio
 * toggle covers about 79% of the copyright run on any viewport narrower
 * than ~1376px, which is most laptops.
 *
 * Two things this deliberately is NOT:
 *
 * - Not a scroll handler. Reading `getBoundingClientRect()` on every
 *   scroll event puts a layout read on the scroll path, which ADR 0014
 *   keeps clear by construction. An IntersectionObserver answers the
 *   same question off the main scroll path, and matches the pattern
 *   `createOffscreenPauser` already established here.
 * - Not owned by a component. The collision happens on every page, and
 *   the field log — which previously owned this attribute — only exists
 *   on the home page, so every other page had chrome sitting on its
 *   footer with nothing watching for it.
 */

const ATTRIBUTE = 'data-footer-in-view';

export interface FooterInViewOptions {
  /** The footer to watch. */
  target: Element;
  /** Element carrying the flag. Defaults to `<html>` so any component's
   *  stylesheet can react without knowing who set it. */
  root?: HTMLElement;
}

export interface FooterInViewHandle {
  /** Current state, for callers that need it imperatively. */
  isInView: () => boolean;
  dispose: () => void;
}

export function observeFooterInView(opts: FooterInViewOptions): FooterInViewHandle {
  const root = opts.root ?? document.documentElement;
  let inView = false;

  // Seeded synchronously. IntersectionObserver's first callback is
  // asynchronous, so on a page short enough that the footer is already
  // on screen — or a restored scroll position at the bottom — the chrome
  // would render visible and then animate away on load. One layout read
  // at mount is a different thing from a layout read per scroll event,
  // which is what this module exists to avoid.
  const seed = opts.target.getBoundingClientRect();
  inView = seed.top < window.innerHeight && seed.bottom > 0;
  root.toggleAttribute(ATTRIBUTE, inView);

  const observer = new IntersectionObserver(
    (entries) => {
      const next = entries.some((e) => e.isIntersecting);
      if (next === inView) return;
      inView = next;
      root.toggleAttribute(ATTRIBUTE, inView);
    },
    // Zero threshold: chrome should move aside as soon as any part of
    // the footer is on screen, not once some fraction of it is.
    { threshold: 0 },
  );
  observer.observe(opts.target);

  return {
    isInView: () => inView,
    dispose: (): void => {
      observer.disconnect();
      // Cleared on teardown: under client-side routing a stale flag
      // would leave the next page's chrome hidden for no reason.
      root.removeAttribute(ATTRIBUTE);
    },
  };
}
