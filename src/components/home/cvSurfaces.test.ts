import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FIELD_SHAPE_ATTR, shapeAttrValue } from '../../lib/home/fieldShapeState';
import { SHAPES } from '../../lib/three/field/tuning';

/**
 * Three surfaces link the CV: the hero masthead pill, the site-wide footer
 * link, and the mobile contact card's button. All must derive the filename from
 * `src/data/papers.ts` via `cvPaper()` / `paperUrl()` rather than hardcoding
 * `mikko-numminen-cv.pdf`. A hardcoded filename here would silently drift from
 * the data module the day the PDF is renamed or replaced, producing a dead
 * download link that no build step would catch — which is what the mobile card
 * did, unguarded, for as long as it had a CV button.
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
const mobileContactCardSource = readFileSync(
  path.join(here, '../contact/MobileContactCard.astro'),
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
const mobileContactCard = stripComments(mobileContactCardSource);

/**
 * Ends a class name without swallowing its BEM siblings.
 *
 * `\b` is wrong here: a hyphen is a non-word character, so `\bhero__cv\b`
 * matches inside `hero__cv-row` and `hero__cv-read` as happily as it matches
 * `hero__cv`. The pill happens to appear before both in the source today, so a
 * `.match()` returned the right tag by luck; reordering the markup would have
 * silently pointed every assertion below at the read link instead.
 */
const CLASS_END = '(?![\\w-])';

/**
 * The CV anchor's opening tag, isolated so attribute checks cannot be satisfied
 * by some other element on the page. `class` is matched inside the attribute
 * value rather than as the literal `class="hero__cv"`, so adding a modifier
 * class does not break an assertion about something else.
 */
const cvAnchor = (code: string): string | undefined =>
  code.match(
    new RegExp(
      `<a\\s[^>]*class="[^"]*\\b(?:hero__cv|site-footer__cv)${CLASS_END}[^"]*"[^>]*>`,
    ),
  )?.[0];

const SURFACES: readonly [string, string][] = [
  ['Hero.astro', hero],
  ['BaseLayout.astro', baseLayout],
  ['MobileContactCard.astro', mobileContactCard],
];

/**
 * The subset whose CV anchor carries a class of its own. The mobile card's
 * three buttons all share `mcc__btn`, so there is nothing in its markup that
 * identifies the CV one — it is held to the derivation checks, which is where
 * the rename drift lives, and not to the anchor-shape one.
 */
const CLASSED_SURFACES = SURFACES.filter(([name]) => name !== 'MobileContactCard.astro');

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

  it.each(CLASSED_SURFACES)(
    '%s builds the CV anchor from the papers module',
    (_name, code) => {
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
    },
  );

  it('keeps both hero CV controls inside .hero__masthead', () => {
    const mastheadIndex = hero.indexOf('hero__masthead');
    const rowIndex = hero.search(new RegExp(`class="[^"]*\\bhero__cv-row${CLASS_END}`));
    const cvIndex = hero.search(new RegExp(`class="[^"]*\\bhero__cv${CLASS_END}`));
    const readIndex = hero.search(new RegExp(`class="[^"]*\\bhero__cv-read${CLASS_END}`));
    const contentIndex = hero.indexOf('hero__content');

    expect(mastheadIndex, 'hero__masthead not found in Hero.astro').toBeGreaterThan(-1);
    expect(rowIndex, 'hero__cv-row not found in Hero.astro').toBeGreaterThan(-1);
    expect(cvIndex, 'hero__cv not found in Hero.astro').toBeGreaterThan(-1);
    expect(readIndex, 'hero__cv-read not found in Hero.astro').toBeGreaterThan(-1);
    expect(contentIndex, 'hero__content not found in Hero.astro').toBeGreaterThan(-1);

    // Containment, not just ordering. Ordering alone passes when a control is a
    // SIBLING of the masthead rather than a child, which is the arrangement
    // this case exists to reject: `.hero__masthead` is the only block in the
    // hero that is neither pointer-events:none nor aria-hidden, so a control
    // that drifts out of it lands somewhere it cannot be clicked or cannot be
    // named.
    //
    // Proved by nesting depth rather than by parsing. There is no closing div
    // between the masthead opening and the row opening, so the row cannot be
    // anywhere but inside the masthead; the same argument then places both
    // controls inside the row. The second step needs the row to contain no
    // nested div of its own, which is asserted rather than assumed, because
    // that is exactly the assumption the earlier version of this test made
    // about the MASTHEAD and which adding the row quietly invalidated.
    // Both halves of the nesting argument, and the first one is not optional:
    // the "before any div closes" check alone is satisfied by a row that sits
    // entirely BEFORE the masthead, since then rowIndex precedes mastheadIndex
    // and so precedes every closing tag after it too. Moving the row above the
    // masthead is a real way to break this, and it takes both bounds to reject.
    const firstCloseAfterMasthead = hero.indexOf('</div>', mastheadIndex);
    expect(
      firstCloseAfterMasthead,
      'could not find any closing div after the masthead opens',
    ).toBeGreaterThan(-1);
    expect(
      rowIndex,
      'hero__cv-row must open after hero__masthead opens, or the row precedes the masthead rather than sitting inside it',
    ).toBeGreaterThan(mastheadIndex);
    expect(
      rowIndex,
      'hero__cv-row must open before any div closes after the masthead, or the row is not inside the masthead',
    ).toBeLessThan(firstCloseAfterMasthead);

    const rowClose = hero.indexOf('</div>', rowIndex);
    expect(rowClose, 'could not find the row closing tag').toBeGreaterThan(-1);
    expect(
      hero.slice(rowIndex, rowClose),
      'the row gained a nested div, so its first closing tag is no longer its own and the containment checks below prove nothing',
    ).not.toMatch(/<div\b/);

    for (const [label, index] of [
      ['hero__cv', cvIndex],
      ['hero__cv-read', readIndex],
    ] as const) {
      expect(
        index,
        `${label} must appear after hero__cv-row opens, or it is outside the row`,
      ).toBeGreaterThan(rowIndex);
      expect(
        index,
        `${label} must appear before the row closes, or it is a sibling of the row rather than a child of it`,
      ).toBeLessThan(rowClose);
      expect(
        index,
        `${label} must appear before hero__content, or it has drifted into a pointer-events:none / aria-hidden block and become unclickable or unnameable`,
      ).toBeLessThan(contentIndex);
    }
  });

  /**
   * The highlight that lights both controls while the field holds the CV
   * formation is a string match ACROSS files: `fieldShapeState.ts` writes
   * `shapeAttrValue(cv lane)` into `FIELD_SHAPE_ATTR` on the element carrying
   * `data-section-hero`, and only this stylesheet knows either name. Rename
   * the attribute or the lane, or drop the `hero` class off the marked
   * section, and typecheck, lint and every unit test stay green while the
   * highlight silently never fires again.
   *
   * Matched against the comment-stripped source for the same reason the
   * filename case is: the block comment above the rule names the attribute
   * while explaining it, and it must not be able to satisfy this on the real
   * rule's behalf.
   */
  it('keeps the CV highlight selector in step with the state module', () => {
    const cvValue = shapeAttrValue(SHAPES.indexOf('cv'));
    expect(cvValue, 'the field no longer has a cv lane').not.toBeNull();

    expect(
      hero,
      `no rule selects [${FIELD_SHAPE_ATTR}='${cvValue}']; the attribute or the lane name was renamed without the stylesheet`,
    ).toMatch(new RegExp(`\\[${FIELD_SHAPE_ATTR}=['"]?${cvValue}['"]?\\]`));

    // The tracker targets `[data-section-hero]`; the rules key off `.hero`.
    // They have to be the same element or the attribute lands somewhere no
    // selector reads.
    const marked = hero.match(/<section\s[^>]*\bdata-section-hero\b[^>]*>/)?.[0];
    expect(marked, 'no <section> carries data-section-hero').toBeTruthy();
    expect(
      marked,
      'the element the shape attribute is written onto must carry the class the highlight rules select',
    ).toMatch(new RegExp(`class="[^"]*\\bhero${CLASS_END}`));
  });

  /**
   * The read link is the other half of what the CV surfaces owe a visitor: one
   * control to take the file, one to read it without taking it. It is checked
   * separately from the download surfaces above because it points at a route
   * rather than at the PDF, so none of the `papers.ts` derivation applies to it.
   */
  it('points the hero read link at the localized /cv route', () => {
    const anchor = hero.match(
      new RegExp(`<a\\s[^>]*class="[^"]*\\bhero__cv-read${CLASS_END}[^"]*"[^>]*>`, 's'),
    )?.[0];

    expect(anchor, 'no anchor carries hero__cv-read').toBeTruthy();
    expect(
      anchor,
      'the read link must route through localizePath, or the Finnish page links the English CV',
    ).toMatch(/href=\{localizePath\(\s*'\/cv'/);
    expect(
      anchor,
      'the visible label is lowercase prose fragment, so it needs an aria-label to stand alone in a list of links',
    ).toMatch(/aria-label=/);
  });
});
