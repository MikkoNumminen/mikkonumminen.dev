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

function lastUsedDate(iso) {
  // Return an absolute YYYY-MM-DD string anchored to the measurement
  // timestamp itself — NOT a relative "Nd ago" label. A relative label would
  // be wrong the moment someone reads this PDF on a day other than its
  // generation day: "today" on the doc would read as "today" in the
  // reader's frame, when it actually means "the day the scanner ran".
  if (!iso) return '';
  return iso.slice(0, 10);
}

// Policy bands for the estimate-vs-observed calibration line on measured
// rows. Within ±10% — "close" (author guessed well). Off by ≥5× either way —
// "off" (highlighted so calibration misses are visible at a glance).
const CMP_CLOSE_BAND = 0.1;
const CMP_OFF_THRESHOLD = 5;

function fmtComparison(observed, estimated) {
  if (!observed || observed <= 0 || !estimated || estimated <= 0) return null;
  const ratio = observed / estimated;
  if (ratio >= 1 - CMP_CLOSE_BAND && ratio <= 1 + CMP_CLOSE_BAND) {
    return { text: `est. ${fmt(estimated)} · close`, klass: 'cmp-close' };
  }
  if (ratio > 1) {
    const r = ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1);
    const klass = ratio >= CMP_OFF_THRESHOLD ? 'cmp-off' : '';
    return { text: `est. ${fmt(estimated)} · ${r}× under`, klass };
  }
  const inv = 1 / ratio;
  const r = inv >= 10 ? Math.round(inv) : inv.toFixed(1);
  const klass = inv >= CMP_OFF_THRESHOLD ? 'cmp-off' : '';
  return { text: `est. ${fmt(estimated)} · ${r}× over`, klass };
}

// Cost-per-use cell. Two lines for estimated rows (number + "(est.)").
// Three lines for measured rows when a prior_estimate exists: the measured
// number + "(measured)" tag + a calibration line ("est. X · Nx under")
// surfacing how far the author's pre-measurement guess was from reality.
function renderCostPerUse(receipt) {
  if (!receipt?.tokens_per_use) return '—';
  const measured = receipt.source === 'transcript-measurement';
  const tag = measured ? '(measured)' : '(est.)';
  let extra = '';
  if (measured) {
    const cmp = fmtComparison(receipt.tokens_per_use, receipt.prior_estimate?.tokens_per_use);
    if (cmp) {
      const cls = cmp.klass ? `subtle ${cmp.klass}` : 'subtle';
      extra = `<br><span class="${cls}">${cmp.text}</span>`;
    }
  }
  return `${fmt(receipt.tokens_per_use)}<br><span class="subtle">${tag}</span>${extra}`;
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

// Aggregate "Tokens used / yr" subline. Describes what fraction of a headline
// total is measurement-backed: empty when the headline itself is '—', the
// literal strings 'all measured' or 'all est.' at the extremes, otherwise the
// measured share spelled out.
function tokensSubline(measured, total) {
  if (!total) return '';
  if (!measured) return `<br><span class="subtle">all est.</span>`;
  if (measured >= total) return `<br><span class="subtle">all measured</span>`;
  return `<br><span class="subtle">~${fmt(measured)} measured</span>`;
}

// Without-skill baseline as a multiple of the skill's per-use cost. The model:
// an unstructured chat would scout files, form plans, and decide path before
// producing the same artifact a focused skill run does — so the "without the
// skill" alternative costs noticeably more than the skill itself. Default
// assumes the alternative is ~3× the skill cost (i.e. savings = 2× cost).
// Override per skill by setting `tokens_saved_per_use` directly on a receipt
// when the heuristic is wrong (e.g. a redirect skill has no replacement work
// to compare against).
const DEFAULT_BASELINE_MULTIPLIER = 3;

function tokensSavedPerUse(receipt) {
  if (!receipt) return 0;
  if (typeof receipt.tokens_saved_per_use === 'number') return receipt.tokens_saved_per_use;
  if (typeof receipt.tokens_per_use !== 'number') return 0;
  return Math.round(receipt.tokens_per_use * (DEFAULT_BASELINE_MULTIPLIER - 1));
}

function tokensSavedAnnual(receipt) {
  const perUse = tokensSavedPerUse(receipt);
  if (!perUse) return 0;
  const uses = receipt.uses_per_year;
  if (typeof uses !== 'number' || uses <= 0) return 0;
  return perUse * uses;
}

// Tokens-saved cell. Annualized savings vs the modeled "without skill"
// baseline. Renders as a bare number — the column header carries "/ yr
// (est.)" so per-row repetition would be redundant. Matches how the
// aggregate column renders the same data, so the per-skill and aggregate
// tables format the savings figure identically.
function renderTokensSaved(receipt) {
  const annual = tokensSavedAnnual(receipt);
  if (!annual) return '—';
  return `~${fmt(annual)}`;
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
      const lastUsed = lastUsedDate(br.last_invoked);
      const stamp = lastUsed ? `<br><span class="subtle">last ${esc(lastUsed)}</span>` : '';
      return `<tr class="measured"><td><strong>${esc(br.label)}</strong>${stamp}</td><td class="desc">${esc(br.description)}</td><td>${renderCostPerUse(receipt)}</td><td>${renderTimesRun(receipt)}</td><td>${renderTokensUsed(receipt)}</td><td>—</td></tr>`;
    })
    .join('\n');
  return `<h2>Reference: Claude Code built-ins</h2>
<p class="meta">Claude Code's own slash commands &mdash; <strong>not part of this portfolio</strong>, shown for scale. <strong>Excluded from every total below.</strong> No savings claim — built-ins are baseline tooling, not a compression-over-baseline.</p>
<table class="per-repo">
  <thead><tr><th>Skill</th><th>Description</th><th>Cost / use</th><th>Times run</th><th>Tokens used</th><th>Tokens saved / yr (est.)</th></tr></thead>
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
  let sumAnnualSaved = 0;
  const aggregate = [];
  for (const r of data.repos) {
    let measuredInv = 0;
    let measuredAnnualRuns = 0;
    let measuredAnnualTokens = 0;
    let totalAnnualTokens = 0;
    let annualSaved = 0;
    for (const s of r.skills) {
      const rec = s.receipt;
      if (!rec) continue;
      totalAnnualTokens += rec.annual_total ?? 0;
      annualSaved += tokensSavedAnnual(rec);
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
    sumAnnualSaved += annualSaved;
    aggregate.push({
      name: r.name,
      skills: r.skills.length,
      measuredInv,
      measuredAnnualRuns,
      measuredAnnualTokens,
      totalAnnualTokens,
      annualSaved,
    });
  }

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
      const tokens = a.totalAnnualTokens
        ? `~${fmt(a.totalAnnualTokens)}${tokensSubline(a.measuredAnnualTokens, a.totalAnnualTokens)}`
        : '—';
      const saved = a.annualSaved ? `~${fmt(a.annualSaved)}` : '—';
      return `<tr><td>${esc(a.name)}</td><td>${a.skills}</td><td>${runs}</td><td>${tokens}</td><td>${saved}</td></tr>`;
    })
    .join('\n');

  const repoSections = data.repos
    .map((r) => {
      const rows = r.skills
        .map((s) => {
          const isMeasured = s.receipt?.source === 'transcript-measurement';
          const rowClass = isMeasured ? ' class="measured"' : '';
          const name = `<strong>${esc(s.name)}</strong>${s.redirect ? ' <em>(redirect)</em>' : ''}`;
          const lastUsed = isMeasured ? lastUsedDate(s.receipt.last_invoked) : '';
          const stamp = lastUsed
            ? `<br><span class="subtle">last ${esc(lastUsed)}</span>`
            : '';
          const linkedName =
            s.receipt && isSafeHref(s.receipt.path)
              ? `<a href="${esc(s.receipt.path)}">${name}</a>${stamp}`
              : `${name}${stamp}`;
          return `<tr${rowClass}><td>${linkedName}</td><td class="desc">${esc(s.description)}</td><td>${renderCostPerUse(s.receipt)}</td><td>${renderTimesRun(s.receipt)}</td><td>${renderTokensUsed(s.receipt)}</td><td>${renderTokensSaved(s.receipt)}</td></tr>`;
        })
        .join('\n');
      const url =
        r.github_url && isSafeHref(r.github_url)
          ? ` — <a href="${esc(r.github_url)}">${esc(r.github_url)}</a>`
          : '';
      return `<h2>${esc(r.name)}${url}</h2>
<table class="per-repo">
  <thead><tr><th>Skill</th><th>Description</th><th>Cost / use</th><th>Times run</th><th>Tokens used</th><th>Tokens saved / yr (est.)</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
    })
    .join('\n');

  const totalRunsCell = sumMeasuredInv
    ? `${sumMeasuredInv} in 90d<br><span class="subtle">→ ~${sumMeasuredAnnualRuns}/yr</span>`
    : '—';
  const totalTokensCell = sumAnnualTokens
    ? `~${fmt(sumAnnualTokens)}${tokensSubline(sumMeasuredAnnualTokens, sumAnnualTokens)}`
    : '—';
  const totalSavedCell = sumAnnualSaved ? `~${fmt(sumAnnualSaved)}` : '—';

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
  /* Estimate-vs-observed calibration line: green when the author's pre-measurement
     guess landed within ±10% of reality, orange when off by ≥5× in either direction. */
  .cmp-close { color: #2e7d32; font-weight: 600; }
  .cmp-off { color: #c2410c; font-weight: 600; }
  footer { color: #888; font-size: 8pt; margin-top: 18pt; }
</style>
</head>
<body>
<h1>Skill registry — ${esc(generated)}</h1>
<p class="meta">Every <code>.claude/skills/*/SKILL.md</code> across the portfolio. Rows with a green left edge are <span class="tag-measured">measured</span> from real Claude Code transcripts (90-day window); the rest are <span class="tag-estimated">estimated</span> by the skill author. On measured rows, the <strong>Cost / use</strong> cell carries a calibration line comparing the observed average to the author's pre-measurement guess, e.g. <code>est. 4K &middot; 93&times; under</code> &mdash; green when the estimate landed within &plusmn;10%, orange when off by &ge;5&times;. <strong>Tokens saved</strong> models the without-skill alternative: an unstructured chat would scout files, form plans, and decide path before producing the same artifact, costing roughly 3&times; the focused skill run; savings &asymp; 2&times; cost per use &times; annual uses. Override per skill via <code>tokens_saved_per_use</code> on the receipt when the heuristic is wrong.</p>

${builtInsSection}

<h2>Aggregate</h2>
<table class="aggregate">
  <thead><tr><th>Repo</th><th>Skills</th><th>Times run (measured)</th><th>Tokens used / yr</th><th>Tokens saved / yr (est.)</th></tr></thead>
  <tbody>
    ${aggregateRows}
    <tr class="totals-row"><td>Total</td><td>${data.totals.skills}</td><td>${totalRunsCell}</td><td>${totalTokensCell}</td><td>${totalSavedCell}</td></tr>
  </tbody>
</table>

${repoSections}

<footer>Generated ${esc(fmtGeneratedAt(data.generated_at))}. Measured window: ${sumMeasuredInv} invocations across custom rows · ${fmt(sumMeasuredTokensWindow)} tokens in 90d. Built-in reference rows are excluded.</footer>
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
