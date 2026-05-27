#!/usr/bin/env node
// Render public/data/skills-registry.json to public/skills-registry.pdf using
// the locally-installed Chrome's headless --print-to-pdf. Content-aware
// wrapper for the skill-registry shape; for generic markdown / HTML use, see
// the `md-to-pdf` skill at `.claude/skills/md-to-pdf/SKILL.md` and the
// `scripts/build-pdf.mjs` CLI.
//
// Output layout (page-by-page; see docs/audits/skills-pdf-current-state.md
// for why this differs from the prior renderer):
//
//   Page 1   Hero: title, one-line abstract, measured-vs-/review bar pair,
//            voice paragraph, per-repo summary table.
//   Page 2   Calibration honesty: every measured row that has a prior
//            editorial estimate, sorted by how wrong the guess was.
//   Page 3+  Per-repo skill tables with measured rows visually elevated.
//   Last     Method page: how rows are produced, what's measured, what's
//            modeled, what this document does NOT claim, reproducibility.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChrome, printHtmlToPdf } from './lib/chrome-pdf.mjs';
import { escapeHtml as esc, isSafeHref } from './lib/escape.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'data', 'skills-registry.json');
const OUT = path.join(ROOT, 'public', 'skills-registry.pdf');
const CSS_FILE = path.join(ROOT, 'scripts', 'lib', 'skills-pdf.css');

// Regime mismatch threshold: when transcript-measured cost is more than this
// multiple of the A/B calibration baseline, the row prints an extra subline
// anchoring the saved percentage to the A/B baseline so reader math works.
// 2× catches every row where the gap is meaningful (current data: 9 rows,
// from /review at 14.6× down to a handful at ~3×) without false-flagging
// rows where cost and save come from the same regime (within ~1.5× tends
// to be the same A/B run feeding both numbers).
const REGIME_MISMATCH_THRESHOLD = 2;

// ---------------------------------------------------------------------------
//  Formatting helpers
// ---------------------------------------------------------------------------

const fmt = (n) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(0)}K`
      : String(n);

// Like `fmt` but preserves an order-of-magnitude signal at the low end —
// `fmt(4295)` collapses to "4K" (same as 14K, 40K), which is misleading
// for accuracy footers where the spread itself is the point. Below 100K we
// show comma-separated raw integers; above we fall through to fmt.
const fmtPrecise = (n) => (n < 100_000 ? n.toLocaleString('en-US') : fmt(n));

// Measured-save cell with an A/B-baseline subline. Used on rows where the
// transcript cost is large enough vs the A/B baseline that the bare percent
// would mislead — see REGIME_MISMATCH_THRESHOLD. Recomputes pct fresh from
// (saved / armA) so what the reader sees on the row matches what they'd
// compute themselves; also unifies both render paths (built-in carries a
// pre-stored `calibration_pct_saved`, per-skill receipts don't).
// `fmtPrecise` (not `fmt`) on the baseline value preserves precision at
// the bottom end — current baselines run 16K–117K, where fmt would
// collapse 16,225 and 19,500 to the same "16K"/"20K" reading. Matches
// the accuracy-stats subline style on the /review row.
function saveCellWithBaseline(value, armA) {
  const negative = value < 0;
  const cellClasses = ['num-cell', 'num-cell-measured-save'];
  if (negative) cellClasses.push('cell-negative');
  const display = negative ? `−${fmt(Math.abs(value))}` : fmt(value);
  const pct = armA > 0 ? Math.round((value / armA) * 100) : null;
  const pctText = pct != null ? ` · ${pct}%` : '';
  return `<td class="${cellClasses.join(' ')}"><span class="num-cell-big">${display}</span><span class="num-cell-unit">tokens / use</span><span class="num-cell-sub">vs ${fmtPrecise(armA)} A/B baseline${pctText}</span></td>`;
}

// Optional sample-stats subline for the save cell, surfaced when the save
// number is averaged over multiple A/B runs. Two display modes:
//
//  - Plain multi-A/B (no buckets): "avg of N A/Bs · L1–L2 lines · range P1%–P2%"
//  - Bucketed (recipe value varies systematically with task size):
//      "weighted across N A/Bs · small 44% · med 26% · large 15% · xlarge -10%"
//    so the reader sees both that the headline is weighted by production
//    frequency AND that the recipe value isn't uniform across the population.
//
// Returns empty string for rows with only one A/B measurement.
function abSampleSubline(rec) {
  // Threshold is 2: a single A/B is just the headline number and doesn't warrant
  // a "sample" subline; from 2 onwards the spread tells a story the headline can't.
  if (
    !rec ||
    typeof rec.calibration_ab_count !== 'number' ||
    rec.calibration_ab_count < 2
  )
    return '';
  // Bucketed mode: emit per-bucket pct breakdown so the size→save gradient is
  // visible alongside the weighted headline.
  if (rec.calibration_ab_buckets && typeof rec.calibration_ab_buckets === 'object') {
    const buckets = rec.calibration_ab_buckets;
    const parts = [];
    for (const name of ['small', 'med', 'large', 'xlarge']) {
      const b = buckets[name];
      if (!b) continue;
      parts.push(`${name} ${b.pct_median}%`);
    }
    return `<span class="num-cell-sub">weighted across ${rec.calibration_ab_count} A/Bs · ${parts.join(' · ')}</span>`;
  }
  // Fallback: plain multi-A/B subline.
  const linesRange =
    typeof rec.calibration_ab_lines_min === 'number' &&
    typeof rec.calibration_ab_lines_max === 'number'
      ? ` · ${rec.calibration_ab_lines_min}–${rec.calibration_ab_lines_max} lines`
      : '';
  const pctRange =
    typeof rec.calibration_save_pct_min === 'number' &&
    typeof rec.calibration_save_pct_max === 'number'
      ? ` · range ${rec.calibration_save_pct_min}%–${rec.calibration_save_pct_max}%`
      : '';
  return `<span class="num-cell-sub">avg of ${rec.calibration_ab_count} A/Bs${linesRange}${pctRange}</span>`;
}

// Inject an AB-sample subline (when present on the row) just before the
// closing </td> of an already-built save cell. Keeps the regime-mismatch
// path and the plain-pct path both able to opt in without restructuring
// the cell HTML. No-op when abSampleSubline returns empty string.
function appendAbSubline(cellHtml, rec) {
  const sub = abSampleSubline(rec);
  if (!sub) return cellHtml;
  return cellHtml.replace(/<\/td>$/, `${sub}</td>`);
}

// Compact legend for the SAVE / USE column. Lives directly next to the
// tables that carry the column (built-ins + per-repo) rather than only on
// the method page several pages away — readers who skip the method page
// still need to know what they're looking at, especially the negative/orange
// case and the "do not subtract" warning.
function renderSaveUseLegend() {
  return `<aside class="save-use-legend">
  <strong>SAVE / USE</strong> — tokens saved vs running the same task without the skill, measured by A/B test (arm A cold − arm B with-skill).
  A <strong>negative value (orange)</strong> means the skill cost more than the unstructured baseline — it encodes rigor, not token compression.
  <strong>Cost / use</strong> is measured from production transcripts; <strong>save / use</strong> is measured by A/B calibration. They come from different runs — <strong>do not subtract one from the other</strong>.
</aside>`;
}

function fmtGeneratedAt(iso) {
  const s = iso.replace('Z', '');
  const [datePart, timePart] = s.split('T');
  const hhmm = timePart ? timePart.slice(0, 5) : '??:??';
  return `${datePart} at ${hhmm} UTC`;
}

function lastUsedDate(iso) {
  // Absolute YYYY-MM-DD, never relative — see prior renderer comment for
  // the reasoning (a "today" tag would be wrong the moment someone reads
  // the PDF on a different day).
  if (!iso) return '';
  return iso.slice(0, 10);
}

function firstSentence(text) {
  // The description field in the JSON can be 4-8 lines of prose. The PDF
  // tagline shows only the leading sentence so a row can be scanned in
  // under 2 seconds. Falls back to truncating at 140 chars if there's no
  // sentence-terminating punctuation.
  if (!text) return '';
  const trimmed = text.trim();
  const m = trimmed.match(/^[^.!?]*[.!?](?=\s|$)/);
  if (m) return m[0];
  return trimmed.length > 140 ? trimmed.slice(0, 137) + '…' : trimmed;
}

// ---------------------------------------------------------------------------
//  Tokens-saved model (kept verbatim from the prior renderer)
//
//  An unstructured chat would scout files, form plans, and decide path
//  before producing the same artifact a focused skill run does — so the
//  "without skill" alternative costs noticeably more. Default assumes the
//  alternative is ~3x the skill cost (savings = 2x cost per use). Override
//  per-skill via `tokens_saved_per_use` on the receipt when the heuristic
//  is wrong (e.g. a redirect skill has no replacement work to compare to).
// ---------------------------------------------------------------------------

const DEFAULT_BASELINE_MULTIPLIER = 3;

function tokensSavedPerUse(receipt) {
  if (!receipt) return 0;
  if (typeof receipt.tokens_saved_per_use === 'number') {
    return receipt.tokens_saved_per_use;
  }
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

// ---------------------------------------------------------------------------
//  Calibration delta (how wrong the prior editorial guess was)
//
//  Returns null when there's no prior estimate or either side is zero.
//  Otherwise returns:
//    { multiplier: <number>, direction: 'under' | 'over' | 'close',
//      klass: 'off' | 'ok' | '' }
//
//  "close" = ratio within +/- 10% of 1.
//  "off"   = ratio >= 5x in either direction (the senior-engineer signal).
// ---------------------------------------------------------------------------

const CMP_CLOSE_BAND = 0.1;
const CMP_OFF_THRESHOLD = 5;

function calibrationDelta(observed, estimated) {
  if (!observed || observed <= 0) return null;
  if (!estimated || estimated <= 0) return null;
  const ratio = observed / estimated;
  if (ratio >= 1 - CMP_CLOSE_BAND && ratio <= 1 + CMP_CLOSE_BAND) {
    return { multiplier: 1, direction: 'close', klass: 'ok', raw: ratio };
  }
  if (ratio > 1) {
    return {
      multiplier: ratio,
      direction: 'under',
      klass: ratio >= CMP_OFF_THRESHOLD ? 'off' : '',
      raw: ratio,
    };
  }
  const inv = 1 / ratio;
  return {
    multiplier: inv,
    direction: 'over',
    klass: inv >= CMP_OFF_THRESHOLD ? 'off' : '',
    raw: ratio,
  };
}

function fmtMultiplier(m) {
  if (m >= 10) return `${Math.round(m)}×`;
  return `${m.toFixed(1)}×`;
}

// ---------------------------------------------------------------------------
//  Row classification
// ---------------------------------------------------------------------------

// "Measured" means the cost-per-use is backed by a real run, regardless of
// which kind of run. Two sources qualify:
//   - 'transcript-measurement': real Claude Code session transcripts
//     scanned by mikko-skill-usage. "What happened in production."
//   - 'calibration': A/B calibration arm-B sub-agent ran the skill on a
//     representative task. "What happens under controlled conditions."
// Both are real tokens billed through the harness. The chip says MEASURED
// for either; the per-cell unit text distinguishes the source when useful.
function isMeasured(receipt) {
  return (
    receipt?.source === 'transcript-measurement' || receipt?.source === 'calibration'
  );
}

// ---------------------------------------------------------------------------
//  Hero block (page 1)
// ---------------------------------------------------------------------------

function renderHero(perRepo, totalSkillsWithReceipts, totalCalibrated) {
  // Per-portfolio A/B-measured save rates. The hero used to track
  // measurement coverage (cost-measured / save-measured / estimate-only),
  // but with all 34 portfolio rows now calibrated the coverage bars all hit
  // 34/34 — uninteresting. The interesting story now is the data itself:
  // which portfolios save tokens via their skills, and which spend more
  // because their skills encode rigor rather than scout-savings.
  //
  // Each bar shows one portfolio's aggregate save rate, computed by summing
  // calibration_arm_A and calibration_arm_B across that portfolio's
  // calibrated rows. Bars use absolute pct for width (so a +52% and a -52%
  // both consume half the page) with class .pos / .neg coloring direction.
  // Only repos with calibration data render a bar.
  const reposWithCalib = perRepo.filter((r) => r.calibArmATotal > 0);
  if (reposWithCalib.length === 0) {
    return '';
  }
  reposWithCalib.sort((a, b) => b.calibPctSaved - a.calibPctSaved);
  const maxAbsPct = Math.max(...reposWithCalib.map((r) => Math.abs(r.calibPctSaved)), 1);
  const bars = reposWithCalib
    .map((r) => {
      const sign = r.calibPctSaved >= 0 ? '+' : '−';
      const klass = r.calibPctSaved >= 0 ? 'pos' : 'neg';
      const pct = Math.abs(r.calibPctSaved);
      const barWidth = Math.max(Math.round((pct / maxAbsPct) * 100), 1);
      const savedFmt =
        r.calibSavedTotal >= 0
          ? `+${fmt(r.calibSavedTotal)}`
          : `−${fmt(Math.abs(r.calibSavedTotal))}`;
      return `<div class="hero-row">
    <span class="number">${sign}${pct}% <span class="pct">${savedFmt} tokens across ${r.calibratedCount} skill${r.calibratedCount === 1 ? '' : 's'}</span></span>
    <span class="label">${esc(r.name)} <span class="sublabel">(arm A ${fmt(r.calibArmATotal)} → arm B ${fmt(r.calibArmBTotal)})</span></span>
    <span class="bar ${klass}" style="width: ${barWidth}%"></span>
  </div>`;
    })
    .join('\n  ');
  const aggArmA = reposWithCalib.reduce((n, r) => n + r.calibArmATotal, 0);
  const aggArmB = reposWithCalib.reduce((n, r) => n + r.calibArmBTotal, 0);
  const aggSaved = aggArmA - aggArmB;
  const aggPct = aggArmA > 0 ? Math.round((aggSaved / aggArmA) * 100) : 0;
  const aggSignedPct = aggPct >= 0 ? `+${aggPct}` : `−${Math.abs(aggPct)}`;
  const aggSignedSaved =
    aggSaved >= 0 ? `+${fmt(aggSaved)}` : `−${fmt(Math.abs(aggSaved))}`;
  return `<section class="hero avoid-break">
  <h2>A/B-measured save rates by portfolio</h2>
  ${bars}
  <p class="hero-caption"><strong>Aggregate: ${aggSignedPct}% (${aggSignedSaved} tokens across ${totalCalibrated} skills).</strong> Save rate = (arm A − arm B) / arm A, summed per portfolio. Negative means the skill costs MORE per use than going cold — those skills encode rigor (audit thoroughness, protocol discipline, spec depth), not scout-savings. The 3× heuristic baseline assumed everything would save ~67%; measurement says the truth varies from +52% to −112% depending on what the skill encodes.</p>
</section>`;
}

// Design note: there is deliberately no secondary "Context: portfolio used X
// tokens in 90 days, /review ate Y in the same window" paragraph beneath the
// hero. A prior version of the renderer carried one (renderContextBox); it
// was removed because it brought "tokens used" back as a headline-adjacent
// number, against the document's per-use-only framing. The /review row
// still appears as its own line in the Claude Code built-ins reference
// table below — that's the scale anchor, not the deleted paragraph.

// Reference: Claude Code built-ins. /review and any other tracked built-in
// shows up here as its own discrete row, separate from the custom-skill
// portfolio. The built-in costs are measurement-backed (same accounting
// convention as the per-repo measured rows). Save / use can also be
// measured by treating the built-in's prompt as an "arm B" recipe in the
// same A/B methodology used on custom skills (see whichever calibration
// audit the data points at). Excluded from the savings hero because the
// built-ins are not part of the custom portfolio.
function renderBuiltInsSection(refs) {
  if (!refs || refs.length === 0) return '';
  // Same 6-column shape as the per-repo tables so the row scans the same
  // way. Built-ins where the prompt has been A/B-calibrated populate the
  // measured-save cell; un-calibrated built-ins keep "—" there.
  const rows = refs
    .map((br) => {
      const lastSeen = br.last_invoked
        ? `<span class="last-seen">last ${esc(lastUsedDate(br.last_invoked))}</span>`
        : '';
      const tagline = esc(br.description);
      const skill = `<td class="skill"><span class="name">${esc(br.label)}</span><span class="tagline">${tagline}</span></td>`;
      const status = `<td class="status"><span class="chip chip-measured">measured</span>${lastSeen}</td>`;
      // Accuracy footer is shown when the per-invocation stats are present —
      // `build-review-stats.mjs` populates them by re-scanning local JSONLs
      // and computing median + mean + min/max/σ across the N invocations.
      // The headline (tokens_per_use_avg) is now the MEDIAN: the cost
      // distribution is heavily right-skewed (a few large /review calls
      // pull the mean above what one typical use costs), so the median is
      // the honest "what does one /review cost" figure. The mean + spread
      // ride in the subline so the reader sees how wobbly the average is.
      const hasAccuracy =
        typeof br.tokens_per_use_min === 'number' &&
        typeof br.tokens_per_use_max === 'number' &&
        typeof br.tokens_per_use_stddev === 'number' &&
        typeof br.invocations_in_window === 'number';
      const meanText =
        typeof br.tokens_per_use_mean === 'number'
          ? ` · mean ${fmtPrecise(br.tokens_per_use_mean)}`
          : '';
      const accuracyLine = hasAccuracy
        ? `<span class="num-cell-sub">median of ${br.invocations_in_window} runs${meanText} · range ${fmtPrecise(br.tokens_per_use_min)}–${fmtPrecise(br.tokens_per_use_max)} · σ ${fmtPrecise(br.tokens_per_use_stddev)}</span>`
        : '';
      const measuredCost = `<td class="num-cell num-cell-measured-cost"><span class="num-cell-big">${fmt(br.tokens_per_use_avg)}</span><span class="num-cell-unit">tokens / use</span>${accuracyLine}</td>`;
      const dash = `<td class="num-cell">—</td>`;
      // Regime mismatch on built-in row: cost is from production transcripts
      // (`tokens_per_use_avg`), save is from a single small-PR A/B calibration
      // (`tokens_saved_per_use` vs `calibration_arm_A`). When the transcript
      // cost is much larger than the A/B baseline, the bare "(63%)" reads as
      // if it applies to the visible cost — actually it's 63% of the much
      // smaller A/B baseline. Surface the baseline in a subline when the gap
      // is real. /review hits 14.6× — far past the threshold. Recompute the
      // percentage fresh from `saved / armA` so the math the reader sees on
      // the row exactly matches what they'd compute themselves (also
      // unifies with the per-skill path which doesn't carry a pre-stored
      // calibration_pct_saved field on the receipt).
      const brRegimeMismatch =
        typeof br.calibration_arm_A === 'number' &&
        typeof br.tokens_per_use_avg === 'number' &&
        br.tokens_per_use_avg > br.calibration_arm_A * REGIME_MISMATCH_THRESHOLD;
      const measuredSave =
        typeof br.tokens_saved_per_use === 'number'
          ? appendAbSubline(
              brRegimeMismatch
                ? saveCellWithBaseline(br.tokens_saved_per_use, br.calibration_arm_A)
                : `<td class="num-cell num-cell-measured-save"><span class="num-cell-big">${fmt(br.tokens_saved_per_use)}</span><span class="num-cell-unit">tokens / use${typeof br.calibration_pct_saved === 'number' ? ` (${br.calibration_pct_saved}%)` : ''}</span></td>`,
              br,
            )
          : dash;
      // estimated-cost has no source for built-ins (no SKILL.md author).
      // estimated-save uses the project-wide 3× baseline heuristic so the row
      // shows the heuristic prediction the document is calibrating against —
      // e.g. /review's measured 46K vs heuristic 2.1M (46× overestimate).
      const estSave =
        typeof br.tokens_per_use_avg === 'number'
          ? `<td class="num-cell num-cell-est-save"><span class="num-cell-big">${fmt(Math.round(br.tokens_per_use_avg * 2))}</span><span class="num-cell-unit">tokens / use (3× heuristic)</span></td>`
          : dash;
      return `<tr class="measured">${skill}${status}${measuredCost}${measuredSave}${dash}${estSave}</tr>`;
    })
    .join('\n');
  const anyCalibrated = refs.some((br) => typeof br.tokens_saved_per_use === 'number');
  // Audit-doc paths are sourced from the calibration JSON (per-entry
  // `audit_doc_path` field) so a future calibration that ships a different
  // audit file doesn't need a renderer edit. De-duplicated because two
  // built-ins calibrated in the same run share one audit document.
  const auditPaths = anyCalibrated
    ? [
        ...new Set(
          refs
            .map((br) => br.audit_doc_path)
            .filter((p) => typeof p === 'string' && p.length > 0),
        ),
      ]
    : [];
  const auditFragment =
    auditPaths.length > 0
      ? ` Methodology and raw arm-A / arm-B numbers: ${auditPaths
          .map((p) => `<code>${esc(p)}</code>`)
          .join(', ')}.`
      : '';
  const noteText = anyCalibrated
    ? `Built-in slash commands. Per-use cost is measured from real session transcripts the same way as the custom-skill rows. Per-use save is measured by treating the built-in's prompt as an arm-B recipe in the same A/B methodology used on custom skills — both measured columns are real numbers, not heuristics. The estimated-cost cell stays "—" because built-ins have no SKILL.md author who wrote a guess; the estimated-save cell shows the project-wide 3× baseline heuristic prediction (2× measured cost) so the row carries the same heuristic-vs-measured contrast the custom-skill rows show.${auditFragment}`
    : `Built-in slash commands. Per-use cost is measured the same way as the custom-skill rows. No <code>SKILL.md</code> exists for these, so there's no procedure to A/B-test against — the save columns read "—" rather than zero. Shown as a scale anchor for the reader.`;
  return `<div class="repo-heading"><span class="repo-name">Claude Code built-ins</span><span class="repo-stats">reference — not part of the portfolio</span></div>
  <p class="note">${noteText}</p>
  <table class="skills">
    <thead>
      <tr>
        <th scope="col">Skill</th>
        <th scope="col">Status</th>
        <th scope="col" class="num">Cost / use<br><span class="th-sub">measured</span></th>
        <th scope="col" class="num">Save / use<br><span class="th-sub">measured</span></th>
        <th scope="col" class="num">Cost / use<br><span class="th-sub">estimated</span></th>
        <th scope="col" class="num">Save / use<br><span class="th-sub">estimated</span></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ---------------------------------------------------------------------------
//  Per-repo summary (page 1, under the hero)
// ---------------------------------------------------------------------------

function renderSummaryTable(perRepo) {
  // Per-use only. Columns count skills by measurement coverage; no annual
  // figures (no Tokens-used-90d, no Saved-per-year). The reader who wants
  // a per-skill number opens the per-repo tables.
  const rows = perRepo
    .map((r) => {
      const skills = r.totalSkills;
      const costMeasured = r.measuredCount;
      const saveMeasured = r.calibratedCount;
      const estOnly = skills - costMeasured;
      return `<tr><td>${esc(r.name)}</td><td class="num">${skills}</td><td class="num">${costMeasured}</td><td class="num">${saveMeasured}</td><td class="num">${estOnly}</td></tr>`;
    })
    .join('\n');
  return `<table class="aggregate">
  <thead><tr><th scope="col">Repo</th><th scope="col" class="num">Skills</th><th scope="col" class="num">Cost / use measured</th><th scope="col" class="num">Save / use measured</th><th scope="col" class="num">Estimate-only</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="note">All measurement counts are per single invocation of the skill. Cost-measured rows have a real run behind their per-use cost (a transcript-attributed session, or an A/B calibration arm-B). Save-measured rows have a real A/B test behind their per-use savings (calibration). Estimate-only rows have neither yet.</p>`;
}

// ---------------------------------------------------------------------------
//  Calibration page (page 2)
// ---------------------------------------------------------------------------

function renderCalibrationPage(measuredWithPriors) {
  if (measuredWithPriors.length === 0) {
    return `<section class="page-break">
  <h2>Calibration honesty</h2>
  <p class="calib-intro">No measured rows have a prior editorial estimate to compare against yet. As more skills get both a guess and a measurement, this page will populate.</p>
</section>`;
  }

  // Sort by absolute log-ratio descending — biggest miss first regardless
  // of direction. A 100x under and a 100x over are equally interesting.
  measuredWithPriors.sort((a, b) => {
    const la = Math.abs(Math.log(a.delta.raw));
    const lb = Math.abs(Math.log(b.delta.raw));
    return lb - la;
  });

  const rows = measuredWithPriors
    .map((row) => {
      const d = row.delta;
      const cls = d.klass ? ` class="delta ${d.klass}"` : ' class="delta"';
      const dirText = d.direction === 'close' ? 'within ±10%' : `${d.direction}`;
      return `<tr>
  <td><span class="repo-tag">${esc(row.repo)}</span><strong>${esc(row.name)}</strong></td>
  <td class="num">${fmt(row.priorTpu)}</td>
  <td class="num">${fmt(row.observedTpu)}</td>
  <td class="num"><span${cls}>${fmtMultiplier(d.multiplier)}</span><span class="delta-dir">${esc(dirText)}</span></td>
</tr>`;
    })
    .join('\n');

  const offCount = measuredWithPriors.filter((r) => r.delta.klass === 'off').length;

  return `<section class="page-break">
  <h2>Calibration honesty — where my guesses landed</h2>
  <p class="calib-intro">Here are the rows where I had a guess before I had data. The “How wrong” column is the measurement divided by the guess. Green means I landed within ±10%. Orange means I was off by 5× or more in either direction. ${offCount} of ${measuredWithPriors.length} rows are orange. The fix is not to write better guesses next time. The fix is to keep measuring.</p>
  <p class="calib-intro">Where the guesses come from: each skill carries an author-written estimate in its <code>SKILL.md</code> frontmatter (or in the repo's <code>README.md</code> table for some skills). I imagined what a single use should cost in tokens and wrote that number down when first scaffolding the skill, before any real run existed. No math, no benchmark — just the number that felt right at the time. The provenance for each row (the <code>source</code> tag — either <code>skill-body</code> or <code>readme.md</code> — and the file path) lives on the row's <code>prior_estimate</code> block in <code>public/data/skills-registry.json</code>.</p>
  <table class="calibration">
    <thead><tr><th scope="col">Skill</th><th scope="col" class="num">My guess (per use)</th><th scope="col" class="num">Measured (per use)</th><th scope="col" class="num">How wrong</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

// ---------------------------------------------------------------------------
//  Per-repo skill table (pages 3+)
// ---------------------------------------------------------------------------

function renderSkillRow(repoName, s) {
  const rec = s.receipt;
  const measured = isMeasured(rec);
  const cls = s.redirect ? 'redirect' : measured ? 'measured' : 'estimate';

  const chip = s.redirect
    ? '<span class="chip chip-redirect">redirect</span>'
    : measured
      ? '<span class="chip chip-measured">measured</span>'
      : '<span class="chip chip-estimate">estimate</span>';

  const tagline = esc(firstSentence(s.description));
  const linkedName =
    rec && isSafeHref(rec.path)
      ? `<a href="${esc(rec.path)}">${esc(s.name)}</a>`
      : esc(s.name);

  const lastSeen =
    measured && rec?.last_invoked
      ? `<span class="last-seen">last ${esc(lastUsedDate(rec.last_invoked))}</span>`
      : '';

  // Four per-use data columns, in pairs. Annual / runs / calibration-delta
  // columns are deliberately gone — this document only shows per-use data.
  //
  //   Measured cost/use      tokens_per_use when source is transcript OR
  //                          calibration (both are real runs); — otherwise.
  //   Measured save/use      tokens_saved_per_use when tokens_saved_source
  //                          is 'calibration'; — otherwise. Negatives mean
  //                          the skill cost MORE in the A/B than baseline.
  //   Estimated cost/use     The editorial cost guess. Pulled from
  //                          prior_estimate (preserved when calibration
  //                          promoted arm-B into the measured cost) or from
  //                          the raw receipt when there's no measurement at
  //                          all on the row.
  //   Estimated save/use     The 3× heuristic applied to the estimated
  //                          cost: saved ≈ 2× cost. Author guess, always.
  const measuredCost = isMeasured(rec) ? rec.tokens_per_use : null;
  const measuredSave =
    rec?.tokens_saved_source === 'calibration' ? rec.tokens_saved_per_use : null;
  const estimatedCost =
    rec?.prior_estimate?.tokens_per_use ?? (isMeasured(rec) ? null : rec?.tokens_per_use);
  const estimatedSave =
    typeof estimatedCost === 'number'
      ? Math.round(estimatedCost * (DEFAULT_BASELINE_MULTIPLIER - 1))
      : null;

  function num(value, kind) {
    if (value == null) return `<td class="num-cell">—</td>`;
    const negative = value < 0;
    const cellClasses = ['num-cell', `num-cell-${kind}`];
    if (kind === 'measured-save' && negative) cellClasses.push('cell-negative');
    const display = negative ? `−${fmt(Math.abs(value))}` : fmt(value);
    return `<td class="${cellClasses.join(' ')}"><span class="num-cell-big">${display}</span><span class="num-cell-unit">tokens / use</span></td>`;
  }

  // Regime mismatch: see saveCellWithBaseline + REGIME_MISMATCH_THRESHOLD at
  // the top of the file for the why. Per-skill path applies the same
  // detection rule as the built-in path; both render the same subline.
  const regimeMismatch =
    rec?.source === 'transcript-measurement' &&
    rec?.tokens_saved_source === 'calibration' &&
    typeof rec?.calibration_arm_A === 'number' &&
    typeof rec?.tokens_per_use === 'number' &&
    rec.tokens_per_use > rec.calibration_arm_A * REGIME_MISMATCH_THRESHOLD;

  const measuredSaveCell = regimeMismatch
    ? saveCellWithBaseline(measuredSave, rec.calibration_arm_A)
    : num(measuredSave, 'measured-save');

  // Median-headline subline for transcript-measured rows. `tokens_per_use`
  // here is the median (`build-review-stats.mjs` writes the median into
  // that field for any skill with N≥2 invocations); the mean + spread move
  // into a sub-cell so the reader sees how much the average wobbles. Rows
  // without the per-invocation stats (single hit, or skill never re-scanned
  // by the script) just keep the unadorned headline — same as before.
  const measuredCostCell = num(measuredCost, 'measured-cost');
  const hasMultiRunStats =
    typeof rec?.invocations_per_use_count === 'number' &&
    rec.invocations_per_use_count >= 2 &&
    typeof rec?.tokens_per_use_mean === 'number' &&
    typeof rec?.tokens_per_use_min === 'number' &&
    typeof rec?.tokens_per_use_max === 'number' &&
    typeof rec?.tokens_per_use_stddev === 'number';
  const measuredCostCellWithSpread = hasMultiRunStats
    ? measuredCostCell.replace(
        /<\/td>$/,
        `<span class="num-cell-sub">median of ${rec.invocations_per_use_count} runs · mean ${fmtPrecise(rec.tokens_per_use_mean)} · range ${fmtPrecise(rec.tokens_per_use_min)}–${fmtPrecise(rec.tokens_per_use_max)} · σ ${fmtPrecise(rec.tokens_per_use_stddev)}</span></td>`,
      )
    : measuredCostCell;

  const skillCell = `<td class="skill"><span class="name">${linkedName}</span><span class="tagline">${tagline}</span></td>`;
  const statusCell = `<td class="status">${chip}${lastSeen}</td>`;

  return `<tr class="${cls}">${skillCell}${statusCell}${measuredCostCellWithSpread}${measuredSaveCell}${num(estimatedCost, 'est-cost')}${num(estimatedSave, 'est-save')}</tr>`;
}

function renderRepoSection(repo) {
  const measuredCount = repo.skills.filter((s) => isMeasured(s.receipt)).length;
  const rows = repo.skills.map((s) => renderSkillRow(repo.name, s)).join('\n');
  const url =
    repo.github_url && isSafeHref(repo.github_url)
      ? `<a href="${esc(repo.github_url)}">${esc(repo.github_url.replace(/^https?:\/\//, ''))}</a>`
      : '';
  const stats = `${repo.skills.length} skills · ${measuredCount} measured`;
  const statsCell = url ? `${stats} · ${url}` : stats;
  // Banner is a standalone div ABOVE the table — only renders once at the
  // top of each repo's section, never repeated when the table spans page
  // breaks. The column header row IS in <thead>, but CSS overrides its
  // default `display: table-header-group` to `table-row-group` so Chrome
  // does NOT repeat it on subsequent pages either. Both heading + columns
  // are one-shot — no duplicated banner-in-the-middle-of-rows confusion.
  return `<section>
  <div class="repo-heading"><span class="repo-name">${esc(repo.name)}</span><span class="repo-stats">${statsCell}</span></div>
  <table class="skills">
    <thead>
      <tr>
        <th scope="col">Skill</th>
        <th scope="col">Status</th>
        <th scope="col" class="num">Cost / use<br><span class="th-sub">measured</span></th>
        <th scope="col" class="num">Save / use<br><span class="th-sub">measured</span></th>
        <th scope="col" class="num">Cost / use<br><span class="th-sub">estimated</span></th>
        <th scope="col" class="num">Save / use<br><span class="th-sub">estimated</span></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

// ---------------------------------------------------------------------------
//  Multi-model calibration comparison page
// ---------------------------------------------------------------------------

// Walk every calibrated row + built-in reference and emit a side-by-side
// comparison of arm A / arm B / saved / %saved across the three measured
// models. Each row gets a Sonnet baseline (always present — primary
// calibration), plus an Opus column when alt_model_measurements.opus exists,
// plus a Haiku column ditto. Haiku placeholders (entries in the alt-model
// JSON with null tokens) deliberately don't add anything here — they live
// in the source JSON to make "Haiku not yet measured" explicit when the
// reader reads the files directly, but the rendered comparison table only
// shows rows we have data for.
//
// The 3-model picture exists so the reader can answer "would this skill
// still save tokens if I ran on Opus instead of Sonnet?" — measured, not
// guessed. Sample size is small (6 skills as of the multi-model PR) so we
// label the page accordingly.
const MODEL_ORDER = ['sonnet', 'opus', 'haiku'];

function renderModelComparisonPage(data) {
  // Collect every row that has at least one alt-model measurement. Skip rows
  // where the only data we have is the primary Sonnet — those are already
  // visible in the per-repo tables. The point of this page is the comparison.
  const rows = [];

  for (const r of data.repos) {
    for (const s of r.skills) {
      const alt = s.receipt?.alt_model_measurements;
      if (!alt) continue;
      const measured = {};
      // Sonnet primary — pulled from the receipt's calibration fields.
      if (
        s.receipt.tokens_saved_source === 'calibration' &&
        typeof s.receipt.calibration_arm_A === 'number' &&
        typeof s.receipt.calibration_arm_B === 'number'
      ) {
        measured.sonnet = {
          arm_A: s.receipt.calibration_arm_A,
          arm_B: s.receipt.calibration_arm_B,
          saved: s.receipt.tokens_saved_per_use,
          pct_saved:
            s.receipt.calibration_arm_A > 0
              ? Math.round(
                  (s.receipt.tokens_saved_per_use / s.receipt.calibration_arm_A) * 100,
                )
              : 0,
        };
      }
      for (const [m, v] of Object.entries(alt)) {
        if (v.arm_A_tokens == null || v.arm_B_tokens == null) continue;
        measured[m] = {
          arm_A: v.arm_A_tokens,
          arm_B: v.arm_B_tokens,
          saved: v.saved,
          pct_saved: v.pct_saved,
          procedure_deviation: v.procedure_deviation === true,
          procedure_deviation_note: v.procedure_deviation_note ?? null,
        };
      }
      if (Object.keys(measured).length < 2) continue;
      rows.push({ repo: r.name, name: s.name, measured });
    }
  }

  for (const br of data.built_in_references ?? []) {
    if (!br.alt_model_measurements) continue;
    const measured = {};
    if (
      typeof br.calibration_arm_A === 'number' &&
      typeof br.calibration_arm_B === 'number'
    ) {
      measured.sonnet = {
        arm_A: br.calibration_arm_A,
        arm_B: br.calibration_arm_B,
        saved: br.tokens_saved_per_use,
        pct_saved: br.calibration_pct_saved,
      };
    }
    for (const [m, v] of Object.entries(br.alt_model_measurements)) {
      if (v.arm_A_tokens == null || v.arm_B_tokens == null) continue;
      measured[m] = {
        arm_A: v.arm_A_tokens,
        arm_B: v.arm_B_tokens,
        saved: v.saved,
        pct_saved: v.pct_saved,
        procedure_deviation: v.procedure_deviation === true,
        procedure_deviation_note: v.procedure_deviation_note ?? null,
      };
    }
    if (Object.keys(measured).length < 2) continue;
    rows.push({ repo: 'Claude Code built-in', name: br.label ?? br.name, measured });
  }

  if (rows.length === 0) return '';

  // Order rows by maximum |pct_saved diff| across models — most dramatic
  // model-sensitivity first. A skill where Sonnet saves 63% and Opus saves
  // 39% (24-point delta) is more interesting than one where both save 51%.
  rows.sort((a, b) => {
    const spread = (row) => {
      const pcts = Object.values(row.measured).map((v) => v.pct_saved);
      return Math.max(...pcts) - Math.min(...pcts);
    };
    return spread(b) - spread(a);
  });

  const modelHeaderCells = MODEL_ORDER.map((m) => {
    const cap = m.charAt(0).toUpperCase() + m.slice(1);
    return `<th scope="col" class="num model-col model-${m}">${cap}</th>`;
  }).join('');

  // Collect deviation cells so the page footer can list which (skill, model)
  // pairs deviated from the SKILL.md procedure. Surfaces compromised
  // measurements without burying the per-cell numbers — a dagger marker next
  // to the pct, plus an enumerated footnote at the bottom of the page.
  const deviations = [];
  for (const row of rows) {
    for (const m of MODEL_ORDER) {
      const cell = row.measured[m];
      if (cell?.procedure_deviation) {
        deviations.push({
          row,
          model: m,
          note: cell.procedure_deviation_note,
        });
      }
    }
  }

  const renderCell = (m, cellData) => {
    if (!cellData) {
      return `<td class="num model-col model-${m} model-empty">—</td>`;
    }
    const negative = cellData.pct_saved < 0;
    const cls = ['num', 'model-col', `model-${m}`];
    if (negative) cls.push('cell-negative');
    if (cellData.procedure_deviation) cls.push('cell-deviation');
    const sign = negative ? '−' : '+';
    const dagger = cellData.procedure_deviation
      ? '<sup class="deviation-marker">†</sup>'
      : '';
    const savePct = `${sign}${Math.abs(cellData.pct_saved)}%${dagger}`;
    const saveAbs =
      cellData.saved < 0 ? `−${fmt(Math.abs(cellData.saved))}` : fmt(cellData.saved);
    return `<td class="${cls.join(' ')}">
      <span class="model-cell-pct">${savePct}</span>
      <span class="model-cell-detail">arm A ${fmt(cellData.arm_A)} → B ${fmt(cellData.arm_B)}</span>
      <span class="model-cell-detail">${saveAbs} saved/use</span>
    </td>`;
  };

  const tableRows = rows
    .map((row) => {
      const repoTag = `<span class="repo-tag">${esc(row.repo)}</span>`;
      const cells = MODEL_ORDER.map((m) => renderCell(m, row.measured[m])).join('');
      return `<tr>
        <td>${repoTag}<strong>${esc(row.name)}</strong></td>
        ${cells}
      </tr>`;
    })
    .join('\n');

  // Footnote: list which models are still placeholder so the reader knows
  // empty Haiku columns mean "not measured yet," not "no data possible."
  // Derived from the data rather than hardcoded so a future model that's
  // still pending shows up automatically.
  const placeholderModels = MODEL_ORDER.filter((m) =>
    rows.every((row) => !row.measured[m]),
  ).map((m) => m.charAt(0).toUpperCase() + m.slice(1));
  const placeholderNote =
    placeholderModels.length > 0
      ? ` <em>${placeholderModels.join(' / ')} columns are placeholders — the calibration sub-agents have not been dispatched on those models yet.</em>`
      : '';

  // Procedure-deviation footnote block. Each enumerated entry has the model,
  // the (repo, skill), and the deviation note verbatim from the source JSON.
  // Without this block the dagger marker is meaningless.
  const deviationBlock =
    deviations.length > 0
      ? `<div class="deviation-footnotes">
        <p class="note"><strong>† Procedure deviation</strong> — these ${deviations.length === 1 ? 'measurement is' : `${deviations.length} measurements are`} marked with † because the arm-B sub-agent did NOT actually execute the SKILL.md procedure (e.g. tool unavailable in the sandbox, classifier blocked a script). The cost/save number reflects whatever the sub-agent did INSTEAD, not what the skill would actually cost when run normally. Read these rows as "this measurement is compromised" — not as a finding about the skill.</p>
        <ol class="deviation-list">${deviations
          .map(
            (d) =>
              `<li><strong>${esc(d.model.charAt(0).toUpperCase() + d.model.slice(1))}</strong> · <span class="repo-tag">${esc(d.row.repo)}</span><code>${esc(d.row.name)}</code> — ${esc(d.note ?? 'No deviation note recorded.')}</li>`,
          )
          .join('')}</ol>
      </div>`
      : '';

  return `<section class="page-break model-comparison">
  <h2>Multi-model calibration — does the save rate hold across models?</h2>
  <p class="calib-intro">Same A/B methodology as the per-repo Sonnet calibrations, repeated with sub-agents dispatched as Opus and (later) Haiku. Each skill below was measured at least twice — once per model. The save rate is what changes: Opus is more efficient cold, so the recipe's value compresses; Sonnet rewards scaffolding skills more. Sorted by spread across models — biggest model-sensitivity first.${placeholderNote}</p>
  <table class="model-grid">
    <thead><tr><th scope="col">Skill</th>${modelHeaderCells}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="note">Each cell shows the A/B save rate (% of arm A tokens), the raw arm-A → arm-B tokens, and the absolute saved-per-use. Orange = the skill cost MORE on this model than the unstructured baseline. Cells marked † had a procedure deviation in arm B — see the footnote block below. Sample size N=1 per (skill, model) pair — trust direction and magnitude, not two-significant-digit precision. The cross-portfolio observation is that recipe value shrinks as model capability rises: skills that save 50%+ on Sonnet typically settle at 20-40% on Opus because the cold arm gets cheaper, not because the recipe arm gets more expensive.</p>
  ${deviationBlock}
</section>`;
}

// ---------------------------------------------------------------------------
//  Method page (last)
// ---------------------------------------------------------------------------

function renderMethodPage() {
  // Prose lives inline in this function rather than in a separate template
  // file because the voice rules in the redesign brief are strict and we
  // want every word to be reviewable in the same code review as the
  // layout that frames it. If this grows past ~400 lines, split it out.
  return `<section class="page-break method">
  <h1>Method, in plain language</h1>
  <p class="subhead">How the numbers in this document are produced, what they mean, and where I am still guessing.</p>

  <h2>Per single use — the only unit on this page</h2>
  <p>Every number in the document is per one invocation of the skill. There are no annual figures, no monthly figures, no "tokens per year" anywhere. The original document had those; they were models stacked on guesses about how often a skill gets used. This version drops them. If you want to know what a skill costs you over a year, multiply the per-use number by however many times you'll actually run it — the model wasn't going to be more honest than that anyway.</p>

  <h2>How “measured cost / use” is produced</h2>
  <p>Two sources, both real. <strong>Transcript measurement</strong>: every Claude Code session writes a JSON-Lines transcript to <code>~/.claude/projects/&lt;dir&gt;/&lt;sessionId&gt;.jsonl</code>, with each assistant message carrying an <code>attributionSkill</code> field when a skill is active. The <code>skill-usage</code> skill walks those files, groups by skill, sums <code>input_tokens + output_tokens + cache_creation_input_tokens</code> (cache reads excluded — those are paid upstream), dedupes by <code>requestId</code>, and reports per-use averages across whatever invocations landed in the 90-day window. That's "what happened in production."</p>
  <p><strong>A/B calibration arm-B</strong>: when a skill hasn't been invoked in production (no transcript data), an A/B run still spends real tokens — a Sonnet sub-agent followed the <code>SKILL.md</code> end-to-end on a representative task, with usage billed through the harness. Arm-B IS a real cost-per-use measurement, just from a controlled run instead of in-the-wild use. Rows in this state show the cost with a "tokens / use (A/B-measured)" sub-label. Rows with both transcript and A/B data prefer the transcript number — it's what happened, not what's reproducible.</p>

  <h2>What counts as one “use” — the invocation-boundary correction</h2>
  <p>The upstream <code>skill-usage</code> parser groups assistant messages by <code>(skill, sessionId)</code>. Every assistant message attributed to one skill inside one Claude Code session counts as part of <em>one</em> invocation. That's accurate for total tokens spent and last-invoked timestamps — but it <em>overstates</em> tokens-per-use whenever a single session contains multiple uses of the same skill. For <code>/review</code> that's a 23× distortion: 14 sessions contained 336 distinct <code>/review</code> calls, so the parser's session-grouped "avg 1.15M / use" was really "avg cost of 336 uses spread across 14 sessions, divided by 14 instead of by 336."</p>
  <p>This document corrects for that. <code>build-review-stats.mjs</code> walks the <code>parentUuid</code> → originating-user-message chain on every transcript-measured row and uses each user message's <code>promptId</code> as the invocation ID. Each distinct <code>(sessionId, promptId)</code> is one use. For <code>/review</code> that drops the per-use figure from 1.15M to ~17K (median); the 90-day total spend is unchanged, only its decomposition into <em>per use × uses</em>. For other heavily-iterated skills the correction is much smaller (most have one or two sessions in the window, so session-grouped ≈ invocation-grouped), but every row with N≥2 invocations gets the same accounting so the comparison stays apples-to-apples.</p>

  <h2>Median, not mean, on the cost-per-use headline</h2>
  <p>Wherever a row's cost-per-use is the average of multiple invocations, the headline number is the <strong>median</strong> — the cost distribution is heavily right-skewed (one or two large invocations pull the mean well above what one typical use costs), so the median is the honest "what does one use of this skill cost" figure. The mean, range, and σ ride in the sub-cell as honest spread information; if the σ is comparable to the median, treat the headline as a soft anchor and look at the spread to understand the variance. Single-invocation rows (A/B-only or one transcript hit) don't have a distribution, so they keep their unadorned headline.</p>

  <h2>How “measured save / use” is produced</h2>
  <p>One source: a calibration A/B test. Two Sonnet sub-agents solve the same task in fresh sandboxed worktrees — arm A cold (no <code>SKILL.md</code> access), arm B following the skill. Save / use is arm-A tokens minus arm-B tokens for that one run. <strong>N = 1 per skill, single data point</strong>. A re-run would produce different absolute numbers for both arms; trust direction and rough magnitude, not two-significant-digit precision.</p>
  <p>Some skills show negative save / use in orange. Those are real findings: the skill arm spent MORE tokens than the unstructured arm, because the skill encodes rigor (e.g. a full-CRUD lifecycle or a multi-phase audit) that the unstructured arm skipped. The skill's value is completeness, not token compression. The arm-A / arm-B numbers are preserved on each calibrated row's receipt for any downstream consumer that wants to see both sides.</p>
  <p><strong>Exception: <code>/review</code>.</strong> N=11 A/Bs, bucketed by PR size, weighted by production frequency. The original N=1 measurement on a 5-file PR (63% saved) was the upper end of a sharp size gradient: re-running on real production PRs of 174–3977 lines reveals the recipe saves most on small PRs and actively <em>costs more</em> on the largest ones. Bucket medians: small (0–199 lines) <strong>44%</strong>, medium (200–799) <strong>26%</strong>, large (800–2499) <strong>15%</strong>, extra-large (2500+) <strong>−10%</strong>. The headline 35% (17K saved per use) is each bucket's median weighted by its share of production /review invocations (63% small, 26% medium, 7% large, 3% extra-large). The per-bucket and per-PR data live on the row's <code>calibration_ab_buckets</code> + <code>calibration_ab_runs</code> arrays for downstream consumers. Other skills stay at N=1 until they accumulate enough production usage to warrant a multi-PR pass.</p>
  <p><strong>Different regimes.</strong> Cost on the <code>/review</code> row is from production transcripts (real invocations summarised over the 90-day window). Save is from A/B calibrations (synthetic cold-vs-recipe pairs on representative PRs). They measure related but distinct things: cost is what one production use spends; save is what one matched A/B pair would save. A reader must not divide save by cost to get a "%" — the % shown is anchored to the A/B baseline, not the production cost. Same caveat applies to every transcript-measured row in the document; the row-level subline ("vs &lt;armA&gt; A/B baseline · pct") makes the anchoring explicit on rows where the regime gap is large.</p>

  <h2>Regime gap: when measured cost and measured save come from different scales</h2>
  <p>Several rows pair a transcript-measured cost (the average of N real production invocations) with an A/B-measured save (a single calibration run on a deliberately-small representative task). When the production runs are <em>much larger</em> than the A/B task — and they often are, by 5–15× — the cost and save sit in different regimes. Reading the row as "save / cost = recipe efficiency" gives the wrong answer.</p>
  <p>Concrete: an early version of this document showed <code>/review</code> as <strong>1.15M tokens / use measured cost</strong> next to <strong>~24K tokens / use measured save</strong>. The cost was a session-grouped artifact (14 sessions, 336 actual invocations) and the save was a single small-PR A/B (~60K baseline). Doing 24K ÷ 1.15M would read as a 2% save rate; the actual finding from the A/B was ~39%. Both numbers were real, but they sat in different regimes — the cost was production-scale, the save was calibration-scale. The current <code>/review</code> row corrects the cost via per-invocation accounting (~17K median, close to the calibration scale) so the math anchors directly. The same trap still shows up on roughly a dozen other transcript-measured rows where the production-scale cost runs 2× or more above its A/B baseline — common offenders include <code>mikko-help</code>, <code>session-cost</code>, <code>equipment</code>, <code>audit</code>, <code>release-cut</code>, and <code>skill-registry</code>. Every row that hits the threshold gets the same labelling treatment described next.</p>
  <p>When a row hits this regime gap (transcript cost &gt; 2× the A/B arm-A baseline) the measured-save cell prints a subline making the baseline explicit: <em>vs &lt;armA&gt; A/B baseline · &lt;pct&gt;%</em>. Math on the row now works: <code>save ÷ baseline = pct</code> instead of <code>save ÷ visible-cost = misleading</code>. This isn't a correction — both numbers were always real. It's a labelling fix so a reader doesn't combine them wrong.</p>
  <p>The gap itself is the finding: <strong>the A/B calibration task isn't representative of what production runs of these skills actually look like</strong>. The honest read is that recipe value scales with task complexity, and the A/B numbers underestimate the absolute save at production scale (the same recipe collapsing the same amount of structure, applied to a 1M-token task instead of a 70K-token task, would save proportionally more). The fix is either re-running calibrations on representative-sized targets, or treating the A/B save as a lower bound. I haven't done the former; the document treats the A/B save as what it is.</p>

  <h2>How “estimated cost / use” is produced</h2>
  <p class="pull warn">I made up the number. I imagined what running the skill should cost in tokens and wrote that down. There's no math behind these. They are guesses by the person who built the skill, written down before any measurement existed.</p>
  <p>The estimates stay in the document so the picture covers every skill, not just the ones I've measured. Every measured estimate I had has turned out to be off, usually low by 5× to 100× — apply the same skepticism to the rows that haven't been measured yet. If anything, the un-measured estimates are likely to be <em>more</em> wrong: I measured the ones I felt most confident about first.</p>

  <h2>How “estimated save / use” is produced</h2>
  <p>3× heuristic on the estimated cost: <em>saved ≈ 2× cost</em>. The model says "doing this without the skill would cost about 3× what the skill costs," so the saved-per-use is 2× the cost-per-use. The 3× is a handful-of-side-by-side-runs guess; the May-2026 Spacepotatis calibration showed it's overstated by roughly 3× at the portfolio level (measured savings averaged ~22% of arm-A cost, vs the heuristic's ~67%). Treat estimated savings as a possibly-too-optimistic upper bound.</p>
  <p>Cost is on both sides of the underlying subtraction, so the estimated save figure is more sensitive to bad cost estimates than the estimated cost is. An italic estimated-save stacked on top of an italic estimated-cost is a model on top of a guess — least trustworthy cell on the page. A green measured-save on top of a green measured-cost is the most trustworthy. The visual treatment matches that hierarchy.</p>

  <h2>What this document does NOT claim</h2>
  <ul>
    <li>No production cost numbers. This is development-time tooling on my own machine.</li>
    <li>No comparison to other engineers' setups. I only have transcripts for one engineer.</li>
    <li>No per-feature ROI claim. This is per-skill cost, not per-feature value.</li>
    <li>No assertion that any of this scales linearly to a team. It might. I have not measured.</li>
    <li>No claim that the modeled savings would survive an actual A/B test against well-prompted unstructured chats. They might; I haven't tested.</li>
  </ul>

  <h2>Reproducibility</h2>
  <p>From inside this repo (<code>mikkonumminen.dev/</code>) on a machine with Claude Code installed:</p>
  <ol>
    <li><code>/mikko-skill-usage</code> — writes <code>.claude/agent-verdicts/SKILL-USAGE-LATEST.json</code> from local transcripts.</li>
    <li><code>/skill-localUpdate</code> (formerly <code>/skill-pdf</code>) — re-walks the portfolio inventory, applies the measurement overlay, renders this PDF.</li>
  </ol>
  <p>The data the renderer reads is committed to the repo at <code>public/data/skills-registry.json</code>. If you want to inspect what's behind a number on this page, that file is the source of truth. The dated history lives in <code>.claude/agent-verdicts/SKILL-REGISTRY-*.json</code>.</p>
  <p>The <em>last &lt;date&gt;</em> marker on a measured row is the timestamp of the most recent Claude Code transcript that invoked that skill. The transcript itself stays on my machine because it contains code and context from private repos. If you want to verify the measurement methodology rather than the measurement, the parser source is at <code>~/.claude/skills/mikko-skill-usage/SKILL.md</code> — it is a JSONL parser, not a network call to anything.</p>
</section>`;
}

// ---------------------------------------------------------------------------
//  Build pass: walk the data once, collect everything the renderer needs.
// ---------------------------------------------------------------------------

function buildAggregates(data) {
  const perRepo = [];
  const calibrationRows = [];
  let customMeasured90d = 0;
  let portfolioSavedTotal = 0;
  let portfolioSavedMeasured = 0;
  let portfolioSavedCalibrated = 0; // savings from rows with A/B-measured
  // saved-per-use (calibration overlay)
  let portfolioSavedModeled = 0; // savings from rows still using the
  // 3× heuristic on cost-per-use

  for (const r of data.repos) {
    let measuredCount = 0;
    let calibratedCount = 0;
    let measuredTokensWindow = 0;
    let annualSaved = 0;
    let annualSavedMeasured = 0;
    let annualSavedCalibrated = 0;
    // Per-portfolio A/B aggregate — sum arm-A and arm-B token counts across
    // every calibrated row in this repo. The hero uses these to render
    // per-portfolio save-rate bars (saved = sum_armA - sum_armB; pct = saved
    // / sum_armA). Independent of annual projections because A/B tokens are
    // per-use measurements.
    let calibArmATotal = 0;
    let calibArmBTotal = 0;
    for (const s of r.skills) {
      const rec = s.receipt;
      if (!rec) continue;
      const saved = tokensSavedAnnual(rec);
      annualSaved += saved;
      if (rec.tokens_saved_source === 'calibration') {
        calibratedCount += 1;
        annualSavedCalibrated += saved;
        portfolioSavedCalibrated += saved;
        if (typeof rec.calibration_arm_A === 'number') {
          calibArmATotal += rec.calibration_arm_A;
        }
        if (typeof rec.calibration_arm_B === 'number') {
          calibArmBTotal += rec.calibration_arm_B;
        }
      } else if (saved !== 0) {
        portfolioSavedModeled += saved;
      }
      if (isMeasured(rec)) {
        measuredCount += 1;
        const w =
          rec.total_tokens_in_window ??
          (rec.tokens_per_use != null && rec.invocations_in_window != null
            ? rec.tokens_per_use * rec.invocations_in_window
            : 0);
        measuredTokensWindow += w;
        customMeasured90d += w;
        annualSavedMeasured += saved;
        portfolioSavedMeasured += saved;

        const delta = calibrationDelta(
          rec.tokens_per_use,
          rec.prior_estimate?.tokens_per_use,
        );
        if (delta) {
          calibrationRows.push({
            repo: r.name,
            name: s.name,
            priorTpu: rec.prior_estimate.tokens_per_use,
            observedTpu: rec.tokens_per_use,
            delta,
          });
        }
      }
      portfolioSavedTotal += saved;
    }
    const calibSavedTotal = calibArmATotal - calibArmBTotal;
    const calibPctSaved =
      calibArmATotal > 0 ? Math.round((calibSavedTotal / calibArmATotal) * 100) : 0;
    perRepo.push({
      name: r.name,
      totalSkills: r.skills.length,
      measuredCount,
      calibratedCount,
      measuredTokensWindow,
      annualSaved,
      annualSavedCalibrated,
      annualSavedMeasuredShare: annualSaved > 0 ? annualSavedMeasured / annualSaved : 0,
      calibArmATotal,
      calibArmBTotal,
      calibSavedTotal,
      calibPctSaved,
    });
  }

  return {
    perRepo,
    calibrationRows,
    customMeasured90d,
    portfolioSavedTotal,
    portfolioSavedMeasured,
    portfolioSavedCalibrated,
    portfolioSavedModeled,
  };
}

// ---------------------------------------------------------------------------
//  Assemble the full HTML document
// ---------------------------------------------------------------------------

function buildHtml(data, css) {
  const generated = data.generated_at.slice(0, 10);
  const agg = buildAggregates(data);

  const measuredShare =
    agg.portfolioSavedTotal > 0
      ? Math.round((agg.portfolioSavedMeasured / agg.portfolioSavedTotal) * 100)
      : 0;

  const repoSections = data.repos.map(renderRepoSection).join('\n');
  const calibratedCount = agg.perRepo.reduce((n, r) => n + (r.calibratedCount || 0), 0);
  const totalSkillsWithReceipts = data.repos.reduce(
    (n, r) => n + r.skills.filter((s) => s.receipt).length,
    0,
  );
  const hero = renderHero(agg.perRepo, totalSkillsWithReceipts, calibratedCount);
  const summary = renderSummaryTable(agg.perRepo);
  const calibrationPage = renderCalibrationPage(agg.calibrationRows);
  const modelComparisonPage = renderModelComparisonPage(data);
  const methodPage = renderMethodPage();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Skill registry — ${esc(generated)}</title>
<style>${css}</style>
</head>
<body>

<header>
  <h1>Skill registry — ${esc(generated)}</h1>
  <p class="lede">A register of every custom skill I've written for Claude Code (Anthropic's coding assistant CLI), and whether it has measured data behind its claims yet. A "skill" here is a reusable slash command — a named recipe Claude Code runs when I type <code>/audit</code> or similar. ${data.repos.length} repos, ${data.totals.skills} skills, ${calibratedCount} of them A/B-tested for token savings so far.</p>
</header>

${hero}

<p class="lede">Per-skill, four numbers per row: <strong>measured cost / use</strong> (real tokens billed when a skill ran), <strong>measured save / use</strong> (A/B test: arm A minus arm B), <strong>estimated cost / use</strong> (the author's pre-measurement guess), and <strong>estimated save / use</strong> (the 3× heuristic applied to the estimated cost). Green = measured. Italic gray = estimated. Orange measured-save means the skill cost MORE in the A/B than the unstructured baseline — real findings, not bugs. Cost-or-save dashes (<em>—</em>) mean no data exists for that cell yet.</p>

<h2>Per-repo summary</h2>
${summary}

${renderSaveUseLegend()}

${renderBuiltInsSection(data.built_in_references ?? [])}

${calibrationPage}

${modelComparisonPage}

<section class="page-break repo-page">
  <h1>Per-repo skill tables</h1>
  <p class="lede">One row per skill. Measured rows have a green wash; estimated rows are white. Four data columns per row, in pairs: <strong>Cost / use</strong> measured + estimated, then <strong>Save / use</strong> measured + estimated. Green numbers come from real runs (transcript or A/B). Italic gray numbers are author estimates. Orange numbers are real A/B measurements showing the skill cost MORE per use than the unstructured baseline. Dashes mean no data exists for that cell yet. Every figure is per single invocation — no annual projections anywhere in this document.</p>
  ${renderSaveUseLegend()}
  ${repoSections}
</section>

${methodPage}

<footer>
  Generated ${esc(fmtGeneratedAt(data.generated_at))}.
  Custom-skill measured cost in the 90-day window: ${fmt(agg.customMeasured90d)} tokens.
  Modeled savings ${measuredShare}% measurement-backed, ${100 - measuredShare}% estimate-backed.
  Built-in /review reference excluded from every total above.
</footer>

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
  // hosted-build render would drift from the committed PDF the next time
  // a human refreshes locally. Always defer to the committed artifact on
  // hosted builds so the public-facing PDF only changes when a real
  // refresh lands in a commit.
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
  if (!fs.existsSync(CSS_FILE)) {
    console.error(`stylesheet missing: ${CSS_FILE}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const css = fs.readFileSync(CSS_FILE, 'utf8');
  const html = buildHtml(data, css);
  // Persist a stable HTML copy alongside the PDF so a developer can open
  // the same content in a browser. Not committed (the path is under
  // .gitignore'd .claude/tmp/), exists purely to support the "developer
  // can open the HTML in a browser" requirement from the redesign brief.
  const previewDir = path.join(ROOT, '.claude', 'tmp');
  fs.mkdirSync(previewDir, { recursive: true });
  const previewHtml = path.join(previewDir, 'skills-pdf-preview.html');
  fs.writeFileSync(previewHtml, html);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-pdf-'));
  const tmpHtml = path.join(tmpDir, 'skills-registry.html');
  fs.writeFileSync(tmpHtml, html);
  try {
    printHtmlToPdf({ htmlPath: tmpHtml, pdfPath: OUT });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`wrote ${OUT}`);
  console.log(`preview HTML: ${previewHtml}`);
}

main();
