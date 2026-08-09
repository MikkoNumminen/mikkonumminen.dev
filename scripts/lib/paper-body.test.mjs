/**
 * The research reader's source resolution and rendering.
 *
 * THE BUG THIS EXISTS FOR was silent. `ROOT` was derived from `import.meta.url`,
 * Vite bundled the module into `dist/.prerender/chunks/`, every source lookup
 * returned "no source", `getStaticPaths` emitted nothing, and the build reported
 * success with ten pages missing. Nothing failed. The page count in the build log
 * was the only evidence, and it is not something anyone reads.
 *
 * So the count is asserted here, and a mapped-but-missing source now throws
 * instead of returning null.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { COMPANION, kindFor, MAP, READER_ONLY, ROOT, sourceFor } from './paper-sources.mjs';
import { isReadable, readPaperBody } from './paper-body.mjs';

const RENDER_SCRIPT = readFileSync(path.join(ROOT, 'scripts/render-audit-pdfs.mjs'), 'utf8');

describe('paper sources', () => {
  it('resolves the repo root, not a build directory', () => {
    // Direct assertion on the failure mode: the root must contain the repo, not
    // `dist/`. A root under dist is how every lookup came back empty.
    expect(ROOT).not.toMatch(/[\\/]dist([\\/]|$)/);
    expect(() => readFileSync(path.join(ROOT, 'astro.config.mjs'))).not.toThrow();
  });

  it('has papers to resolve at all', () => {
    // Guards the guard: an empty MAP would make every case below vacuous, and
    // that is exactly the state the silent bug simulated.
    expect(MAP.length).toBeGreaterThanOrEqual(5);
  });

  it('resolves every mapped paper to a file that exists', () => {
    for (const { pub } of MAP) {
      const abs = sourceFor(pub);
      expect(abs, `${pub} resolved to nothing`).toBeTruthy();
      expect(() => readFileSync(abs), `${pub} -> ${abs}`).not.toThrow();
    }
  });

  it('is the only copy of the map', () => {
    // The PDF renderer and the reader must resolve the SAME markdown, or a
    // visitor reads one text and downloads another. Sharing the module is what
    // makes that true; a re-added local copy would silently un-make it.
    expect(RENDER_SCRIPT).toMatch(/from '\.\/lib\/paper-sources\.mjs'/);
    expect(
      RENDER_SCRIPT,
      'render-audit-pdfs.mjs has its own MAP again; the reader and the PDF can now diverge',
    ).not.toMatch(/^const MAP = \[/m);
  });

  it('throws rather than returning null when a mapped source is missing', () => {
    // The silent-null is what hid the root bug. A paper that SHOULD have a
    // source and does not is a fault, and must read as one.
    expect(() => sourceFor('skills-results.pdf')).not.toThrow();
    const original = MAP.find((e) => e.pub === 'skills-results.pdf');
    const saved = { ...original };
    try {
      delete original.re;
      original.src = 'docs/audits/this-file-does-not-exist.md';
      expect(() => sourceFor('skills-results.pdf')).toThrow(/does not exist/);
    } finally {
      Object.assign(original, saved);
      if (saved.re === undefined) delete original.re;
      if (saved.src === undefined) delete original.src;
    }
  });

  it('reports no source for a paper that has none, without throwing', () => {
    // This case used to name poro-finnish-review and rag-finnish-blind-test,
    // because a condensed copy was treated as no copy. They are COMPANION pages
    // now, labelled as accompanying their PDF rather than reproducing it, so the
    // only paper left with no prose at all is the one generated from JSON.
    // "None" is still a correct answer and must stay distinguishable from a
    // fault, which is what this asserts.
    expect(isReadable('skills-registry.pdf')).toBe(false);
    expect(readPaperBody('skills-registry.pdf')).toBeNull();
  });
});

describe('the reader list and the PDF-regeneration list stay separate', () => {
  // THE TRAP THIS GUARDS. `MAP` drives `render-audit-pdfs`, so an entry there
  // means "rebuild this PDF from that markdown on the next prebuild". Two of the
  // readable papers are DESIGNED documents — kickers, numbered sections, stat
  // callouts — that no script in this repo produced. Their prose matches, so
  // they are safe to READ; regenerating them would replace a designed report
  // with a plain render and the loss would arrive as a silent build artifact.
  it('never lists the same paper in both', () => {
    const inBoth = READER_ONLY.filter((r) => MAP.some((m) => m.pub === r.pub)).map(
      (r) => r.pub,
    );
    expect(
      inBoth,
      `${inBoth.join(', ')} is in MAP as well as READER_ONLY, so the next prebuild ` +
        'will overwrite the served PDF with a plain render of its markdown',
    ).toEqual([]);
  });

  it('has entries in both lists', () => {
    // Guards the guard: either list going empty makes the check above vacuous.
    expect(MAP.length).toBeGreaterThanOrEqual(5);
    expect(READER_ONLY.length).toBeGreaterThanOrEqual(2);
  });

  it('resolves every reader-only source to a file that exists', () => {
    for (const { pub } of READER_ONLY) {
      expect(sourceFor(pub), `${pub} resolved to nothing`).toBeTruthy();
    }
  });
});

describe('rendered paper bodies', () => {
  const readable = [...MAP, ...READER_ONLY, ...COMPANION].map((e) => e.pub);

  it.each(readable)('%s renders usable HTML', (pub) => {
    const body = readPaperBody(pub);
    expect(body, `${pub} has no body`).not.toBeNull();
    expect(body.html.length, 'suspiciously short render').toBeGreaterThan(2000);

    // The page supplies its own <h1>; the document's leading title must be
    // stripped or every paper ships two.
    expect((body.html.match(/<h1/g) ?? []).length, 'duplicate top-level heading').toBe(0);

    // Sibling links (`./x.json`, `./x.pdf`) point at files that are not served.
    // Left alone they 404, which makes a complete-looking page hand out dead
    // links — worse than the PDF-only state the reader replaces.
    const relative = [...body.html.matchAll(/href="(\.\/[^"]*)"/g)].map((m) => m[1]);
    expect(relative, `${pub} keeps unserved relative links`).toEqual([]);

    expect(body.source, 'source path should be repo-relative').not.toMatch(/^[A-Za-z]:|^\//);
  });

  it('rewrites sibling links to the public repo', () => {
    const body = readPaperBody('skills-optim-study.pdf');
    expect(body.html).toMatch(
      /href="https:\/\/github\.com\/MikkoNumminen\/mikkonumminen\.dev\/blob\/master\/docs\/audits\//,
    );
  });

  it('keeps the colour legend with the coloured tables', () => {
    // The legend explains the green/red cells and is added by the renderer only
    // when something is coloured. A reader without it shows colours that mean
    // nothing stated.
    const coloured = readPaperBody('skills-optim-study.pdf');
    expect(coloured.html).toContain('class="legend"');
  });
});


describe('a companion page never claims to be the paper', () => {
  // The distinction this tier exists for. A companion carries 66-72% of the
  // published words (or, for the experiment report, a full word count and a
  // different document), so rendering one unlabelled would hand a visitor a
  // parallel write-up as the paper. The label is the entire difference between
  // useful and dishonest, which makes it worth a test rather than a convention.
  it('classifies every paper that has a page', () => {
    for (const { pub } of [...MAP, ...READER_ONLY]) {
      expect(kindFor(pub), `${pub} should reproduce its PDF`).toBe('full');
    }
    for (const { pub } of COMPANION) {
      expect(kindFor(pub), `${pub} only accompanies its PDF`).toBe('companion');
    }
  });

  it('has both kinds, so neither branch is dead', () => {
    expect(COMPANION.length).toBeGreaterThanOrEqual(3);
    expect([...MAP, ...READER_ONLY].length).toBeGreaterThanOrEqual(7);
  });

  it('never files one paper under two kinds', () => {
    // A paper in COMPANION *and* MAP would render as 'full' and lose its notice,
    // which is the failure that silently misrepresents a document.
    const full = new Set([...MAP, ...READER_ONLY].map((e) => e.pub));
    const both = COMPANION.filter((c) => full.has(c.pub)).map((c) => c.pub);
    expect(both, `${both.join(', ')} is both full and companion`).toEqual([]);
  });

  it('gives no page at all to a paper with no prose', () => {
    // skills-registry.pdf is generated from JSON. A page built from nothing
    // would be a title and a download button pretending to be an introduction.
    expect(kindFor('skills-registry.pdf')).toBeNull();
    expect(readPaperBody('skills-registry.pdf')).toBeNull();
  });
});
