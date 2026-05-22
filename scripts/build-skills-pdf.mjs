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
    receipt?.source === 'transcript-measurement' ||
    receipt?.source === 'calibration'
  );
}

function isTranscriptMeasured(receipt) {
  return receipt?.source === 'transcript-measurement';
}

// ---------------------------------------------------------------------------
//  Hero block (page 1)
// ---------------------------------------------------------------------------

function renderHero(agg, calibratedCount, transcriptMeasuredCount, totalSkillsWithReceipts) {
  // Per-use only. Annual / year projections are deliberately absent — this
  // document is a register of skills with measured data, not a usage
  // forecast. The hero counts skills by what's been measured per use:
  //
  //   - costMeasured = skills with cost-per-use from a real run
  //                    (transcript-measurement OR calibration arm-B).
  //   - saveMeasured = skills with a real A/B save-per-use (calibration).
  //   - estOnly      = skills with neither — only editorial guesses.
  //
  // The bars share an integer scale so the eye sees "X of N" directly.
  const costMeasured = transcriptMeasuredCount + calibratedCount;
  const saveMeasured = calibratedCount;
  const estOnly = totalSkillsWithReceipts - costMeasured;
  const cap = totalSkillsWithReceipts || 1;
  const pct = (n) => Math.round((n / cap) * 100);
  return `<section class="hero avoid-break">
  <h2>Skills with measured per-use data</h2>
  <div class="hero-row">
    <span class="number">${costMeasured} <span class="pct">of ${totalSkillsWithReceipts} skills with cost data</span></span>
    <span class="label">Measured cost / use <span class="sublabel">(real run — transcripts or A/B arm-B)</span></span>
    <span class="bar cust" style="width: ${Math.max(pct(costMeasured), 1)}%"></span>
  </div>
  <div class="hero-row">
    <span class="number">${saveMeasured} <span class="pct">of ${totalSkillsWithReceipts} skills with save data</span></span>
    <span class="label">Measured save / use <span class="sublabel">(real A/B test — arm A minus arm B)</span></span>
    <span class="bar cust" style="width: ${Math.max(pct(saveMeasured), 1)}%"></span>
  </div>
  <div class="hero-row">
    <span class="number">${estOnly} <span class="pct">of ${totalSkillsWithReceipts} estimate-only</span></span>
    <span class="label">No measured data <span class="sublabel">(author guesses, still candidates for the next /mikko-skill-calibration run)</span></span>
    <span class="bar ref" style="width: ${Math.max(pct(estOnly), 1)}%"></span>
  </div>
  <p class="hero-caption">A register of every custom skill across the portfolio, with the per-use cost and per-use savings each skill has — measured where I have receipts, labeled as estimate where I do not. No annual projections in this document; every number is per single invocation of the skill.</p>
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
// convention as the per-repo measured rows), but no SKILL.md exists for
// these, so they have no procedure to A/B-test against (yet — the slot is
// here for a future calibration target). Excluded from the savings hero
// because they're not a savings claim, they're a scale anchor.
function renderBuiltInsSection(refs) {
  if (!refs || refs.length === 0) return '';
  // Same 6-column shape as the per-repo tables so the row scans the same
  // way. Built-ins have a measured cost but no SKILL.md to A/B-test
  // against, so the save columns are "—" — not a savings claim, just a
  // scale anchor for the reader.
  const rows = refs
    .map((br) => {
      const lastSeen = br.last_invoked
        ? `<span class="last-seen">last ${esc(lastUsedDate(br.last_invoked))}</span>`
        : '';
      const tagline = esc(br.description);
      const skill = `<td class="skill"><span class="name">${esc(br.label)}</span><span class="tagline">${tagline}</span></td>`;
      const status = `<td class="status"><span class="chip chip-measured">measured</span>${lastSeen}</td>`;
      const measuredCost = `<td class="num-cell num-cell-measured-cost"><span class="num-cell-big">${fmt(br.tokens_per_use_avg)}</span><span class="num-cell-unit">tokens / use</span></td>`;
      const dash = `<td class="num-cell">—</td>`;
      return `<tr class="measured">${skill}${status}${measuredCost}${dash}${dash}${dash}</tr>`;
    })
    .join('\n');
  return `<div class="repo-heading"><span class="repo-name">Claude Code built-ins</span><span class="repo-stats">reference — not part of the portfolio</span></div>
  <p class="note">Built-in slash commands. Per-use cost is measured the same way as the custom-skill rows. No <code>SKILL.md</code> exists for these, so there's no procedure to A/B-test against — the save columns read "—" rather than zero. Shown as a scale anchor for the reader.</p>
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

  const offCount = measuredWithPriors.filter((r) => r.delta.klass === 'off')
    .length;

  return `<section class="page-break">
  <h2>Calibration honesty — where my guesses landed</h2>
  <p class="calib-intro">Here are the rows where I had a guess before I had data. The “How wrong” column is the measurement divided by the guess. Green means I landed within ±10%. Orange means I was off by 5× or more in either direction. ${offCount} of ${measuredWithPriors.length} rows are orange. The fix is not to write better guesses next time. The fix is to keep measuring.</p>
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
  const cls = s.redirect
    ? 'redirect'
    : measured
      ? 'measured'
      : 'estimate';

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

  const lastSeen = measured && rec?.last_invoked
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
    rec?.tokens_saved_source === 'calibration'
      ? rec.tokens_saved_per_use
      : null;
  const estimatedCost = rec?.prior_estimate?.tokens_per_use
    ?? (isMeasured(rec) ? null : rec?.tokens_per_use);
  const estimatedSave =
    typeof estimatedCost === 'number'
      ? Math.round(estimatedCost * (DEFAULT_BASELINE_MULTIPLIER - 1))
      : null;

  function num(value, kind) {
    if (value == null) return `<td class="num-cell">—</td>`;
    const negative = value < 0;
    const cellClasses = ['num-cell', `num-cell-${kind}`];
    if (kind === 'measured-save' && negative) cellClasses.push('cell-negative');
    const display = negative
      ? `−${fmt(Math.abs(value))}`
      : fmt(value);
    return `<td class="${cellClasses.join(' ')}"><span class="num-cell-big">${display}</span><span class="num-cell-unit">tokens / use</span></td>`;
  }

  const skillCell = `<td class="skill"><span class="name">${linkedName}</span><span class="tagline">${tagline}</span></td>`;
  const statusCell = `<td class="status">${chip}${lastSeen}</td>`;

  return `<tr class="${cls}">${skillCell}${statusCell}${num(measuredCost, 'measured-cost')}${num(measuredSave, 'measured-save')}${num(estimatedCost, 'est-cost')}${num(estimatedSave, 'est-save')}</tr>`;
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

  <h2>How “measured save / use” is produced</h2>
  <p>One source: a calibration A/B test. Two Sonnet sub-agents solve the same task in fresh sandboxed worktrees — arm A cold (no <code>SKILL.md</code> access), arm B following the skill. Save / use is arm-A tokens minus arm-B tokens for that one run. <strong>N = 1 per skill, single data point</strong>. A re-run would produce different absolute numbers for both arms; trust direction and rough magnitude, not two-significant-digit precision.</p>
  <p>Some skills show negative save / use in orange. Those are real findings: the skill arm spent MORE tokens than the unstructured arm, because the skill encodes rigor (e.g. a full-CRUD lifecycle or a multi-phase audit) that the unstructured arm skipped. The skill's value is completeness, not token compression. The arm-A / arm-B numbers are preserved on each calibrated row's receipt for any downstream consumer that wants to see both sides.</p>

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
  let portfolioSavedCalibrated = 0;   // savings from rows with A/B-measured
                                       // saved-per-use (calibration overlay)
  let portfolioSavedModeled = 0;       // savings from rows still using the
                                       // 3× heuristic on cost-per-use

  for (const r of data.repos) {
    let measuredCount = 0;
    let calibratedCount = 0;
    let measuredTokensWindow = 0;
    let annualSaved = 0;
    let annualSavedMeasured = 0;
    let annualSavedCalibrated = 0;
    for (const s of r.skills) {
      const rec = s.receipt;
      if (!rec) continue;
      const saved = tokensSavedAnnual(rec);
      annualSaved += saved;
      if (rec.tokens_saved_source === 'calibration') {
        calibratedCount += 1;
        annualSavedCalibrated += saved;
        portfolioSavedCalibrated += saved;
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
    perRepo.push({
      name: r.name,
      totalSkills: r.skills.length,
      measuredCount,
      calibratedCount,
      measuredTokensWindow,
      annualSaved,
      annualSavedCalibrated,
      annualSavedMeasuredShare:
        annualSaved > 0 ? annualSavedMeasured / annualSaved : 0,
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
      ? Math.round(
          (agg.portfolioSavedMeasured / agg.portfolioSavedTotal) * 100,
        )
      : 0;

  const repoSections = data.repos.map(renderRepoSection).join('\n');
  const calibratedCount = agg.perRepo.reduce(
    (n, r) => n + (r.calibratedCount || 0),
    0,
  );
  // Transcript-measured = isMeasured BUT not calibration-source. Used to
  // split the hero's "cost measured" count between sources.
  const transcriptMeasuredCount = data.repos.reduce(
    (n, r) =>
      n + r.skills.filter((s) => isTranscriptMeasured(s.receipt)).length,
    0,
  );
  const totalSkillsWithReceipts = data.repos.reduce(
    (n, r) => n + r.skills.filter((s) => s.receipt).length,
    0,
  );
  const hero = renderHero(
    agg,
    calibratedCount,
    transcriptMeasuredCount,
    totalSkillsWithReceipts,
  );
  const summary = renderSummaryTable(agg.perRepo);
  const calibrationPage = renderCalibrationPage(agg.calibrationRows);
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

${renderBuiltInsSection(data.built_in_references ?? [])}

${calibrationPage}

<section class="page-break repo-page">
  <h1>Per-repo skill tables</h1>
  <p class="lede">One row per skill. Measured rows have a green wash; estimated rows are white. Four data columns per row, in pairs: <strong>Cost / use</strong> measured + estimated, then <strong>Save / use</strong> measured + estimated. Green numbers come from real runs (transcript or A/B). Italic gray numbers are author estimates. Orange numbers are real A/B measurements showing the skill cost MORE per use than the unstructured baseline. Dashes mean no data exists for that cell yet. Every figure is per single invocation — no annual projections anywhere in this document.</p>
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
