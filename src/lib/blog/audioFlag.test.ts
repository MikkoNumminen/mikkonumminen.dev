import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `hasAudio` against the mp3s that actually exist.
 *
 * The flag was low-stakes while it only decided whether the entry page mounted a
 * player: a wrong `true` meant the player fetched a missing file, which the
 * component's try/catch swallows, and a reader who never pressed play never knew.
 *
 * The blog index now ADVERTISES it. A card that says "audio" is a promise made
 * before the reader has clicked anything, so a stale flag stops being a silent
 * 404 and becomes the site telling someone the wrong thing. That is the reason
 * this file exists now and did not before.
 *
 * Checked against the filesystem rather than against another copy of the
 * frontmatter, because two lists that agree with each other prove nothing about
 * whether either matches the recordings.
 */

const BLOG_DIR = join(process.cwd(), 'src', 'content', 'blog');
const AUDIO_DIR = join(process.cwd(), 'public', 'audio', 'blog');

interface Entry {
  locale: string;
  file: string;
  slug: string;
  hasAudio: boolean;
  mp3: string;
}

function entries(): Entry[] {
  const found: Entry[] = [];
  for (const locale of readdirSync(BLOG_DIR)) {
    const dir = join(BLOG_DIR, locale);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(join(dir, file), 'utf-8');
      const slug = /^slug:\s*['"]?([^'"\n]+)/m.exec(text)?.[1]?.trim();
      const flag = /^hasAudio:\s*(true|false)/m.exec(text)?.[1];
      if (!slug || !flag) continue;
      found.push({
        locale,
        file,
        slug,
        hasAudio: flag === 'true',
        mp3: join(AUDIO_DIR, `${slug}-${locale}.mp3`),
      });
    }
  }
  return found;
}

describe('blog hasAudio flags', () => {
  const all = entries();

  it('finds entries to check', () => {
    // A parser that silently matched nothing would make every assertion below
    // vacuously true, which is the failure mode this whole file guards against
    // one level up.
    expect(all.length).toBeGreaterThan(5);
  });

  it('every entry claiming audio has a recording on disk', () => {
    const lying = all.filter((e) => e.hasAudio && !existsSync(e.mp3));
    expect(
      lying.map(
        (e) => `${e.locale}/${e.file} claims audio, no ${e.slug}-${e.locale}.mp3`,
      ),
    ).toEqual([]);
  });

  it('every recording on disk is claimed by its entry', () => {
    // The other direction, which matters because it is the silent one: a
    // recording exists, the flag says false, and the card tells readers there is
    // no audio while the mp3 sits there unplayed.
    const hiding = all.filter((e) => !e.hasAudio && existsSync(e.mp3));
    expect(
      hiding.map(
        (e) =>
          `${e.locale}/${e.file} says no audio, but ${e.slug}-${e.locale}.mp3 exists`,
      ),
    ).toEqual([]);
  });

  it('both states are represented, so the checks above are not vacuous', () => {
    expect(all.some((e) => e.hasAudio)).toBe(true);
    expect(all.some((e) => !e.hasAudio)).toBe(true);
  });
});
