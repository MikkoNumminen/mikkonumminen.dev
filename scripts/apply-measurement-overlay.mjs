#!/usr/bin/env node
// Overlay transcript-measured token figures from
// .claude/agent-verdicts/SKILL-USAGE-LATEST.json onto
// public/data/skills-registry.json. Measured rows replace whatever receipt
// they had before; unmeasured rows are untouched. Recomputes totals.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'public', 'data', 'skills-registry.json');
const USAGE = path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-USAGE-LATEST.json');

// Sample-sessionId → repo lookup. Sessions live under
// ~/.claude/projects/<dir>/<sessionId>.jsonl; each <dir> maps to one repo.
// Verified manually for the 2026-05-20 90-day window.
const SESSION_TO_REPO = {
  '3b219a03-2024-4372-b270-a13237480b7e': 'AudiobookMaker',
  '6e537f60-3404-4bc0-b9c9-fd3d1a6c340d': 'AudiobookMaker',
  '4a938199-6bea-4ec0-b86f-901ab6faa515': 'AudiobookMaker',
  '89216c3d-52b2-4763-a770-fd7502176a12': 'AudiobookMaker',
  'a36d05d7-450e-41ca-9d2c-602c40a5d2de': 'Spacepotatis',
  'ac357e75-ba76-4889-af17-2d9295c3b5df': 'Spacepotatis',
  'c168355a-2563-4dbf-89bc-f36cc21f96aa': 'mikkonumminen.dev',
  '397c4ce8-dcec-4a2e-a4ce-c46cc23397ec': 'mikkonumminen.dev',
  'de3894ce-bc85-4172-b059-a8a4077c594c': 'mikkonumminen.dev',
};

// Skills that exist in the registry but should NOT be overlaid (built-in,
// meta, or out-of-scope skills).
const SKIP = new Set(['review', 'mikko-help', 'update-config', 'pre-push-scan',
  'mikko-skill-usage', 'commit-then-scan', 'mikko-skills']);

const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const usage = JSON.parse(fs.readFileSync(USAGE, 'utf8'));

let overlaid = 0;
const report = [];

for (const m of usage.skills) {
  if (SKIP.has(m.name)) continue;
  // Use the first sample sessionId to pick the repo.
  const repo = SESSION_TO_REPO[m.sample_session_ids?.[0]];
  if (!repo) {
    report.push(`SKIP ${m.name} — unknown session ${m.sample_session_ids?.[0]}`);
    continue;
  }
  const r = reg.repos.find((x) => x.name === repo);
  if (!r) {
    report.push(`SKIP ${m.name} — repo ${repo} not in registry`);
    continue;
  }
  const s = r.skills.find((x) => x.name === m.name);
  if (!s) {
    report.push(`SKIP ${m.name} — not declared in ${repo}`);
    continue;
  }
  const oldAnnual = s.receipt?.annual_total ?? 0;
  s.receipt = {
    path: '.claude/agent-verdicts/SKILL-USAGE-LATEST.json',
    source: 'transcript-measurement',
    tokens_per_use: m.tokens_per_use_avg,
    uses_per_year: m.uses_per_year,
    annual_total: m.annual_total,
    measurement_window_days: usage.window_days,
    invocations_in_window: m.invocations,
    last_invoked: m.last_invoked,
  };
  overlaid++;
  report.push(`OVERLAY ${repo}.${m.name}: ${oldAnnual} → ${m.annual_total}`);
}

// Recompute totals.
let totalAnnual = 0;
let withReceipts = 0;
let totalSkills = 0;
let redirects = 0;
for (const r of reg.repos) {
  for (const s of r.skills) {
    totalSkills++;
    if (s.redirect) redirects++;
    if (s.receipt) withReceipts++;
    if (s.receipt?.annual_total) totalAnnual += s.receipt.annual_total;
  }
}
reg.totals = {
  skills: totalSkills,
  redirects,
  with_receipts: withReceipts,
  annual_tokens_saved: totalAnnual,
};
reg.generated_at = new Date().toISOString();

fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n');

console.log(report.join('\n'));
console.log(`\nOverlaid ${overlaid} skills. New annual total: ${totalAnnual.toLocaleString()}`);
