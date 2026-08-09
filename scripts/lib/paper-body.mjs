/**
 * A research paper's markdown, prepared for the web reader.
 *
 * Build-time only, and Node-only: it reads the repo off disk. `src/data/papers.ts`
 * stays free of this deliberately, because the terminal ships it to the browser.
 *
 * The HTML comes from `render-audit-doc.mjs`'s own renderer, the one that prints
 * the PDFs. Reaching for a general markdown library instead would have been less
 * code and the wrong trade: this renderer knows about the documents' figures and
 * their colour-coded percentage columns, and a second renderer would quietly
 * disagree with the download on exactly the tables people came to read.
 */
import fs from 'node:fs';
import path from 'node:path';

import { renderBodyHtml } from '../render-audit-doc.mjs';
import { kindFor, ROOT, sourceFor } from './paper-sources.mjs';

const BLOB = 'https://github.com/MikkoNumminen/mikkonumminen.dev/blob/master';

/** Strip a `---` frontmatter block. Corpus posts have one; audit docs do not. */
function stripFrontmatter(md) {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

/**
 * Drop the leading `# Title`, which the page already renders as its `<h1>`.
 *
 * Only the FIRST heading, and only when it is the first content: an audit doc
 * opens with its title, and leaving it in gives the page two h1s, which is both
 * a duplicate and an accessibility problem.
 */
function stripLeadingH1(md) {
  return md.replace(/^\s*#\s+[^\n]+\n+/, '');
}

/**
 * Point sibling-file links at the repo instead of at this site.
 *
 * The audit documents link their own raw data and dated PDF as `./x.json`,
 * `./x.pdf`. Those files live in `docs/audits/` and are not served, so on
 * `/research/study` every one of them would 404 — the reader would look complete
 * and hand out dead links, which is worse than the PDF-only state it replaces.
 *
 * They resolve to GitHub rather than being stripped, because the raw data behind
 * a measurement is the most useful thing a sceptical reader can be given, and
 * this repo is public.
 */
function rewriteSiblingLinks(md, sourceAbs) {
  const dir = path.relative(ROOT, path.dirname(sourceAbs)).replace(/\\/g, '/');
  return md.replace(
    /\]\(\.\/([^)\s]+)\)/g,
    (_, name) => `](${BLOB}/${dir}/${name})`,
  );
}

/**
 * `{ html }` for a paper's served PDF name, or null when it has no source.
 *
 * Null is a real answer, not an error: two published papers have only condensed
 * copies in this repo, and rendering one of those as if it were the document is
 * the thing `paper-sources.mjs` refuses to do.
 */
export function readPaperBody(pubPdf) {
  const abs = sourceFor(pubPdf);
  if (!abs) return null;
  const raw = fs.readFileSync(abs, 'utf8');
  const prepared = rewriteSiblingLinks(stripLeadingH1(stripFrontmatter(raw)), abs);
  return {
    /** 'full' when this reproduces the PDF's text, 'companion' when it accompanies it. */
    kind: kindFor(pubPdf),
    html: renderBodyHtml(prepared),
    /** Repo-relative, shown to the reader so the source is nameable. */
    source: path.relative(ROOT, abs).replace(/\\/g, '/'),
  };
}

/** True when this paper can be read in the browser. */
export function isReadable(pubPdf) {
  return sourceFor(pubPdf) !== null;
}
