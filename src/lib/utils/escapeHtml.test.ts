import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

// escapeHtml is the single HTML-injection boundary between untrusted strings
// (command args, skill data, hover-label text) and the `innerHTML` sinks in
// the terminal output path and the Three.js hover label. These tests pin the
// exact entity output and, crucially, that no HTML-significant character can
// survive the escape.

describe('escapeHtml', () => {
  it('escapes each of the five significant characters to its entity', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('leaves a string with no significant characters untouched', () => {
    expect(escapeHtml('hello world 123 — åäö')).toBe('hello world 123 — åäö');
  });

  it('returns an empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes in a single pass — the & it introduces is not re-escaped', () => {
    // If the implementation walked its own output it would double-escape and
    // produce '&amp;amp;'. A single pass over the original string keeps it
    // idempotent against its own entities.
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('neutralizes a script-injection payload — no raw <, >, or " survives', () => {
    const payload = '<script>alert("xss")</script>';
    const out = escapeHtml(payload);
    expect(out).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(out).not.toMatch(/[<>"]/);
  });

  it('neutralizes an attribute-breakout payload using quotes and apostrophes', () => {
    const out = escapeHtml("\" onmouseover='alert(1)'");
    expect(out).not.toMatch(/["'<>]/);
    expect(out).toContain('&quot;');
    expect(out).toContain('&#39;');
  });
});
