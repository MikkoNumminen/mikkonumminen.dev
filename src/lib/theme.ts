/**
 * Single source of truth for the per-page theme identifier.
 *
 * Used by:
 *  - `BaseLayout.astro` — sets `data-theme` on `<html>` and `<body>`.
 *  - `pageTransition.ts` — paints the dissolve canvas with the destination
 *    page's accent colour by reading this same union.
 */
export type Theme = 'home' | 'projects' | 'experience' | 'contact';

export const THEMES: readonly Theme[] = ['home', 'projects', 'experience', 'contact'];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
