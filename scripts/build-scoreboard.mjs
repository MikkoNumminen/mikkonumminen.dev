#!/usr/bin/env node
// Build the optim-rollout replicate scoreboard from raw per-draw token data.
//
// Companion to scripts/draw-tokens.mjs (which extracts per-draw token totals
// from sub-agent transcripts). This script turns a cells-input file (raw draws
// per arm, plus editorial prior_rounds / verdict prose) into the published
// scoreboard JSON: median + spread per arm, saved + pct on medians, and a
// ratio-of-sums aggregate over the per-cell medians.
//
// Token-accounting convention (applied upstream in draw-tokens.mjs, documented
// here for the reader): input + output + cache_creation_input_tokens, deduped
// by (sessionId, requestId), cache_read excluded. Matches build-review-stats.mjs.
//
// Cell = MEDIAN + spread, never a single draw. Noise floor ~2% = direction only.
//
// Usage:
//   node scripts/build-scoreboard.mjs \
//     [--input docs/audits/skills-optim-study-2026-06-01-replicates.input.json] \
//     [--output docs/audits/skills-optim-study-2026-06-01-replicates.json]
//
// Re-run to regenerate the scoreboard's numeric fields from the raw draws; the
// verdict/prior_rounds prose passes through from the input file unchanged.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = {
    input: path.join(
      REPO_ROOT,
      'docs/audits/skills-optim-study-2026-06-01-replicates.input.json',
    ),
    output: path.join(
      REPO_ROOT,
      'docs/audits/skills-optim-study-2026-06-01-replicates.json',
    ),
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') out.input = path.resolve(argv[++i] ?? '');
    else if (argv[i] === '--output') out.output = path.resolve(argv[++i] ?? '');
  }
  return out;
}

const round = (x) => Math.round(x);

function stat(vals) {
  const n = vals.length;
  if (!n) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2);
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { n, median, mean: round(mean), min: s[0], max: s[n - 1], stddev: round(Math.sqrt(variance)) };
}

const args = parseArgs(process.argv.slice(2));
const data = JSON.parse(fs.readFileSync(args.input, 'utf8'));

const cells = {};
let aggA = 0;
let aggB = 0;
let nCells = 0;
for (const [key, c] of Object.entries(data.cells)) {
  const A = stat(c.arm_A_draws);
  const B = stat(c.arm_B_draws);
  if (!A || !B) continue;
  const savedMedian = A.median - B.median;
  const pctMedian = round((savedMedian / A.median) * 100);
  // Pinned before-arm = mean of cold draws ("pin the before-arm by averaging").
  const savedPinned = A.mean - B.median;
  const pctPinned = round((savedPinned / A.mean) * 100);
  cells[key] = {
    model: c.model,
    n_arm_A: A.n,
    n_arm_B: B.n,
    arm_A_draws: c.arm_A_draws,
    arm_B_draws: c.arm_B_draws,
    arm_A: A,
    arm_B: B,
    saved_median: savedMedian,
    pct_saved_median: pctMedian,
    before_arm_pinned_mean: A.mean,
    saved_pinned: savedPinned,
    pct_saved_pinned: pctPinned,
    prior_rounds: c.prior_rounds ?? null,
    verdict: c.verdict ?? null,
  };
  aggA += A.median;
  aggB += B.median;
  nCells++;
}

const scoreboard = {
  generated_at: data.generated_at,
  study: 'optim-rollout-replicates-2026-06-01',
  round: 6,
  source_repo: 'https://github.com/MikkoNumminen/claude-skills',
  regenerate: 'node scripts/build-scoreboard.mjs (reads the *.input.json sibling; per-draw tokens via scripts/draw-tokens.mjs)',
  context:
    "Re-measure the study's noisiest cells at depth (N>=5/arm on opus), both arms in the same window, before-arm pinned by averaging cold draws. Resolves N=1 anomalies from rounds 1-5. Triggered as the optim-rollout fallback: the audit/fix queue found 0 fixes to apply, so remaining quota went to firming up the noisiest existing cells.",
  methodology: {
    arm_A: 'cold (no skills-quality/freshness SKILL.md or script; DOES inspect target skills since auditing them is the task)',
    arm_B: 'with-skill (read SKILL.md, run its script read-only, no --update)',
    model_held_constant: true,
    before_arm: 'pinned by averaging >=5 cold draws (not a single N=1 draw)',
    cell: 'MEDIAN + spread; ratio computed on medians (and on pinned mean for the before arm)',
    aggregate: 'ratio of sum-of-per-cell-medians (volume-weighted), NOT mean-of-cell-percentages',
    token_accounting:
      'input + output + cache_creation_input_tokens, deduped by (sessionId,requestId), cache_read excluded. Matches scripts/build-review-stats.mjs + the round-1-5 study.',
    noise_floor: 'cells within ~2% carry direction only',
    worktree_isolation: 'skipped - both arms read-only against ~/.claude/skills/',
    caveat: 'cold-arm token cost is task-framing-sensitive (how thoroughly it audits); trust direction + magnitude, not the exact %.',
  },
  cells,
  aggregate: nCells
    ? {
        cells_measured: nCells,
        sum_median_arm_A: aggA,
        sum_median_arm_B: aggB,
        net_saved: aggA - aggB,
        net_pct_saved: round(((aggA - aggB) / aggA) * 100),
      }
    : null,
};

fs.writeFileSync(args.output, JSON.stringify(scoreboard, null, 2) + '\n');
console.log(`Wrote ${args.output}`);
for (const [k, c] of Object.entries(cells)) {
  console.log(
    `  ${k}: A med ${c.arm_A.median} (n${c.n_arm_A}) | B med ${c.arm_B.median} (n${c.n_arm_B}) | saved ${c.saved_median} (${c.pct_saved_median}%)`,
  );
}
if (scoreboard.aggregate) {
  console.log(
    `  AGGREGATE: ${scoreboard.aggregate.net_saved} saved (${scoreboard.aggregate.net_pct_saved}%) across ${nCells} cell(s)`,
  );
}
