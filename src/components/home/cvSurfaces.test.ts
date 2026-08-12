import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Two surfaces link the CV: the hero masthead pill and the site-wide footer
 * link. Both must derive the filename from `src/data/papers.ts` via
 * `cvPaper()` / `paperUrl()` rather than hardcoding
 * `mikko-numminen-cv.pdf`. A hardcoded filename here would silently drift
 * from the data module the day the PDF is renamed or replaced, producing a
 * dead download link that no build step would catch.
 *
 * Source-read rather than rendered, matching `SiteNav.test.ts`: the property
 * worth holding is what the `.astro` source contains, not one render of it.
 * Comments are stripped first so prose describing the rule (like this
 * block) can't satisfy or violate the rule it documents.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const heroSource = readFileSync(path.join(here, 'Hero.astro'), 'utf8');
const baseLayoutSource = readFileSync(
  path.join(here, '../../layouts/BaseLayout.astro'),
  'utf8',
);

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const hero = stripComments(heroSource);
const baseLayout = stripComments(baseLayoutSource);

describe('CV download surfaces', () => {
  it.each([
    ['Hero.astro', hero],
    ['BaseLayout.astro', baseLayout],
  ])('%s imports cvPaper and paperUrl from the papers module', (_name, code) => {
    expect(code, 'must import cvPaper to build the CV link').toMatch(
      /import\s*\{[^}]*\bcvPaper\b[^}]*\}\s*from\s*['"].*data\/papers['"]/,
    );
    expect(code, 'must import paperUrl to build the CV href').toMatch(
      /import\s*\{[^}]*\bpaperUrl\b[^}]*\}\s*from\s*['"].*data\/papers['"]/,
    );
  });

  it.each([
    ['Hero.astro', hero],
    ['BaseLayout.astro', baseLayout],
  ])(
    '%s renders an anchor whose href calls paperUrl and which carries download',
    (_name, code) => {
      expect(
        code,
        'the anchor href must call paperUrl(...) rather than a literal path',
      ).toMatch(/href=\{paperUrl\(/);
      expect(
        code,
        'the anchor must carry a download attribute so the browser saves the PDF',
      ).toMatch(/download=\{/);
    },
  );

  it.each([
    ['Hero.astro', heroSource],
    ['BaseLayout.astro', baseLayoutSource],
  ])('%s never hardcodes the CV filename', (_name, code) => {
    expect(
      code,
      'the literal filename belongs in src/data/papers.ts only; every other surface must derive it from cvPaper()/paperUrl()',
    ).not.toContain('mikko-numminen-cv.pdf');
  });

  it.each([
    ['Hero.astro', hero],
    ['BaseLayout.astro', baseLayout],
  ])('%s gives the CV anchor an aria-label', (_name, code) => {
    const anchor = code.match(
      /<a\s+class="(?:hero__cv|site-footer__cv)"[\s\S]{0,400}?>/,
    )?.[0];
    expect(
      anchor,
      'could not find the CV anchor to check for an aria-label',
    ).toBeTruthy();
    expect(
      anchor,
      'the visible label reads "cv · pdf ↓", which is unreadable to a screen reader without an aria-label',
    ).toMatch(/aria-label=/);
  });

  it('places the hero CV pill inside .hero__masthead, not .hero__content or .hero__corners', () => {
    const mastheadIndex = hero.indexOf('hero__masthead');
    const cvIndex = hero.indexOf('hero__cv"');
    const contentIndex = hero.indexOf('hero__content');

    expect(mastheadIndex, 'hero__masthead not found in Hero.astro').toBeGreaterThan(-1);
    expect(cvIndex, 'hero__cv not found in Hero.astro').toBeGreaterThan(-1);
    expect(contentIndex, 'hero__content not found in Hero.astro').toBeGreaterThan(-1);

    // .hero__content is pointer-events:none and .hero__corners is
    // aria-hidden="true", so a link placed in either is unclickable or
    // unnameable. Positional ordering is the only signal a source read has
    // for nesting: the pill must sit after the masthead opens and before
    // the content block that follows it.
    expect(
      cvIndex,
      'hero__cv must appear after hero__masthead opens, or the pill is not inside the masthead',
    ).toBeGreaterThan(mastheadIndex);
    expect(
      cvIndex,
      'hero__cv must appear before hero__content, or the pill has drifted into a pointer-events:none / aria-hidden block and become unclickable or unnameable',
    ).toBeLessThan(contentIndex);
  });
});
