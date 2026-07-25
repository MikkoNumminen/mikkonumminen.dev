/**
 * The wire between the things that happen and the panel that reports
 * them: one `field:log` CustomEvent on `document`.
 *
 * A document-level event rather than another scene-handle callback,
 * even though `onRipple`/`onFormed` set that pattern — the emitters live
 * in three separate places (the scene, the gate in the page's boot
 * script, the GSAP timeline), and threading a callback through all
 * three would widen three interfaces and hand the timeline a dependency
 * on the scene that it does not currently have. It also matches the one
 * cross-component eventing precedent the repo already has,
 * `bg-audio:state` in BackgroundAudio.astro.
 *
 * Emitting is unconditional and cheap: with no listener mounted,
 * dispatchEvent on a document with no registered handler is a no-op, so
 * the scene never has to know whether a panel exists.
 */
import type { FieldLogEvent } from './fieldLog';

export const FIELD_LOG_EVENT = 'field:log';

/** Fire an event at whatever is listening. Never throws — a log that
 *  breaks the scene reporting on it would be a poor trade. */
export function emitFieldLog(event: FieldLogEvent): void {
  try {
    document.dispatchEvent(new CustomEvent(FIELD_LOG_EVENT, { detail: event }));
  } catch {
    /* the page is more important than its log */
  }
}

/** Subscribe. Returns an unsubscribe so callers can tear down cleanly
 *  under client-side routing. */
export function onFieldLog(handler: (event: FieldLogEvent) => void): () => void {
  const listener = (e: Event): void => {
    const detail = (e as CustomEvent<FieldLogEvent>).detail;
    if (detail) handler(detail);
  };
  document.addEventListener(FIELD_LOG_EVENT, listener);
  return () => document.removeEventListener(FIELD_LOG_EVENT, listener);
}
