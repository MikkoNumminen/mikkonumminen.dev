/**
 * Single source of truth for the per-page theme identifier.
 *
 * Set by `BaseLayout.astro` on `<html>` and `<body>` (`data-theme`), which drives
 * the per-theme accent tokens (`--color-{theme}-accent`) and component chrome.
 */
export type Theme = 'home' | 'projects' | 'experience' | 'contact';

export const THEMES: readonly Theme[] = ['home', 'projects', 'experience', 'contact'];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
