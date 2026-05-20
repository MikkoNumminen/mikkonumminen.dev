#!/usr/bin/env node
// Render public/data/skills-registry.json to public/skills-registry.pdf using
// the locally-installed Chrome's headless --print-to-pdf. Content-aware wrapper
// for the skill-registry shape; for generic markdown / HTML use, see the
// `md-to-pdf` skill at `.claude/skills/md-to-pdf/SKILL.md` and the
// `scripts/build-pdf.mjs` CLI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChrome, printHtmlToPdf } from './lib/chrome-pdf.mjs';
import { escapeHtml as esc, isSafeHref } from './lib/escape.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'data', 'skills-registry.json');
const OUT = path.join(ROOT, 'public', 'skills-registry.pdf');

const fmt = (n) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(0)}K`
      : String(n);

function buildHtml(data) {
  const generated = data.generated_at.slice(0, 10);
  const aggregate = data.repos.map((r) => {
    const total = r.skills.length;
    const reds = r.skills.filter((s) => s.redirect).length;
    const wr = r.skills.filter((s) => s.receipt && s.receipt.annual_total != null).length;
    const ann = r.skills.reduce((a, s) => a + (s.receipt?.annual_total ?? 0), 0);
    return { name: r.name, total, reds, wr, ann };
  });

  const aggregateRows = aggregate
    .map(
      (a) =>
        `<tr><td>${esc(a.name)}</td><td>${a.total}</td><td>${a.reds}</td><td>${a.wr}</td><td>${a.ann ? `~${fmt(a.ann)}` : '—'}</td></tr>`,
    )
    .join('\n');

  const repoSections = data.repos
    .map((r) => {
      const rows = r.skills
        .map((s) => {
          const tpu = s.receipt?.tokens_per_use ? fmt(s.receipt.tokens_per_use) : '—';
          // For transcript-measured rows, append the measurement window so the
          // reader can see whether "4 / yr" is a 90-day extrapolation or a
          // 365-day count.
          const upyVal = s.receipt?.uses_per_year;
          const upy =
            upyVal != null
              ? s.receipt?.measurement_window_days
                ? `${upyVal} <span class="window">(${s.receipt.measurement_window_days}d)</span>`
                : String(upyVal)
              : '—';
          const tot = s.receipt?.annual_total ? `~${fmt(s.receipt.annual_total)}` : '—';
          const isMeasured = s.receipt?.source === 'transcript-measurement';
          // Local-path receipts (e.g. `.claude/agent-verdicts/X.md`) don't
          // resolve from inside a PDF viewer, so render them as plain
          // source-label text. Only http(s) URLs become clickable.
          const receiptLabel = isMeasured ? 'measured' : s.receipt?.source;
          const receipt = s.receipt
            ? isSafeHref(s.receipt.path)
              ? `<a href="${esc(s.receipt.path)}">${esc(receiptLabel)}</a>`
              : esc(receiptLabel)
            : '—';
          const name = `<strong>${esc(s.name)}</strong>${s.redirect ? ' <em>(redirect)</em>' : ''}`;
          const rowClass = isMeasured ? ' class="measured"' : '';
          return `<tr${rowClass}><td>${name}</td><td class="desc">${esc(s.description)}</td><td>${tpu}</td><td>${upy}</td><td>${tot}</td><td>${receipt}</td></tr>`;
        })
        .join('\n');
      const url =
        r.github_url && isSafeHref(r.github_url)
          ? ` — <a href="${esc(r.github_url)}">${esc(r.github_url)}</a>`
          : '';
      return `<h2>${esc(r.name)}${url}</h2>
<table class="per-repo">
  <thead><tr><th>Skill</th><th>Description</th><th>Tokens / use</th><th>Uses / year</th><th>Total</th><th>Receipt</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Skill registry — ${esc(generated)}</title>
<style>
  @page { size: A4 landscape; margin: 18mm 12mm; }
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; font-size: 9.5pt; color: #1a1a1a; line-height: 1.4; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  h2 { font-size: 12pt; margin: 14pt 0 4pt; border-bottom: 1px solid #ccc; padding-bottom: 2pt; }
  p.meta { color: #555; font-size: 9pt; margin-bottom: 12pt; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; font-size: 8.5pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #ddd; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; font-weight: 600; }
  /* Aggregate table: every column past col 1 is numeric. Per-repo tables:
     cols 1-2 (Skill, Description) stay left, numerics start at col 3. */
  table.aggregate td:nth-child(n+2) { text-align: right; white-space: nowrap; }
  table.per-repo td:nth-child(n+3) { text-align: right; white-space: nowrap; }
  td.desc { text-align: left; white-space: normal; max-width: 380pt; }
  a { color: #0a66c2; text-decoration: none; }
  hr { border: none; border-top: 1px solid #ccc; margin: 16pt 0; }
  .totals-row td { font-weight: 700; background: #f9f9f9; }
  /* Rows with transcript-measured receipts get a subtle green left edge so
     the reader can tell measured rows from author-estimated ones at a glance. */
  tr.measured td:first-child { border-left: 3px solid #2e7d32; }
  tr.measured td:last-child a, tr.measured td:last-child { color: #2e7d32; font-weight: 600; }
  .window { color: #777; font-weight: 400; font-size: 7.5pt; }
  footer { color: #888; font-size: 8pt; margin-top: 18pt; }
</style>
</head>
<body>
<h1>Skill registry — ${esc(generated)}</h1>
<p class="meta">Scope: every <code>.claude/skills/*/SKILL.md</code> across the portfolio. Rows marked <span style="color:#2e7d32;font-weight:600">measured</span> are derived from real Claude Code transcripts (<code>attributionSkill</code>); other rows are author-estimated. Trace each row to its receipt.</p>

<h2>Aggregate</h2>
<table class="aggregate">
  <thead><tr><th>Repo</th><th>Skills</th><th>Redirects</th><th>With receipts</th><th>Tokens / yr</th></tr></thead>
  <tbody>
    ${aggregateRows}
    <tr class="totals-row"><td>Total</td><td>${data.totals.skills}</td><td>${data.totals.redirects}</td><td>${data.totals.with_receipts}</td><td>~${fmt(data.totals.annual_tokens_saved)}</td></tr>
  </tbody>
</table>

${repoSections}

<footer>Generated ${esc(data.generated_at)}.</footer>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`source missing: ${SRC}`);
    console.error('Run the skill-registry skill and copy its JSON output here first.');
    process.exit(1);
  }
  // CI / hosted-build environments (Vercel, GitHub Actions, etc.) should NOT
  // regenerate the PDF — even if their build image happens to include Chrome,
  // we don't want a transient deploy-time render to diverge from the
  // committed artifact. Force the committed PDF to be the source of truth on
  // every hosted build by short-circuiting here when standard CI env vars
  // are present.
  if (process.env.CI || process.env.VERCEL) {
    console.log(
      'build-skills-pdf: CI environment detected — skipping regeneration, committed PDF is canonical.',
    );
    process.exit(0);
  }
  // Local dev with no Chrome (unusual but possible) — same fallback: leave
  // the committed PDF in place and continue.
  if (!locateChrome()) {
    console.log(
      'build-skills-pdf: no Chrome / Chromium on PATH — leaving existing PDF in place. Set CHROME_PATH or install Chrome to regenerate.',
    );
    process.exit(0);
  }
  const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const html = buildHtml(data);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-pdf-'));
  const tmpHtml = path.join(tmpDir, 'skills-registry.html');
  fs.writeFileSync(tmpHtml, html);
  try {
    printHtmlToPdf({ htmlPath: tmpHtml, pdfPath: OUT });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`wrote ${OUT}`);
}

main();
