import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inline, stripFrontmatter, toHtml } from './build-cv-pdf.mjs';

/**
 * The CV's PDF and its `/cv` page now come from one markdown file, so the
 * converter here is the only thing standing between an edit to `content/cv.md`
 * and a wrong download. It is guarded rather than eyeballed because the failure
 * is silent: a shape it does not understand degrades to a paragraph of literal
 * markdown in a document nobody re-reads before sending it to an employer.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const cv = readFileSync(path.join(here, '../content/cv.md'), 'utf8');

describe('stripFrontmatter', () => {
  it('removes the leading YAML block', () => {
    // The bug this exists for: render-audit-doc.mjs has no frontmatter
    // handling, so pointing it at the CV printed `--- title: ... ---` as the
    // first line of body text.
    expect(stripFrontmatter('---\ntitle: x\nkind: cv\n---\n# Name\n')).toBe('# Name\n');
  });

  it('leaves a horizontal rule further down alone', () => {
    // `---` mid-document is a rule, not frontmatter. A greedy match would eat
    // everything between the top of the file and the first rule.
    const doc = '# Name\n\ntext\n\n---\n\nmore\n';
    expect(stripFrontmatter(doc)).toBe(doc);
  });

  it('leaves a document with no frontmatter untouched', () => {
    expect(stripFrontmatter('# Name\n')).toBe('# Name\n');
  });
});

describe('inline', () => {
  it('escapes before it converts, so markup in the CV cannot inject HTML', () => {
    expect(inline('a < b & c')).toBe('a &lt; b &amp; c');
    expect(inline('<script>x</script>')).not.toContain('<script>');
  });

  it('converts links, bold and code', () => {
    expect(inline('[label](https://example.com)')).toBe(
      '<a href="https://example.com">label</a>',
    );
    expect(inline('**bold**')).toBe('<strong>bold</strong>');
    expect(inline('`code`')).toBe('<code>code</code>');
  });
});

describe('toHtml', () => {
  it('converts the heading levels the CV uses', () => {
    const html = toHtml('# One\n\n## Two\n\n### Three\n');
    expect(html).toContain('<h1>One</h1>');
    expect(html).toContain('<h2>Two</h2>');
    expect(html).toContain('<h3>Three</h3>');
  });

  it('groups consecutive bullets into one list and closes it', () => {
    const html = toHtml('- a\n- b\n\ntext\n');
    expect(html).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p>text</p>');
  });

  it('marks a technology strip so it can be styled apart from prose', () => {
    // A line that starts with backticked text is the per-project stack line.
    // Without the class it renders at body size and the page overflows.
    expect(toHtml('`Rust · axum`\n')).toContain('class="stack"');
    expect(toHtml('Ordinary sentence.\n')).not.toContain('class="stack"');
  });

  it('renders the shapes a markdown author will reach for', () => {
    // Every one of these used to fall through to `<p>` and print as literal
    // source, while `/cv` rendered it properly through Astro. The two outputs
    // are only "the same document" if the shapes agree.
    expect(toHtml('a\n\n---\n\nb\n'), 'a rule printed as three dashes').toBe(
      '<p>a</p>\n<hr>\n<p>b</p>',
    );
    expect(toHtml('1. one\n2. two\n')).toBe('<ol>\n<li>one</li>\n<li>two</li>\n</ol>');
    expect(toHtml('an *emphasis* here\n')).toBe('<p>an <em>emphasis</em> here</p>');
  });

  it('joins a soft-wrapped paragraph instead of splitting it', () => {
    // Markdown folds consecutive lines into one paragraph. Emitting one `<p>`
    // per source line meant a re-wrapped `content/cv.md` printed as a column
    // of one-line paragraphs while `/cv` still read as prose.
    expect(toHtml('one paragraph\nover two lines.\n')).toBe(
      '<p>one paragraph over two lines.</p>',
    );
    expect(toHtml('- item one\n  continues here\n- item two\n')).toBe(
      '<ul>\n<li>item one continues here</li>\n<li>item two</li>\n</ul>',
    );
  });

  it.each([
    ['a heading deeper than ###', '#### Sub\n'],
    ['a blockquote', '> quoted\n'],
    ['a table', '| a | b |\n'],
    ['a * bullet', '* star\n'],
    ['a nested list', '- top\n  - nested\n'],
    ['an image', '![alt](https://example.com/x.png)\n'],
  ])('refuses %s rather than printing it as source', (_what, markdown) => {
    // Loud beats literal. The document is read once, by an employer, after
    // nobody re-read it — so an unprintable shape has to stop the build.
    expect(() => toHtml(markdown)).toThrow(/does not print/);
  });

  it('refuses a link target outside http, https and mailto', () => {
    expect(() => toHtml('[x](javascript:alert(1))\n')).toThrow(/refusing to print/);
    expect(toHtml('[m](mailto:a@b.com)\n')).toContain('href="mailto:a@b.com"');
  });
});

describe('content/cv.md survives the converter', () => {
  const html = toHtml(cv);

  it('emits no literal markdown the converter failed to understand', () => {
    // The silent-degradation check. Any of these surviving into the HTML means
    // a shape reached the page as raw source.
    //
    // Anchored INSIDE the emitted element, not at the start of a line. An
    // unconverted heading comes out as `<p>#### Sub</p>`, which starts with
    // `<`, so the `/^#{1,6}\s/m` this check used to carry could never fire
    // whatever the converter did — it passed on the exact input it was written
    // to catch.
    expect(html, 'a heading reached the body as text').not.toMatch(/<p[^>]*>#{1,6}\s/);
    expect(html, 'a bullet reached the body as text').not.toMatch(/<p[^>]*>[-*+]\s/);
    expect(html, 'a table row reached the body as text').not.toMatch(/<p[^>]*>\|/);
    expect(html, 'an unconverted bold or emphasis marker').not.toContain('**');
    expect(html, 'an unconverted link').not.toMatch(/\]\(http/);
    expect(html, 'frontmatter reached the body').not.toContain('kind: cv');
  });

  it('keeps the one h1 the page also relies on', () => {
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });

  it('carries the sections a reader is promised', () => {
    for (const section of [
      'Profile',
      'Experience',
      'Principal projects',
      'Other work',
      'Technology',
      'Hardware retail, 1998 to 2022',
      'Education',
    ]) {
      expect(html, `missing section: ${section}`).toContain(`<h2>${section}</h2>`);
    }
  });

  it('turns every link in the source into a real href', () => {
    // A CV whose live links 404 is worse than one that omits them, so every
    // link has to survive the converter.
    //
    // Derived from the markdown rather than listed here. The listed version
    // named four URLs and silently skipped the two newest — including the
    // Feedback Intelligence host, which is the generated Azure name most
    // likely to change — so the check covered everything except the links
    // worth checking.
    const targets = [...cv.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
    expect(targets.length, 'no links found; the extraction is broken').toBeGreaterThan(4);
    for (const url of targets) {
      expect(html, `missing live link: ${url}`).toContain(
        `href="${url.replace(/&/g, '&amp;')}"`,
      );
    }
  });
});
