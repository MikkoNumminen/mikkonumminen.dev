/**
 * Publishes how far the footer has pushed into the bottom of the
 * viewport, as `--footer-lift` on `<html>`, so fixed bottom-corner
 * chrome can come to rest on top of it instead of sitting over it.
 *
 * The audio toggle and the field log are `position: fixed` in the bottom
 * corners, so they do not scroll away; the footer arrives in that same
 * band at the end of every page, underneath them. Measured at 884px, the
 * toggle covered about 79% of the copyright run, and the field log sat
 * over the build credit.
 *
 * The obvious fix — hide the chrome while the footer is on screen —
 * trades a legibility bug for a worse one: it takes away the only audio
 * control on the site at the bottom of every page, destroys focus if a
 * keyboard user is inside it, and latches permanently on any page too
 * short to scroll its footer away. Lifting instead keeps every control
 * present and interactive; the footer simply slides underneath.
 *
 * No layout read on the scroll path. The footer's position in DOCUMENT
 * space is measured once at mount and on resize; per scroll this is
 * arithmetic on `scrollY`, and the write is coalesced onto a rAF.
 */

const PROPERTY = '--footer-lift';

export interface FooterOverlapOptions {
  /** The footer to stay clear of. */
  target: HTMLElement;
  /** Element carrying the custom property. Defaults to `<html>` so any
   *  component's stylesheet can react without knowing who set it. */
  root?: HTMLElement;
}

export interface FooterOverlapHandle {
  /** Current lift in CSS pixels; 0 when the footer is not yet in view. */
  lift: () => number;
  /** Re-measure the footer's document position. Exposed for callers that
   *  change layout in ways a resize event does not cover. */
  remeasure: () => void;
  dispose: () => void;
}

export function trackFooterOverlap(opts: FooterOverlapOptions): FooterOverlapHandle {
  const root = opts.root ?? document.documentElement;
  let footerTopInDocument = 0;
  let lift = 0;
  let frame = 0;

  const measure = (): void => {
    footerTopInDocument = opts.target.getBoundingClientRect().top + window.scrollY;
  };

  const apply = (): void => {
    frame = 0;
    // How far the footer's top edge has risen above the bottom of the
    // viewport. Negative until the footer appears, which clamps to zero.
    const footerTopInViewport = footerTopInDocument - window.scrollY;
    const next = Math.max(0, Math.round(window.innerHeight - footerTopInViewport));
    if (next === lift) return;
    lift = next;
    // The chrome keeps its own bottom offset, so lifting by the full
    // intrusion leaves exactly that offset as the gap above the footer —
    // the same rhythm the corners already use, without this module
    // needing to know what that offset is.
    root.style.setProperty(PROPERTY, `${lift}px`);
  };

  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(apply);
  };

  const onResize = (): void => {
    measure();
    apply();
  };

  measure();
  // Applied synchronously so a page that loads already scrolled to its
  // footer renders with the chrome in the right place, rather than
  // animating into it.
  apply();

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  return {
    lift: () => lift,
    remeasure: onResize,
    dispose: (): void => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      // Cleared on teardown: under client-side routing a stale lift
      // would displace the next page's chrome.
      root.style.removeProperty(PROPERTY);
    },
  };
}
