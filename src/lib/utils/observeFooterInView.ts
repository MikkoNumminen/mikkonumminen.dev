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

  /**
   * One evaluation, shared by the synchronous seed, the observer and the
   * resize listener, so all three can never disagree.
   *
   * The escapability test is the important half. On a page too short to
   * scroll — /404 is `min-height: 80vh` plus a 6rem footer margin, so its
   * footer is on screen at scroll 0 on any viewport taller than 480px —
   * the footer is visible and can never be moved off. Without this the
   * flag latches on at mount and never clears, taking the only audio
   * control on the site with it for the life of the page, while
   * persisted music keeps playing. Chrome only yields to a footer the
   * visitor actually scrolled to.
   */
  const sync = (): void => {
    const rect = opts.target.getBoundingClientRect();
    const escapable = rect.top + window.scrollY >= window.innerHeight;
    const next = escapable && rect.top < window.innerHeight && rect.bottom > 0;
    if (next === inView) return;
    inView = next;
    root.toggleAttribute(ATTRIBUTE, inView);
  };

  // Synchronous, because IntersectionObserver's first callback is not:
  // on a page whose footer is already on screen the chrome would
  // otherwise render visible and then animate away on load. One layout
  // read at mount is a different thing from one per scroll event.
  sync();

  const observer = new IntersectionObserver(
    () => sync(),
    // Zero threshold: chrome should move aside as soon as any part of
    // the footer is on screen, not once some fraction of it is.
    { threshold: 0 },
  );
  observer.observe(opts.target);
  // Escapability depends on viewport height, which the observer alone
  // will not re-evaluate: a rotation can turn an unscrollable page into
  // a scrollable one and back.
  window.addEventListener('resize', sync, { passive: true });

  return {
    isInView: () => inView,
    dispose: (): void => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      // Cleared on teardown: under client-side routing a stale flag
      // would leave the next page's chrome hidden for no reason.
      root.removeAttribute(ATTRIBUTE);
    },
  };
}
