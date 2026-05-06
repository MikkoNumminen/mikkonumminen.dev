/**
 * Escape the five HTML-significant characters so a string can be safely
 * interpolated into `innerHTML`. Shared between the terminal output path
 * and the Three.js hover label, which were each carrying their own copy.
 *
 * The character class in the regex guarantees `c` is one of the five keys
 * in the lookup table, so the result is `string` (not `string | undefined`)
 * and we don't need a non-null assertion.
 */
const HTML_ESCAPES: Record<'&' | '<' | '>' | '"' | "'", string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c as keyof typeof HTML_ESCAPES]);
}
