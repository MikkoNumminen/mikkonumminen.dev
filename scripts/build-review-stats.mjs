#!/usr/bin/env node
// Scan ~/.claude/projects/ JSONLs and refresh per-invocation token stats
// on transcript-measured rows in public/data/skills-registry.json.
//
// Two passes:
//
//   1. /review built-in — walks the parentUuid chain from every
//      review-attributed assistant message to the originating user
//      message and uses that message's promptId as the invocation ID.
//      Each distinct (sessionId, promptId) is one /review call. Writes
//      the per-invocation cost stats AND the bucketed A/B-save numbers
//      onto `built_in_references[name === 'review']`. Replaces the
//      upstream skill-usage parser's session-grouped figure, which
//      collapses every /review call inside one Claude Code session into
//      one "invocation" and overstates tokens-per-use whenever a session
//      contains multiple runs (336 /review calls landed in 14 sessions
//      → upstream divides by 14, this script divides by 336).
//
//   2. Other transcript-measured skills with N≥2 invocations in the
//      window — same per-invocation accounting as pass 1 (group by
//      (sessionId, promptId) via parentUuid chain). Writes median +
//      mean + min/max/σ to each matching `repos[].skills[].receipt` so
//      the renderer can headline the median instead of the upstream
//      mean. Skills with N<2 (single transcript hit) are left alone —
//      no distribution to medianize.
//
// Token-accounting and dedupe convention match upstream scan.mjs:
// (sessionId, requestId) dedupe so the thinking + tool_use double-line
// doesn't double-count, exclude cache_read because those tokens were
// paid upstream.
//
// Chain order: run AFTER `node scripts/apply-measurement-overlay.mjs`.
// Overlay writes the upstream session-grouped figures; this script
// replaces them with per-invocation accounting on /review and on every
// other transcript-measured row with N≥2 invocations (second-write
// wins). After this pass the volume fields are coherent — both
// `invocations_in_window` and `total_tokens_in_window` reflect the
// per-invocation walk (NOT the upstream session count), and
// `uses_per_year` / `annual_total` are re-derived from those. Not
// chained into prebuild because it reads local user data under
// ~/.claude/projects/.
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
const REVIEW_SKILL = 'review';
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
  return (
    (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  );
}

function stats(values) {
  if (values.length === 0) return null;
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const min = values.reduce((a, b) => (a < b ? a : b));
  const max = values.reduce((a, b) => (a > b ? a : b));
  // Population variance, not sample — the values ARE the full 90-day window,
  // not a sample drawn from a wider population. Matches the convention used
  // by the upstream skill-usage parser for the same series.
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const med = n % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  return {
    n,
    total: sum,
    mean: Math.round(mean),
    median: med,
    min,
    max,
    stddev: Math.round(stddev),
  };
}

// Walk each JSONL once, capture every assistant message attributed to ANY
// skill AND build per-file uuid → message maps so we can chain-walk to find
// each invocation's originating user message promptId. Returns records keyed
// by skill name so the two passes (review-specific + generic) share one walk.
function scanAllFiles(files, cutoffMs) {
  const bySkill = new Map(); // skill -> records[]
  const byUuidPerFile = []; // per-file { byUuid, records } for chain walking
  const lastInvokedBySkill = new Map(); // skill -> latest ISO ts seen

  for (const f of files) {
    let content;
    try {
      content = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const byUuid = new Map();
    const fileRecords = [];

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.uuid) byUuid.set(obj.uuid, obj);
      if (obj.type !== 'assistant') continue;
      const skill = obj.attributionSkill;
      if (!skill) continue;
      if (!obj.message?.usage || !obj.requestId) continue;
      const t = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (!Number.isFinite(t) || t < cutoffMs) continue;
      fileRecords.push(obj);
      if (!bySkill.has(skill)) bySkill.set(skill, []);
      bySkill.get(skill).push(obj);
      const prevLast = lastInvokedBySkill.get(skill) ?? '';
      if (obj.timestamp && obj.timestamp > prevLast) {
        lastInvokedBySkill.set(skill, obj.timestamp);
      }
    }

    if (fileRecords.length === 0) continue;
    byUuidPerFile.push({ byUuid, records: fileRecords });
  }
  return { bySkill, byUuidPerFile, lastInvokedBySkill };
}

// Resolve each skill-attributed assistant message to its originating
// user-message promptId by walking parentUuid up the chain. Cap the walk
// at 200 hops for safety on malformed transcripts; in practice the chain
// depth is always small (a few tool-use round trips).
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
  console.log(
    `No ~/.claude/projects/ found — skipping transcript stats refresh (existing stats preserved).`,
  );
  process.exit(0);
}

const files = listJsonlFiles(PROJECTS_DIR);
const { bySkill, byUuidPerFile, lastInvokedBySkill } = scanAllFiles(files, cutoffMs);

const reviewRecords = bySkill.get(REVIEW_SKILL) ?? [];
if (reviewRecords.length === 0) {
  console.log(
    `No /${REVIEW_SKILL} invocations found in the last ${args.windowDays} days — skipping stats refresh.`,
  );
  process.exit(0);
}

const invocationIdByRecord = resolveInvocationIds(byUuidPerFile);
const perInvocation = stats(
  bucketTokens(reviewRecords, (r) => {
    const id = invocationIdByRecord.get(`${r.sessionId}|${r.requestId}`);
    return `${r.sessionId}|${id}`;
  }),
);
const lastInvoked = lastInvokedBySkill.get(REVIEW_SKILL) ?? '';

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
  { pr: 75, lines: 86, arm_A: 19841, arm_B: 18556, bucket: 'small' },
  // med: 200-799 lines · 26% of production
  { pr: 23, lines: 244, arm_A: 43317, arm_B: 31993, bucket: 'med' },
  { pr: 168, lines: 599, arm_A: 60017, arm_B: 56122, bucket: 'med' },
  { pr: 143, lines: 245, arm_A: 39027, arm_B: 21263, bucket: 'med' },
  // large: 800-2499 lines · 7% of production
  { pr: 63, lines: 1066, arm_A: 38037, arm_B: 32510, bucket: 'large' },
  { pr: 60, lines: 926, arm_A: 49077, arm_B: 41234, bucket: 'large' },
  { pr: 90, lines: 1183, arm_A: 32951, arm_B: 42580, bucket: 'large' },
  // xlarge: 2500+ lines · 3% of production (only 2 unique PRs available)
  { pr: 91, lines: 3977, arm_A: 45400, arm_B: 41821, bucket: 'xlarge' },
  { pr: 13, lines: 3806, arm_A: 88573, arm_B: 113093, bucket: 'xlarge' },
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
  small: 0.63,
  med: 0.26,
  large: 0.07,
  xlarge: 0.03,
};

const BUCKET_LABEL_LINES = {
  small: '0–199 lines',
  med: '200–799 lines',
  large: '800–2499 lines',
  xlarge: '2500+ lines',
};

// Pick the bucket containing the 50th percentile of production invocations.
// Walks the weights in declared order accumulating until the cumulative share
// crosses 0.5 — that's the band the median PR sits in, and therefore the
// band the median production cost was incurred in. Used to anchor the
// headline save to the same point of the distribution as the headline cost.
// Bucket weights are intentionally close to (but not exactly) 1.0 (rounding
// loss across 4 buckets), so we tolerate the sum being shy of 1.
function pickTypicalBucket(weights) {
  let cumulative = 0;
  for (const [name, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (cumulative >= 0.5) return name;
  }
  // Cumulative never reached 0.5 — degenerate weights. Fall back to the
  // last named bucket so downstream code at least gets a defined value.
  return Object.keys(weights).pop();
}

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
  const weightedPct =
    weightedArmANormalized > 0
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

// Drop any prior split-row artifact ('review-per-invocation') left over from
// the two-row design. The /review row below is now canonical and carries the
// per-invocation accounting directly.
const splitIdx = refs.findIndex((r) => r.name === 'review-per-invocation');
if (splitIdx >= 0) refs.splice(splitIdx, 1);

const reviewRow = refs.find((r) => r.name === REVIEW_SKILL);
if (!reviewRow) {
  console.error(`built_in_references[${REVIEW_SKILL}] not found in ${REGISTRY_PATH}`);
  process.exit(1);
}

// Per-invocation cost stats — uses_per_year scales with the invocation count
// (each /review call counts as one use), so annual_total is re-derived from
// the per-use mean (annual_total is a sum, not a typical-use figure, so it
// keeps using the mean even though the headline is the median).
const usesPerYear = Math.round((perInvocation.n / args.windowDays) * DAYS_PER_YEAR);
const annualTotal = perInvocation.mean * usesPerYear;

reviewRow.label = '/review';
reviewRow.description = 'Claude Code built-in PR code review';
reviewRow.measurement_window_days = args.windowDays;
reviewRow.invocations_in_window = perInvocation.n;
reviewRow.total_tokens_in_window = perInvocation.total;
// Headline: median, not mean. Right-skewed distributions (a handful of huge
// PRs pulling the mean above what one typical /review costs) make the median
// the honest "what does one /review cost" number; mean + range + σ stay on
// the row for the reader who wants the spread.
reviewRow.tokens_per_use_avg = perInvocation.median;
reviewRow.tokens_per_use_mean = perInvocation.mean;
reviewRow.tokens_per_use_min = perInvocation.min;
reviewRow.tokens_per_use_max = perInvocation.max;
reviewRow.tokens_per_use_stddev = perInvocation.stddev;
reviewRow.annual_total = annualTotal;
reviewRow.uses_per_year = usesPerYear;
if (lastInvoked) reviewRow.last_invoked = lastInvoked;

// A/B save: bucket-aligned with the cost headline. The cost headline is the
// MEDIAN production /review run; the typical run lives in whichever bucket
// holds the 50th percentile of production invocations (small at 63% — easily
// the median bucket). Headline save uses THAT bucket's measured A/B median so
// cost and save describe the same point of the distribution; the aggregate
// across-bucket weighted figure moves into a sub-label alongside the
// per-bucket breakdown.
const typicalBucketName = pickTypicalBucket(BUCKET_WEIGHTS);
const typical = ab.buckets[typicalBucketName];
if (!typical) {
  console.error(
    `bucket '${typicalBucketName}' has no A/B runs — cannot anchor headline save`,
  );
  process.exit(1);
}
reviewRow.tokens_saved_per_use = typical.saved_median;
reviewRow.calibration_arm_A = typical.arm_A_median;
reviewRow.calibration_arm_B = typical.arm_A_median - typical.saved_median;
reviewRow.calibration_pct_saved = typical.pct_median;
// The headline save now describes one specific bucket's typical A/B run.
// Tagging the source lets a downstream consumer tell this apart from the
// older 'weighted-bucket-median' aggregate.
reviewRow.calibration_arm_A_source = `${typicalBucketName}-bucket-median`;
reviewRow.calibration_headline_bucket = typicalBucketName;
// Preserve the across-bucket aggregate for the sub-label and for any
// downstream consumer that wants the population-weighted number.
reviewRow.calibration_aggregate_saved_per_use = ab.weighted_saved_per_use;
reviewRow.calibration_aggregate_arm_A = ab.weighted_arm_A;
reviewRow.calibration_aggregate_pct_saved = ab.weighted_pct;
reviewRow.calibration_ab_runs = ab.runs;
reviewRow.calibration_ab_count = ab.n;
reviewRow.calibration_save_pct_min = ab.overall_pct_min;
reviewRow.calibration_save_pct_max = ab.overall_pct_max;
reviewRow.calibration_ab_lines_min = ab.overall_lines_min;
reviewRow.calibration_ab_lines_max = ab.overall_lines_max;
reviewRow.calibration_ab_buckets = ab.buckets;
reviewRow.calibration_ab_bucket_weights = ab.bucket_weights;
reviewRow.calibration_ab_bucket_labels = BUCKET_LABEL_LINES;

// ---------------------------------------------------------------------------
// Pass 2 — generic transcript-stats refresh for non-/review skills with
// N≥2 invocations. Same per-invocation accounting as pass 1; just widens the
// scope so the renderer can headline median instead of mean across the board.
// Single-invocation skills (N=1) are not touched — there's no distribution.
// ---------------------------------------------------------------------------

function statsForSkill(skill) {
  const recs = bySkill.get(skill) ?? [];
  if (recs.length === 0) return null;
  const perInv = bucketTokens(recs, (r) => {
    const id = invocationIdByRecord.get(`${r.sessionId}|${r.requestId}`);
    return `${r.sessionId}|${id}`;
  });
  return stats(perInv);
}

// Match registry rows to skill-attribution names. The transcript records use
// the installed prefix (e.g. "mikko-audit"), while the registry stores the
// canonical name ("audit"). The upstream skill-usage parser collapses both
// onto the registry name; mirror that here so the rebuilt receipts line up.
function candidateAttributionNames(repoName, skillName) {
  const out = new Set([skillName]);
  // claude-skills library installs into ~/.claude/skills/ with the
  // mikko- prefix; transcripts capture the prefixed name.
  if (repoName === 'claude-skills') out.add(`mikko-${skillName}`);
  return [...out];
}

let medianUpdated = 0;
for (const repo of registry.repos ?? []) {
  for (const skill of repo.skills ?? []) {
    const rec = skill.receipt;
    if (!rec || rec.source !== 'transcript-measurement') continue;
    // Find the best matching scanned skill — try canonical then prefixed.
    let matched = null;
    for (const candidate of candidateAttributionNames(repo.name, skill.name)) {
      const s = statsForSkill(candidate);
      if (s && s.n >= 2) {
        // Pick the candidate with the most invocations — handles the case
        // where transcripts also exist for a now-renamed skill.
        if (!matched || s.n > matched.n) matched = s;
      }
    }
    if (!matched) continue;
    rec.tokens_per_use = matched.median;
    rec.tokens_per_use_mean = matched.mean;
    rec.tokens_per_use_min = matched.min;
    rec.tokens_per_use_max = matched.max;
    rec.tokens_per_use_stddev = matched.stddev;
    // Recompute the volume fields off the per-invocation walk so the receipt
    // is internally consistent: invocations_in_window now counts distinct
    // skill invocations (not the upstream parser's session approximation),
    // total_tokens_in_window is the actual sum from this walk, and the
    // annual projections fall out of those. Mean (not median) is the right
    // anchor for annual_total — it's a sum-extrapolation, not a typical-use
    // figure. Keeps `tokens_per_use × invocations_in_window ≈
    // total_tokens_in_window` honest for any downstream JSON consumer.
    rec.invocations_in_window = matched.n;
    rec.total_tokens_in_window = matched.total;
    rec.uses_per_year = Math.round((matched.n / args.windowDays) * DAYS_PER_YEAR);
    rec.annual_total = matched.mean * rec.uses_per_year;
    medianUpdated++;
  }
}

fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');

console.log(`/${REVIEW_SKILL} per-invocation stats (${args.windowDays}d window):`);
console.log(`  N=${perInvocation.n} invocations`);
console.log(`  median ${perInvocation.median.toLocaleString()} tokens / use  (headline)`);
console.log(`  mean   ${perInvocation.mean.toLocaleString()}`);
console.log(
  `  range  ${perInvocation.min.toLocaleString()} – ${perInvocation.max.toLocaleString()}`,
);
console.log(`  stddev ${perInvocation.stddev.toLocaleString()}`);
console.log(
  `  uses/yr extrapolated: ${usesPerYear.toLocaleString()} · annual total: ${annualTotal.toLocaleString()}`,
);
console.log('');
console.log(`  A/B SAVE (N=${ab.n} runs across 4 size buckets):`);
for (const [name, bucket] of Object.entries(ab.buckets)) {
  const w = (ab.bucket_weights[name] * 100).toFixed(0);
  console.log(
    `    ${name.padEnd(7)} (${BUCKET_LABEL_LINES[name].padEnd(14)} · ${w}% of prod): N=${bucket.n} · median saved ${bucket.saved_median.toLocaleString()} (${bucket.pct_median}%) · range ${bucket.pct_min}%–${bucket.pct_max}%`,
  );
}
console.log(
  `    weighted: ${ab.weighted_saved_per_use.toLocaleString()} tokens saved / use (${ab.weighted_pct}%)`,
);
console.log(
  `    overall pct range across all ${ab.n} runs: ${ab.overall_pct_min}%–${ab.overall_pct_max}%`,
);
console.log('');
console.log(
  `Generic transcript-stats pass: ${medianUpdated} non-/review receipt(s) updated with median + spread.`,
);
console.log(`Wrote ${REGISTRY_PATH}`);
