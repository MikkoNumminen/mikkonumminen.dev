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

// A/B calibrations for /review's save rate, measured across N=11 real PRs
// spanning the production size distribution. Each PR is bucketed by its
// diff size (additions + deletions); each bucket gets a median save number
// + range, and the headline is the bucket medians weighted by each bucket's
// share of production invocations (so a small-PR-heavy workload doesn't
// over-weight the toy-end of the spread).
//
// Bucket weights come from walking the 337 per-invocation /review records
// in the 90-day window, extracting the PR number from each invocation's
// originating user message + tool calls, looking up the PR size via gh CLI,
// and computing the fraction in each bucket. The weights below are frozen
// snapshots from that walk; refresh them by re-running
// `python scripts/bucket-review-invocations.py` and updating BUCKET_WEIGHTS
// + REVIEW_AB_RUNS below to match the new distribution.
//
// Each entry: arm A is a cold Sonnet sub-agent given a generic "review PR
// #N" task; arm B is a Sonnet sub-agent given the literal /review builtin
// prompt. Same dispatch shape as the original PR #149 calibration.
const REVIEW_AB_RUNS = [
  // small: 0-199 lines · 63% of production /review invocations
  { pr: 149, lines: 292, arm_A: 72170, arm_B: 26432, bucket: 'small' },
  { pr: 167, lines: 174, arm_A: 50194, arm_B: 28319, bucket: 'small' },
  { pr: 75,  lines:  86, arm_A: 19841, arm_B: 18556, bucket: 'small' },
  // med: 200-799 lines · 26% of production
  { pr: 23,  lines: 244, arm_A: 43317, arm_B: 31993, bucket: 'med' },
  { pr: 168, lines: 599, arm_A: 60017, arm_B: 56122, bucket: 'med' },
  { pr: 143, lines: 245, arm_A: 39027, arm_B: 21263, bucket: 'med' },
  // large: 800-2499 lines · 7% of production
  { pr: 63,  lines:1066, arm_A: 38037, arm_B: 32510, bucket: 'large' },
  { pr: 60,  lines: 926, arm_A: 49077, arm_B: 41234, bucket: 'large' },
  { pr: 90,  lines:1183, arm_A: 32951, arm_B: 42580, bucket: 'large' },
  // xlarge: 2500+ lines · 3% of production (only 2 unique PRs available)
  { pr: 91,  lines:3977, arm_A: 45400, arm_B: 41821, bucket: 'xlarge' },
  { pr: 13,  lines:3806, arm_A: 88573, arm_B:113093, bucket: 'xlarge' },
];

// Production invocation weights per bucket — derived from the per-PR walk
// over the 337 mapped /review invocations. Used for the weighted headline
// save figure. The remainder (~69% of all invocations) couldn't be mapped
// to a PR number and is excluded from the weighting; the relative fractions
// among mapped invocations stay the most defensible estimate.
//
// These are rounded production fractions and intentionally sum to 0.99,
// not 1.00 (rounding loss across 4 buckets). The aggregator in
// summarizeAbRuns renormalizes by the total active weight, so don't
// "fix" the sum to 1.00 — it would silently shift the headline.
const BUCKET_WEIGHTS = {
  small:  0.63,
  med:    0.26,
  large:  0.07,
  xlarge: 0.03,
};

const BUCKET_LABEL_LINES = {
  small:  '0–199 lines',
  med:    '200–799 lines',
  large:  '800–2499 lines',
  xlarge: '2500+ lines',
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function summarizeBucket(runs) {
  if (runs.length === 0) return null;
  const saved = runs.map((r) => r.arm_A - r.arm_B);
  const armA = runs.map((r) => r.arm_A);
  const pcts = runs.map((r) => Math.round(((r.arm_A - r.arm_B) / r.arm_A) * 100));
  // The per-PR runs aren't repeated here — they live on the parent row's
  // calibration_ab_runs array with a `bucket` field, so downstream consumers
  // can rehydrate per-bucket runs via `runs.filter(r => r.bucket === name)`
  // without doubling the JSON.
  return {
    n: runs.length,
    saved_median: median(saved),
    saved_min: saved.reduce((a, b) => (a < b ? a : b)),
    saved_max: saved.reduce((a, b) => (a > b ? a : b)),
    arm_A_median: median(armA),
    pct_median: median(pcts),
    pct_min: pcts.reduce((a, b) => (a < b ? a : b)),
    pct_max: pcts.reduce((a, b) => (a > b ? a : b)),
    lines_min: runs.map((r) => r.lines).reduce((a, b) => (a < b ? a : b)),
    lines_max: runs.map((r) => r.lines).reduce((a, b) => (a > b ? a : b)),
  };
}

function summarizeAbRuns(runs, weights) {
  const byBucket = {};
  for (const r of runs) {
    if (!byBucket[r.bucket]) byBucket[r.bucket] = [];
    byBucket[r.bucket].push(r);
  }
  const buckets = {};
  for (const [name, bucketRuns] of Object.entries(byBucket)) {
    buckets[name] = summarizeBucket(bucketRuns);
  }
  // Weighted headline: each bucket's median save × bucket's production share.
  // Skip buckets with no data (weight reallocated implicitly).
  let weightedSaved = 0;
  let weightedArmA = 0;
  let activeWeight = 0;
  for (const [name, w] of Object.entries(weights)) {
    const b = buckets[name];
    if (!b) continue;
    weightedSaved += w * b.saved_median;
    weightedArmA += w * b.arm_A_median;
    activeWeight += w;
  }
  // Renormalize over active weight so 100% adds to 100% even if a bucket is
  // missing.
  const weightedSavedNormalized = activeWeight > 0 ? weightedSaved / activeWeight : 0;
  const weightedArmANormalized = activeWeight > 0 ? weightedArmA / activeWeight : 0;
  const weightedPct = weightedArmANormalized > 0
    ? Math.round((weightedSavedNormalized / weightedArmANormalized) * 100)
    : 0;
  const allPcts = runs.map((r) => Math.round(((r.arm_A - r.arm_B) / r.arm_A) * 100));
  return {
    n: runs.length,
    buckets,
    bucket_weights: weights,
    weighted_saved_per_use: Math.round(weightedSavedNormalized),
    weighted_arm_A: Math.round(weightedArmANormalized),
    weighted_pct: weightedPct,
    overall_pct_min: allPcts.reduce((a, b) => (a < b ? a : b)),
    overall_pct_max: allPcts.reduce((a, b) => (a > b ? a : b)),
    overall_lines_min: runs.map((r) => r.lines).reduce((a, b) => (a < b ? a : b)),
    overall_lines_max: runs.map((r) => r.lines).reduce((a, b) => (a > b ? a : b)),
    runs,
  };
}

const ab = summarizeAbRuns(REVIEW_AB_RUNS, BUCKET_WEIGHTS);

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

// Replace the single-PR save numbers with the bucketed weighted figure.
// Both /review rows share these — save is independent of how the cost is
// decomposed. The per-bucket breakdown + per-PR runs are preserved on the
// row's calibration_ab_buckets / calibration_ab_runs arrays so any
// downstream consumer can drill into the spread.
sessionRow.tokens_saved_per_use = ab.weighted_saved_per_use;
sessionRow.calibration_arm_A = ab.weighted_arm_A;
sessionRow.calibration_arm_B = ab.weighted_arm_A - ab.weighted_saved_per_use;
sessionRow.calibration_pct_saved = ab.weighted_pct;
// arm_A above is a synthetic weighted-bucket-median value, not any single
// A/B run's baseline. The source tag makes that explicit for downstream
// consumers reading the field directly.
sessionRow.calibration_arm_A_source = 'weighted-bucket-median';
sessionRow.calibration_ab_runs = ab.runs;
sessionRow.calibration_ab_count = ab.n;
sessionRow.calibration_save_pct_min = ab.overall_pct_min;
sessionRow.calibration_save_pct_max = ab.overall_pct_max;
sessionRow.calibration_ab_lines_min = ab.overall_lines_min;
sessionRow.calibration_ab_lines_max = ab.overall_lines_max;
sessionRow.calibration_ab_buckets = ab.buckets;
sessionRow.calibration_ab_bucket_weights = ab.bucket_weights;
sessionRow.calibration_ab_bucket_labels = BUCKET_LABEL_LINES;

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
  // `lastInvoked` is guaranteed set here — the records-length early-exit
  // above only proceeds when we found at least one /review record, and the
  // scanner only adds records with valid timestamps. Same value used on the
  // session-grouped row above.
  last_invoked: lastInvoked,
  // Carry the same A/B calibration save data — the recipe save itself doesn't
  // change with how we count uses. The regime-mismatch detection in the
  // renderer will correctly decide whether to show the baseline subline (the
  // per-invocation row's cost is BELOW 2× the avg A/B baseline, so it
  // won't trigger the subline — the math anchors directly now).
  tokens_saved_per_use: sessionRow.tokens_saved_per_use,
  tokens_saved_source: sessionRow.tokens_saved_source,
  calibration_arm_A: sessionRow.calibration_arm_A,
  calibration_arm_B: sessionRow.calibration_arm_B,
  calibration_pct_saved: sessionRow.calibration_pct_saved,
  calibration_arm_A_source: sessionRow.calibration_arm_A_source,
  calibration_ab_runs: sessionRow.calibration_ab_runs,
  calibration_ab_count: sessionRow.calibration_ab_count,
  calibration_save_pct_min: sessionRow.calibration_save_pct_min,
  calibration_save_pct_max: sessionRow.calibration_save_pct_max,
  calibration_ab_lines_min: sessionRow.calibration_ab_lines_min,
  calibration_ab_lines_max: sessionRow.calibration_ab_lines_max,
  calibration_ab_buckets: sessionRow.calibration_ab_buckets,
  calibration_ab_bucket_weights: sessionRow.calibration_ab_bucket_weights,
  calibration_ab_bucket_labels: sessionRow.calibration_ab_bucket_labels,
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
console.log('');
console.log(`  A/B SAVE (N=${ab.n} runs across 4 size buckets):`);
for (const [name, bucket] of Object.entries(ab.buckets)) {
  const w = (ab.bucket_weights[name] * 100).toFixed(0);
  console.log(`    ${name.padEnd(7)} (${BUCKET_LABEL_LINES[name].padEnd(14)} · ${w}% of prod): N=${bucket.n} · median saved ${bucket.saved_median.toLocaleString()} (${bucket.pct_median}%) · range ${bucket.pct_min}%–${bucket.pct_max}%`);
}
console.log(`    weighted: ${ab.weighted_saved_per_use.toLocaleString()} tokens saved / use (${ab.weighted_pct}%)`);
console.log(`    overall pct range across all ${ab.n} runs: ${ab.overall_pct_min}%–${ab.overall_pct_max}%`);
console.log('');
console.log(`Wrote ${REGISTRY_PATH}`);
