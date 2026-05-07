/**
 * Linkify timeline body strings against the projects data.
 *
 * Walks an arbitrary string, finds substrings that match a known project's
 * `liveUrl` host (e.g. `vuohiliitto.com`, `spacepotatis.vercel.app`), and
 * splits the string into a sequence of plain text parts and link parts.
 * The renderer (`LinkifiedText.astro`) turns link parts into `<a>` tags
 * with `target="_blank" rel="noopener noreferrer"`.
 *
 * Auto-derived from `data/projects.ts` so adding a new project with a
 * `liveUrl` automatically links its host wherever a body mentions it,
 * with no template edits.
 *
 * Build-time only — Astro frontmatter calls this; nothing here ships in
 * the runtime bundle.
 */

import { projects } from '../../data/projects';

const projectUrlsByHost: Record<string, string> = {};
for (const p of projects) {
  if (!p.liveUrl) continue;
  try {
    projectUrlsByHost[new URL(p.liveUrl).host] = p.liveUrl;
  } catch {
    /* malformed liveUrl in data — skip rather than crash the build */
  }
}

// Hoisted: sorted host list is invariant per build, so compute it once.
// Longest hosts matched first so a host that's a prefix of another
// (theoretical: `example.com` vs `sub.example.com`) doesn't win when
// the longer one is present.
const PROJECT_HOSTS: readonly string[] = Object.keys(projectUrlsByHost).sort(
  (a, b) => b.length - a.length,
);

export type BodyPart =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

/**
 * Walk the body string and split it into text spans and link spans.
 * A link span is created whenever the body contains the bare host of a
 * known project (e.g. `spacepotatis.vercel.app`); the host is the visible
 * text and the project's full `liveUrl` becomes the href.
 */
export function linkifyBody(body: string): BodyPart[] {
  if (PROJECT_HOSTS.length === 0) return [{ type: 'text', value: body }];

  const parts: BodyPart[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    let earliest: { host: string; idx: number } | null = null;
    for (const host of PROJECT_HOSTS) {
      const idx = body.indexOf(host, cursor);
      if (idx < 0) continue;
      if (!earliest || idx < earliest.idx) earliest = { host, idx };
    }
    if (!earliest) {
      parts.push({ type: 'text', value: body.slice(cursor) });
      break;
    }
    if (earliest.idx > cursor) {
      parts.push({ type: 'text', value: body.slice(cursor, earliest.idx) });
    }
    // `host` came directly from `Object.keys(projectUrlsByHost)`, so the
    // lookup is sound — the `!` satisfies noUncheckedIndexedAccess.
    parts.push({
      type: 'link',
      value: earliest.host,
      href: projectUrlsByHost[earliest.host]!,
    });
    cursor = earliest.idx + earliest.host.length;
  }
  return parts;
}
