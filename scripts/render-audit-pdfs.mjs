#!/usr/bin/env node
// Render the served audit/study PDFs from their .md source of truth into BOTH the
// dated docs/audits/ canonical AND the stable-named public/ download the contact
// terminal serves (SUITE_PDF_PATH / STUDY_PDF_PATH / RESULTS_PDF_PATH in
// src/lib/terminal/commands.ts). The .md is authoritative; rendering both copies
// from it in one step is what stops the drift that left public/ three releases
// behind — you can no longer regenerate one copy and forget the other.
//
//   node scripts/render-audit-pdfs.mjs           prebuild mode: re-render only docs whose .md is newer than its PDF (no churn on a no-op build)
//   node scripts/render-audit-pdfs.mjs --force   regenerate every served doc regardless of mtime
//
// Skips entirely in CI / when Chrome is absent, so the committed PDFs stay
// canonical on hosted builds (same guard as build-skills-pdf.mjs). The replicates
// doc is json+pdf only (no .md), so it has no source to render from and is left as-is.
//
// Note: Chrome stamps a creation date into the PDF, so renders aren't byte-
// reproducible — a --force run always yields a (metadata-only) diff even when the
// .md is unchanged. The mtime skip above keeps that off the normal build path.
// build-skills-pdf solves the same problem differently, by comparing rendered
// content with the stamps masked (scripts/lib/pdf-content.mjs) — sturdier than
// mtime, which a fresh clone or branch switch resets. Worth adopting here if
// these audit PDFs ever start churning. Commit PDFs intentionally.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChrome } from './lib/chrome-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDITS_DIR = path.join(ROOT, 'docs', 'audits');
const PUBLIC_DIR = path.join(ROOT, 'public');
const RENDERER = path.join(ROOT, 'scripts', 'render-audit-doc.mjs');

// Each entry maps a served public/ download to the regex matching its dated .md
// source. Anchored + date-then-suffix specific so optim-study and its -replicates
// sibling never collide. The dated PDF is the .md basename with .pdf.
const MAP = [
  { pub: 'skills-suite-calibration.pdf', re: /^skills-suite-calibration-(\d{4}-\d{2}-\d{2})\.md$/ },
  { pub: 'skills-optim-study.pdf', re: /^skills-optim-study-(\d{4}-\d{2}-\d{2})\.md$/ },
  { pub: 'skills-optim-study-replicates.pdf', re: /^skills-optim-study-(\d{4}-\d{2}-\d{2})-replicates\.md$/ },
  { pub: 'skills-results.pdf', re: /^skills-results-(\d{4}-\d{2}-\d{2})\.md$/ },
];

function latestMd(names, re) {
  return names
    .map((name) => ({ name, match: re.exec(name) }))
    .filter((e) => e.match !== null)
    .sort((a, b) => b.match[1].localeCompare(a.match[1]))[0]?.name;
}

function main() {
  const force = process.argv.includes('--force');

  if (process.env.CI || process.env.VERCEL || !locateChrome()) {
    console.log('render-audit-pdfs: CI / no Chrome on PATH — committed PDFs stay canonical. Skipping.');
    process.exit(0);
  }
  if (!fs.existsSync(AUDITS_DIR)) {
    console.log(`render-audit-pdfs: no ${path.relative(ROOT, AUDITS_DIR)} dir — skipping.`);
    process.exit(0);
  }

  const names = fs.readdirSync(AUDITS_DIR);
  let rendered = 0;
  let skipped = 0;
  const missing = [];
  const failed = [];

  for (const { pub, re } of MAP) {
    const mdName = latestMd(names, re);
    if (!mdName) {
      missing.push(pub);
      continue;
    }
    const mdPath = path.join(AUDITS_DIR, mdName);
    const datedPdf = path.join(AUDITS_DIR, mdName.replace(/\.md$/, '.pdf'));
    const pubPdf = path.join(PUBLIC_DIR, pub);

    // Default (prebuild) mode: only re-render when the source .md is newer than the
    // rendered PDF, so a no-edit build produces no churn. --force overrides. The mtime
    // guard is a heuristic — git doesn't preserve mtimes, so right after a fresh clone
    // the comparison reflects whatever order the checkout wrote files (worst case: one
    // spurious render). CI never reaches here (no Chrome), so this only affects local builds.
    if (!force && fs.existsSync(datedPdf) && fs.statSync(datedPdf).mtimeMs >= fs.statSync(mdPath).mtimeMs) {
      skipped += 1;
      continue;
    }

    // Degrade gracefully: a single doc's render failure warns and keeps the existing
    // committed PDFs rather than aborting the whole prebuild (mirrors build-skills-pdf).
    try {
      execFileSync(process.execPath, [RENDERER, '--input', mdPath, '--output', datedPdf], { stdio: 'inherit' });
      fs.mkdirSync(PUBLIC_DIR, { recursive: true });
      fs.copyFileSync(datedPdf, pubPdf);
      rendered += 1;
      console.log(`render-audit-pdfs: ${mdName} → docs/audits/${path.basename(datedPdf)} + public/${pub}`);
    } catch (err) {
      failed.push(pub);
      console.warn(`render-audit-pdfs: FAILED ${mdName} (${err.message}) — keeping existing PDFs.`);
    }
  }

  if (missing.length > 0) {
    console.log(`render-audit-pdfs: no .md source for ${missing.join(', ')} — left as-is (json+pdf only).`);
  }
  console.log(
    `render-audit-pdfs: ${rendered} rendered, ${skipped} up-to-date, ${missing.length} without .md, ${failed.length} failed.`,
  );
}

main();
