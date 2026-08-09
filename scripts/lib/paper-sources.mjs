/**
 * Which markdown file each served research PDF is rendered from.
 *
 * ONE DEFINITION, TWO CONSUMERS. `render-audit-pdfs.mjs` uses it to regenerate
 * the PDFs, and the `/research/<id>` reader uses it to render the same document
 * as a web page. Two copies of this map would let a visitor read one text online
 * and download a different one, which is the drift this repo keeps finding in
 * other shapes: the eval measuring a config production never ran, the corpus
 * guard grepping a file that had moved, the harness grading against its own
 * private refusal list.
 *
 * Extracted from `render-audit-pdfs.mjs`, where it lived alone. The comments
 * below are its, kept verbatim where they still hold, because they record which
 * documents deliberately have no source and why.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repo root, found rather than assumed.
 *
 * A path relative to `import.meta.url` is wrong inside an Astro build: Vite
 * bundles this module into `dist/.prerender/chunks/`, so the root resolves to
 * `dist/` and every lookup below finds nothing. That failed SILENTLY the first
 * time — `getStaticPaths` emitted no routes, the build reported success, and ten
 * pages were simply absent.
 *
 * `process.cwd()` alone would be wrong for a script invoked from a subdirectory.
 * So: walk up from the module, then from the cwd, and take the first directory
 * holding this repo's `package.json`.
 */
function findRoot() {
  const starts = [path.dirname(fileURLToPath(import.meta.url)), process.cwd()];
  for (const start of starts) {
    let dir = start;
    for (;;) {
      if (fs.existsSync(path.join(dir, 'package.json'))
        && fs.existsSync(path.join(dir, 'astro.config.mjs'))) {
        return dir;
      }
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  throw new Error('paper-sources: could not locate the repo root');
}

export const ROOT = findRoot();
const AUDITS_DIR = path.join(ROOT, 'docs', 'audits');

// Each entry maps a served public/ download to the regex matching its dated .md
// source. Anchored + date-then-suffix specific so optim-study and its -replicates
// sibling never collide. The dated PDF is the .md basename with .pdf.
export const MAP = [
  {
    pub: 'skills-suite-calibration.pdf',
    re: /^skills-suite-calibration-(\d{4}-\d{2}-\d{2})\.md$/,
  },
  { pub: 'skills-optim-study.pdf', re: /^skills-optim-study-(\d{4}-\d{2}-\d{2})\.md$/ },
  { pub: 'skills-results.pdf', re: /^skills-results-(\d{4}-\d{2}-\d{2})\.md$/ },
  // Sourced outside docs/audits: these reports' .md lives with the corpus posts,
  // which is what the RAG index reads. Duplicating them into docs/audits purely
  // to satisfy the regex convention would reintroduce exactly the drift this
  // driver exists to prevent, so `src` names the real source and `dated` the
  // canonical PDF the regex would otherwise have derived from the filename.
  //
  // A `src` entry is only correct when the post IS the document, not a shorter
  // write-up of it. Verified for both below: agent-delegation renders to the same
  // length it always had, and skills-optim-replicates carries the full six-cell
  // table matching the scoreboard JSON. That one had been an orphan binary with
  // no source at all, its regex pointing at a docs/audits/.md that has never
  // existed, so nothing could regenerate it.
  //
  // poro-finnish-review.pdf and rag-finnish-blind-test.pdf are deliberately NOT
  // here. Their corpus posts are condensed versions: rendering the served copy
  // from poro-finnish-review.md dropped about a quarter of the published text.
  // Those two downloads keep their committed bytes, and their em dashes with
  // them, because a complete document beats a tidier truncated one. Wiring them
  // up needs their real sources, which are not in this repo.
  //
  // The same sentence decides whether a paper gets a READER. A document with no
  // faithful source in this repo is offered as a PDF and nothing else, rather
  // than rendered from a summary of itself and presented as the document.
  {
    pub: 'agent-delegation.pdf',
    src: 'content/posts/agent-delegation-measured.md',
    dated: 'AGENT-DELEGATION-2026-07-26.pdf',
  },
  {
    pub: 'skills-optim-study-replicates.pdf',
    src: 'content/posts/skills-optim-replicates.md',
    dated: 'skills-optim-study-2026-06-01-replicates.pdf',
  },
];

/**
 * Markdown the READER may render, over and above what `MAP` regenerates.
 *
 * WHY THIS IS A SECOND LIST. `MAP` answers "what regenerates this PDF", and the
 * prebuild acts on it: adding an entry there makes `render-audit-pdfs` overwrite
 * the served PDF. Two of the papers below are DESIGNED documents — kickers,
 * numbered sections, stat callouts, page furniture — that were not produced by
 * `render-audit-doc.mjs` and would be destroyed by re-rendering them from prose.
 * Their markdown is nonetheless the same text, so it is safe to READ and unsafe
 * to RENDER BACK. Conflating the two questions would have quietly replaced a
 * designed report with a plain one on the next build.
 *
 * ADMISSION CRITERION, measured per paper with `pdftotext` against the served
 * PDF rather than assumed from a filename:
 *
 *   paper                     md/pdf words   sentences absent   verdict
 *   poro-findings                     100%              2 / 69   text matches
 *   rag-finnish-methodology            91%              6 / 37   the 6 are page
 *                                                                furniture + 1
 *
 * DELIBERATELY ABSENT, same measurement, opposite answer:
 *
 *   rag-finnish-experiment            100%             20 / 36   equal length,
 *       different document: the PDF is an infographic report with a VRAM table
 *       and a discipline table the post does not contain.
 *   rag-finnish-blind-test             72%             67 / 67   different
 *   poro-finnish-review                66%             34 / 39   different
 *
 * The last three would render a parallel write-up as though it were the paper.
 * `skills-registry.pdf` is absent for a different reason: it is generated from
 * JSON, so it has no prose source at all.
 */
export const READER_ONLY = [
  { pub: 'poro-findings.pdf', src: 'content/posts/poro-findings.md' },
  {
    pub: 'rag-finnish-methodology.pdf',
    src: 'content/posts/rag-finnish-methodology.md',
  },
];

/**
 * Papers whose in-repo prose is a COMPANION to the PDF, not the PDF's text.
 *
 * Measured the same way as `READER_ONLY` and failing the same test: 66-72% of
 * the published words for two of them, and for `rag-finnish-experiment` a full
 * word count with 20 of 36 sentences absent, because that PDF is an infographic
 * report carrying tables the post never had.
 *
 * The earlier answer was to leave all three as a download and nothing else,
 * which is defensible and unhelpful: a visitor deciding whether a 227 KB PDF is
 * worth opening got a one-line summary and no way to find out. These render as
 * their own page, labelled for what they are, with the PDF named as the
 * document. An introduction to a paper is worth having; an introduction
 * PRESENTED as the paper is not, and the label is the whole difference.
 */
export const COMPANION = [
  {
    pub: 'rag-finnish-experiment.pdf',
    src: 'content/posts/rag-finnish-experiment.md',
  },
  {
    pub: 'rag-finnish-blind-test.pdf',
    src: 'content/posts/rag-finnish-blind-test.md',
  },
  { pub: 'poro-finnish-review.pdf', src: 'content/posts/poro-finnish-review.md' },
];

/**
 * How faithfully a paper's page reproduces its PDF:
 *
 *   'full'       the page IS the PDF's text
 *   'companion'  prose that accompanies the PDF, measured as not reproducing it
 *   'generated'  the same source data as the PDF, rendered a second way
 *   null         no page at all
 *
 * The page renders a notice for the two inexact kinds, worded differently
 * because they are inexact for different reasons, and the listing labels the
 * link so the distinction reaches a reader before the click.
 */
export function kindFor(pubPdf) {
  if (MAP.some((e) => e.pub === pubPdf) || READER_ONLY.some((e) => e.pub === pubPdf)) {
    return 'full';
  }
  if (COMPANION.some((e) => e.pub === pubPdf)) return 'companion';
  // 'generated' rather than 'companion': the page is not a write-up that
  // accompanies the PDF, it is the same data rendered a second way, and telling
  // a reader otherwise would be inaccurate in the direction this whole tier
  // exists to avoid.
  return GENERATED.some((e) => e.pub === pubPdf) ? 'generated' : null;
}

/**
 * The paper with no prose anywhere: its page is built from the same JSON the PDF
 * is built from.
 *
 * Faithful by construction rather than by comparison — there is no second text
 * that could drift, because there is only one source. It is still a COMPANION,
 * because `build-skills-pdf.mjs` renders a hero, a calibration chart, a findings
 * section and an appendix that the page does not carry.
 */
export const GENERATED = [
  { pub: 'skills-registry.pdf', src: 'public/data/skills-registry.json' },
];

/** Newest dated file matching `re`, by the date in the filename. */
export function latestMd(names, re) {
  return names
    .map((name) => ({ name, match: re.exec(name) }))
    .filter((e) => e.match !== null)
    .sort((a, b) => b.match[1].localeCompare(a.match[1]))[0]?.name;
}

/**
 * Absolute path to the markdown behind a served PDF, or null when it has none.
 *
 * `re` entries resolve to the NEWEST dated file, so publishing a new round makes
 * both the PDF and the reader follow it without an edit here. That is the whole
 * reason the regex form exists and why the reader must not hardcode a filename.
 */
export function sourceFor(pubPdf) {
  const entry =
    MAP.find((e) => e.pub === pubPdf) ??
    READER_ONLY.find((e) => e.pub === pubPdf) ??
    COMPANION.find((e) => e.pub === pubPdf) ??
    GENERATED.find((e) => e.pub === pubPdf);
  // Not in the map is a real answer: two published papers deliberately have no
  // faithful source here.
  if (!entry) return null;

  // In the map and missing is NOT. Being loud about it is the whole lesson of
  // the silent-root bug above: a null here removes a reader page and a PDF
  // regeneration, and both failures look like success from the outside.
  const missing = (what) => {
    throw new Error(
      `paper-sources: ${pubPdf} is mapped to ${what}, which does not exist under ${ROOT}. ` +
        'Either the source moved (update MAP) or the repo root was resolved wrongly.',
    );
  };

  if (entry.src) {
    const abs = path.join(ROOT, entry.src);
    if (!fs.existsSync(abs)) missing(entry.src);
    return abs;
  }
  if (!fs.existsSync(AUDITS_DIR)) missing('docs/audits');
  const name = latestMd(fs.readdirSync(AUDITS_DIR), entry.re);
  if (!name) missing(`no docs/audits file matching ${entry.re}`);
  return path.join(AUDITS_DIR, name);
}
