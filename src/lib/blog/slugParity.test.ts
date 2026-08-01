import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { LOCALES } from '../../i18n';

/**
 * Read the markdown off disk rather than through `getCollection`, so these
 * invariants hold without booting Astro and fail in `vitest` rather than at
 * the end of a build.
 *
 * The runtime already degrades gracefully when a slug is missing a locale —
 * the switcher and the hreflang alternates are restricted to the locales an
 * entry is published in. This suite is the separate, stricter claim: the
 * repository does not intend to ship a half-translated entry at all.
 */
// Resolved from a plain string rather than `new URL(rel, import.meta.url)`:
// the suite runs under jsdom, whose global URL is not brand-compatible with
// node's `fileURLToPath`, which rejects it as "not of scheme file".
const CONTENT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'content',
  'blog',
);

interface BlogFile {
  /** Repo-relative so a failure message points straight at the offending file. */
  path: string;
  dirLocale: string;
  locale: string | undefined;
  slug: string | undefined;
  draft: boolean;
}

function frontmatterField(source: string, field: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  const body = block?.[1];
  if (body === undefined) return undefined;

  const match = new RegExp(`^${field}:[ \\t]*(.+)$`, 'm').exec(body);
  const raw = match?.[1];
  if (raw === undefined) return undefined;

  return raw.trim().replace(/^['"]|['"]$/g, '');
}

function readBlogFiles(): BlogFile[] {
  return readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(CONTENT_ROOT, dir.name))
        .filter((name) => name.endsWith('.md'))
        .map((name) => {
          const source = readFileSync(join(CONTENT_ROOT, dir.name, name), 'utf8');
          return {
            path: `src/content/blog/${dir.name}/${name}`,
            dirLocale: dir.name,
            locale: frontmatterField(source, 'locale'),
            slug: frontmatterField(source, 'slug'),
            draft: frontmatterField(source, 'draft') === 'true',
          };
        }),
    );
}

const files = readBlogFiles();

describe('blog content on disk', () => {
  // Without this, a wrong CONTENT_ROOT or a frontmatter format the reader
  // above cannot parse would leave every assertion below iterating an empty
  // list and reporting green.
  it('finds markdown entries in every locale directory', () => {
    for (const locale of LOCALES) {
      const found = files.filter((f) => f.dirLocale === locale);
      expect(
        found.length,
        `no entries under src/content/blog/${locale}/`,
      ).toBeGreaterThan(0);
    }
  });

  it('gives every file a parseable slug and a locale matching its directory', () => {
    for (const f of files) {
      expect(f.slug, `${f.path} has no readable slug`).toBeTruthy();
      expect(f.locale, `${f.path} declares locale "${f.locale}"`).toBe(f.dirLocale);
    }
  });

  // Two entries in one locale sharing a slug collapse onto a single route:
  // the index lists both cards, both link to the same URL, and one entry is
  // unreachable. Astro reports this as a getStaticPaths duplicate, late.
  it('uses each slug at most once per locale', () => {
    const claimedBy = new Map<string, string>();
    for (const f of files) {
      const key = `${f.dirLocale}/${f.slug}`;
      const previous = claimedBy.get(key);
      expect(
        previous,
        `${f.path} reuses slug "${f.slug}", already claimed by ${previous}`,
      ).toBeUndefined();
      claimedBy.set(key, f.path);
    }
  });

  // Swedish is deliberately outside this invariant since 2026-08-01. It is
  // batched occasionally rather than written per entry, so requiring it would
  // block every new post on a translation nobody has scheduled — which is the
  // opposite of what the rule was for. The rule itself stands for the locales
  // that ARE written per entry: English and Finnish must both ship, so a
  // half-translated entry still cannot reach the site.
  const REQUIRED_LOCALES = LOCALES.filter((l) => l !== 'sv');

  it('publishes every non-draft slug in English and Finnish', () => {
    const publishedIn = new Map<string, Set<string>>();
    for (const f of files) {
      if (f.draft || f.slug === undefined) continue;
      const locales = publishedIn.get(f.slug) ?? new Set<string>();
      locales.add(f.dirLocale);
      publishedIn.set(f.slug, locales);
    }

    for (const [slug, locales] of publishedIn) {
      for (const locale of REQUIRED_LOCALES) {
        expect(
          locales.has(locale),
          `slug "${slug}" is published in [${[...locales].sort().join(', ')}] but src/content/blog/${locale}/${slug}.md is missing or still a draft`,
        ).toBe(true);
      }
    }
  });

  // Swedish is optional, but not half-done. A Swedish file that exists while
  // stuck on draft is an entry someone started and abandoned, and it reads as
  // "no Swedish" to the site while looking like "Swedish exists" in the repo.
  it('never leaves a Swedish entry stranded as a draft', () => {
    const publishedSlugs = new Set(
      files.filter((f) => !f.draft && f.dirLocale !== 'sv').map((f) => f.slug),
    );
    const stranded = files.filter(
      (f) => f.dirLocale === 'sv' && f.draft && publishedSlugs.has(f.slug),
    );
    expect(
      stranded.map((f) => f.path),
      'a Swedish entry is a draft while the same slug is published elsewhere',
    ).toEqual([]);
  });
});
