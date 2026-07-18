// Compare two PDFs by content, ignoring the stamps Chrome varies per render.
//
// Chrome writes a fresh /CreationDate, /ModDate and file /ID into every render,
// so two renders of identical input are never byte-identical. Scripts that
// regenerate a COMMITTED pdf therefore dirty the working tree on every build
// unless they compare content rather than bytes.
//
// Both stamps are fixed-width, so masking them cannot shift the xref byte
// offsets that follow — two renders of the same content mask to the same
// string. The mask is deliberately applied to the whole file rather than just
// the trailer: a stray match inside a compressed stream would make two
// DIFFERENT files compare equal, but a real content change shifts bytes
// throughout (and usually the file length), so it cannot hide inside one
// fixed-width mask. Anchoring tighter would risk the opposite error — a false
// "changed", which is exactly the churn this exists to stop.
import { createHash } from 'node:crypto';

const VOLATILE_PDF_FIELDS = /\/(?:CreationDate|ModDate)\s*\([^)]*\)|\/ID\s*\[[^\]]*\]/g;

/** True when two PDF buffers differ only in per-render metadata stamps. */
export function pdfContentEquals(a, b) {
  return mask(a) === mask(b);
}

/** Fingerprint of everything that determines the rendered PDF. */
export function inputFingerprint(html) {
  return createHash('sha256').update(html, 'utf8').digest('hex');
}

/**
 * Whether Chrome must be run at all.
 *
 * Comparing rendered PDFs catches a changed document but NOT a changed
 * renderer: Chrome's internal encoding (font subsetting, object layout) shifts
 * between browser versions, so after a Chrome upgrade an unchanged document
 * re-renders to different bytes and the committed artifact churns once for no
 * visible reason. The generated HTML is the true input — it is a pure function
 * of the registry JSON, the stylesheet, and this script's layout code, and it
 * is blind to which browser will print it. So fingerprint the HTML and skip the
 * render entirely when it has not moved.
 *
 * The fingerprint file must be committed: a fresh clone or new worktree with no
 * stored hash would otherwise re-render and reintroduce exactly the divergence
 * this prevents.
 */
export function shouldRender({ force, pdfExists, storedFingerprint, fingerprint }) {
  if (force || !pdfExists) return true;
  return storedFingerprint !== fingerprint;
}

function mask(buf) {
  // latin1 is a lossless byte<->char mapping, so binary survives the replace.
  return buf.toString('latin1').replace(VOLATILE_PDF_FIELDS, '');
}
