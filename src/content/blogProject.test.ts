import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projects } from '../data/projects';

/**
 * The schema already rejects a `project` that is not a real project id, so
 * these tests cover what a per-file schema cannot see: agreement BETWEEN the
 * three locale copies of one entry.
 *
 * Each locale is its own file with its own frontmatter, and the three are
 * edited at different times, usually by whoever is doing the translation pass.
 * Nothing stops the Finnish copy of a post claiming a different project from
 * the English one, or one copy carrying a tag the others lost. Both would
 * render happily and only show up if someone compared the pages side by side.
 */

const BLOG_DIR = join(process.cwd(), 'src', 'content', 'blog');
// Imported, not restated: a second copy of the locale list is how a locale
// removal leaves a test still checking for it.
import { LOCALES } from '../i18n';
const PROJECT_IDS = new Set(projects.map((p) => p.id));

interface Entry {
  file: string;
  locale: string;
  slug: string;
  project: string;
  tags: string;
}

function readEntries(): Entry[] {
  const out: Entry[] = [];
  for (const locale of LOCALES) {
    const dir = join(BLOG_DIR, locale);
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const raw = readFileSync(join(dir, name), 'utf8');
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? '';
      const read = (key: string) => {
        const prefix = `${key}:`;
        for (const line of frontmatter.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith(prefix)) {
            return trimmed
              .slice(prefix.length)
              .trim()
              .replace(/^['"]|['"]$/g, '');
          }
        }
        return '';
      };
      out.push({
        file: `${locale}/${name}`,
        locale,
        slug: read('slug'),
        project: read('project'),
        tags: read('tags'),
      });
    }
  }
  return out;
}

const entries = readEntries();
const bySlug = new Map<string, Entry[]>();
for (const e of entries) {
  const group = bySlug.get(e.slug) ?? [];
  group.push(e);
  bySlug.set(e.slug, group);
}

describe('blog project and tags', () => {
  it('finds entries to check', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every declared project is a real project id', () => {
    const unknown = entries
      .filter((e) => e.project && !PROJECT_IDS.has(e.project))
      .map((e) => `${e.file} -> ${e.project}`);
    expect(unknown).toEqual([]);
  });

  it('all locales of an entry name the same project', () => {
    const disagreeing: string[] = [];
    for (const [slug, group] of bySlug) {
      const values = new Set(group.map((e) => e.project));
      if (values.size > 1)
        disagreeing.push(
          `${slug}: ${[...values].map((v) => v || '(none)').join(' vs ')}`,
        );
    }
    expect(disagreeing).toEqual([]);
  });

  it('all locales of an entry carry the same tags', () => {
    // Tags are subject matter, not prose, so they are copied verbatim across
    // locales rather than translated. A divergence means one copy was edited
    // and the others were not.
    const disagreeing: string[] = [];
    for (const [slug, group] of bySlug) {
      const values = new Set(group.map((e) => e.tags));
      if (values.size > 1) disagreeing.push(`${slug}: ${[...values].join(' vs ')}`);
    }
    expect(disagreeing).toEqual([]);
  });
});
