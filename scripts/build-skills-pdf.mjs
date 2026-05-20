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

function fmtGeneratedAt(iso) {
  const s = iso.replace('Z', '');
  const [datePart, timePart] = s.split('T');
  const hhmm = timePart ? timePart.slice(0, 5) : '??:??';
  return `${datePart} at ${hhmm} UTC`;
}

function daysAgo(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return days === 0 ? 'today' : days === 1 ? '1d ago' : `${days}d ago`;
}

// Cost-per-use cell. Two lines: number + small "(measured)" or "(est.)" tag.
function renderCostPerUse(receipt) {
  if (!receipt?.tokens_per_use) return '—';
  const measured = receipt.source === 'transcript-measurement';
  const tag = measured ? '(measured)' : '(est.)';
  return `${fmt(receipt.tokens_per_use)}<br><span class="subtle">${tag}</span>`;
}

// Times-run cell.
//   Measured rows show "<inv> in <win>d" with a second line projecting to a yearly rate.
//   Estimated rows show "<n>/yr (est.)".
function renderTimesRun(receipt) {
  if (!receipt) return '—';
  if (receipt.source === 'transcript-measurement') {
    const inv = receipt.invocations_in_window ?? '?';
    const win = receipt.measurement_window_days ?? '?';
    const proj = receipt.uses_per_year != null ? receipt.uses_per_year : '?';
    return `${inv} in ${win}d<br><span class="subtle">→ ~${proj}/yr</span>`;
  }
  const upy = receipt.uses_per_year;
  return upy != null ? `${upy} / yr<br><span class="subtle">(est.)</span>` : '—';
}

// Tokens-used cell. Single number; annual projection on measured rows.
function renderTokensUsed(receipt) {
  if (!receipt) return '—';
  if (receipt.source === 'transcript-measurement') {
    const wRaw =
      receipt.total_tokens_in_window ??
      (receipt.tokens_per_use != null && receipt.invocations_in_window != null
        ? receipt.tokens_per_use * receipt.invocations_in_window
        : null);
    const w = wRaw != null ? fmt(wRaw) : '?';
    const ann = receipt.annual_total != null ? fmt(receipt.annual_total) : '?';
    return `${w} in window<br><span class="subtle">~${ann}/yr proj.</span>`;
  }
  return receipt.annual_total
    ? `~${fmt(receipt.annual_total)}<br><span class="subtle">/yr (est.)</span>`
    : '—';
}

function renderBuiltInsSection(refs) {
  const rows = refs
    .map((br) => {
      const receipt = {
        source: 'transcript-measurement',
        tokens_per_use: br.tokens_per_use_avg,
        uses_per_year: br.uses_per_year,
        annual_total: br.annual_total,
        invocations_in_window: br.invocations_in_window,
        total_tokens_in_window: br.total_tokens_in_window,
        measurement_window_days: br.measurement_window_days,
        last_invoked: br.last_invoked,
      };
      const ago = daysAgo(br.last_invoked);
      const stamp = ago ? `<br><span class="subtle">${esc(ago)}</span>` : '';
      return `<tr class="measured"><td><strong>${esc(br.label)}</strong>${stamp}</td><td class="desc">${esc(br.description)}</td><td>${renderCostPerUse(receipt)}</td><td>${renderTimesRun(receipt)}</td><td>${renderTokensUsed(receipt)}</td></tr>`;
    })
    .join('\n');
  return `<h2>Reference: Claude Code built-ins</h2>
<p class="meta">Claude Code's own slash commands &mdash; <strong>not part of this portfolio</strong>, shown for scale. <strong>Excluded from every total below.</strong></p>
<table class="per-repo">
  <thead><tr><th>Skill</th><th>Description</th><th>Cost / use</th><th>Times run</th><th>Tokens used</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function buildHtml(data) {
  const generated = data.generated_at.slice(0, 10);
  // Single pass per repo: every row contributes to totalAnnualTokens (the
  // mixed measured+editorial figure); measured rows additionally contribute
  // to the measured-only counters so the aggregate can show how much of
  // each repo's annual figure is measurement-backed vs author guess.
  let sumMeasuredInv = 0;
  let sumMeasuredAnnualRuns = 0;
  let sumMeasuredTokensWindow = 0;
  let sumMeasuredAnnualTokens = 0;
  let sumAnnualTokens = 0;
  const aggregate = data.repos.map((r) => {
    let measuredInv = 0;
    let measuredAnnualRuns = 0;
    let measuredAnnualTokens = 0;
    let totalAnnualTokens = 0;
    for (const s of r.skills) {
      const rec = s.receipt;
      if (!rec) continue;
      totalAnnualTokens += rec.annual_total ?? 0;
      if (rec.source !== 'transcript-measurement') continue;
      measuredInv += rec.invocations_in_window ?? 0;
      measuredAnnualRuns += rec.uses_per_year ?? 0;
      measuredAnnualTokens += rec.annual_total ?? 0;
      sumMeasuredTokensWindow +=
        rec.total_tokens_in_window ??
        (rec.tokens_per_use != null && rec.invocations_in_window != null
          ? rec.tokens_per_use * rec.invocations_in_window
          : 0);
    }
    sumMeasuredInv += measuredInv;
    sumMeasuredAnnualRuns += measuredAnnualRuns;
    sumMeasuredAnnualTokens += measuredAnnualTokens;
    sumAnnualTokens += totalAnnualTokens;
    return {
      name: r.name,
      skills: r.skills.length,
      measuredInv,
      measuredAnnualRuns,
      measuredAnnualTokens,
      totalAnnualTokens,
    };
  });

  const refs = data.built_in_references ?? [];
  const builtInsSection = refs.length === 0 ? '' : renderBuiltInsSection(refs);

  // Annual tokens cell: top line is the all-rows total (mixed measured +
  // editorial), bottom line surfaces the measured-only fraction so the
  // reader can tell at a glance whether the headline number is mostly
  // grounded in transcripts or mostly author estimate.
  const aggregateRows = aggregate
    .map((a) => {
      const runs = a.measuredInv
        ? `${a.measuredInv} in 90d<br><span class="subtle">→ ~${a.measuredAnnualRuns}/yr</span>`
        : '—';
      let tokens = '—';
      if (a.totalAnnualTokens) {
        tokens = `~${fmt(a.totalAnnualTokens)}`;
        if (a.measuredAnnualTokens) {
          tokens += `<br><span class="subtle">~${fmt(a.measuredAnnualTokens)} measured</span>`;
        } else {
          tokens += `<br><span class="subtle">all est.</span>`;
        }
      }
      return `<tr><td>${esc(a.name)}</td><td>${a.skills}</td><td>${runs}</td><td>${tokens}</td></tr>`;
    })
    .join('\n');

  const repoSections = data.repos
    .map((r) => {
      const rows = r.skills
        .map((s) => {
          const isMeasured = s.receipt?.source === 'transcript-measurement';
          const rowClass = isMeasured ? ' class="measured"' : '';
          const name = `<strong>${esc(s.name)}</strong>${s.redirect ? ' <em>(redirect)</em>' : ''}`;
          const stamp = isMeasured
            ? `<br><span class="subtle">${esc(daysAgo(s.receipt.last_invoked))}</span>`
            : '';
          const linkedName =
            s.receipt && isSafeHref(s.receipt.path)
              ? `<a href="${esc(s.receipt.path)}">${name}</a>${stamp}`
              : `${name}${stamp}`;
          return `<tr${rowClass}><td>${linkedName}</td><td class="desc">${esc(s.description)}</td><td>${renderCostPerUse(s.receipt)}</td><td>${renderTimesRun(s.receipt)}</td><td>${renderTokensUsed(s.receipt)}</td></tr>`;
        })
        .join('\n');
      const url =
        r.github_url && isSafeHref(r.github_url)
          ? ` — <a href="${esc(r.github_url)}">${esc(r.github_url)}</a>`
          : '';
      return `<h2>${esc(r.name)}${url}</h2>
<table class="per-repo">
  <thead><tr><th>Skill</th><th>Description</th><th>Cost / use</th><th>Times run</th><th>Tokens used</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
    })
    .join('\n');

  const totalRunsCell = sumMeasuredInv
    ? `${sumMeasuredInv} in 90d<br><span class="subtle">→ ~${sumMeasuredAnnualRuns}/yr</span>`
    : '—';
  const totalTokensCell = sumAnnualTokens
    ? `~${fmt(sumAnnualTokens)}<br><span class="subtle">~${fmt(sumMeasuredAnnualTokens)} measured</span>`
    : '—';

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
  table.aggregate td:nth-child(n+2) { text-align: right; white-space: nowrap; }
  table.per-repo td:nth-child(n+3) { text-align: right; white-space: nowrap; }
  td.desc { text-align: left; white-space: normal; max-width: 420pt; }
  a { color: #0a66c2; text-decoration: none; }
  .totals-row td { font-weight: 700; background: #f9f9f9; }
  tr.measured td:first-child { border-left: 3px solid #2e7d32; }
  .subtle { color: #777; font-weight: 400; font-size: 7.5pt; }
  .tag-measured { color: #2e7d32; font-weight: 600; }
  .tag-estimated { color: #666; font-weight: 600; }
  footer { color: #888; font-size: 8pt; margin-top: 18pt; }
</style>
</head>
<body>
<h1>Skill registry — ${esc(generated)}</h1>
<p class="meta">Every <code>.claude/skills/*/SKILL.md</code> across the portfolio. Rows with a green left edge are <span class="tag-measured">measured</span> from real Claude Code transcripts (90-day window); the rest are <span class="tag-estimated">estimated</span> by the skill author.</p>

${builtInsSection}

<h2>Aggregate</h2>
<table class="aggregate">
  <thead><tr><th>Repo</th><th>Skills</th><th>Times run (measured)</th><th>Tokens used / yr</th></tr></thead>
  <tbody>
    ${aggregateRows}
    <tr class="totals-row"><td>Total</td><td>${data.totals.skills}</td><td>${totalRunsCell}</td><td>${totalTokensCell}</td></tr>
  </tbody>
</table>

${repoSections}

<footer>Generated ${esc(fmtGeneratedAt(data.generated_at))}. Measured window: ${sumMeasuredInv} invocations across ${refs.length ? 'custom + built-in' : 'custom'} rows · ${fmt(sumMeasuredTokensWindow)} tokens in 90d.</footer>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`source missing: ${SRC}`);
    console.error('Run the skill-registry skill and copy its JSON output here first.');
    process.exit(1);
  }
  // CI / Vercel may have Chrome on the build image, but a transient
  // hosted-build render would drift from the committed PDF the next time a
  // human refreshes locally. Always defer to the committed artifact on
  // hosted builds so the public-facing PDF only changes when a real refresh
  // lands in a commit.
  if (process.env.CI || process.env.VERCEL) {
    console.log(
      'build-skills-pdf: CI environment detected — skipping regeneration, committed PDF is canonical.',
    );
    process.exit(0);
  }
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
