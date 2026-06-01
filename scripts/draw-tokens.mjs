#!/usr/bin/env node
// Per-draw token accounting for skill-calibration / optim-rollout replicate draws.
//
// Thin CLI wrapper around scripts/lib/transcript-tokens.mjs (pure, unit-tested).
// Given one or more sub-agent transcript files (agent-*.jsonl under
// ~/.claude/projects/<proj>/<session>/subagents/**), prints each draw's summed
// token cost, assistant-message count, model, and any DRAW_ID:<id> marker found
// in the first user message (used to map a transcript back to its A/B cell).
//
// Convention: input + output + cache_creation, dedup by (sessionId,requestId),
// cache_read excluded — matches scripts/build-review-stats.mjs.
//
// Usage:
//   node scripts/draw-tokens.mjs <agent-1.jsonl> [<agent-2.jsonl> ...]
// Feed the resulting per-DRAW_ID totals into the *.input.json cells, then
// run scripts/build-scoreboard.mjs to (re)generate the scoreboard.

import fs from 'node:fs';
import { accountTranscript } from './lib/transcript-tokens.mjs';

function accountFile(file) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  return { file, ...accountTranscript(content) };
}

const files = process.argv.slice(2);
const rows = files.map(accountFile).filter(Boolean);
for (const r of rows) {
  console.log(
    `${r.total}\t${r.nAsst}\t${r.model ?? '?'}\t${r.drawId ?? '-'}\t${r.file.split(/[\\/]/).pop()}`,
  );
}
if (rows.length > 1) {
  const sum = rows.reduce((a, r) => a + r.total, 0);
  console.log(`# files=${rows.length} sum=${sum}`);
}
