import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The hero's CV formation against the CV.
 *
 * `cvTargets.ts` rasterises the opening of the CV so the shape a visitor sees
 * IS the document rather than a picture of one, and it holds that opening as
 * string constants because the module is bundled into the browser while
 * `content/cv.md` is a build-time file. The copy is therefore a copy, and a
 * copy drifts: the CV was rewritten and this module went on drawing the
 * previous title, contact line and summary, so the home page advertised a role
 * and a paragraph that appear nowhere in the CV a visitor can read or
 * download. Nothing failed, because nothing was watching.
 *
 * Source-read rather than rendered, matching `cvSurfaces.test.ts` and
 * `cvPage.test.ts`: the constants are module-private and the module needs a
 * canvas, so the property worth holding is what the source says.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, 'cvTargets.ts'), 'utf8');
const markdown = readFileSync(path.join(here, '../../../../content/cv.md'), 'utf8');

/**
 * The markdown reduced to the text a reader sees: link labels without their
 * targets, and no bold markers. The contact line is a row of links in the
 * source and a row of plain words on the page, and it is the page's version
 * the field draws.
 */
const plainText = markdown
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1');

/** The value of a top-level `const NAME = '...'` (single- or multi-line). */
function constant(name: string): string {
  const match = source.match(new RegExp(`const ${name} =\\s*\\n?\\s*'([^']*)'`));
  if (!match?.[1]) throw new Error(`cvTargets.ts no longer declares ${name}`);
  return match[1];
}

describe('the hero CV block quotes content/cv.md', () => {
  it.each(['NAME_LINE', 'TITLE_LINE', 'CONTACT_LINE', 'SHARP_BODY', 'FADING_BODY'])(
    '%s appears verbatim in the CV',
    (name) => {
      expect(
        plainText,
        `cvTargets.ts's ${name} is not in content/cv.md. The particle field would ` +
          'draw text the CV no longer contains; re-quote it from the markdown.',
      ).toContain(constant(name));
    },
  );

  it('draws the CV from its opening, not from somewhere in the middle', () => {
    // The block is the TOP of the document: name, tagline, contact, then the
    // first two paragraphs in order. Quoting real-but-scattered sentences
    // would satisfy the check above while drawing a document nobody wrote.
    const positions = ['NAME_LINE', 'TITLE_LINE', 'CONTACT_LINE', 'SHARP_BODY'].map(
      (name) => plainText.indexOf(constant(name)),
    );
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
