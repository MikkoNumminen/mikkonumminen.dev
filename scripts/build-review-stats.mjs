#!/usr/bin/env node
// Scan ~/.claude/projects/ JSONLs for /review invocations and compute
// per-use token stats. Produces TWO sets of numbers and writes both to
// public/data/skills-registry.json under built_in_references:
//
//   1. SESSION-GROUPED — matches the upstream skill-usage parser, which
//      collapses every /review call inside one Claude Code session into
//      a single "invocation" (the (skill, sessionId) approximation in
//      claude-skills/skills/skill-usage/scan.mjs). This overstates
//      tokens-per-use whenever a session contains multiple /review runs
//      (typical when iterating on a stack of PRs). Lives on the existing
//      `built_in_references[name === 'review']` entry.
//
//   2. PER-INVOCATION (CORRECTED) — walks the parentUuid chain from
//      every review-attributed assistant message up to the originating
//      user message and uses that message's promptId as the invocation
//      ID. Each distinct (sessionId, promptId) is one /review call.
//      Lives on a sibling `built_in_references[name === 'review-per-invocation']`
//      entry so the renderer can emit a second row under the original
//      and the reader sees both numbers explicitly.
//
// Why both: the document's central value is honesty. The original 1.05M
// tokens/use for /review was misleading because it averaged across
// sessions, not invocations; the corrected number is ~45K, but the total
// annual cost (~60M) is unchanged because uses_per_year scales inversely
// (57 sessions/yr → ~1,330 invocations/yr). Showing both rows makes the
// parser limitation visible without hiding either truth.
//
// Token-accounting and dedupe convention match upstream scan.mjs:
// (sessionId, requestId) dedupe so the thinking + tool_use double-line
// doesn't double-count, exclude cache_read because those tokens were
// paid upstream.
//
// Chain order: run AFTER `node scripts/apply-measurement-overlay.mjs`.
// Both scripts write tokens_per_use_avg / invocations_in_window /
// total_tokens_in_window / last_invoked on /review's row; second-write
// wins, so overlay first (handles every measured row), then this script
// (corrects /review specifically). Not chained into prebuild because it
// reads local user data under ~/.claude/projects/.
//
// CI behavior: when ~/.claude/projects/ is missing (build server, fresh
// clone, CI runner), the script exits 0 with a no-op message and leaves
// the committed stats untouched.
//
// Usage: node scripts/build-review-stats.mjs [--window-days 90]
//        npm run build:review-stats

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'public', 'data', 'skills-registry.json');
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const SKILL_NAME = 'review';
const PER_INVOCATION_NAME = 'review-per-invocation';
const DAYS_PER_YEAR = 365;

function parseArgs(argv) {
  const out = { windowDays: 90 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--window-days') out.windowDays = parseInt(argv[++i] ?? '', 10);
  }
  return out;
}

function listJsonlFiles(projectsDir) {
  const files = [];
  if (!fs.existsSync(projectsDir)) return files;
  for (const projDir of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!projDir.isDirectory()) continue;
    const projPath = path.join(projectsDir, projDir.name);
    for (const e of fs.readdirSync(projPath, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        files.push(path.join(projPath, e.name));
      }
      if (e.isDirectory()) {
        const subDir = path.join(projPath, e.name, 'subagents');
        if (!fs.existsSync(subDir)) continue;
        for (const sf of fs.readdirSync(subDir)) {
          if (sf.endsWith('.jsonl')) files.push(path.join(subDir, sf));
        }
      }
    }
  }
  return files;
}

function tokenCost(usage) {
  const u = usage ?? {};
  return (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

function stats(values) {
  if (values.length === 0) return null;
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const min = values.reduce((a, b) => (a < b ? a : b));
  const max = values.reduce((a, b) => (a > b ? a : b));
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return { n, total: sum, mean: Math.round(mean), min, max, stddev: Math.round(stddev) };
}

// Walk each JSONL once, capture all assistant messages attributed to /review
// AND build a uuid → message map so we can chain-walk to find the originating
// user message's promptId per invocation.
function scanAllFiles(files, cutoffMs) {
  const records = []; // assistant messages for /review
  const byUuidPerFile = []; // [{ uuid: msg, ... }, ...] keeping each file's chain separate
  let lastInvoked = '';

  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const byUuid = new Map();
    const fileRecords = [];

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.uuid) byUuid.set(obj.uuid, obj);
      if (obj.type !== 'assistant') continue;
      if (obj.attributionSkill !== SKILL_NAME) continue;
      if (!obj.message?.usage || !obj.requestId) continue;
      const t = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (!Number.isFinite(t) || t < cutoffMs) continue;
      fileRecords.push(obj);
      if (obj.timestamp && obj.timestamp > lastInvoked) lastInvoked = obj.timestamp;
    }

    if (fileRecords.length === 0) continue;
    records.push(...fileRecords);
    byUuidPerFile.push({ byUuid, records: fileRecords });
  }
  return { records, byUuidPerFile, lastInvoked };
}

// Resolve each /review assistant message to its originating user-message
// promptId by walking parentUuid up the chain. Cap the walk at 200 hops
// for safety on malformed transcripts; in practice the chain depth is
// always small (a few tool-use round trips).
function resolveInvocationIds(byUuidPerFile) {
  const out = new Map(); // (sessionId, requestId) -> invocationId
  for (const { byUuid, records } of byUuidPerFile) {
    for (const o of records) {
      let invocationId = null;
      let node = o;
      let depth = 0;
      while (node && depth < 200) {
        const pu = node.parentUuid;
        if (!pu) break;
        const parent = byUuid.get(pu);
        if (!parent) break;
        if (parent.type === 'user' && parent.promptId) {
          invocationId = parent.promptId;
          break;
        }
        node = parent;
        depth++;
      }
      // Fallback when chain doesn't lead to a user message: use sessionId so the
      // record still gets counted, just collapses with other un-attributable
      // records in the same session. Very rare on well-formed transcripts.
      if (!invocationId) invocationId = `fallback-${o.sessionId ?? 'unknown'}`;
      out.set(`${o.sessionId}|${o.requestId}`, invocationId);
    }
  }
  return out;
}

function bucketTokens(records, keyFn) {
  // Dedupe by (sessionId, requestId), then bucket by keyFn applied to record.
  const seen = new Set();
  const buckets = new Map();
  for (const r of records) {
    const dedupe = `${r.sessionId}|${r.requestId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const k = keyFn(r);
    buckets.set(k, (buckets.get(k) ?? 0) + tokenCost(r.message?.usage));
  }
  return [...buckets.values()];
}

const args = parseArgs(process.argv.slice(2));
const cutoffMs = Date.now() - args.windowDays * 86_400_000;

if (!fs.existsSync(PROJECTS_DIR)) {
  console.log(`No ~/.claude/projects/ found — skipping /${SKILL_NAME} stats refresh (existing stats preserved).`);
  process.exit(0);
}

const files = listJsonlFiles(PROJECTS_DIR);
const { records, byUuidPerFile, lastInvoked } = scanAllFiles(files, cutoffMs);

if (records.length === 0) {
  console.log(`No /${SKILL_NAME} invocations found in the last ${args.windowDays} days — skipping stats refresh.`);
  process.exit(0);
}

const sessionGrouped = stats(bucketTokens(records, (r) => r.sessionId));

const invocationIdByRecord = resolveInvocationIds(byUuidPerFile);
const perInvocation = stats(bucketTokens(records, (r) => {
  const id = invocationIdByRecord.get(`${r.sessionId}|${r.requestId}`);
  return `${r.sessionId}|${id}`;
}));

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const refs = registry.built_in_references ?? [];

const sessionRow = refs.find((r) => r.name === SKILL_NAME);
if (!sessionRow) {
  console.error(`built_in_references[${SKILL_NAME}] not found in ${REGISTRY_PATH}`);
  process.exit(1);
}

// 1. Update the session-grouped row (matches what the upstream parser produces).
sessionRow.invocations_in_window = sessionGrouped.n;
sessionRow.total_tokens_in_window = sessionGrouped.total;
sessionRow.tokens_per_use_avg = sessionGrouped.mean;
sessionRow.tokens_per_use_min = sessionGrouped.min;
sessionRow.tokens_per_use_max = sessionGrouped.max;
sessionRow.tokens_per_use_stddev = sessionGrouped.stddev;
if (lastInvoked) sessionRow.last_invoked = lastInvoked;
// Make the methodology explicit in the row's description so the PDF carries it.
sessionRow.description = 'Claude Code built-in PR code review · session-grouped (current upstream parser)';

// 2. Append (or update) the per-invocation row. uses_per_year scales with the
// invocation count (each /review call counts as one use), so annual_total is
// re-derived from the corrected per-use mean.
const perInvocationUsesPerYear = Math.round((perInvocation.n / args.windowDays) * DAYS_PER_YEAR);
const perInvocationAnnualTotal = perInvocation.mean * perInvocationUsesPerYear;

const perInvocationRow = {
  name: PER_INVOCATION_NAME,
  label: '/review',
  description: 'Claude Code built-in PR code review · per-invocation (corrected via parentUuid → promptId chain)',
  measurement_window_days: args.windowDays,
  invocations_in_window: perInvocation.n,
  total_tokens_in_window: perInvocation.total,
  tokens_per_use_avg: perInvocation.mean,
  tokens_per_use_min: perInvocation.min,
  tokens_per_use_max: perInvocation.max,
  tokens_per_use_stddev: perInvocation.stddev,
  annual_total: perInvocationAnnualTotal,
  uses_per_year: perInvocationUsesPerYear,
  last_invoked: lastInvoked || sessionRow.last_invoked,
  // Carry the same A/B calibration save data — the recipe save itself doesn't
  // change with how we count uses. The regime-mismatch detection in the
  // renderer will correctly decide whether to show the baseline subline (the
  // per-invocation row's 45K cost is BELOW 2× the 72K A/B baseline, so it
  // won't trigger the subline — the math anchors directly now).
  tokens_saved_per_use: sessionRow.tokens_saved_per_use,
  tokens_saved_source: sessionRow.tokens_saved_source,
  calibration_arm_A: sessionRow.calibration_arm_A,
  calibration_arm_B: sessionRow.calibration_arm_B,
  calibration_pct_saved: sessionRow.calibration_pct_saved,
  audit_doc_path: sessionRow.audit_doc_path,
};

const existingPerInvocation = refs.findIndex((r) => r.name === PER_INVOCATION_NAME);
if (existingPerInvocation >= 0) {
  refs[existingPerInvocation] = perInvocationRow;
} else {
  refs.push(perInvocationRow);
}
registry.built_in_references = refs;

fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');

console.log(`/${SKILL_NAME} stats (${args.windowDays}d window):`);
console.log('');
console.log('  SESSION-GROUPED (matches upstream parser):');
console.log(`    N=${sessionGrouped.n} sessions`);
console.log(`    avg ${sessionGrouped.mean.toLocaleString()} tokens / use`);
console.log(`    range ${sessionGrouped.min.toLocaleString()} – ${sessionGrouped.max.toLocaleString()}`);
console.log(`    stddev ${sessionGrouped.stddev.toLocaleString()}`);
console.log('');
console.log('  PER-INVOCATION (corrected via parentUuid chain):');
console.log(`    N=${perInvocation.n} invocations`);
console.log(`    avg ${perInvocation.mean.toLocaleString()} tokens / use`);
console.log(`    range ${perInvocation.min.toLocaleString()} – ${perInvocation.max.toLocaleString()}`);
console.log(`    stddev ${perInvocation.stddev.toLocaleString()}`);
console.log(`    uses/yr extrapolated: ${perInvocationUsesPerYear.toLocaleString()}`);
console.log(`    annual total: ${perInvocationAnnualTotal.toLocaleString()}`);
console.log('');
console.log(`Total in window (both methods should match): session=${sessionGrouped.total.toLocaleString()} per-inv=${perInvocation.total.toLocaleString()}`);
console.log(`Wrote ${REGISTRY_PATH}`);
