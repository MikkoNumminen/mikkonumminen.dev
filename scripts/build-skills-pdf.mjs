#!/usr/bin/env node
// Render public/data/skills-registry.json to public/skills-registry.pdf using
// the locally-installed Chrome's headless --print-to-pdf. Content-aware
// wrapper for the skill-registry shape; for generic markdown / HTML use, see
// the `md-to-pdf` skill at `.claude/skills/md-to-pdf/SKILL.md` and the
// `scripts/build-pdf.mjs` CLI.
//
// Document layout after the 2026-05-27 restructure (target: ~8–10 pages):
//
//   Page 1   Hero — title, one-line "what", portfolio save-rate bars,
//            one-line stance. Detailed legend pushed off page 1.
//   Page 2   "How to read this" box + cross-model insight callout +
//            start of the single spine table.
//   ~2–6     One spine table grouped by repo. Columns:
//            Skill | Status | Cost/use | Est. cost | Save: Sonnet |
//            Save: Opus | Save: Haiku. Replaces the prior per-repo
//            tables AND the standalone multi-model section.
//   ~7       Calibration honesty — log-scale dot-strip chart (SVG)
//            showing measured÷guess per skill.
//   ~8       Findings — seven prose paragraphs distilling the
//            observations of record, plus the "what this document does
//            NOT claim" bookend.
//   last     Appendix — slim methodology covering how cost and save
//            are produced, the invocation-boundary correction, the
//            median-headline convention, and the regime-gap caveat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChrome, printHtmlToPdf } from './lib/chrome-pdf.mjs';
import { inputFingerprint, pdfContentEquals, shouldRender } from './lib/pdf-content.mjs';
import { escapeHtml as esc, isSafeHref } from './lib/escape.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'data', 'skills-registry.json');
const OUT = path.join(ROOT, 'public', 'skills-registry.pdf');
// Committed on purpose: a fresh clone or new worktree with no stored
// fingerprint would re-render and put a divergent PDF back in the tree.
const FINGERPRINT_FILE = path.join(ROOT, 'scripts', 'skills-pdf.input.sha256');
const CSS_FILE = path.join(ROOT, 'scripts', 'lib', 'skills-pdf.css');

// ---------------------------------------------------------------------------
//  Formatting helpers
// ---------------------------------------------------------------------------

const fmt = (n) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
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
  // Absolute YYYY-MM-DD, never relative — a "today" tag would be wrong the
  // moment someone reads the PDF on a different day.
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
//      klass: 'off' | 'ok' | '', raw: <ratio> }
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
function isMeasured(receipt) {
  return (
    receipt?.source === 'transcript-measurement' || receipt?.source === 'calibration'
  );
}

// ---------------------------------------------------------------------------
//  Hero block (page 1) — per-portfolio A/B-measured save rates
// ---------------------------------------------------------------------------

function renderHero(perRepo) {
  const reposWithCalib = perRepo.filter((r) => r.calibArmATotal > 0);
  if (reposWithCalib.length === 0) return '';
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
  const totalCalibrated = reposWithCalib.reduce((n, r) => n + r.calibratedCount, 0);
  return `<section class="hero avoid-break">
  <h2>A/B-measured save rates by portfolio</h2>
  ${bars}
  <p class="hero-caption"><strong>Aggregate: ${aggSignedPct}% (${aggSignedSaved} tokens across ${totalCalibrated} skills).</strong> Save rate = (arm A − arm B) / arm A, summed per portfolio. Negative means the skill costs MORE per use than going cold — those skills encode rigor (audit thoroughness, protocol discipline, spec depth), not scout-savings.</p>
</section>`;
}

// ---------------------------------------------------------------------------
//  Stance line (page 1)
// ---------------------------------------------------------------------------

function renderStanceLine() {
  return `<p class="stance">This document separates measured numbers from estimated ones, shows the cases where a skill cost MORE than no skill at all, and claims no more than the data supports.</p>`;
}

// ---------------------------------------------------------------------------
//  "How to read this" box — short, plain-language framing for the spine
//  table that follows. Replaces the prior multi-paragraph lede and the
//  standalone save-use legend.
// ---------------------------------------------------------------------------

function renderHowToReadBox() {
  return `<aside class="howtoread avoid-break">
  <h3>How to read this</h3>
  <ul>
    <li><strong>Per use, not annual.</strong> Every number on the row is per one invocation of the skill. Multiply by uses-per-year yourself if you want to extrapolate.</li>
    <li><strong>Measured (green) vs estimated (italic gray).</strong> Green numbers come from real runs — production transcripts for cost, A/B calibrations for save. Italic gray numbers are the author's pre-measurement guesses.</li>
    <li><strong>Cost and save are different regimes.</strong> Cost is from production transcripts; save is from controlled A/B calibrations on representative tasks. They often live at different scales. Do not divide save by cost to get an "efficiency %" — the percentages shown are anchored to the A/B baseline, not the production cost.</li>
    <li><strong>N=1 for most A/B saves.</strong> One sub-agent ran the task with the skill, one without. Trust direction and rough magnitude, not two-significant-digit precision. The /review row is the exception — N=11 across four PR-size buckets.</li>
    <li><strong>Negative save (orange) is a real finding</strong>, not a bug. The skill spent MORE tokens than the unstructured baseline because it encodes work the cold arm skipped (audit thoroughness, protocol discipline). The value is completeness, not compression.</li>
    <li><strong>Estimated save column is intentionally absent.</strong> It would mechanically be 2× estimated cost (the 3× heuristic this project started with); zero independent information. The estimated cost column carries the actual author guesses.</li>
  </ul>
</aside>`;
}

// ---------------------------------------------------------------------------
//  Cross-model insight callout — one paragraph distilling the multi-model
//  comparison the spine table now carries column-by-column.
// ---------------------------------------------------------------------------

function renderCrossModelCallout(data) {
  // Count skills with multiple model measurements so the callout's framing
  // is data-anchored, not editorial.
  const multiModel = [];
  for (const r of data.repos) {
    for (const s of r.skills) {
      const alt = s.receipt?.alt_model_measurements;
      if (!alt) continue;
      const measured = [];
      if (s.receipt.tokens_saved_source === 'calibration') measured.push('sonnet');
      for (const [m, v] of Object.entries(alt)) {
        if (v?.arm_A_tokens != null && v?.arm_B_tokens != null) measured.push(m);
      }
      if (measured.length >= 2) multiModel.push({ repo: r.name, name: s.name });
    }
  }
  for (const br of data.built_in_references ?? []) {
    if (!br.alt_model_measurements) continue;
    const measured = [];
    if (typeof br.calibration_arm_A === 'number') measured.push('sonnet');
    for (const [m, v] of Object.entries(br.alt_model_measurements)) {
      if (v?.arm_A_tokens != null && v?.arm_B_tokens != null) measured.push(m);
    }
    if (measured.length >= 2)
      multiModel.push({ repo: 'built-in', name: br.label ?? br.name });
  }
  const n = multiModel.length;
  if (n === 0) return '';
  return `<aside class="callout avoid-break">
  <p><strong>Across-model pattern.</strong> ${n} skills were A/B-tested on more than one model. The save rate is what changes: skills that save 50%+ on Sonnet typically settle at 20–40% on Opus. The skill arm does not get more expensive — the cold arm gets cheaper, because a stronger model needs less scaffolding to do the task well. A skill's measured value is not a fixed property; it is relative to the model underneath it. See the per-model save columns below.</p>
</aside>`;
}

// ---------------------------------------------------------------------------
//  Spine table — one row per skill, grouped by repo. Replaces the prior
//  per-repo tables AND the standalone multi-model comparison section.
// ---------------------------------------------------------------------------

const MODEL_ORDER = ['sonnet', 'opus', 'haiku'];
const MODEL_LABEL = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };

function costCellHtml(receipt) {
  if (!isMeasured(receipt) || typeof receipt.tokens_per_use !== 'number') {
    return `<td class="cost-cell empty">—</td>`;
  }
  const cost = receipt.tokens_per_use;
  const model = receipt.cost_model;
  const n = receipt.invocations_in_window;
  const isMedian =
    receipt.source === 'transcript-measurement' &&
    typeof n === 'number' &&
    n >= 2 &&
    typeof receipt.tokens_per_use_mean === 'number';
  // Meta line: "<Model> production · median of N" for transcript rows with
  // distribution; "<Model> production" for single-hit transcript rows;
  // "production · model unknown" when the transcripts predate the
  // message.model field; "A/B arm-B" for calibration-only rows.
  const metaParts = [];
  if (model) {
    metaParts.push(`${esc(MODEL_LABEL[model] ?? model)} production`);
  } else if (receipt.source === 'transcript-measurement') {
    metaParts.push('production · model unknown');
  } else {
    metaParts.push('A/B arm-B');
  }
  if (isMedian) metaParts.push(`median of ${n}`);
  // Spread suffix: for multi-run rows, show mean + range + σ so the
  // median headline sits alongside the spread it summarises. Rendering
  // side of finding-6 ("median and mean tell different stories"); the
  // actual stats are computed by build-review-stats.mjs and live on
  // the receipt.
  let spread = '';
  if (isMedian) {
    const mean = receipt.tokens_per_use_mean;
    const lo = receipt.tokens_per_use_min;
    const hi = receipt.tokens_per_use_max;
    const sd = receipt.tokens_per_use_stddev;
    const parts = [];
    if (typeof mean === 'number') parts.push(`mean ${fmt(mean)}`);
    if (typeof lo === 'number' && typeof hi === 'number') {
      parts.push(`range ${fmt(lo)}–${fmt(hi)}`);
    }
    if (typeof sd === 'number') parts.push(`σ ${fmt(sd)}`);
    if (parts.length > 0) spread = ` — ${parts.join(', ')}`;
  }
  return `<td class="cost-cell"><span class="num">${fmt(cost)}</span><span class="unit">tokens / use</span><span class="meta">${metaParts.join(' · ')}${spread}</span></td>`;
}

function estCostCellHtml(receipt) {
  const measured = isMeasured(receipt);
  const value =
    receipt?.prior_estimate?.tokens_per_use ??
    (measured ? null : receipt?.tokens_per_use);
  if (typeof value !== 'number') return `<td class="est-cost-cell empty">—</td>`;
  return `<td class="est-cost-cell"><span class="num">${fmt(value)}</span><span class="unit">tokens / use</span></td>`;
}

function saveCellHtml(receipt, model) {
  if (!receipt) return `<td class="save-cell empty">—</td>`;
  let pct = null;
  let abs = null;
  let dagger = false;
  // The primary calibration's top-level fields (`calibration_arm_A/B` +
  // `tokens_saved_per_use`) belong to whichever model the calibration was
  // actually run on. `apply-measurement-overlay.mjs` writes that as
  // `calibration_model`; legacy receipts that predate the propagation
  // default to 'sonnet' (the historical convention — the non-suffixed
  // SKILL-CALIBRATION-*-LATEST.json source files declare model: sonnet).
  // /review's `calibration_pct_saved` is the pre-computed bucket-aligned
  // headline; everything else recomputes pct fresh from saved ÷ arm_A so
  // the row's displayed numbers reconcile.
  const primaryModel = receipt.calibration_model ?? 'sonnet';
  if (
    model === primaryModel &&
    receipt.tokens_saved_source === 'calibration' &&
    typeof receipt.tokens_saved_per_use === 'number' &&
    typeof receipt.calibration_arm_A === 'number' &&
    receipt.calibration_arm_A > 0
  ) {
    abs = receipt.tokens_saved_per_use;
    pct =
      typeof receipt.calibration_pct_saved === 'number'
        ? receipt.calibration_pct_saved
        : Math.round((abs / receipt.calibration_arm_A) * 100);
  }
  if (pct == null) {
    // Fall back to alt-model measurements — used for any column whose model
    // doesn't match the primary calibration (so today: Opus + Haiku for the
    // 33 portfolio rows; in the future, any column when calibration_model
    // points elsewhere).
    const alt = receipt.alt_model_measurements?.[model];
    if (alt && typeof alt.pct_saved === 'number') {
      pct = alt.pct_saved;
      abs = typeof alt.saved === 'number' ? alt.saved : null;
      dagger = alt.procedure_deviation === true;
    }
  }
  if (pct == null) return `<td class="save-cell empty">—</td>`;
  const negative = pct < 0;
  const cls = ['save-cell'];
  if (negative) cls.push('cell-negative');
  if (dagger) cls.push('cell-deviation');
  const sign = negative ? '−' : '+';
  const pctText = `${sign}${Math.abs(pct)}%`;
  let absText = '';
  if (typeof abs === 'number') {
    absText = abs < 0 ? `−${fmt(Math.abs(abs))}` : `+${fmt(abs)}`;
  }
  const dagHtml = dagger
    ? '<sup class="deviation-marker" title="procedure deviation">†</sup>'
    : '';
  return `<td class="${cls.join(' ')}"><span class="pct">${pctText}${dagHtml}</span>${absText ? `<span class="abs">${absText}</span>` : ''}</td>`;
}

function spineRowHtml({
  name,
  description,
  receipt,
  path: srcPath,
  isRedirect,
  isBuiltIn,
}) {
  const measured = isMeasured(receipt);
  const cls = isRedirect ? 'redirect' : measured ? 'measured' : 'estimate';
  const chip = isRedirect
    ? '<span class="chip chip-redirect">redirect</span>'
    : measured
      ? '<span class="chip chip-measured">measured</span>'
      : '<span class="chip chip-estimate">estimate</span>';
  const lastSeen =
    measured && receipt?.last_invoked
      ? `<span class="last-seen">last ${esc(lastUsedDate(receipt.last_invoked))}</span>`
      : '';
  const tagline = esc(firstSentence(description ?? ''));
  const href = srcPath ?? receipt?.path;
  const linkedName =
    href && isSafeHref(href) ? `<a href="${esc(href)}">${esc(name)}</a>` : esc(name);
  const builtinTag = isBuiltIn
    ? '<span class="builtin-tag">Claude Code built-in (reference)</span>'
    : '';
  const skillCell = `<td class="skill-cell"><span class="name">${linkedName}</span>${builtinTag}<span class="tagline">${tagline}</span></td>`;
  const statusCell = `<td class="status-cell">${chip}${lastSeen}</td>`;
  const cost = costCellHtml(receipt);
  const estCost = estCostCellHtml(receipt);
  const saves = MODEL_ORDER.map((m) => saveCellHtml(receipt, m)).join('');
  return `<tr class="${cls}">${skillCell}${statusCell}${cost}${estCost}${saves}</tr>`;
}

// Built-in records carry the same logical fields as per-skill receipts but
// use a few different field names (`tokens_per_use_avg` instead of
// `tokens_per_use`) and lack the `source` tag the per-skill receipts use to
// distinguish transcript vs A/B. Normalize once so the cell helpers can
// treat them like any other measured receipt without a special path. Only
// tag `source` when there's an actual cost number behind it — otherwise an
// empty-data built-in would render a misleading "measured" chip above an
// empty cost cell.
function normalizeBuiltinReceipt(br) {
  const cost = br.tokens_per_use ?? br.tokens_per_use_avg;
  const normalized = { ...br, tokens_per_use: cost };
  if (typeof cost === 'number') normalized.source = 'transcript-measurement';
  return normalized;
}

function renderSpineTable(data) {
  // Each project group renders as TWO <tbody> elements: a "stick" tbody
  // holding the group-heading row plus its first skill row (with
  // break-inside: avoid in CSS so the pair is treated as one unbreakable
  // unit), and a "rest" tbody holding the remaining skill rows. This is
  // the only reliable way in Chromium's print pipeline to guarantee a
  // group label never lands alone at the bottom of a page — break-after
  // on a bare <tr> is honored inconsistently.
  const builtins = data.built_in_references ?? [];
  const builtinBodies = (() => {
    if (builtins.length === 0) return '';
    const heading = `<tr class="group-heading group-builtin"><td colspan="7"><strong>Claude Code built-in (reference)</strong> · not part of the custom portfolio</td></tr>`;
    const rows = builtins.map((br) =>
      spineRowHtml({
        name: br.label ?? br.name,
        description: br.description,
        receipt: normalizeBuiltinReceipt(br),
        path: br.audit_doc_path,
        isBuiltIn: true,
      }),
    );
    const [first, ...rest] = rows;
    const stick = `<tbody class="group-stick">${heading}${first ?? ''}</tbody>`;
    const tail = rest.length > 0 ? `<tbody>${rest.join('\n')}</tbody>` : '';
    return stick + tail;
  })();

  const repoBodies = data.repos
    .map((repo) => {
      const url =
        repo.github_url && isSafeHref(repo.github_url)
          ? ` · <a href="${esc(repo.github_url)}">${esc(repo.github_url.replace(/^https?:\/\//, ''))}</a>`
          : '';
      const heading = `<tr class="group-heading"><td colspan="7"><strong>${esc(repo.name)}</strong>${url} · ${repo.skills.length} skill${repo.skills.length === 1 ? '' : 's'}</td></tr>`;
      const rows = repo.skills.map((s) =>
        spineRowHtml({
          name: s.name,
          description: s.description,
          receipt: s.receipt,
          isRedirect: !!s.redirect,
        }),
      );
      const [first, ...rest] = rows;
      const stick = `<tbody class="group-stick">${heading}${first ?? ''}</tbody>`;
      const tail = rest.length > 0 ? `<tbody>${rest.join('\n')}</tbody>` : '';
      return stick + tail;
    })
    .join('\n');

  return `<section class="spine-section">
  <h2>Per-skill registry</h2>
  <p class="caption">Every figure per single invocation. <strong>Cost / use</strong> is from production transcripts (model tagged on each row); <strong>Est. cost</strong> is the author's pre-measurement guess; <strong>Save: X</strong> is an A/B calibration on model X (arm A cold − arm B with-skill). Dash means no data exists for that cell yet. A † on a save cell flags a procedure deviation — see the appendix.</p>
  <table class="spine">
    <thead>
      <tr>
        <th>Skill</th>
        <th>Status</th>
        <th class="num">Cost / use</th>
        <th class="num">Est. cost</th>
        <th class="num">Save: Sonnet</th>
        <th class="num">Save: Opus</th>
        <th class="num">Save: Haiku</th>
      </tr>
    </thead>
    ${builtinBodies}
    ${repoBodies}
  </table>
</section>`;
}

// ---------------------------------------------------------------------------
//  Calibration honesty chart — one dot per skill on a log-scale "how wrong"
//  axis. Replaces the prior multi-page guess-vs-measured table.
// ---------------------------------------------------------------------------

function renderCalibrationChart(rows) {
  if (!rows || rows.length === 0) {
    return `<section class="page-break calibration-chart-section">
  <h2>Calibration honesty</h2>
  <p>No measured rows have a prior editorial estimate to compare against yet.</p>
</section>`;
  }

  // Sort by absolute log-ratio descending so the worst misses are first;
  // we use the first few for annotation.
  const sorted = [...rows].sort(
    (a, b) => Math.abs(Math.log(b.delta.raw)) - Math.abs(Math.log(a.delta.raw)),
  );
  const offCount = sorted.filter((r) => r.delta.klass === 'off').length;
  const underCount = sorted.filter((r) => r.delta.direction === 'under').length;
  const closeCount = sorted.filter((r) => r.delta.direction === 'close').length;

  // SVG geometry. The chart sits inside a fixed viewBox so Chrome's PDF
  // renderer scales it predictably regardless of viewport width. Right
  // margin is generous to give labels at the rightmost dot somewhere to
  // extend; left margin matches for symmetry.
  const W = 720;
  const H = 230;
  const margin = { top: 38, right: 64, bottom: 44, left: 64 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  // X axis: log10(measured/guessed). Auto-fit to the data with padding so
  // even the most extreme dot sits comfortably inside the plot, not on an
  // edge. Floor at log10(100) so the chart consistently spans ÷100 to ×100
  // — the ±10% band reads as a thin sliver against that span (the right
  // visual proportion for "most guesses were wildly off"), and the ×10 /
  // ÷10 tick marks always render.
  const logRatios = sorted.map((r) => Math.log10(r.delta.raw));
  const dataMax = logRatios.length > 0 ? Math.max(...logRatios.map(Math.abs)) : 0;
  const maxAbsLog = Math.max(dataMax + 0.2, Math.log10(100));
  const xOf = (logR) => margin.left + ((logR + maxAbsLog) / (2 * maxAbsLog)) * innerW;

  // Lane assignment that both spreads marks vertically (so the chart fills
  // its plot area) AND avoids overlap when marks are close on the x-axis.
  // Walk marks left-to-right; for each one, START the lane search at a
  // rotating cursor (`idx % ROWS`) so consecutive marks prefer different
  // lanes, then fall through to the next lane whose last-occupied x is
  // far enough away. That recovers the old round-robin's even distribution
  // while still pushing colliding marks to a free lane. Collision distance
  // is the dot diameter plus a breathing margin — wider than 2r means the
  // next dot does not visually touch the previous one. If the entire row
  // of 7 lanes is still occupied within the collision radius, fall back
  // to the rotating start anyway so a dense cluster degrades to overlap
  // rather than a runtime error.
  //
  // Order of operations matters: the lane assignment walks left-to-right
  // (by x), but the renderer's `sorted`/`marks` order stays "biggest miss
  // first" so the annotation picker (marks.slice(0, 3)) still names the
  // three most extreme misses, not the three leftmost dots.
  const ROWS = 7;
  const rowH = innerH / ROWS;
  const DOT_R = 5;
  const COLLIDE = DOT_R * 2.4;
  const marks = sorted.map((r) => ({
    ...r,
    x: xOf(Math.log10(r.delta.raw)),
    lane: 0,
  }));
  const laneLastX = new Array(ROWS).fill(-Infinity);
  const byX = [...marks].sort((a, b) => a.x - b.x);
  byX.forEach((m, idx) => {
    const start = idx % ROWS;
    let lane = -1;
    for (let i = 0; i < ROWS; i++) {
      const l = (start + i) % ROWS;
      if (m.x - laneLastX[l] >= COLLIDE) {
        lane = l;
        break;
      }
    }
    if (lane === -1) lane = start;
    m.lane = lane;
    laneLastX[lane] = m.x;
  });
  marks.forEach((m) => {
    m.y = margin.top + m.lane * rowH + rowH / 2;
  });

  const colorFor = (m) =>
    m.delta.klass === 'off' ? '#b13a18' : m.delta.klass === 'ok' ? '#1f6f3a' : '#888';

  // ±10% band shading
  const x10minus = xOf(Math.log10(0.9));
  const x10plus = xOf(Math.log10(1.1));
  const band = `<rect x="${x10minus.toFixed(1)}" y="${margin.top}" width="${(x10plus - x10minus).toFixed(1)}" height="${innerH}" fill="rgba(31,111,58,0.08)" stroke="rgba(31,111,58,0.35)" stroke-width="0.5" stroke-dasharray="2,2"/>`;
  const bandLabel = `<text x="${((x10minus + x10plus) / 2).toFixed(1)}" y="${(margin.top - 6).toFixed(1)}" font-size="8" fill="#1f6f3a" text-anchor="middle">±10% band</text>`;

  // Axis baseline + log ticks at decade boundaries that fall within range.
  const axisY = H - margin.bottom + 6;
  const tickValues = [-2, -1, 0, 1, 2].filter((v) => Math.abs(v) <= maxAbsLog + 0.001);
  const tickLabel = (v) => {
    if (v === 0) return '1×';
    if (v > 0) return `×${Math.pow(10, v)}`;
    return `÷${Math.pow(10, -v)}`;
  };
  const axisLine = `<line x1="${margin.left}" y1="${axisY}" x2="${(margin.left + innerW).toFixed(1)}" y2="${axisY}" stroke="#888" stroke-width="0.5"/>`;
  const ticks = tickValues
    .map((v) => {
      const x = xOf(v);
      return `<g><line x1="${x.toFixed(1)}" y1="${axisY - 3}" x2="${x.toFixed(1)}" y2="${axisY + 3}" stroke="#888" stroke-width="0.5"/><text x="${x.toFixed(1)}" y="${axisY + 14}" font-size="9" fill="#555" text-anchor="middle">${tickLabel(v)}</text></g>`;
    })
    .join('');
  const xAxisTitle = `<text x="${(margin.left + innerW / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="#555" text-anchor="middle">measured ÷ guessed (log scale) — left of 1× = guess too high, right = guess too low</text>`;

  const dots = marks
    .map(
      (m) =>
        `<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="5" fill="${colorFor(m)}" opacity="0.85"><title>${esc(m.repo)} / ${esc(m.name)}: ${fmtMultiplier(m.delta.multiplier)} ${esc(m.delta.direction)}</title></circle>`,
    )
    .join('');

  // Annotate the 3 most extreme misses inline so the chart names what the
  // reader is looking at without forcing them to flip back to the spine
  // table. Pick text-anchor by the dot's position in the plot — dots on
  // the right anchor 'end' so the label extends leftward into the chart
  // instead of clipping off the right edge; dots on the left anchor 'start'
  // for the mirror reason; centre marks stay 'middle'. Stagger label Y so
  // they don't collide with the mark itself.
  const topMisses = marks.slice(0, 3);
  const annotations = topMisses
    .map((m) => {
      const labelY = m.y < margin.top + innerH / 2 ? m.y - 10 : m.y + 16;
      const relX = (m.x - margin.left) / innerW;
      const anchor = relX > 0.78 ? 'end' : relX < 0.22 ? 'start' : 'middle';
      const text = `${m.name} ${fmtMultiplier(m.delta.multiplier)} ${m.delta.direction}`;
      return `<text x="${m.x.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="9" font-weight="600" fill="#1a1a1a" text-anchor="${anchor}">${esc(text)}</text>`;
    })
    .join('');

  const grayCount = sorted.length - offCount - closeCount;
  return `<section class="page-break calibration-chart-section">
  <h2>Calibration honesty — where my guesses landed</h2>
  <p>Each dot is one skill: position on the x-axis shows how wrong the guess was (measured ÷ guessed). <strong>Green dots</strong> sit inside the ±10% band — the guess was effectively right (${closeCount} ${closeCount === 1 ? 'skill' : 'skills'}). <strong>Orange dots</strong> missed by 5× or more (${offCount} of ${sorted.length}). <strong>Gray dots</strong> missed by less than 5× — between the ±10% band and the 5× threshold (${grayCount} of ${sorted.length}). <strong>${underCount} of ${sorted.length} guesses were too low</strong>. The fix is not "guess better next time" — intuition about token cost is unreliable in a way better intuition will not fix. The fix is to keep measuring.</p>
  <div class="avoid-break">
    <svg class="calibration-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration scatter: ${sorted.length} skill guesses vs measurements">
      ${band}
      ${bandLabel}
      ${dots}
      ${annotations}
      ${axisLine}
      ${ticks}
      ${xAxisTitle}
    </svg>
    <p class="caption">Per-skill guess and measured numbers are in the spine table above (<em>Est. cost</em> and <em>Cost / use</em> columns). This chart shows the ratio between them. ${sorted.length} skills total — every measured row that has a prior editorial estimate on record.</p>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
//  Findings page — seven prose paragraphs distilling the project's
//  observations of record, plus the "What this document does NOT claim"
//  bookend.
// ---------------------------------------------------------------------------

const FINDINGS = [
  {
    heading: 'Estimates were systematically wrong, and systematically low.',
    body: 'Before measuring anything, I wrote a guess for what each skill would cost. Of 28 skills with a guess on record, 13 were off by 5× or more — and the misses ran almost entirely one direction: I guessed too low. The takeaway is not "guess better next time." Intuition about token cost is unreliable in a way better intuition will not fix. The takeaway is to measure, and to keep measuring.',
  },
  {
    heading: "A recipe's value shrinks as the model gets more capable.",
    body: "The same skill, A/B-tested on Sonnet, Opus, and Haiku, does not save the same amount on each. Skills that save 50%+ on Sonnet typically settle at 20–40% on Opus. The skill arm does not get more expensive — the cold arm gets cheaper, because a stronger model needs less scaffolding to do the task well. A skill's measured value is not a fixed property; it is relative to the model underneath it.",
  },
  {
    heading: 'Some skills cost more than no skill at all — and that is the point.',
    body: 'Several skills show a negative save: the run that followed the skill spent more tokens than the run that went in cold. These are not failures. They are audit and lifecycle skills that do thorough work the unstructured run simply skipped. Their value is completeness and discipline, not token compression. A registry that only celebrated savings would have to hide them; this one counts them.',
  },
  {
    heading: 'The measurement tooling itself had a 23× error.',
    body: 'The parser that produced the cost numbers grouped a whole Claude Code session as one "use." A single session can contain dozens of calls to the same skill — so for /review it reported the cost of 336 invocations divided by 14, overstating per-use cost roughly 23×. A carefully collected number from a faulty instrument is still a wrong number. The measurement infrastructure needs the same scrutiny as the thing it measures — and catching this cost only attention, not compute: re-parsing transcripts is free.',
  },
  {
    heading: 'Cost and save are measured in different regimes; do not divide them.',
    body: 'Cost per use comes from real production transcripts. Save per use comes from controlled A/B calibrations on representative tasks. They measure related but different things, often at different scales — so dividing save by cost to get an "efficiency %" produces a number that means nothing. The percentages here are anchored to the A/B baseline, stated explicitly on each row where the gap is large. Two real numbers can still be the wrong pair to compare.',
  },
  {
    heading:
      'Cost distributions are heavily skewed; the median and the mean tell different stories.',
    body: "A skill's cost per use is not a single number. For /review it ranges from about 1K to nearly 1M tokens, because cost tracks the size of the work — a one-line PR and a 4,000-line PR are not the same job. A few large runs pull the mean to 48K, while the typical run — the median — costs 10K. This is not a defect to fix; it is a true property of the data. The honest response is to headline the median and show the spread, not to pretend one average describes every use.",
  },
  {
    heading: 'The measured aggregate save is far below the heuristic that started this.',
    body: "This project began with a rule of thumb: a skill saves about twice what it costs — a ~67% saving. Measurement put the portfolio aggregate at about 17%. The heuristic was roughly three times too optimistic. That gap, more than any single skill's number, is why the document exists: the way to know what tooling is worth is to measure it, not to model it.",
  },
];

function renderFindingsPage() {
  const findings = FINDINGS.map(
    (f) => `<section class="finding">
    <h3>${esc(f.heading)}</h3>
    <p>${esc(f.body)}</p>
  </section>`,
  ).join('\n');
  return `<section class="page-break findings-page">
  <h1>Findings</h1>
  ${findings}
  ${renderDoesNotClaimList()}
</section>`;
}

function renderDoesNotClaimList() {
  return `<section class="does-not-claim avoid-break">
  <h2>What this document does NOT claim</h2>
  <ul>
    <li>No production cost numbers. This is development-time tooling on my own machine.</li>
    <li>No comparison to other engineers' setups. I only have transcripts for one engineer.</li>
    <li>No per-feature ROI claim. This is per-skill cost, not per-feature value.</li>
    <li>No assertion that any of this scales linearly to a team. It might. I have not measured.</li>
    <li>No claim that the modeled savings would survive an actual A/B test against well-prompted unstructured chats. They might; I have not tested.</li>
  </ul>
</section>`;
}

// ---------------------------------------------------------------------------
//  Appendix — slim methodology page. The seven findings and the
//  "How to read this" box carry the prose framing; this section is purely
//  technical (how the numbers are produced, the invocation-boundary
//  correction, the regime gap, reproducibility).
// ---------------------------------------------------------------------------

function renderAppendix() {
  return `<section class="page-break appendix">
  <h1>Appendix — methodology</h1>
  <p class="subhead">How the numbers in the spine table are produced.</p>

  <h2>Per single use — the only unit</h2>
  <p>Every number is per one invocation of the skill. No annual figures, no "tokens per year." If you want a yearly figure, multiply by however many times you will actually run the skill.</p>

  <h2>How "measured cost / use" is produced</h2>
  <p>Two sources, both real. <strong>Transcript measurement</strong>: every Claude Code session writes a JSON-Lines transcript to <code>~/.claude/projects/&lt;dir&gt;/&lt;sessionId&gt;.jsonl</code>, with each assistant message carrying an <code>attributionSkill</code> field when a skill is active. <code>scripts/build-review-stats.mjs</code> walks those files, groups by <code>(skill, sessionId, promptId)</code> (one user message = one invocation), sums <code>input_tokens + output_tokens + cache_creation_input_tokens</code> (cache reads excluded — paid upstream), dedupes by <code>requestId</code>, and reports per-use stats across whatever invocations landed in the 90-day window. The dominant model that spent tokens on the skill becomes its <code>cost_model</code> tag.</p>
  <p><strong>A/B calibration arm-B</strong>: when a skill has no production transcripts, an A/B run still spends real tokens — a sub-agent followed the <code>SKILL.md</code> end-to-end on a representative task. Arm-B IS a real cost-per-use measurement, just from a controlled run instead of in-the-wild use.</p>

  <h2>What counts as one "use" — the invocation-boundary correction</h2>
  <p>The upstream <code>skill-usage</code> parser groups assistant messages by <code>(skill, sessionId)</code>: every message in one session counts as part of one invocation. That overstates tokens-per-use whenever a session contains multiple uses of the same skill. For <code>/review</code> the distortion is 23×: 14 sessions contained 336 distinct calls, so the parser's "1.15M / use" was really "cost of 336 uses divided by 14 instead of 336." <code>build-review-stats.mjs</code> corrects this by walking the <code>parentUuid</code> → originating-user-message chain on every transcript-measured row and using each user message's <code>promptId</code> as the invocation ID.</p>

  <h2>Median, not mean, on the cost headline</h2>
  <p>Where a row's cost is the average of multiple invocations, the headline is the <strong>median</strong> — the cost distribution is heavily right-skewed (one or two large invocations pull the mean well above the typical use), so the median is the honest "what does one use cost" figure. The cost cell tags "median of N" when applicable.</p>

  <h2>How "measured save / use" is produced</h2>
  <p>A calibration A/B test. Two sub-agents solve the same task in fresh sandboxed worktrees — arm A cold (no <code>SKILL.md</code> access), arm B following the skill. Save = arm-A tokens − arm-B tokens. <strong>N = 1 per skill, single data point</strong> on Sonnet primary; the multi-model columns repeat the A/B with a sub-agent dispatched as Opus or Haiku. Trust direction and magnitude, not two-significant-digit precision.</p>
  <p><strong>Exception: <code>/review</code>.</strong> N=11 A/Bs bucketed by PR size. Per-bucket medians: small (0–199 lines) 44%, medium (200–799) 26%, large (800–2499) 15%, extra-large (2500+) −10%. 63% of production /review calls are on small PRs, so the row's headline save uses the small-bucket median; the across-bucket aggregate (35%, 17K saved) sits in <code>calibration_aggregate_*</code> on the JSON. Per-bucket and per-PR data live on <code>calibration_ab_buckets</code> + <code>calibration_ab_runs</code>.</p>

  <h2>Different regimes — do not divide save by cost</h2>
  <p>Cost is from production transcripts; save is from A/B calibrations on (often smaller) representative tasks. The percentages shown on save cells are <code>save ÷ A/B arm A</code>, not <code>save ÷ production cost</code>. Several rows have an explicit scale-ratio hint (e.g. "A/B scale ~5× production" or "production scale ~11× A/B") when the two regimes diverge by 2× or more.</p>

  <h2>How "estimated cost / use" is produced</h2>
  <p>The number an author wrote down before any measurement existed, parsed from the skill's <code>SKILL.md</code> frontmatter or the repo's <code>README.md</code>. There is no math behind these — they are intuition snapshots from the moment the skill was scaffolded. See the calibration honesty chart for how reliable that intuition turned out to be.</p>

  <h2>Reproducibility</h2>
  <p>From inside <code>mikkonumminen.dev/</code> on a machine with Claude Code installed:</p>
  <ol>
    <li><code>/mikko-skill-usage</code> — writes <code>.claude/agent-verdicts/SKILL-USAGE-LATEST.json</code> from local transcripts.</li>
    <li><code>/skill-localUpdate</code> — re-walks the portfolio inventory, applies the measurement overlay, re-runs <code>build-review-stats.mjs</code>, renders this PDF.</li>
  </ol>
  <p>The data the renderer reads is committed at <code>public/data/skills-registry.json</code>. The dated history lives in <code>.claude/agent-verdicts/SKILL-REGISTRY-*.json</code>. The transcript files themselves stay on the author's machine because they contain code and context from private repos.</p>
</section>`;
}

// ---------------------------------------------------------------------------
//  Aggregates — feeds the hero and the calibration chart.
// ---------------------------------------------------------------------------

function buildAggregates(data) {
  const perRepo = [];
  const calibrationRows = [];
  let customMeasured90d = 0;
  let portfolioSavedTotal = 0;
  let portfolioSavedMeasured = 0;
  let portfolioSavedCalibrated = 0;
  let portfolioSavedModeled = 0;

  for (const r of data.repos) {
    let measuredCount = 0;
    let calibratedCount = 0;
    let measuredTokensWindow = 0;
    let annualSaved = 0;
    let annualSavedMeasured = 0;
    let annualSavedCalibrated = 0;
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
        if (typeof rec.calibration_arm_A === 'number')
          calibArmATotal += rec.calibration_arm_A;
        if (typeof rec.calibration_arm_B === 'number')
          calibArmBTotal += rec.calibration_arm_B;
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
//  Compose the full HTML document
// ---------------------------------------------------------------------------

function buildHtml(data, css) {
  const generated = data.generated_at.slice(0, 10);
  const agg = buildAggregates(data);
  const calibratedCount = agg.perRepo.reduce((n, r) => n + (r.calibratedCount || 0), 0);

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
  <p class="lede-short">A register of every custom slash-command skill I have written for Claude Code, with measurement when I have it and an honest guess when I do not. ${data.repos.length} repos, ${data.totals.skills} skills, ${calibratedCount} A/B-tested.</p>
</header>

${renderHero(agg.perRepo)}

${renderStanceLine()}

${renderHowToReadBox()}

${renderCrossModelCallout(data)}

${renderSpineTable(data)}

${renderCalibrationChart(agg.calibrationRows)}

${renderFindingsPage()}

${renderAppendix()}

<footer>
  Generated ${esc(fmtGeneratedAt(data.generated_at))}.
  Source data: <code>public/data/skills-registry.json</code>.
</footer>

</body>
</html>`;
}

// Read a file that may not exist yet. Reading and handling ENOENT keeps the
// decision on one filesystem call — an existsSync/readFileSync pair is a
// check-then-use race, and it reads the same file twice.
function readIfExists(file) {
  try {
    return fs.readFileSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
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

  // Skip the render entirely when the inputs have not moved. Chrome's internal
  // encoding shifts between browser versions, so re-rendering an unchanged
  // document is not a no-op — it rewrites the committed PDF for no visible
  // reason the first time the developer's Chrome updates.
  const fingerprint = inputFingerprint(html);
  const storedFingerprint = readIfExists(FINGERPRINT_FILE)?.toString('utf8').trim() ?? null;
  const existingPdf = readIfExists(OUT);
  if (
    !shouldRender({
      force: process.argv.includes('--force'),
      pdfExists: existingPdf !== null,
      storedFingerprint,
      fingerprint,
    })
  ) {
    console.log(`unchanged: ${OUT} (inputs unchanged — no render)`);
    console.log(`preview HTML: ${previewHtml}`);
    return;
  }

  if (!locateChrome()) {
    console.log(
      'build-skills-pdf: no Chrome / Chromium on PATH — leaving existing PDF in place. Set CHROME_PATH or install Chrome to regenerate.',
    );
    process.exit(0);
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-pdf-'));
  const tmpHtml = path.join(tmpDir, 'skills-registry.html');
  fs.writeFileSync(tmpHtml, html);
  // Rendered to a temp file and copied only on a real content change: a changed
  // input does not always move the rendered page (a reworded comment in the
  // layout code, say), and this PDF is committed.
  const tmpPdf = path.join(tmpDir, 'skills-registry.pdf');
  try {
    printHtmlToPdf({ htmlPath: tmpHtml, pdfPath: tmpPdf });
    if (existingPdf && pdfContentEquals(existingPdf, fs.readFileSync(tmpPdf))) {
      console.log(`unchanged: ${OUT}`);
    } else {
      fs.copyFileSync(tmpPdf, OUT);
      console.log(`wrote ${OUT}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  // Recorded even when the bytes were kept, so the next build short-circuits
  // on these inputs instead of re-rendering to reach the same conclusion.
  fs.writeFileSync(FINGERPRINT_FILE, `${fingerprint}\n`);
  console.log(`preview HTML: ${previewHtml}`);
}

main();
