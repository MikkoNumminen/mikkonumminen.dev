import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * `CvPage.astro` renders `content/cv.md` through the `cv` content collection
 * defined in `src/content.config.ts`. Both the markdown and the component are
 * source-read rather than rendered, matching `SiteNav.test.ts` and
 * `cvSurfaces.test.ts`: `.astro` files are not exercised by this test runner,
 * so the property worth holding is what the source files contain, not one
 * render of them.
 *
 * `content/` sits outside `src/`, at the repo root, which is why the path
 * below climbs two directories rather than one.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const cvMarkdownPath = path.join(here, '../../content/cv.md');
const cvMarkdown = readFileSync(cvMarkdownPath, 'utf8');
const cvPageSource = readFileSync(path.join(here, 'CvPage.astro'), 'utf8');

/**
 * Splits frontmatter from body the same way the `gray-matter`-style `---`
 * fence works. A missing closing fence would leave `body` as `undefined`,
 * which the emptiness check below turns into a clear failure rather than a
 * crash.
 */
function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return { frontmatter: match?.[1] ?? '', body: match?.[2] ?? '' };
}

const { frontmatter, body } = splitFrontmatter(cvMarkdown);

/**
 * Comment stripping duplicated from `cvSurfaces.test.ts` rather than
 * imported. The repo's rule of three says wait for a third use before
 * extracting a shared helper, and this is only the second.
 *
 * All three comment syntaxes an `.astro` file can carry are stripped, the
 * HTML kind by scanning for delimiters rather than a single regex pass, so an
 * unterminated `<!--` cannot leave the opener behind and the filename check
 * below cannot be tripped by a doc comment that merely mentions the filename
 * while explaining why nothing may hardcode it.
 */
const HTML_OPEN = '<!--';
const HTML_CLOSE = '-->';

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

const stripComments = (source: string): string =>
  stripHtmlComments(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const cvPage = stripComments(cvPageSource);

describe('content/cv.md', () => {
  it('exists with a non-empty body after frontmatter', () => {
    // CvPage.astro renders this file's body through <Content />. A moved or
    // renamed source would still pass a schema check on the frontmatter alone
    // while the build shipped a blank page below the header row.
    expect(
      body.trim().length,
      'content/cv.md has no body after its frontmatter fence',
    ).toBeGreaterThan(0);
  });

  it('declares title and kind: cv in frontmatter', () => {
    // The cv collection's zod schema in content.config.ts requires both
    // fields with no default. Dropping either fails the astro build at the
    // schema, in a place that never names this page or this file.
    expect(frontmatter, 'frontmatter is missing a title: field').toMatch(
      /^title:\s*.+$/m,
    );
    expect(
      frontmatter,
      'frontmatter is missing kind: cv, which the schema requires',
    ).toMatch(/^kind:\s*cv\s*$/m);
  });

  it('opens its body with a top-level # heading', () => {
    // CvPage.astro deliberately renders no title of its own and relies on
    // this file's own h1 being the page's only one. If the markdown loses
    // its h1, /cv ships with no h1 at all rather than falling back to a
    // second one somewhere else.
    expect(
      body,
      "content/cv.md has no top-level # heading; CvPage.astro depends on this being the page's only h1",
    ).toMatch(/^#\s+\S/m);
  });
});

describe('CvPage.astro', () => {
  it('renders no h1 of its own', () => {
    // The other half of the same invariant: content/cv.md supplies the one
    // and only h1. An h1 added here would state the name twice on the page.
    expect(
      cvPage,
      "CvPage.astro contains an <h1 tag; content/cv.md already supplies the page's h1",
    ).not.toMatch(/<h1[\s>]/);
  });

  it('resolves the cv entry through getEntry and throws when it is missing', () => {
    // paper-sources.mjs's stated failure mode is a content lookup that yields
    // nothing while the build still exits 0. A silent empty render is what
    // this guards against, so both the lookup and a throw near it must exist.
    expect(
      cvPage,
      "CvPage.astro must resolve the entry via getEntry('cv', 'cv')",
    ).toMatch(/getEntry\(\s*['"]cv['"]\s*,\s*['"]cv['"]\s*\)/);
    expect(
      cvPage,
      'a missing cv entry must throw rather than render an empty page',
    ).toMatch(/throw new Error/);
  });

  it('never hardcodes the CV filename', () => {
    // Same single-source invariant SURFACES in cvSurfaces.test.ts are held
    // to: the literal filename belongs in src/data/papers.ts only, and every
    // other surface must derive it from cvPaper()/paperUrl().
    expect(cvPage, 'must import cvPaper to build the CV download').toMatch(
      /import\s*\{[^}]*\bcvPaper\b[^}]*\}\s*from\s*['"].*data\/papers['"]/,
    );
    expect(cvPage, 'must import paperUrl to build the CV href').toMatch(
      /import\s*\{[^}]*\bpaperUrl\b[^}]*\}\s*from\s*['"].*data\/papers['"]/,
    );
    expect(
      cvPage,
      'the literal filename belongs in src/data/papers.ts only; CvPage.astro must derive it from cvPaper()/paperUrl()',
    ).not.toContain('mikko-numminen-cv.pdf');
  });
});

describe('/cv route shims', () => {
  const cvRoute = readFileSync(path.join(here, '../pages/cv.astro'), 'utf8');
  const fiCvRoute = readFileSync(path.join(here, '../pages/fi/cv.astro'), 'utf8');

  it.each([
    ['src/pages/cv.astro', cvRoute],
    ['src/pages/fi/cv.astro', fiCvRoute],
  ])('%s imports and renders CvPage', (_name, code) => {
    // /cv or /fi/cv silently missing means the hero's read link 404s and the
    // hreflang alternate points at a page that was never generated.
    expect(code, 'must import CvPage from page-content').toMatch(
      /import\s+CvPage\s+from\s+['"].*page-content\/CvPage\.astro['"]/,
    );
    expect(code, 'must render <CvPage />').toMatch(/<CvPage\s*\/>/);
  });
});
