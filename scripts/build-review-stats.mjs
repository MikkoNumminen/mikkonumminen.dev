#!/usr/bin/env node
// Scan ~/.claude/projects/ JSONLs for /review invocations, compute per-session
// token totals (input + output + cache_creation; exclude cache_read), then
// derive avg / min / max / stddev across the N sessions and merge the
// statistics into public/data/skills-registry.json under
// built_in_references[/review].
//
// Token-accounting and dedupe convention match upstream
// claude-skills/skills/skill-usage/scan.mjs: dedupe by (sessionId, requestId)
// so the two-line thinking+tool_use case doesn't double-count, group by
// sessionId so one /review run = one invocation = one session, exclude
// cache_read because those tokens were paid upstream.
//
// The renderer (build-skills-pdf.mjs) reads the new stat fields and adds a
// subline beneath /review's cost cell — "avg of N runs · range LO–HI · σ S".
// No upstream change to claude-skills required; runs entirely off local data.
//
// Usage: node scripts/build-review-stats.mjs [--window-days 90]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'public', 'data', 'skills-registry.json');
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const SKILL_NAME = 'review';

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

function scanReviewRecords(files, cutoffMs) {
  // One record per assistant message with attributionSkill === SKILL_NAME.
  const records = [];
  for (const f of files) {
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type !== 'assistant') continue;
      if (obj.attributionSkill !== SKILL_NAME) continue;
      if (!obj.message?.usage || !obj.requestId) continue;
      const t = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (!Number.isFinite(t) || t < cutoffMs) continue;
      records.push({
        sessionId: obj.sessionId ?? '__unknown__',
        requestId: obj.requestId,
        timestamp: obj.timestamp,
        usage: obj.message.usage,
      });
    }
  }
  return records;
}

function perSessionTotals(records) {
  // Dedupe (sessionId, requestId) — adjacent thinking + tool_use lines share
  // requestId and usage; counting both double-counts.
  const seen = new Set();
  const bySession = new Map();
  let lastInvoked = '';
  for (const r of records) {
    const dedupeKey = `${r.sessionId}|${r.requestId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const u = r.usage;
    const cost = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    bySession.set(r.sessionId, (bySession.get(r.sessionId) ?? 0) + cost);
    if (r.timestamp > lastInvoked) lastInvoked = r.timestamp;
  }
  return { perSession: [...bySession.values()], lastInvoked };
}

function stats(values) {
  if (values.length === 0) return null;
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Population stddev — we have the full window, not a sample of it.
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return {
    n,
    total: sum,
    mean: Math.round(mean),
    min,
    max,
    stddev: Math.round(stddev),
  };
}

const args = parseArgs(process.argv.slice(2));
const cutoffMs = Date.now() - args.windowDays * 86_400_000;

const files = listJsonlFiles(PROJECTS_DIR);
const records = scanReviewRecords(files, cutoffMs);
const { perSession, lastInvoked } = perSessionTotals(records);
const s = stats(perSession);

if (!s) {
  console.error(`No /${SKILL_NAME} invocations found in the last ${args.windowDays} days.`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const ref = (registry.built_in_references ?? []).find((r) => r.name === SKILL_NAME);
if (!ref) {
  console.error(`built_in_references[${SKILL_NAME}] not found in ${REGISTRY_PATH}`);
  process.exit(1);
}

// Merge: keep existing fields, add the new accuracy stats. The renderer reads
// `tokens_per_use_avg` for the headline number (unchanged), and the four new
// fields below for the subline.
ref.invocations_in_window = s.n;
ref.total_tokens_in_window = s.total;
ref.tokens_per_use_avg = s.mean;
ref.tokens_per_use_min = s.min;
ref.tokens_per_use_max = s.max;
ref.tokens_per_use_stddev = s.stddev;
if (lastInvoked) ref.last_invoked = lastInvoked;

fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');

console.log(`/${SKILL_NAME} stats (${args.windowDays}d window):`);
console.log(`  N=${s.n} sessions`);
console.log(`  avg ${s.mean.toLocaleString()} tokens / use`);
console.log(`  range ${s.min.toLocaleString()} – ${s.max.toLocaleString()}`);
console.log(`  σ ${s.stddev.toLocaleString()}`);
console.log(`  total ${s.total.toLocaleString()} in window`);
console.log(`Wrote ${REGISTRY_PATH}`);
