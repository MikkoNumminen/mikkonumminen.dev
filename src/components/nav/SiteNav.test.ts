import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getTranslations, LOCALES } from '../../i18n';

/**
 * The top nav and the front-page card grid must offer the same destinations.
 *
 * `/research` shipped in the card grid and not in the nav, so the page existed,
 * was linked from the home page, and was invisible from every other page on the
 * site. Nobody noticed until the owner went looking for it in the bar. Two
 * hand-maintained lists of the same thing drift the first time one is edited,
 * which is the same reason `src/data/papers.ts` exists.
 *
 * Source-read rather than rendered: both lists are plain arrays in `.astro`
 * frontmatter, and the property worth holding is that the ARRAYS agree, not that
 * one particular render did.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const nav = readFileSync(path.join(here, 'SiteNav.astro'), 'utf8');
const cards = readFileSync(path.join(here, '../home/NavCards.astro'), 'utf8');

/** Every `localizePath('/x', locale)` destination in a component's frontmatter. */
function destinations(source: string): string[] {
  return [...source.matchAll(/localizePath\('([^']+)'/g)].map((m) => m[1] as string);
}

describe('SiteNav', () => {
  const navPaths = destinations(nav);
  const cardPaths = destinations(cards);

  it('finds destinations in both components', () => {
    // Guards the guard: a renamed helper would empty both lists and make the
    // comparison below vacuously true. Floors are the counts that ship, so a
    // dropped link fails here rather than passing a stale threshold.
    expect(navPaths.length).toBeGreaterThanOrEqual(6);
    expect(cardPaths.length).toBeGreaterThanOrEqual(5);
  });

  it('offers every destination the front-page cards do', () => {
    // One direction only. The nav carries `/` and the cards do not, which is
    // deliberate: a card back to the page you are on is noise.
    for (const dest of cardPaths) {
      expect(
        navPaths,
        `the card grid links ${dest} and the top nav does not, so the page is unreachable from anywhere else`,
      ).toContain(dest);
    }
  });

  it('links the research page', () => {
    // Named explicitly rather than left to the loop above, so deleting the card
    // cannot quietly satisfy the parity check by removing the requirement.
    expect(navPaths).toContain('/research');
  });

  it('labels every link in every locale', () => {
    for (const locale of LOCALES) {
      const t = getTranslations(locale);
      for (const key of [
        'home',
        'projects',
        'experience',
        'blog',
        'research',
        'contact',
      ] as const) {
        expect(t.nav[key], `${locale}.nav.${key}`).toBeTruthy();
      }
    }
  });
});
