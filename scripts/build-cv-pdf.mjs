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
//   node scripts/build-cv-pdf.mjs --keep-html   (leave the intermediate HTML)
//
// Skips silently when Chrome is absent, matching the other PDF builders: CI
// treats the committed PDF as the canonical artifact.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChrome, printHtmlToPdf } from './lib/chrome-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = path.join(ROOT, 'content', 'cv.md');
const OUTPUT = path.join(ROOT, 'public', 'mikko-numminen-cv.pdf');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Strip the YAML frontmatter. Only a leading `---` block counts: a `---` later
 * in the document is a horizontal rule and must survive.
 */
export function stripFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? markdown.slice(match[0].length) : markdown;
}

/** Inline markdown: links, bold, and backtick code. Escaped first. */
export function inline(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * The CV's own small markdown subset. Deliberately not a general converter:
 * the document is one file whose shapes are known, and a general converter
 * would be a dependency plus a surface for surprises in a document that has to
 * come out identical every build.
 */
export function toHtml(markdown) {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const out = [];
  let list = false;

  const closeList = () => {
    if (list) {
      out.push('</ul>');
      list = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^-\s+(.*)$/);
    if (bullet) {
      if (!list) {
        out.push('<ul>');
        list = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    closeList();
    // A line that is only inline code is the per-project technology strip.
    const strip = line.match(/^`([^`]+)`(\s+·\s+.*)?$/);
    if (strip) {
      out.push(`<p class="stack">${inline(line)}</p>`);
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
  }
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
ul { margin: 0 0 2mm; padding-left: 4.2mm; }
li { margin: 0 0 1.1mm; }
a { color: #2f6f62; text-decoration: none; }
strong { font-weight: 650; color: #0d1117; }
code {
  font-family: "SF Mono", "Cascadia Mono", Consolas, monospace;
  font-size: 8.2pt; color: #4a5a63; background: none;
}
/* The per-project technology strip: quiet, one line, never wrapping mid-name. */
p.stack { margin: 0.6mm 0 0; font-size: 8.2pt; color: #6b7a83; }
p.stack code { color: #4a5a63; }
/* Keep a project's heading with its first line, and never split a short block. */
h2, h3 { break-after: avoid; page-break-after: avoid; }
li, p { break-inside: avoid; page-break-inside: avoid; }
`;

function buildHtml(markdown) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Mikko Numminen CV</title>
<style>${CSS}</style></head>
<body>
${toHtml(markdown)}
</body></html>`;
}

function main() {
  const keepHtml = process.argv.includes('--keep-html');
  if (!locateChrome()) {
    console.log('build-cv-pdf: no local Chrome, skipping (the committed PDF stands)');
    return;
  }
  const markdown = fs.readFileSync(INPUT, 'utf8');
  const htmlPath = keepHtml
    ? OUTPUT.replace(/\.pdf$/i, '.html')
    : path.join(os.tmpdir(), 'build-cv-pdf.html');
  fs.writeFileSync(htmlPath, buildHtml(markdown), 'utf8');
  printHtmlToPdf({ htmlPath, pdfPath: OUTPUT });
  if (!keepHtml) fs.rmSync(htmlPath, { force: true });
  console.log(`build-cv-pdf: ${path.relative(ROOT, INPUT)} -> ${path.relative(ROOT, OUTPUT)}`);
}

// CLI only, so the pure helpers above stay importable by the test.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
