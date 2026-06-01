#!/usr/bin/env node
// Build a replicate scoreboard from raw per-draw token data.
//
// Thin IO wrapper around scripts/lib/scoreboard-stats.mjs (pure, unit-tested).
// Reads a cells-input file (raw draws per arm + the study's identity/metadata +
// editorial prior_rounds/verdict prose), computes median + spread per arm and a
// ratio-of-sums aggregate, and writes the published scoreboard JSON.
//
// Nothing study-specific lives here — study name, round, context, and the
// methodology block all ride in on the *.input.json, so a future round is a new
// input file, not a code edit.
//
// Companion: scripts/draw-tokens.mjs extracts the per-draw token totals (and
// DRAW_ID markers) from sub-agent transcripts that feed the input file. Token
// convention: input + output + cache_creation, dedup by (sessionId,requestId),
// cache_read excluded — matches scripts/build-review-stats.mjs.
//
// Usage:
//   node scripts/build-scoreboard.mjs \
//     [--input docs/audits/skills-optim-study-2026-06-01-replicates.input.json] \
//     [--output docs/audits/skills-optim-study-2026-06-01-replicates.json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScoreboard } from './lib/scoreboard-stats.mjs';

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

const args = parseArgs(process.argv.slice(2));
const data = JSON.parse(fs.readFileSync(args.input, 'utf8'));
const scoreboard = buildScoreboard(data);

fs.writeFileSync(args.output, JSON.stringify(scoreboard, null, 2) + '\n');
console.log(`Wrote ${args.output}`);
for (const [k, c] of Object.entries(scoreboard.cells)) {
  console.log(
    `  ${k}: A med ${c.arm_A.median} (n${c.n_arm_A}) | B med ${c.arm_B.median} (n${c.n_arm_B}) | saved ${c.saved_median} (${c.pct_saved_median}%)`,
  );
}
if (scoreboard.aggregate) {
  console.log(
    `  AGGREGATE: ${scoreboard.aggregate.net_saved} saved (${scoreboard.aggregate.net_pct_saved}%) across ${scoreboard.aggregate.cells_measured} cell(s)`,
  );
}
