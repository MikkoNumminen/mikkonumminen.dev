/**
 * The on-disk size of a file in `public/`, formatted for display.
 *
 * Build-time and Node-only. Three surfaces now show a download's weight before
 * a visitor commits to it (the research listing, the hero CV pill, the footer's
 * accessible name), and the third copy is where the rounding and the unit stop
 * being obviously the same on all of them.
 *
 * Resolved from `process.cwd()` and NOT from `import.meta.url`. That was the
 * first attempt in `ResearchIndexPage.astro` and it broke the build: `.astro`
 * frontmatter is bundled into `dist/.prerender/chunks/`, so a URL relative to
 * the module resolves to `dist/public/…` and every stat throws ENOENT. Both
 * `astro build` and `astro dev` run from the project root, which the chunk's
 * own location does not track.
 *
 * A missing file throws rather than degrading to a blank or a guess. A listing
 * that silently drops a paper, or a download control that understates its own
 * file, is the failure these callers exist to prevent.
 */
import { statSync } from 'node:fs';
import path from 'node:path';

export function publicFileSize(filename: string): string {
  const bytes = statSync(path.join(process.cwd(), 'public', filename)).size;
  return `${Math.round(bytes / 1024)} KB`;
}
