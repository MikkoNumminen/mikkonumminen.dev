#!/usr/bin/env node
// Per-draw token accounting for skill-calibration / optim-rollout replicate draws.
//
// Given one or more sub-agent transcript files (agent-*.jsonl under
// ~/.claude/projects/<proj>/<session>/subagents/**), prints each draw's summed
// token cost, assistant-message count, model, and any DRAW_ID:<id> marker found
// in the first user message (used to map a transcript back to its A/B cell).
//
// Accounting convention (matches scripts/build-review-stats.mjs + the study):
//   tokenCost = input_tokens + output_tokens + cache_creation_input_tokens
//   deduped by (sessionId, requestId); cache_read excluded (paid upstream).
//
// Usage:
//   node scripts/draw-tokens.mjs <agent-1.jsonl> [<agent-2.jsonl> ...]
// Feed the resulting per-DRAW_ID totals into the *.input.json cells, then
// run scripts/build-scoreboard.mjs to (re)generate the scoreboard.

import fs from 'node:fs';

function accountFile(file) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const seen = new Set();
  let total = 0;
  let nAsst = 0;
  let model = null;
  let drawId = null;
  let firstUserSeen = false;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === 'user' && !firstUserSeen) {
      firstUserSeen = true;
      const c = o.message?.content;
      const txt =
        typeof c === 'string'
          ? c
          : Array.isArray(c)
            ? c.map((p) => (typeof p === 'string' ? p : (p?.text ?? ''))).join(' ')
            : '';
      const m = txt.match(/DRAW_ID:\s*([A-Za-z0-9_.-]+)/);
      if (m) drawId = m[1];
    }
    if (o.type !== 'assistant') continue;
    if (!o.message?.usage || !o.requestId) continue;
    const dedupe = `${o.sessionId}|${o.requestId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const u = o.message.usage;
    total +=
      (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    nAsst++;
    if (!model && typeof o.message?.model === 'string') {
      const r = o.message.model.toLowerCase();
      model = r.includes('opus')
        ? 'opus'
        : r.includes('sonnet')
          ? 'sonnet'
          : r.includes('haiku')
            ? 'haiku'
            : o.message.model;
    }
  }
  return { file, total, nAsst, model, drawId };
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
