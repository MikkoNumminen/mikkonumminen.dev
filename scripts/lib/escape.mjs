// HTML-escape the five significant characters. Mirrors
// `src/lib/utils/escapeHtml.ts` so the build-time PDF generators and the
// runtime terminal share the same escape contract — keeps a future audit
// from finding two diverging implementations.
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// http(s) only — blocks `javascript:` / `data:` payloads from a malformed
// data file landing in an href attribute. Mirrors the same check in
// `src/lib/terminal/skills.ts` so the PDF and terminal surfaces have the
// same trust model.
export function isSafeHref(url) {
  return (
    typeof url === 'string' &&
    (url.startsWith('https://') || url.startsWith('http://'))
  );
}
