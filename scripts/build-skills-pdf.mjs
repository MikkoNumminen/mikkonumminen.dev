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

function isMeasured(receipt) {
  return receipt?.source === 'transcript-measurement';
}

// ---------------------------------------------------------------------------
//  Hero block (page 1)
// ---------------------------------------------------------------------------

function renderHero(customMeasured90d, reviewBuiltin) {
  const refTokens = reviewBuiltin?.total_tokens_in_window ?? 0;
  const refInvocations = reviewBuiltin?.invocations_in_window ?? 0;
  const cap = Math.max(customMeasured90d, refTokens) || 1;
  const custPct = Math.round((customMeasured90d / cap) * 100);
  const refPct = Math.round((refTokens / cap) * 100);
  const ratioPct =
    refTokens > 0 ? Math.round((customMeasured90d / refTokens) * 100) : 0;
  const ratioFragment = refTokens > 0 ? ` <span class="pct">~${ratioPct}% of /review</span>` : '';
  const ratioText =
    refTokens > 0
      ? `My entire custom portfolio cost about ${ratioPct}% of what /review alone cost in the same window.`
      : '';
  return `<section class="hero avoid-break">
  <h2>Measured token cost — last 90 days</h2>
  <div class="hero-row">
    <span class="number">${fmt(customMeasured90d)}${ratioFragment}</span>
    <span class="label">All custom skills <span class="sublabel">(measured across this portfolio)</span></span>
    <span class="bar cust" style="width: ${Math.max(custPct, 1)}%"></span>
  </div>
  <div class="hero-row">
    <span class="number">${fmt(refTokens)} <span class="pct">${refInvocations} runs</span></span>
    <span class="label">/review built-in <span class="sublabel">(Claude Code's own slash command, shown for scale)</span></span>
    <span class="bar ref" style="width: ${Math.max(refPct, 1)}%"></span>
  </div>
  <p class="hero-caption">${esc(ratioText)} /review is excluded from every total below. Same bar scale — no zoom trickery.</p>
</section>`;
}

// ---------------------------------------------------------------------------
//  Per-repo summary (page 1, under the hero)
// ---------------------------------------------------------------------------

function renderSummaryTable(perRepo) {
  const rows = perRepo
    .map((r) => {
      const skills = r.totalSkills;
      const measured = r.measuredCount;
      const tokens = r.measuredTokensWindow
        ? fmt(r.measuredTokensWindow)
        : '—';
      const saved = r.annualSaved ? `~${fmt(r.annualSaved)}` : '—';
      const savedCls =
        r.annualSavedMeasuredShare < 0.5 ? ' class="saved-est"' : '';
      return `<tr><td>${esc(r.name)}</td><td class="num">${skills}</td><td class="num">${measured}</td><td class="num">${tokens}</td><td class="num"${savedCls}>${saved}</td></tr>`;
    })
    .join('\n');
  return `<table class="aggregate">
  <thead><tr><th scope="col">Repo</th><th scope="col" class="num">Skills</th><th scope="col" class="num">Measured</th><th scope="col" class="num">Tokens used (90d)</th><th scope="col" class="num">Saved / yr*</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="note">* Saved is a model, not a measurement — see the method page. Italicised values are majority-estimate; upright values are majority-measured.</p>`;
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

  // Cost / use
  let costCell = '<td class="cost">—</td>';
  if (rec?.tokens_per_use != null) {
    const unit = measured ? 'tokens / use (measured)' : 'tokens / use (est.)';
    costCell = `<td class="cost"><span class="big">${fmt(rec.tokens_per_use)}</span><span class="unit">${esc(unit)}</span></td>`;
  }

  // Runs
  let runsCell = '<td class="runs">—</td>';
  if (rec) {
    if (measured) {
      const inv = rec.invocations_in_window ?? '?';
      const win = rec.measurement_window_days ?? '?';
      const proj = rec.uses_per_year ?? '?';
      runsCell = `<td class="runs"><span class="runs-primary">${inv} in ${win}d</span><span class="runs-proj">~${proj}/yr projected</span></td>`;
    } else if (rec.uses_per_year != null) {
      runsCell = `<td class="runs"><span class="runs-primary">${rec.uses_per_year} / yr</span><span class="runs-proj">(est.)</span></td>`;
    }
  }

  // Calibration
  let calibCell = '<td class="calib"><span class="calib-none">n/a</span></td>';
  if (measured) {
    const delta = calibrationDelta(
      rec.tokens_per_use,
      rec.prior_estimate?.tokens_per_use,
    );
    if (delta) {
      const cls2 = delta.klass ? `calib-delta ${delta.klass}` : 'calib-delta';
      const guess = fmt(rec.prior_estimate.tokens_per_use);
      const dirLabel =
        delta.direction === 'close' ? 'within ±10%' : delta.direction;
      calibCell = `<td class="calib"><span class="${cls2}">${fmtMultiplier(delta.multiplier)} ${esc(dirLabel)}</span><span class="calib-detail">guess was ${guess}/use</span></td>`;
    } else if (rec.prior_estimate) {
      calibCell = `<td class="calib"><span class="calib-none">no prior number</span></td>`;
    } else {
      calibCell = `<td class="calib"><span class="calib-none">no prior guess</span></td>`;
    }
  }

  // Saved
  let savedCell = '<td class="saved">—</td>';
  const annualSaved = tokensSavedAnnual(rec);
  if (annualSaved) {
    const tag = measured ? 'modeled' : 'modeled (from est.)';
    savedCell = `<td class="saved"><span class="saved-num">~${fmt(annualSaved)}/yr</span><span class="saved-tag">${esc(tag)}</span></td>`;
  }

  const skillCell = `<td class="skill"><span class="name">${linkedName}</span><span class="tagline">${tagline}</span></td>`;
  const statusCell = `<td class="status">${chip}${lastSeen}</td>`;

  return `<tr class="${cls}">${skillCell}${statusCell}${costCell}${runsCell}${calibCell}${savedCell}</tr>`;
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
  return `<section>
  <div class="repo-heading">
    <span class="repo-name">${esc(repo.name)}</span>
    <span class="repo-stats">${statsCell}</span>
  </div>
  <table class="skills">
    <thead><tr>
      <th scope="col">Skill</th>
      <th scope="col">Status</th>
      <th scope="col" class="num">Cost / use</th>
      <th scope="col" class="num">Runs</th>
      <th scope="col" class="num">Calibration</th>
      <th scope="col" class="num">Saved / yr</th>
    </tr></thead>
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

  <h2>How “measured” rows are produced</h2>
  <p>Every time I run a Claude Code session (one conversation in the CLI from start to exit), the harness — the runtime that drives the CLI between me and the model — writes a transcript to <code>~/.claude/projects/&lt;dir&gt;/&lt;sessionId&gt;.jsonl</code>. The file is JSON Lines: one JSON object per line, one line per message. Each assistant message in those files carries an <code>attributionSkill</code> field when a skill is active. That field is the trail.</p>
  <p>A separate skill called <code>skill-usage</code> walks every transcript file, filters to assistant messages with an <code>attributionSkill</code>, groups by (sessionId, skillName), sums the input + output + cache-creation tokens, and dedupes by <code>requestId</code> so retried API calls do not double-count. The output is a dated <code>SKILL-USAGE-{YYYY-MM-DD}.json</code> under <code>.claude/agent-verdicts/</code>. That JSON is what the renderer reads to populate every “measured” row in this document.</p>
  <p><strong>Window:</strong> the last 90 days from the moment <code>skill-usage</code> ran. Sessions older than 90 days are ignored even if they're still on disk. The boundary is inclusive at the start (a session exactly 90 days old, to the second, is counted) and exclusive at the end (the very moment the scanner runs is the cutoff). Running the scanner an hour later can therefore drop a session that just crossed the boundary — that's a real if rare flake, and re-running the chain re-derives the right answer.</p>
  <p><strong>Annual projection:</strong> dumb linear math. If a skill ran twice in 90 days, the annual figure says about 8. That is on purpose. I would rather show the projection method honestly than dress up a single data point as a trend. When a row says <em>“1 in 90d → ~4/yr projected”</em> you should read that as <em>“barely a data point — trust the cost-per-use, ignore the annual.”</em></p>
  <p><strong>Cache accounting:</strong> the per-invocation total sums <code>input_tokens</code>, <code>output_tokens</code>, and <code>cache_creation_input_tokens</code>. It does <em>not</em> sum <code>cache_read_input_tokens</code> — those are cache hits paid for upstream and roughly 10× cheaper. Counting them would double-bill a single skill's multi-turn run. If you care specifically about cache efficiency, that's a different report.</p>
  <p><strong>What is not counted:</strong> any skill that did not run in the 90-day window has no measured row, even if I use it often outside that window. Sub-agent token costs (work the parent skill delegates to a parallel Claude Code agent, written to its own transcript file under a <code>subagents/</code> sibling directory) are included where the harness logs them — each sub-agent transcript inherits the parent session's <code>attributionSkill</code>. If a skill spawns work the harness does not tag, those tokens are invisible to this measurement.</p>
  <p><strong>Renamed skills:</strong> there's a small in-source rename map (<code>RENAMED_SKILLS</code> in <code>apply-measurement-overlay.mjs</code>) that retargets historical old-name measurements onto the renamed registry row. Without this, a rename would silently delete ~90 days of measured signal from the rendered totals. Entries get retired once the window rolls past the rename date.</p>

  <h2>How “estimated” rows are produced</h2>
  <p class="pull warn">I made up the number. I imagined someone — usually me — running the skill some number of times a year and costing some number of tokens per use, and I wrote down what felt right. There is no math behind these. They are guesses by the person who built the skill, written down before any measurement existed.</p>
  <p>The estimates are still in the document because the alternative is showing only a third of the portfolio. The rows that have never been invoked in the 90-day window still represent real tools that take real tokens when used. Pretending they don't exist would make the picture cleaner and less true.</p>
  <p>Make the asymmetry visible: every measured estimate I had has turned out to be wrong, usually low by 5× to 100×. Apply the same skepticism to the rows that have not been measured yet. If anything, the un-measured estimates are likely to be <em>more</em> wrong, because the ones I measured first were the ones I felt most confident about.</p>

  <h2>How “tokens saved” is computed</h2>
  <p>The savings number is a model, not a measurement. Here is the model in one line:</p>
  <p><strong>Saved = (cost of doing it the unstructured way − cost of doing it with the skill) × annual uses.</strong> I model the unstructured way as ~3× a focused skill run, because an unstructured chat would scout the files, talk through a plan, pick an approach, and only then write the same code. So saved ≈ 2× cost-per-use × annual uses.</p>
  <p>The 3× number comes from a handful of side-by-side runs I did on my own machine. It is not a benchmark. It is not a guarantee. It is the number I'm using until I have more measured baselines, and it is the single load-bearing assumption in every "Saved / yr" cell in this document. Per-skill overrides exist (<code>tokens_saved_per_use</code> on a receipt) for cases where the heuristic is obviously wrong — a redirect skill, for example, has no replacement work to compare against. Few skills currently override it.</p>
  <p>Cost appears on both sides of that subtraction, so the savings figure is more sensitive to bad guesses than the cost figure is. An estimated row with a 100× under-guess on cost-per-use produces a 100× under-guess on savings, too. The italicised numbers in the “Saved / yr” column are exactly those rows: a model stacked on top of a guess. Treat them as a lower bound at best.</p>

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

  for (const r of data.repos) {
    let measuredCount = 0;
    let measuredTokensWindow = 0;
    let annualSaved = 0;
    let annualSavedMeasured = 0;
    for (const s of r.skills) {
      const rec = s.receipt;
      if (!rec) continue;
      const saved = tokensSavedAnnual(rec);
      annualSaved += saved;
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
      measuredTokensWindow,
      annualSaved,
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
  };
}

// ---------------------------------------------------------------------------
//  Assemble the full HTML document
// ---------------------------------------------------------------------------

function buildHtml(data, css) {
  const generated = data.generated_at.slice(0, 10);
  const agg = buildAggregates(data);
  const reviewBuiltin = (data.built_in_references ?? []).find(
    (b) => b.name === 'review',
  );

  const measuredShare =
    agg.portfolioSavedTotal > 0
      ? Math.round(
          (agg.portfolioSavedMeasured / agg.portfolioSavedTotal) * 100,
        )
      : 0;

  const repoSections = data.repos.map(renderRepoSection).join('\n');
  const hero = renderHero(agg.customMeasured90d, reviewBuiltin, generated);
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
  <p class="lede">A list of every custom skill I've written for Claude Code (Anthropic's coding assistant CLI), with measured token usage where I have receipts and labeled estimates where I do not. A "skill" here is a reusable slash command — a named recipe Claude Code runs when I type <code>/audit</code> or similar. ${data.repos.length} repos, ${data.totals.skills} skills, ${agg.calibrationRows.length} of them with both a guess and a measurement so far.</p>
</header>

${hero}

<p class="lede">Most rows here are guesses. I wrote a skill, imagined someone using it 30 times a year, wrote that down. The rows tagged <span class="chip chip-measured">measured</span> are the ones where I went back to my Claude Code transcripts and counted — those are facts. The rest are tagged <span class="chip chip-estimate">estimate</span> and are guesses by the person who built the skill (that's me). In every measured case so far, my original guess was off — usually by 5× to 100×. The interesting part isn't that I was wrong. The interesting part is that you can see exactly how wrong, on page 2.</p>

<h2>Per-repo summary</h2>
${summary}

${calibrationPage}

<section class="page-break repo-page">
  <h1>Per-repo skill tables</h1>
  <p class="lede">One row per skill. Measured rows have a green wash; estimated rows are white. <strong>Saved / yr</strong> is a model — italic numbers mean it's modeled on top of an estimate, upright numbers mean it's modeled on top of a measurement. The model itself is described on the method page.</p>
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
