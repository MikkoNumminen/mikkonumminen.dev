#!/usr/bin/env node
// Sync the most-recent skill-registry verdict into the static data file consumed
// by the contact-page terminal. This is the FIRST step of the manual
// /skill-localUpdate refresh chain (sync → apply-measurement-overlay →
// build-review-stats → build-skills-pdf), NOT a prebuild step.
//
// The served public/data/skills-registry.json is a locally-enriched canonical
// artifact: the overlay and review-stats passes layer on transcript-measured
// receipts and A/B buckets that require local ~/.claude data and cannot be
// regenerated on a build server. Auto-syncing the raw dated registry on every
// build (as prebuild used to) silently downgraded the committed file to its
// pre-enrichment state. Run /skill-localUpdate to refresh, then commit the result.
//
// Before promotion, the source is validated against the published schema
// (scripts/lib/validate-json-schema.mjs, the same dependency-free validator
// scripts/validate-registry.mjs uses) — a malformed verdict must never reach
// disk, not even to be caught later by the prebuild gate.
//
// ONE SCHEMA, TWO PIPELINE STAGES, AND ONE DELIBERATE RELAXATION. The schema
// describes the SERVED artifact, which is what exists after
// apply-measurement-overlay.mjs has run. `receipt.source` is enumerated there
// because a published receipt is only ever "calibration" or
// "transcript-measurement". But this script consumes the stage BEFORE the
// overlay, where `source` is the scanner's own provenance string —
// "readme.md", "docs/SKILLS.md", "skill-body". Those are correct at this stage
// and become the enumerated values later.
//
// So the source is checked against the schema with exactly that one constraint
// lifted. Validating it unmodified would fail on every real verdict file, and
// the two available shortcuts are both wrong: widening the enum would let a
// provisional value reach the public artifact unnoticed, and dropping the check
// would leave the promotion step unguarded. The served file keeps the strict
// enum via validate-registry.mjs in prebuild.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainst } from './lib/validate-json-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERDICTS_DIR = path.join(ROOT, '.claude', 'agent-verdicts');
const DEST = path.join(ROOT, 'public', 'data', 'skills-registry.json');
const SCHEMA_PATH = path.join(ROOT, 'public', 'data', 'skills-registry.schema.json');
const FILE_RE = /^SKILL-REGISTRY-(\d{4}-\d{2}-\d{2})\.json$/;

export function findLatestSource(verdictsDir) {
  if (!fs.existsSync(verdictsDir)) return null;
  const entries = fs
    .readdirSync(verdictsDir)
    .map((name) => ({ name, match: FILE_RE.exec(name) }))
    .filter((e) => e.match !== null)
    .sort((a, b) => b.match[1].localeCompare(a.match[1]));
  return entries.length > 0 ? path.join(verdictsDir, entries[0].name) : null;
}

/**
 * The published schema with the one post-overlay-only constraint lifted, so it
 * describes the pre-overlay verdict this script actually reads. See the
 * two-stage note at the top of this file for why the enum cannot simply be
 * widened or dropped.
 *
 * Deep-copied, so a caller's schema object is never mutated — this runs in the
 * same process as validate-registry's schema in the test suite.
 */
export function sourceStageSchema(schema) {
  const relaxed = structuredClone(schema);
  // This schema uses draft-07 `definitions`; `$defs` is checked too so a future
  // draft bump does not silently turn this into a no-op that re-breaks the sync.
  const defs = relaxed.definitions ?? relaxed.$defs;
  const source = defs?.receipt?.properties?.source;
  if (!source) {
    throw new Error(
      'sync-skill-registry: could not find receipt.source in the schema. The ' +
        'source-stage relaxation is silently doing nothing — fix this rather ' +
        'than letting the sync fail on every real verdict file.',
    );
  }
  delete source.enum;
  return relaxed;
}

/**
 * Validate `srcBuf` (the raw bytes of a SKILL-REGISTRY-*.json verdict) against
 * `schema`, stamp sync provenance, and — unless `dryRun` — write it to `dest`.
 * Returns `{ ok: true, skipped, data }` or `{ ok: false, errors }`. Never calls
 * process.exit, so it's usable directly from tests.
 */
export function syncBuffer({ srcBuf, srcName, schema, dest, dryRun = false }) {
  let data;
  try {
    data = JSON.parse(srcBuf.toString('utf8'));
  } catch (err) {
    return { ok: false, errors: [`${srcName} is not valid JSON — ${err.message}`] };
  }

  const errors = validateAgainst(data, sourceStageSchema(schema));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Stamp sync provenance separately from generated_at (which reflects the
  // raw scan time and is later overwritten by apply-measurement-overlay.mjs),
  // so which script ran, when, and from what source stay distinguishable in
  // the committed artifact even across repeated syncs of the same source.
  data.synced_from = srcName;
  data.synced_at = new Date().toISOString();

  if (fs.existsSync(dest)) {
    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(dest, 'utf8'));
    } catch {
      existing = null;
    }
    if (existing) {
      const {
        synced_from: _existingFrom,
        synced_at: _existingAt,
        ...existingRest
      } = existing;
      const { synced_from: _newFrom, synced_at: _newAt, ...newRest } = data;
      if (JSON.stringify(existingRest) === JSON.stringify(newRest)) {
        return { ok: true, skipped: true, data: existing };
      }
    }
  }

  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(data, null, 2) + '\n');
  }

  return { ok: true, skipped: false, data };
}

/**
 * `--dry-run` validates and reports without writing.
 *
 * WHY THIS FLAG EXISTS: running this script bare REPLACES the committed
 * `public/data/skills-registry.json` with the raw pre-overlay verdict, throwing
 * away every measurement receipt that `apply-measurement-overlay.mjs` added.
 * That is correct behaviour as step 1 of the /skill-localUpdate chain and
 * destructive anywhere else — and it is exactly what happens if someone runs
 * the command to check that a change to this file works. It did. Verification
 * now has a safe form, so nobody has to choose between not testing and
 * clobbering the served artifact.
 */
function main() {
  const dryRun = process.argv.includes('--dry-run');
  const src = findLatestSource(VERDICTS_DIR);

  if (!src) {
    console.log(
      'sync-skill-registry: no source file found — run the skill-registry skill at' +
        ' .claude/skills/skill-registry/ to generate one. Skipping copy.',
    );
    process.exit(0);
  }

  const srcBuf = fs.readFileSync(src);
  const srcName = path.basename(src);
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const result = syncBuffer({ srcBuf, srcName, schema, dest: DEST, dryRun });

  if (!result.ok) {
    console.error(
      `sync-skill-registry: ${result.errors.length} schema violation(s) in ${srcName} — refusing to promote it:`,
    );
    for (const e of result.errors.slice(0, 30)) console.error(`  - ${e}`);
    process.exit(1);
  }

  if (result.skipped) {
    console.log(`sync-skill-registry: already in sync (${srcName})`);
    process.exit(0);
  }

  console.log(
    dryRun
      ? `sync-skill-registry: ${srcName} validates and would be promoted (--dry-run, nothing written)`
      : `sync-skill-registry: copied ${src} → ${DEST}`,
  );
}

// Only auto-run when invoked as the CLI entrypoint, not when imported (e.g. by tests).
const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) main();
