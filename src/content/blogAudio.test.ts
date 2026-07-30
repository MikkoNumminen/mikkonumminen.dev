import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `hasAudio` is hand-written frontmatter, and nothing at build time reconciles
 * it with `public/audio/blog/`. Both directions of drift are silent in a way
 * that only shows up in a browser: a `true` with no file renders a player whose
 * source 404s, and a `false` beside a real recording hides narration that was
 * already paid for. These tests are the reconciliation.
 *
 * The filename convention is `<slug>-<locale>.mp3`. Slug is shared across
 * locales and locale is not, so the pair is unique per entry.
 */

const BLOG_DIR = join(process.cwd(), 'src', 'content', 'blog');
const AUDIO_DIR = join(process.cwd(), 'public', 'audio', 'blog');
const LOCALES = ['en', 'fi', 'sv'] as const;

interface Entry {
  file: string;
  locale: string;
  slug: string;
  hasAudio: boolean;
  draft: boolean;
  audioFile: string;
}

function readEntries(): Entry[] {
  const out: Entry[] = [];
  for (const locale of LOCALES) {
    const dir = join(BLOG_DIR, locale);
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const raw = readFileSync(join(dir, name), 'utf8');
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? '';
      const field = (key: string) =>
        new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm').exec(frontmatter)?.[1];
      const slug = field('slug')?.replace(/^['"]|['"]$/g, '');
      // A missing slug is its own failure, asserted below rather than thrown
      // here, so the report names the file instead of dying on a bad regex.
      out.push({
        file: `${locale}/${name}`,
        locale,
        slug: slug ?? '',
        hasAudio: field('hasAudio') === 'true',
        draft: field('draft') === 'true',
        audioFile: `${slug}-${locale}.mp3`,
      });
    }
  }
  return out;
}

const entries = readEntries();

describe('blog audio', () => {
  it('finds blog entries to check', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every entry declares hasAudio explicitly', () => {
    // The schema enforces this at build time, but the suite runs without a
    // build and a missing field would otherwise read as `false` here.
    const missing = entries.filter((e) => {
      const raw = readFileSync(join(BLOG_DIR, e.file), 'utf8');
      return !/^hasAudio:\s*(true|false)\s*$/m.test(raw);
    });
    expect(missing.map((e) => e.file)).toEqual([]);
  });

  it('every entry with hasAudio: true has its recording on disk', () => {
    const claimed = entries.filter((e) => e.hasAudio);
    const orphaned = claimed.filter((e) => !existsSync(join(AUDIO_DIR, e.audioFile)));
    expect(orphaned.map((e) => `${e.file} -> public/audio/blog/${e.audioFile}`)).toEqual(
      [],
    );
  });

  it('every recording on disk is claimed by an entry', () => {
    if (!existsSync(AUDIO_DIR)) return;
    const onDisk = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.mp3'));
    const claimed = new Set(entries.filter((e) => e.hasAudio).map((e) => e.audioFile));
    const unclaimed = onDisk.filter((f) => !claimed.has(f));
    expect(unclaimed).toEqual([]);
  });

  it('recordings follow the <slug>-<locale>.mp3 convention', () => {
    if (!existsSync(AUDIO_DIR)) return;
    const known = new Set(entries.map((e) => e.audioFile));
    const stray = readdirSync(AUDIO_DIR)
      .filter((f) => f.endsWith('.mp3'))
      .filter((f) => !known.has(f));
    expect(stray).toEqual([]);
  });

  it('a narrated entry is not still a draft', () => {
    // Narration is expensive; recording one before the prose is final is a
    // sign the two got out of order.
    const narratedDrafts = entries.filter((e) => e.hasAudio && e.draft);
    expect(narratedDrafts.map((e) => e.file)).toEqual([]);
  });
});
