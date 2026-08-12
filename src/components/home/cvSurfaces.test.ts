import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Two surfaces link the CV: the hero masthead pill and the site-wide footer
 * link. Both must derive the filename from `src/data/papers.ts` via
 * `cvPaper()` / `paperUrl()` rather than hardcoding `mikko-numminen-cv.pdf`.
 * A hardcoded filename here would silently drift from the data module the day
 * the PDF is renamed or replaced, producing a dead download link that no build
 * step would catch.
 *
 * Source-read rather than rendered, matching `SiteNav.test.ts`: the property
 * worth holding is what the `.astro` source contains, not one render of it.
 *
 * EVERY check runs on the comment-stripped source, and all three comment
 * syntaxes an `.astro` file can carry are stripped. Both halves matter and for
 * opposite reasons. A `//`-commented-out import left behind mid-refactor would
 * otherwise satisfy the import case while the real import was gone. And the
 * filename case, which ran against raw source in the first version, would
 * otherwise fail the build on a doc-comment that merely mentions the filename
 * while explaining why nothing may hardcode it — which is exactly the comment
 * `papers.ts` already carries, in a repo whose conventions ask for that kind of
 * why-comment.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const heroSource = readFileSync(path.join(here, 'Hero.astro'), 'utf8');
const baseLayoutSource = readFileSync(
  path.join(here, '../../layouts/BaseLayout.astro'),
  'utf8',
);

const HTML_OPEN = '<!--';
const HTML_CLOSE = '-->';

/**
 * HTML comments removed by scanning for the delimiters rather than by
 * `replace`-ing a regex.
 *
 * A regex that removes `<!--…-->` in one pass leaves the opener behind when
 * there is no closer, and CodeQL flags that as incomplete sanitization. Its
 * stated consequence, HTML injection, does not apply to a string that is only
 * ever regex-matched in assertions and never rendered. The underlying
 * observation is still right, and neither one pass nor a fixed-point loop
 * settles it, so this scans instead: every opener found is excluded along with
 * everything up to its closer, and an unterminated opener discards the rest of
 * the file. No delimiter can survive, by construction rather than by argument.
 */
const stripHtmlComments = (source: string): string => {
  const kept: string[] = [];
  let cursor = 0;
  for (;;) {
    const open = source.indexOf(HTML_OPEN, cursor);
    if (open === -1) {
      kept.push(source.slice(cursor));
      break;
    }
    kept.push(source.slice(cursor, open));
    const close = source.indexOf(HTML_CLOSE, open + HTML_OPEN.length);
    if (close === -1) break;
    cursor = close + HTML_CLOSE.length;
  }
  return kept.join('');
};

/**
 * All three comment syntaxes an `.astro` file can carry. `//` matters as much
 * as the rest: an import commented out mid-refactor would otherwise satisfy
 * the import case while the real import was gone.
 */
const stripComments = (source: string): string =>
  stripHtmlComments(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const hero = stripComments(heroSource);
const baseLayout = stripComments(baseLayoutSource);

/**
 * The CV anchor's opening tag, isolated so attribute checks cannot be satisfied
 * by some other element on the page. `class` is matched inside the attribute
 * value rather than as the literal `class="hero__cv"`, so adding a modifier
 * class does not break an assertion about something else.
 */
const cvAnchor = (code: string): string | undefined =>
  code.match(/<a\s[^>]*class="[^"]*\b(?:hero__cv|site-footer__cv)\b[^"]*"[^>]*>/)?.[0];

const SURFACES: readonly [string, string][] = [
  ['Hero.astro', hero],
  ['BaseLayout.astro', baseLayout],
];

describe('CV download surfaces', () => {
  it.each(SURFACES)(
    '%s imports cvPaper and paperUrl from the papers module',
    (_name, code) => {
      expect(code, 'must import cvPaper to build the CV link').toMatch(
        /import\s*\{[^}]*\bcvPaper\b[^}]*\}\s*from\s*['"].*data\/papers['"]/,
      );
      expect(code, 'must import paperUrl to build the CV href').toMatch(
        /import\s*\{[^}]*\bpaperUrl\b[^}]*\}\s*from\s*['"].*data\/papers['"]/,
      );
    },
  );

  it.each(SURFACES)('%s never hardcodes the CV filename', (_name, code) => {
    expect(
      code,
      'the literal filename belongs in src/data/papers.ts only; every other surface must derive it from cvPaper()/paperUrl()',
    ).not.toContain('mikko-numminen-cv.pdf');
  });

  it.each(SURFACES)('%s builds the CV anchor from the papers module', (_name, code) => {
    const anchor = cvAnchor(code);
    // Scoped to the one tag rather than searched across the file: the first
    // version checked `href={paperUrl(` and `download={` independently, which
    // an unrelated anchor carrying one of them could satisfy on behalf of a CV
    // anchor missing the other.
    expect(
      anchor,
      'no anchor carries the CV class; either it was removed or `class` no longer appears in its opening tag',
    ).toBeTruthy();
    expect(
      anchor,
      'the anchor href must call paperUrl(...) rather than a literal path',
    ).toMatch(/href=\{paperUrl\(/);
    expect(
      anchor,
      'the anchor must carry a download attribute so the browser saves the PDF instead of opening a viewer tab',
    ).toMatch(/download=\{/);
    expect(
      anchor,
      'the visible label reads "cv · pdf ↓", which is unreadable to a screen reader without an aria-label',
    ).toMatch(/aria-label=/);
  });

  it('keeps the hero CV pill inside .hero__masthead', () => {
    const mastheadIndex = hero.indexOf('hero__masthead');
    const cvIndex = hero.search(/class="[^"]*\bhero__cv\b/);
    const contentIndex = hero.indexOf('hero__content');

    expect(mastheadIndex, 'hero__masthead not found in Hero.astro').toBeGreaterThan(-1);
    expect(cvIndex, 'hero__cv not found in Hero.astro').toBeGreaterThan(-1);
    expect(contentIndex, 'hero__content not found in Hero.astro').toBeGreaterThan(-1);

    // Containment, not just ordering. Ordering alone passes when the pill is a
    // SIBLING of the masthead rather than a child, which is the arrangement
    // this case exists to reject: `.hero__masthead` is the only block in the
    // hero that is neither pointer-events:none nor aria-hidden, so a pill that
    // drifts out of it lands somewhere it cannot be clicked or cannot be named.
    // The masthead currently holds no nested element with its own closing div,
    // so its first `</div>` is its own.
    const mastheadClose = hero.indexOf('</div>', mastheadIndex);
    expect(mastheadClose, 'could not find the masthead closing tag').toBeGreaterThan(-1);

    expect(
      cvIndex,
      'hero__cv must appear after hero__masthead opens, or the pill is outside the masthead',
    ).toBeGreaterThan(mastheadIndex);
    expect(
      cvIndex,
      'hero__cv must close before the masthead does, or the pill is a sibling of the masthead rather than a child of it',
    ).toBeLessThan(mastheadClose);
    expect(
      cvIndex,
      'hero__cv must appear before hero__content, or the pill has drifted into a pointer-events:none / aria-hidden block and become unclickable or unnameable',
    ).toBeLessThan(contentIndex);
  });
});
