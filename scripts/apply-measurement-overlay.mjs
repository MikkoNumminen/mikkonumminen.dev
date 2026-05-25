#!/usr/bin/env node
// Overlay transcript-measured token figures from
// .claude/agent-verdicts/SKILL-USAGE-LATEST.json onto
// public/data/skills-registry.json. Measured rows replace whatever receipt
// they had before; unmeasured rows are untouched. Recomputes totals.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Must match the default prefix `install-mikko.sh` applies when copying
// library skills into ~/.claude/skills/. If someone runs the installer
// with `--prefix bobs-` (or similar), update this constant to match — the
// usage scanner records the installed name, not the canonical library name.
const INSTALL_PREFIX = 'mikko-';
const LIBRARY_REPO = 'claude-skills';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'public', 'data', 'skills-registry.json');
const USAGE = path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-USAGE-LATEST.json');
const CALIBRATION = path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-LATEST.json');
const CALIBRATION_BUILTINS = path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-BUILTINS-LATEST.json');
const CALIBRATION_AUDIOBOOKMAKER = path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-AUDIOBOOKMAKER-LATEST.json');
const CALIBRATION_CLAUDESKILLS = path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-CLAUDESKILLS-LATEST.json');
const CALIBRATION_MN_DEV = path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-MIKKONUMMINEN-DEV-LATEST.json');

// Multi-model calibration files (Opus + Haiku). Each mirrors the corresponding
// Sonnet file's schema with a top-level `model` field. Sonnet remains the
// primary measurement that drives tokens_per_use and tokens_saved_per_use on
// the receipt; alt-model measurements attach to s.receipt.alt_model_measurements
// as a record keyed by model name, so the PDF can render side-by-side.
// Haiku files are placeholders today (skills array with null tokens) — they
// exist so the rendering pipeline can show a "pending" column without
// schema gymnastics.
const ALT_MODEL_CALIBRATION_FILES = [
  { model: 'opus',  file: path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-OPUS-SAMPLE-LATEST.json'),               receipt: '.claude/agent-verdicts/SKILL-CALIBRATION-OPUS-SAMPLE-LATEST.json' },
  { model: 'haiku', file: path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-HAIKU-SAMPLE-LATEST.json'),              receipt: '.claude/agent-verdicts/SKILL-CALIBRATION-HAIKU-SAMPLE-LATEST.json' },
  { model: 'haiku', file: path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-BUILTINS-HAIKU-LATEST.json'),             receipt: '.claude/agent-verdicts/SKILL-CALIBRATION-BUILTINS-HAIKU-LATEST.json' },
  { model: 'haiku', file: path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-AUDIOBOOKMAKER-HAIKU-LATEST.json'),       receipt: '.claude/agent-verdicts/SKILL-CALIBRATION-AUDIOBOOKMAKER-HAIKU-LATEST.json' },
  { model: 'haiku', file: path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-CLAUDESKILLS-HAIKU-LATEST.json'),         receipt: '.claude/agent-verdicts/SKILL-CALIBRATION-CLAUDESKILLS-HAIKU-LATEST.json' },
  { model: 'haiku', file: path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-MIKKONUMMINEN-DEV-HAIKU-LATEST.json'),    receipt: '.claude/agent-verdicts/SKILL-CALIBRATION-MIKKONUMMINEN-DEV-HAIKU-LATEST.json' },
  { model: 'haiku', file: path.join(ROOT, '.claude', 'agent-verdicts', 'SKILL-CALIBRATION-SPACEPOTATIS-HAIKU-LATEST.json'),         receipt: '.claude/agent-verdicts/SKILL-CALIBRATION-SPACEPOTATIS-HAIKU-LATEST.json' },
];

// Sample-sessionId → repo lookup. Sessions live under
// ~/.claude/projects/<dir>/<sessionId>.jsonl; each <dir> maps to one repo.
// Verified manually for the 2026-05-20 90-day window.
//
// TODO (PR #122 review followup): this map rots — sessionIds from future
// scanner runs won't be here and will silently skip with "unknown session".
// Two fixes, in increasing cleanliness:
//   (a) derive the mapping at runtime by checking which
//       `~/.claude/projects/<dir>/<sessionId>.jsonl` file exists, OR
//   (b) add a `repo` field to each row in SKILL-USAGE-LATEST.json upstream in
//       skill-usage/scan.mjs (canonical fix — removes this map entirely).
const SESSION_TO_REPO = {
  '3b219a03-2024-4372-b270-a13237480b7e': 'AudiobookMaker',
  '6e537f60-3404-4bc0-b9c9-fd3d1a6c340d': 'AudiobookMaker',
  '4a938199-6bea-4ec0-b86f-901ab6faa515': 'AudiobookMaker',
  '89216c3d-52b2-4763-a770-fd7502176a12': 'AudiobookMaker',
  'a36d05d7-450e-41ca-9d2c-602c40a5d2de': 'Spacepotatis',
  'ac357e75-ba76-4889-af17-2d9295c3b5df': 'Spacepotatis',
  'c168355a-2563-4dbf-89bc-f36cc21f96aa': 'mikkonumminen.dev',
  '397c4ce8-dcec-4a2e-a4ce-c46cc23397ec': 'mikkonumminen.dev',
  'de3894ce-bc85-4172-b059-a8a4077c594c': 'claude-skills',
};

// Skills that exist in the registry but should NOT be overlaid (built-in,
// meta, or out-of-scope skills).
const SKIP = new Set(['review', 'update-config', 'pre-push-scan',
  'commit-then-scan', 'mikko-skills']);

// Skills renamed after measurements were recorded. Old-name measurements in
// SKILL-USAGE-LATEST.json need to attribute to the renamed registry row;
// without this map they fall through unmatched and the historical signal
// disappears from rendered totals. Keyed by old name → new name. The alias
// applies before either the INSTALL_PREFIX or session-to-repo routing
// branches, so all downstream matching sees the canonical (current) name.
// Retire entries here once the corresponding old-name measurements have
// rolled out of the window (~90 days post-rename).
const RENAMED_SKILLS = {
  'skill-pdf': 'skill-localUpdate', // renamed 2026-05-21 (PR #141)
};

// Per-(consumer-repo, skill-name) pairs where the consumer-repo copy is
// effectively the same skill as the claude-skills library copy. Listed
// explicitly per-repo because the same skill NAME can mean different things
// in different repos (e.g. Spacepotatis's `audit` is a modular-refactor
// orchestrator, NOT a duplicate of the library's robustness audit — so it's
// intentionally NOT in this map).
//
// For each (repo, skill) pair listed here:
//   - Non-prefixed measurements (e.g. `attributionSkill: "audit"` from an
//     AudiobookMaker session) attribute to the LIBRARY copy, not the
//     consumer copy's session-derived row.
//   - Prefixed measurements (`mikko-audit`) already route to the library via
//     the INSTALL_PREFIX branch.
//   - When both a prefixed and a non-prefixed measurement land on the same
//     library row in the same overlay run, they accumulate (sum invocations
//     and tokens, recompute averages) rather than overwriting each other.
//   - After the overlay loop, the consumer-repo skills list is filtered to
//     drop these names — so the rendered PDF shows one row per canonical
//     skill instead of duplicating the library row in every consumer table.
//
// Add a (repo, name) pair here once the library copy genuinely supersedes
// the consumer copy. Remove a pair when the consumer copy diverges enough to
// be a genuinely different skill — at which point you should also rename
// one of them to avoid the registry collision.
const CANONICAL_DUPLICATES = {
  AudiobookMaker: new Set(['audit', 'ai-codegen-smell-audit']),
  Spacepotatis: new Set(['ai-codegen-smell-audit', 'security-audit']),
  // 'audit' intentionally absent from Spacepotatis — different skill
  // (modular-refactor orchestrator), renamed to `/modular-architecture-audit`
  // in Spacepotatis PR #235.
};

function isCanonicalDuplicate(repo, skillName) {
  return CANONICAL_DUPLICATES[repo]?.has(skillName) ?? false;
}

const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const usage = JSON.parse(fs.readFileSync(USAGE, 'utf8'));

let overlaid = 0;       // distinct (repo, skill) rows that received a fresh write this run
let accumulated = 0;    // additional measurements layered onto a row that was already written
const report = [];

// Track which (repo, skill) receipts have already been written THIS run, so a
// second measurement targeting the same row accumulates rather than
// overwrites. Keyed by `${repo.name}::${skill.name}`. Only populated for
// transcript-measurement receipts written by this script — receipts from
// prior runs are still treated as "fresh" (we replace them with the current
// run's combined total, which is the desired behavior).
const writtenThisRun = new Set();

for (const m of usage.skills) {
  if (SKIP.has(m.name)) continue;

  // Apply rename aliases before any routing branch so historical measurements
  // tagged with the pre-rename name attribute to the renamed registry row.
  // Mutating m.name in-place is fine — usage.skills is a parsed JSON array,
  // not shared state, and downstream branches all consult m.name.
  if (RENAMED_SKILLS[m.name]) {
    m.name = RENAMED_SKILLS[m.name];
  }

  // Library-skill route: when the measured name starts with the install
  // prefix, route to the claude-skills library before falling back to the
  // session→repo lookup. Library skills run in any directory (they live in
  // ~/.claude/skills/mikko-*), so the session-based heuristic mis-attributes
  // them to whichever consumer repo they ran in.
  let r = null;
  let s = null;
  if (m.name.startsWith(INSTALL_PREFIX)) {
    const libRepo = reg.repos.find((x) => x.name === LIBRARY_REPO);
    if (libRepo) {
      // Try the prefixed name (for skills already named `mikko-*` in the
      // library, e.g. `mikko-help`), then the stripped name (for skills
      // installed as `mikko-<canonical>`, e.g. `mikko-audit` → `audit`).
      const stripped = m.name.slice(INSTALL_PREFIX.length);
      const candidates = [m.name, stripped];
      const found = libRepo.skills.find((x) => candidates.includes(x.name));
      if (found) {
        r = libRepo;
        s = found;
      }
    }
  }

  if (!r) {
    // Canonical-to-library route: when a non-prefixed measurement comes from
    // a session in a consumer repo where THAT repo's copy of the skill is a
    // listed library duplicate, attribute it to the LIBRARY row instead of
    // the consumer's. This is what makes the PDF show one row per canonical
    // skill. Critically, this only triggers when the (repo, name) pair is
    // explicitly in CANONICAL_DUPLICATES — name-only matching would have
    // misattributed Spacepotatis's `audit` (a different skill) to the
    // library audit.
    const sessionRepo = SESSION_TO_REPO[m.sample_session_ids?.[0]];
    if (sessionRepo && isCanonicalDuplicate(sessionRepo, m.name)) {
      const libRepo = reg.repos.find((x) => x.name === LIBRARY_REPO);
      if (libRepo) {
        const found = libRepo.skills.find((x) => x.name === m.name);
        if (found) {
          r = libRepo;
          s = found;
        }
      }
    }
  }

  if (!r || !s) {
    // Use the first sample sessionId to pick the repo.
    const repo = SESSION_TO_REPO[m.sample_session_ids?.[0]];
    if (!repo) {
      report.push(`SKIP ${m.name} — unknown session ${m.sample_session_ids?.[0]}`);
      continue;
    }
    r = reg.repos.find((x) => x.name === repo);
    if (!r) {
      report.push(`SKIP ${m.name} — repo ${repo} not in registry`);
      continue;
    }
    s = r.skills.find((x) => x.name === m.name);
    if (!s) {
      report.push(`SKIP ${m.name} — not declared in ${repo}`);
      continue;
    }
  }
  const oldAnnual = s.receipt?.annual_total ?? 0;
  // TODO (PR #122 review followup): when re-running against an already-
  // overlaid registry, log "REPLACING measured receipt" so hand-edits aren't
  // silently clobbered. Also: this loop picks the first sample sessionId; if
  // a skill ever has invocations in two repos within the same window, only
  // the first repo's row is overlaid — detect and warn.

  // Snapshot the prior estimate so the PDF can show observed vs. estimated.
  //
  // Three cases:
  //   - First overlay on an editorial receipt — capture the editorial
  //     values as priorEstimate so the calibration page can show "how
  //     wrong my guess was."
  //   - Re-run on a row that's already source=transcript-measurement —
  //     preserve the priorEstimate that the first run captured. Don't
  //     let the measured receipt become its own "estimate."
  //   - Re-run on a row whose current source is `calibration` (because
  //     the calibration overlay step ran earlier in this same script) —
  //     preserve the priorEstimate that the calibration step captured.
  //     Capturing the calibration receipt as its own prior would produce
  //     a self-referential prior_estimate (e.g. security-audit's
  //     tokens_per_use === arm_B showing up as both observed and
  //     estimated), which is meaningless and was the regression flagged
  //     in PR #153 review.
  const existing = s.receipt;
  let priorEstimate = null;
  if (existing) {
    if (
      existing.source === 'transcript-measurement' ||
      existing.source === 'calibration'
    ) {
      priorEstimate = existing.prior_estimate ?? null;
    } else {
      priorEstimate = {
        tokens_per_use: existing.tokens_per_use,
        uses_per_year: existing.uses_per_year,
        annual_total: existing.annual_total,
        source: existing.source,
        path: existing.path,
      };
    }
  }

  const rowKey = `${r.name}::${s.name}`;
  if (writtenThisRun.has(rowKey)) {
    // Accumulate: a prior measurement in this run already wrote this row
    // (e.g. both `audit` and `mikko-audit` landing on claude-skills.audit
    // because CANONICAL_DUPLICATES routed them to the same target). Sum
    // invocations + tokens, recompute the per-use average weighted by
    // invocations, and sum projections forward.
    const prev = s.receipt;
    const prevInv = prev.invocations_in_window ?? 0;
    const prevTok = prev.total_tokens_in_window ?? 0;
    const newInv = prevInv + m.invocations;
    const newTok = prevTok + (m.total_tokens_in_window ?? 0);
    const newAvg = newInv > 0 ? Math.round(newTok / newInv) : 0;
    const newUpy = (prev.uses_per_year ?? 0) + (m.uses_per_year ?? 0);
    const newAnnual = (prev.annual_total ?? 0) + (m.annual_total ?? 0);
    // Keep the latest last_invoked timestamp across the two measurements.
    const newLast = [prev.last_invoked, m.last_invoked].filter(Boolean).sort().pop();
    // prior_estimate carries forward from the row's first write of this run
    // — that's `prev.prior_estimate`, which captured the author estimate
    // before any transcript-measurement overlay. Same value as the local
    // `priorEstimate` computed above (both derived from `s.receipt`), so we
    // pick one explicitly without the `??` fallback.
    s.receipt = {
      path: prev.path,
      source: 'transcript-measurement',
      tokens_per_use: newAvg,
      uses_per_year: newUpy,
      annual_total: newAnnual,
      measurement_window_days: usage.window_days,
      invocations_in_window: newInv,
      total_tokens_in_window: newTok,
      last_invoked: newLast,
      prior_estimate: prev.prior_estimate,
    };
    accumulated++;
    report.push(`ACCUMULATE ${r.name}.${s.name}: +${m.name} (${newInv} inv, ${newTok} tokens)`);
  } else {
    s.receipt = {
      path: '.claude/agent-verdicts/SKILL-USAGE-LATEST.json',
      source: 'transcript-measurement',
      tokens_per_use: m.tokens_per_use_avg,
      uses_per_year: m.uses_per_year,
      annual_total: m.annual_total,
      measurement_window_days: usage.window_days,
      invocations_in_window: m.invocations,
      total_tokens_in_window: m.total_tokens_in_window,
      last_invoked: m.last_invoked,
      prior_estimate: priorEstimate,
    };
    overlaid++;
    report.push(`OVERLAY ${r.name}.${s.name} (via ${m.name}): ${oldAnnual} → ${m.annual_total}`);
    writtenThisRun.add(rowKey);
  }
}

// Filter out canonical-to-library duplicates from CONSUMER repos. The library
// row now carries the combined measurements (from both prefixed and
// non-prefixed invocations); keeping the consumer-repo rows would render
// double lines in the PDF for the same canonical skill. Per-(repo, name)
// precision so a same-named-but-different skill (e.g. Spacepotatis's
// `audit`) doesn't get filtered out.
let droppedDuplicates = 0;
for (const r of reg.repos) {
  if (r.name === LIBRARY_REPO) continue;
  const before = r.skills.length;
  r.skills = r.skills.filter((s) => !isCanonicalDuplicate(r.name, s.name));
  const dropped = before - r.skills.length;
  if (dropped > 0) {
    droppedDuplicates += dropped;
    report.push(`DEDUPE ${r.name}: dropped ${dropped} library-canonical duplicate skill(s)`);
  }
}

// Calibration overlay: apply measured tokens-saved-per-use overrides on top
// of any rows whose names match a SKILL-CALIBRATION-LATEST.json entry.
//
// The measurement overlay (above) sets cost-per-use from real transcripts.
// The calibration overlay sets SAVED-per-use from real A/B tests against an
// unstructured baseline. They're orthogonal: one says "what does this skill
// cost when invoked", the other says "what would the same task cost without
// the skill". The build-skills-pdf renderer uses tokens_saved_per_use
// directly when present; falls back to a 3× heuristic on cost when absent.
//
// Skills not present in the calibration JSON keep the 3× modeled savings —
// so the PDF can show measured savings on calibrated rows and modeled
// savings on uncalibrated ones, with the renderer marking which is which.
//
// Calibration runs AFTER dedupe so canonical-duplicate consumer rows have
// already been dropped — calibration writes attach to the library row when
// applicable, the only one left after dedupe.
// Factored-out so the same logic can apply against any per-repo calibration
// file (currently SKILL-CALIBRATION-LATEST.json for Spacepotatis +
// SKILL-CALIBRATION-AUDIOBOOKMAKER-LATEST.json for AudiobookMaker). All
// calibration sources share the schema: {generated_at, skills: [{name,
// arm_A_tokens, arm_B_tokens, saved, pct_saved, notes?}], ...}.
function applyCalibrationFile(file, receiptPath) {
  if (!fs.existsSync(file)) return { calibrated: 0, misses: [] };
  const calibration = JSON.parse(fs.readFileSync(file, 'utf8'));
  let calibrated = 0;
  const misses = [];
  for (const entry of calibration.skills ?? []) {
    const matches = [];
    for (const r of reg.repos) {
      for (const s of r.skills) {
        if (s.name === entry.name && s.receipt) matches.push({ r, s });
      }
    }
    if (matches.length === 0) {
      misses.push(entry.name);
      continue;
    }
    for (const { r, s } of matches) {
      s.receipt.tokens_saved_per_use = entry.saved;
      s.receipt.tokens_saved_source = 'calibration';
      s.receipt.calibration_arm_A = entry.arm_A_tokens;
      s.receipt.calibration_arm_B = entry.arm_B_tokens;
      if (entry.notes) s.receipt.calibration_notes = entry.notes;

      // The calibration's arm-B IS a measured cost-per-use: real tokens
      // billed through the harness when a sub-agent followed the skill
      // procedure end-to-end on a representative task. For rows that don't
      // already have transcript-measurement cost data, this is the best
      // cost number we have — better than the editorial guess. Promote it
      // so the cost column reflects real measurement instead of a stale
      // estimate, and so the chip flips from ESTIMATE to MEASURED.
      //
      // For rows that DO have transcript data, the transcript measurement
      // wins (it's "what happened in production"; arm-B is what happens
      // under controlled A/B conditions). Arm-B stays on the receipt
      // either way so consumers that want it can read it explicitly.
      const hadTranscript = s.receipt.source === 'transcript-measurement';
      if (!hadTranscript) {
        // Preserve the editorial estimate as prior_estimate so the
        // calibration column on the per-repo table can show "how wrong my
        // guess was" — same shape transcript-measured rows already use.
        //
        // Skip the capture when the row is ALREADY source='calibration' —
        // re-running the overlay against an already-calibrated registry
        // would otherwise snapshot the calibration receipt as its own
        // prior_estimate (self-referential: tokens_per_use === arm_B
        // appearing as both observed and "estimated"). PR #153 review
        // surfaced this on security-audit's row.
        if (
          !s.receipt.prior_estimate &&
          typeof s.receipt.tokens_per_use === 'number' &&
          s.receipt.source !== 'calibration'
        ) {
          s.receipt.prior_estimate = {
            tokens_per_use: s.receipt.tokens_per_use,
            uses_per_year: s.receipt.uses_per_year ?? null,
            annual_total: s.receipt.annual_total ?? null,
            source: s.receipt.source ?? null,
            path: s.receipt.path ?? null,
          };
        }

        s.receipt.tokens_per_use = entry.arm_B_tokens;
        s.receipt.annual_total = s.receipt.uses_per_year
          ? entry.arm_B_tokens * s.receipt.uses_per_year
          : null;
        s.receipt.source = 'calibration';
        s.receipt.path = receiptPath;
        if (calibration.generated_at) {
          s.receipt.last_invoked = calibration.generated_at;
        }
      }

      calibrated += 1;
      report.push(
        `CALIBRATE ${r.name}.${s.name}: saved/use = ${entry.saved.toLocaleString()} ` +
          `(arm A ${entry.arm_A_tokens.toLocaleString()} vs B ${entry.arm_B_tokens.toLocaleString()}); ` +
          `cost: ${hadTranscript ? 'kept transcript' : 'promoted to arm-B'}`,
      );
    }
  }
  for (const name of misses) {
    report.push(`SKIP calibration for ${name} — no matching registry row`);
  }
  return { calibrated, misses };
}

// Alt-model overlay: attach Opus/Haiku per-skill arm A/B numbers to the same
// receipt as a side channel (s.receipt.alt_model_measurements[model] = {...}).
// The primary cost/savings columns continue to come from the Sonnet
// calibration. Null tokens (placeholder Haiku files) are skipped so the
// receipt only carries real measurements.
function applyAltModelCalibration(file, model, receiptPath) {
  if (!fs.existsSync(file)) return { written: 0, skipped: 0, missed: 0 };
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  // builtins live in `builtins:`; per-repo skill files use `skills:`. Both
  // share the same per-entry shape. The cross-portfolio OPUS-SAMPLE file
  // uses `skills:` and tags each entry with `kind` + `repo`, so the matcher
  // below can disambiguate same-named skills across repos.
  const entries = payload.skills ?? payload.builtins ?? [];
  let written = 0;
  let skipped = 0;
  let missed = 0;
  for (const entry of entries) {
    if (entry.kind === 'builtin') continue; // handled in the builtins block below
    if (entry.arm_A_tokens == null || entry.arm_B_tokens == null) {
      skipped += 1;
      continue;
    }
    const matches = [];
    for (const r of reg.repos) {
      // When the entry names its repo, only match within that repo. Same-
      // named skills (e.g. `audit` in Spacepotatis vs claude-skills) are
      // not duplicates here — different skills with the same name. The
      // CANONICAL_DUPLICATES filter has already collapsed the actual
      // library-vs-consumer dupes by this point.
      if (entry.repo && r.name !== entry.repo) continue;
      for (const s of r.skills) {
        if (s.name === entry.name && s.receipt) matches.push({ r, s });
      }
    }
    if (matches.length === 0) {
      // Surface the miss so a future skill rename doesn't silently drop the
      // multi-model measurement. Mirrors the SKIP-on-no-match pattern from
      // applyCalibrationFile so a single grep finds both classes of misses.
      const repoSuffix = entry.repo ? ` in ${entry.repo}` : '';
      report.push(`SKIP alt-model ${model} for ${entry.name}${repoSuffix} — no matching registry row`);
      missed += 1;
      continue;
    }
    for (const { r, s } of matches) {
      s.receipt.alt_model_measurements ??= {};
      s.receipt.alt_model_measurements[model] = {
        arm_A_tokens: entry.arm_A_tokens,
        arm_B_tokens: entry.arm_B_tokens,
        saved: entry.saved,
        pct_saved: entry.pct_saved,
        source: receiptPath,
        notes: entry.notes ?? null,
      };
      written += 1;
      report.push(`ALT-MODEL ${r.name}.${s.name} (${model}): arm A ${entry.arm_A_tokens} / arm B ${entry.arm_B_tokens} (saved ${entry.saved}, ${entry.pct_saved}%)`);
    }
  }
  return { written, skipped, missed };
}

const spacepotatisCal = applyCalibrationFile(
  CALIBRATION,
  '.claude/agent-verdicts/SKILL-CALIBRATION-LATEST.json',
);
const audiobookmakerCal = applyCalibrationFile(
  CALIBRATION_AUDIOBOOKMAKER,
  '.claude/agent-verdicts/SKILL-CALIBRATION-AUDIOBOOKMAKER-LATEST.json',
);
const claudeskillsCal = applyCalibrationFile(
  CALIBRATION_CLAUDESKILLS,
  '.claude/agent-verdicts/SKILL-CALIBRATION-CLAUDESKILLS-LATEST.json',
);
const mnDevCal = applyCalibrationFile(
  CALIBRATION_MN_DEV,
  '.claude/agent-verdicts/SKILL-CALIBRATION-MIKKONUMMINEN-DEV-LATEST.json',
);
const calibratedRows =
  spacepotatisCal.calibrated +
  audiobookmakerCal.calibrated +
  claudeskillsCal.calibrated +
  mnDevCal.calibrated;

// Alt-model overlays (Opus + Haiku). Attach side-channel measurements after
// the primary Sonnet calibration is in place — so the receipt already exists
// and we just hang an extra `alt_model_measurements` field off it.
let altModelWritten = 0;
let altModelSkipped = 0;
let altModelMissed = 0;
for (const { file, model, receipt } of ALT_MODEL_CALIBRATION_FILES) {
  const { written, skipped, missed } = applyAltModelCalibration(file, model, receipt);
  altModelWritten += written;
  altModelSkipped += skipped;
  altModelMissed += missed ?? 0;
}

// Recompute totals.
let totalAnnual = 0;
let withReceipts = 0;
let totalSkills = 0;
let redirects = 0;
// TODO (PR #122 review followup): `withReceipts` here counts any receipt
// object; the PDF aggregate column in build-skills-pdf.mjs counts only
// receipts with annual_total != null. Pick one definition and align both
// — recommendation is the stricter check, since "receipt with no number"
// isn't a receipt that saves anything.
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

// Built-in references: surface Claude Code's built-in slash commands as a
// reference point above the custom-skill tables. /review alone consumed
// ~7× the entire custom-skill portfolio in the current window, which is
// the most useful comparison number on the page. Add new built-ins here
// when Anthropic ships another one worth tracking.
const BUILTINS_TO_TRACK = {
  review: { label: '/review', description: 'Claude Code built-in PR code review' },
};

// Optional A/B-calibration overlay for built-ins. When SKILL-CALIBRATION-
// BUILTINS-LATEST.json exists, attach arm A/B token counts and the measured
// per-use saving to the matching reference entry. Absent file = no-op.
let calibBuiltins = null;
if (fs.existsSync(CALIBRATION_BUILTINS)) {
  calibBuiltins = JSON.parse(fs.readFileSync(CALIBRATION_BUILTINS, 'utf8'));
}

const builtInReferences = [];
for (const [skillName, meta] of Object.entries(BUILTINS_TO_TRACK)) {
  const m = usage.skills.find((s) => s.name === skillName);
  if (!m) continue;
  const entry = {
    name: skillName,
    label: meta.label,
    description: meta.description,
    measurement_window_days: usage.window_days,
    invocations_in_window: m.invocations,
    total_tokens_in_window: m.total_tokens_in_window,
    tokens_per_use_avg: m.tokens_per_use_avg,
    annual_total: m.annual_total,
    uses_per_year: m.uses_per_year,
    last_invoked: m.last_invoked,
  };
  const calib = calibBuiltins?.builtins?.find((b) => b.name === skillName);
  if (calib) {
    entry.tokens_saved_per_use = calib.saved;
    entry.tokens_saved_source = 'calibration';
    entry.calibration_arm_A = calib.arm_A_tokens;
    entry.calibration_arm_B = calib.arm_B_tokens;
    entry.calibration_pct_saved = calib.pct_saved;
    entry.calibration_generated_at = calibBuiltins.generated_at;
    entry.calibration_model = calibBuiltins.model ?? 'sonnet';
    // Per-entry audit doc path so the renderer can cite the methodology
    // without hardcoding a filename that rots when a re-calibration ships.
    if (typeof calib.audit_doc_path === 'string') {
      entry.audit_doc_path = calib.audit_doc_path;
    }
  }
  // Attach alt-model measurements to the built-in entry too. Built-ins live
  // outside reg.repos so applyAltModelCalibration's matcher misses them —
  // wire each alt-model file by skim-reading and merging here. Look in both
  // `builtins:` (per-portfolio files) and `skills:` with kind=='builtin'
  // (cross-portfolio OPUS-SAMPLE file).
  for (const { file, model, receipt } of ALT_MODEL_CALIBRATION_FILES) {
    if (!fs.existsSync(file)) continue;
    const altPayload = JSON.parse(fs.readFileSync(file, 'utf8'));
    const candidates = [
      ...(altPayload.builtins ?? []),
      ...(altPayload.skills ?? []).filter((s) => s.kind === 'builtin'),
    ];
    const altEntry = candidates.find((b) => b.name === skillName);
    if (!altEntry || altEntry.arm_A_tokens == null || altEntry.arm_B_tokens == null) continue;
    entry.alt_model_measurements ??= {};
    entry.alt_model_measurements[model] = {
      arm_A_tokens: altEntry.arm_A_tokens,
      arm_B_tokens: altEntry.arm_B_tokens,
      saved: altEntry.saved,
      pct_saved: altEntry.pct_saved,
      source: receipt,
      notes: altEntry.notes ?? null,
    };
  }
  builtInReferences.push(entry);
}
if (builtInReferences.length > 0) {
  reg.built_in_references = builtInReferences;
}
// Drop the predecessor singular key if a prior overlay run wrote it.
delete reg.built_in_reference;

reg.generated_at = new Date().toISOString();

fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n');

console.log(report.join('\n'));
const accumulatedSuffix = accumulated > 0 ? ` (+${accumulated} accumulation${accumulated === 1 ? '' : 's'} onto existing rows)` : '';
const calibSuffix = calibratedRows > 0 ? ` Calibrated ${calibratedRows} row(s).` : '';
const altMissSuffix = altModelMissed > 0 ? `, ${altModelMissed} miss(es)` : '';
const altSuffix = altModelWritten > 0 ? ` Alt-model measurements attached to ${altModelWritten} row(s) (skipped ${altModelSkipped} placeholder/null${altMissSuffix}).` : '';
console.log(`\nOverlaid ${overlaid} rows${accumulatedSuffix}. Dropped ${droppedDuplicates} canonical-to-library duplicate(s).${calibSuffix}${altSuffix} New annual total: ${totalAnnual.toLocaleString()}`);
