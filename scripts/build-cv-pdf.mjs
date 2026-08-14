#!/usr/bin/env node
// content/cv.md -> public/mikko-numminen-cv.pdf
//
// WHY THIS EXISTS. The CV had two outputs and no shared source: `/cv` rendered
// `content/cv.md` while the download served a PDF produced by Typst, whose
// `.typ` source is not in this repository. Nobody could regenerate the PDF, so
// the two drifted, and a visitor could read one document and download a
// different one. This makes the markdown the single source: the page renders
// it, this script prints it, `prebuild` runs the script.
//
// WHY NOT `render-audit-doc.mjs`. That renderer is for the study documents and
// its stylesheet is tuned for reading a long argument: wide leading, generous
// section spacing, a table-of-contents register. A CV is scanned, not read, and
// the same content came out at six pages through it. It also has no frontmatter
// handling, because no audit doc has any, so the CV's `---` block printed as
// body text. Rather than teach one renderer two incompatible jobs, this follows
// the `build-skills-pdf.mjs` precedent: a content-aware wrapper that assembles
// its own HTML and hands it to the shared Chrome printer.
//
// Usage:
//   node scripts/build-cv-pdf.mjs
//   node scripts/build-cv-pdf.mjs --force       (re-render even if unchanged)
//   node scripts/build-cv-pdf.mjs --keep-html   (leave the intermediate HTML)
//
// Skips the render when Chrome is absent and on Vercel, matching the other PDF
// builders: the committed PDF is the canonical artifact for hosted builds. On
// CI it does NOT merely skip — it fails when the committed PDF was not
// regenerated from the current markdown, because "the page and the download are
// the same document" is only true if something refuses the commit where it
// stops being true.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChrome, printHtmlToPdf, PRINT_FLAGS } from './lib/chrome-pdf.mjs';
import { escapeHtml, isSafeHref } from './lib/escape.mjs';
import {
  inputFingerprint,
  pdfContentEquals,
  pdfContentHash,
  shouldRender,
} from './lib/pdf-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = path.join(ROOT, 'content', 'cv.md');
const OUTPUT = path.join(ROOT, 'public', 'mikko-numminen-cv.pdf');
// Committed, for the same reason `skills-pdf.input.sha256` is: a fresh clone
// with no stored hash cannot tell "nothing changed" from "never rendered", and
// the CI gate below has nothing to compare against. Two lines, input then
// output — see `readStored`.
const FINGERPRINT_FILE = path.join(ROOT, 'scripts', 'cv-pdf.input.sha256');

/**
 * Strip the YAML frontmatter. Only a leading `---` block counts: a `---` later
 * in the document is a horizontal rule and must survive.
 */
export function stripFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? markdown.slice(match[0].length) : markdown;
}

/**
 * A link target this document is allowed to print.
 *
 * `isSafeHref` is the repo's shared trust model (http/https only, so a
 * `javascript:` or `data:` target cannot reach an href); `mailto:` is added
 * because a CV is the one document that has a reason to carry one.
 */
function assertHref(href) {
  if (isSafeHref(href) || /^mailto:[^\s"']+$/.test(href)) return href;
  throw new Error(
    `build-cv-pdf: refusing to print the link target ${JSON.stringify(href)}. ` +
      'Only http, https and mailto targets are allowed.',
  );
}

/**
 * Inline markdown: links, bold, italic, and backtick code. Escaped first.
 *
 * Code spans are cut out before the other rules run and put back verbatim,
 * because a code span is the one place where markdown punctuation is content:
 * running the emphasis rules over `a*b*c` italicises the inside of a literal.
 * The split's capture group makes every odd element a span, so the parity
 * check below is the whole of the bookkeeping.
 */
export function inline(text) {
  return escapeHtml(text)
    .split(/(`[^`]+`)/)
    .map((part, i) =>
      i % 2
        ? `<code>${part.slice(1, -1)}</code>`
        : part
            .replace(
              /\[([^\]]+)\]\(([^)\s]+)\)/g,
              (_m, label, href) => `<a href="${assertHref(href)}">${label}</a>`,
            )
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>'),
    )
    .join('');
}

/**
 * Markdown this converter does not print, each mapped to the reason it is a
 * refusal rather than a best effort.
 *
 * The failure being prevented is silent: an unhandled shape used to fall
 * through to `<p>` and reach an employer as literal `---` or `| a | b |` in a
 * document nobody re-reads before attaching it. `/cv` renders all of these
 * correctly through Astro's markdown pipeline, so leaving them to degrade also
 * broke the one property this script exists to establish — that the page and
 * the download are the same document.
 */
const UNSUPPORTED = [
  [/^#{4,}\s/, 'headings deeper than ###'],
  [/^>\s?/, 'blockquotes'],
  [/^\|/, 'tables'],
  [/^[*+]\s/, 'the * and + bullet markers (use -)'],
  // The only entry not anchored to the start of the line, because an image is
  // the only shape here that is legal mid-sentence. Anchored, a mid-line
  // `![alt](src)` slipped past the refusal and `inline` then matched its link
  // half, printing a stray `!` in front of a link to the image file.
  [/!\[/, 'images'],
];

/** The per-project technology strip: a line that opens with inline code. */
const STACK_LINE = /^`[^`]+`(\s+·\s+.*)?$/;

/**
 * The CV's own small markdown subset. Deliberately not a general converter:
 * the document is one file whose shapes are known, and a general converter
 * would be a dependency plus a surface for surprises in a document that has to
 * come out identical every build. What it does NOT understand it refuses (see
 * `UNSUPPORTED`) rather than passing through as literal source.
 */
export function toHtml(markdown) {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const out = [];
  /** @type {'ul' | 'ol' | null} */
  let list = null;
  /** Soft-wrapped source lines waiting to be joined into one paragraph. */
  let para = [];
  /**
   * The same, for the open list item. Buffered as SOURCE and converted once on
   * flush, exactly like a paragraph: converting each source line on its own
   * splits every inline span that straddles a soft wrap, so a `**bold**` or a
   * `[label](url)` opened on the bullet line and closed on the next printed as
   * literal markdown — the silent degradation `UNSUPPORTED` exists to refuse.
   */
  let item = null;

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushItem = () => {
    if (!item) return;
    out.push(`<li>${inline(item.join(' '))}</li>`);
    item = null;
  };
  const closeList = () => {
    flushItem();
    if (!list) return;
    out.push(`</${list}>`);
    list = null;
  };
  const openList = (kind) => {
    if (list === kind) {
      flushItem();
      return;
    }
    closeList();
    out.push(`<${kind}>`);
    list = kind;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }

    const trimmed = line.trim();

    // An indented bullet is a nested list, which this converter does not
    // print. Checked on the RAW line, because indentation is the whole signal
    // and every other rule below reads the trimmed one.
    if (/^\s+(?:[-*+]|\d+\.)\s/.test(raw)) {
      throw new Error(
        `build-cv-pdf: ${path.relative(ROOT, INPUT)} uses nested lists, which this ` +
          `converter does not print. Offending line: ${JSON.stringify(line)}`,
      );
    }

    // Refusals win over every rule below, including the fold: a shape this
    // converter cannot print must fail the same way wherever it appears.
    for (const [pattern, what] of UNSUPPORTED) {
      if (pattern.test(trimmed)) {
        throw new Error(
          `build-cv-pdf: ${path.relative(ROOT, INPUT)} uses ${what}, which this ` +
            `converter does not print. Offending line: ${JSON.stringify(line)}`,
        );
      }
    }

    // A continuation line while a list item is open. Markdown folds it into
    // that item, indented or not (lazy continuation); emitting it separately
    // is what used to cut one list into two with a stray paragraph between.
    if (list && !/^(?:#{1,3}\s|-{3,}$|-\s|\d+\.\s|`)/.test(trimmed)) {
      item.push(trimmed);
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    // A rule, which `stripFrontmatter` deliberately leaves in place.
    if (/^-{3,}$/.test(trimmed)) {
      flushPara();
      closeList();
      out.push('<hr>');
      continue;
    }

    const bullet = trimmed.match(/^-\s+(.*)$/);
    if (bullet) {
      flushPara();
      openList('ul');
      item = [bullet[1]];
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flushPara();
      openList('ol');
      item = [numbered[1]];
      continue;
    }

    if (STACK_LINE.test(trimmed)) {
      flushPara();
      closeList();
      out.push(`<p class="stack">${inline(trimmed)}</p>`);
      continue;
    }

    // No `closeList()` here: while a list is open every non-block line was
    // already folded into its item above, so this is only ever reached with
    // no list open.
    para.push(trimmed);
  }
  flushPara();
  closeList();
  return out.join('\n');
}

// Tuned for scanning on paper. The measurements that matter: 9.6pt body at
// 1.38 leading fits the document in three A4 pages, and headings are separated
// by weight and colour rather than by whitespace, because whitespace is the
// thing in shortest supply.
const CSS = `
@page { size: A4; margin: 13mm 14mm 12mm; }
* { box-sizing: border-box; }
body {
  font: 9.6pt/1.38 "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
  color: #1b1f24; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 { font-size: 21pt; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 1mm; }
h1 + p strong { font-size: 10.5pt; font-weight: 600; color: #2f6f62; }
h2 {
  font-size: 8.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.13em;
  color: #2f6f62; margin: 6.5mm 0 2mm; padding-bottom: 1mm; border-bottom: 0.5pt solid #cfd8d5;
}
h3 { font-size: 10.2pt; font-weight: 650; margin: 3.6mm 0 1mm; color: #12303a; }
p { margin: 0 0 1.8mm; }
ul, ol { margin: 0 0 2mm; padding-left: 4.2mm; }
li { margin: 0 0 1.1mm; }
hr { border: 0; border-top: 0.5pt solid #cfd8d5; margin: 3mm 0; }
a { color: #2f6f62; text-decoration: none; }
strong { font-weight: 650; color: #0d1117; }
em { font-style: italic; }
code {
  font-family: "SF Mono", "Cascadia Mono", Consolas, monospace;
  font-size: 8.2pt; color: #4a5a63; background: none;
}
/* The per-project technology strip: quiet, one line, never wrapping mid-name.
   The break-before rule matters as much as the rest: the strip is meaningless
   away from its project, and without it a page boundary can land it alone at
   the top of the next page. */
p.stack {
  margin: 0.6mm 0 0; font-size: 8.2pt; color: #6b7a83;
  break-before: avoid; page-break-before: avoid;
}
p.stack code { color: #4a5a63; }
/* Keep a project's heading with its first line, and never split a short block. */
h2, h3 { break-after: avoid; page-break-after: avoid; }
li, p { break-inside: avoid; page-break-inside: avoid; }
`;

export function buildHtml(markdown) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Mikko Numminen CV</title>
<style>${CSS}</style></head>
<body>
${toHtml(markdown)}
</body></html>`;
}

const readIfExists = (file) => (fs.existsSync(file) ? fs.readFileSync(file) : null);

/**
 * The two hashes the fingerprint file carries, in order: the HTML the markdown
 * converts to, and the content hash of the PDF that HTML was printed to.
 *
 * The second exists because the first alone cannot answer the question the CI
 * gate asks. A fingerprint file records what the last LOCAL run rendered, so on
 * its own it proves only that this text file was regenerated — `git add
 * scripts/` stages it and leaves `public/*.pdf` behind, and the gate then
 * reports a match while the repository holds the previous CV. Hashing the
 * committed artifact too makes the check read the thing it is making a claim
 * about.
 */
function readStored() {
  const [html, pdf] = (readIfExists(FINGERPRINT_FILE)?.toString('utf8') ?? '')
    .trim()
    .split(/\r?\n/)
    .map((entry) => entry.trim());
  return { html: html || null, pdf: pdf || null };
}

/**
 * Why the committed PDF is not the one this markdown renders to, or null when
 * it is.
 */
function committedPdfProblem(stored, fingerprint) {
  const committed = readIfExists(OUTPUT);
  if (!committed) return `${path.relative(ROOT, OUTPUT)} is missing`;
  if (stored.html !== fingerprint || stored.pdf !== pdfContentHash(committed)) {
    return `the committed PDF does not match ${path.relative(ROOT, INPUT)}`;
  }
  return null;
}

function main() {
  const keepHtml = process.argv.includes('--keep-html');
  const force = process.argv.includes('--force');

  // Converted BEFORE any environment check, so a shape this converter refuses
  // fails everywhere rather than only on the one machine that has Chrome.
  const markdown = fs.readFileSync(INPUT, 'utf8');
  const html = buildHtml(markdown);
  const fingerprint = inputFingerprint(html, PRINT_FLAGS.join('\n'));
  const stored = readStored();

  // Vercel first: `CI` is set there too, and a stale PDF is a reason to shout
  // at a pull request, not to refuse a production deploy of everything else.
  if (process.env.VERCEL) {
    const problem = committedPdfProblem(stored, fingerprint);
    if (problem) console.warn(`build-cv-pdf: WARNING, ${problem}.`);
    console.log('build-cv-pdf: Vercel build, the committed PDF is canonical.');
    return;
  }
  if (process.env.CI) {
    const problem = committedPdfProblem(stored, fingerprint);
    if (problem) {
      console.error(
        `build-cv-pdf: ${problem}.\n` +
          '  /cv renders the markdown and the download serves the PDF, so this ships a\n' +
          '  visitor two different CVs. Run `npm run build:cv-pdf` locally and commit\n' +
          `  ${path.relative(ROOT, OUTPUT)} and ${path.relative(ROOT, FINGERPRINT_FILE)}.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log('build-cv-pdf: CI environment, the committed PDF matches content/cv.md.');
    return;
  }

  // The intermediate HTML is a debugging aid, so it lands in the gitignored
  // scratch directory `build-skills-pdf.mjs` uses. `public/` would have served
  // it as a second, unstyled copy of the CV and offered it to the next commit.
  if (keepHtml) {
    const previewDir = path.join(ROOT, '.claude', 'tmp');
    fs.mkdirSync(previewDir, { recursive: true });
    const previewHtml = path.join(previewDir, 'cv.html');
    fs.writeFileSync(previewHtml, html, 'utf8');
    console.log(`build-cv-pdf: html ${path.relative(ROOT, previewHtml)}`);
  }

  if (
    !shouldRender({
      force,
      pdfExists: fs.existsSync(OUTPUT),
      storedFingerprint: stored.html,
      fingerprint,
    })
  ) {
    console.log(`build-cv-pdf: unchanged, no render (${path.relative(ROOT, OUTPUT)})`);
    return;
  }
  if (!locateChrome()) {
    console.log('build-cv-pdf: no local Chrome, skipping (the committed PDF stands)');
    return;
  }
  const existingPdf = readIfExists(OUTPUT);

  // Rendered to a temp file and copied only on a real content change. Chrome
  // stamps a fresh /CreationDate, /ModDate and /ID into every render, so
  // writing straight to the committed PDF dirtied the working tree on every
  // single build.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-pdf-'));
  let rendered;
  try {
    const tmpHtml = path.join(tmpDir, 'cv.html');
    const tmpPdf = path.join(tmpDir, 'cv.pdf');
    fs.writeFileSync(tmpHtml, html, 'utf8');
    printHtmlToPdf({ htmlPath: tmpHtml, pdfPath: tmpPdf });
    rendered = fs.readFileSync(tmpPdf);
    if (existingPdf && pdfContentEquals(existingPdf, rendered)) {
      console.log(`build-cv-pdf: unchanged (${path.relative(ROOT, OUTPUT)})`);
    } else {
      fs.copyFileSync(tmpPdf, OUTPUT);
      console.log(
        `build-cv-pdf: ${path.relative(ROOT, INPUT)} -> ${path.relative(ROOT, OUTPUT)}`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  // Recorded even when the bytes were kept, so the next build short-circuits.
  // The PDF hash is of the RENDER, which is content-equal to whichever copy
  // now sits at OUTPUT — that equality is what the branch above just decided.
  fs.writeFileSync(FINGERPRINT_FILE, `${fingerprint}\n${pdfContentHash(rendered)}\n`);
}

// CLI only, so the pure helpers above stay importable by the test.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
