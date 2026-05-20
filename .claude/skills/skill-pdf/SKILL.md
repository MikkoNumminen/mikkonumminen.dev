---
name: skill-pdf
description: One-command refresh of the skills-registry PDF. Wraps the four-step chain that takes a recent token-measurement snapshot and produces a deploy-ready `public/skills-registry.pdf`: (1) `/skill-registry` to re-walk the portfolio and emit a fresh inventory JSON, (2) `node scripts/apply-measurement-overlay.mjs` to merge transcript measurements into the inventory and dedupe library-canonical duplicates, (3) `npm run build:skills-pdf` to render the HTML and print to PDF via local Chrome. Use whenever the user says "refresh the skills PDF", "rebuild the skill-registry PDF", "regenerate the skills-registry document", "publish the skills PDF", or `/skill-pdf`. Does NOT gather token usage — that's `/mikko-skill-usage`, run separately. Does NOT commit or push.
barney: One command to refresh the skills-registry PDF after you've run /mikko-skill-usage. Re-walks the inventory, merges measurements, builds the PDF — you commit when it looks right.
---

# skill-pdf

The thin orchestrator that wraps the four-step PDF chain into one slash command. Assumes `/mikko-skill-usage` has already written a fresh `SKILL-USAGE-LATEST.json` — this skill takes it from there.

## When to invoke

- "/skill-pdf"
- "refresh the skills PDF"
- "rebuild the skill-registry PDF"
- "regenerate the skills-registry document"
- "publish the skills PDF"
- After running `/mikko-skill-usage` and wanting to see the new numbers reflected in the deployed artifact

## When NOT to invoke

- **Before running `/mikko-skill-usage`.** This skill consumes the JSON that `/mikko-skill-usage` produces; if the file is missing the chain bails with a clear message.
- **In CI / on Vercel.** `scripts/build-skills-pdf.mjs` already short-circuits in those environments — the committed PDF stays canonical on hosted builds. Run this locally only.
- **For generic markdown-to-PDF.** That's `/md-to-pdf`.
- **As a substitute for the skill-registry skill itself.** This skill *invokes* `/skill-registry` as step 1; it does not replace it. If you want only the inventory refresh without the PDF, run `/skill-registry` directly.

## What this skill does

Four steps, executed in order, with the chain bailing on the first non-zero exit:

| Step | Action | Reads | Writes |
| --- | --- | --- | --- |
| 1 | Pre-flight | `.claude/agent-verdicts/SKILL-USAGE-LATEST.json` | (nothing — verifies the file exists and is fresh enough) |
| 2 | `/skill-registry` | `D:/koodaamista/*/.claude/skills/*/SKILL.md` (every sibling repo) | `.claude/agent-verdicts/SKILL-REGISTRY-{date}.json` + `SKILL-REGISTRY-LATEST.json` |
| 3 | `node scripts/apply-measurement-overlay.mjs` | `SKILL-USAGE-LATEST.json` + `public/data/skills-registry.json` (synced from `SKILL-REGISTRY-LATEST.json` via the prebuild hook) | `public/data/skills-registry.json` (in-place — measurements merged, canonical duplicates dropped) |
| 4 | `npm run build:skills-pdf` | `public/data/skills-registry.json` | `public/skills-registry.pdf` |

End-to-end on a small portfolio: ~30–60s wall-clock, dominated by step 2's parallel sub-agents and step 4's Chrome render.

## Procedure

### 1. Pre-flight

`Read` the first line of `.claude/agent-verdicts/SKILL-USAGE-LATEST.json` to confirm it exists. If missing, bail with:

```
error: no SKILL-USAGE-LATEST.json found.
       Run /mikko-skill-usage first to gather token measurements,
       then re-run /skill-pdf.
```

If the file's `generated_at` timestamp is older than 14 days, warn but proceed:

```
warning: SKILL-USAGE-LATEST.json is N days old. The PDF will reflect
         a stale measurement window. Consider re-running /mikko-skill-usage
         first for a fresh snapshot.
```

(14 days is a sensible default for a portfolio that gets light-to-moderate activity — picks up after a long break, doesn't nag on a daily refresh.)

### 2. Refresh the inventory — `/skill-registry`

Invoke the existing `/skill-registry` skill. It walks every sibling repo under `D:/koodaamista/*/.claude/skills/*/SKILL.md`, reads frontmatter, locates receipts, and writes the dated + LATEST registry JSONs to `.claude/agent-verdicts/`.

The prebuild hook (see `package.json`'s `prebuild` script) auto-syncs `SKILL-REGISTRY-LATEST.json` to `public/data/skills-registry.json` on every `npm run build`. This skill does NOT run `npm run build` until step 4, so we run the sync explicitly before step 3:

```bash
npm run sync:skills-registry
```

(That npm script wraps `node scripts/sync-skill-registry.mjs` and copies the latest dated JSON into `public/data/`; the overlay step in step 3 then operates on the up-to-date file.)

### 3. Apply the measurement overlay

```bash
node scripts/apply-measurement-overlay.mjs
```

This script:
- Reads `SKILL-USAGE-LATEST.json` (measurements) + `public/data/skills-registry.json` (inventory)
- Overlays transcript-measured token figures onto each matching `(repo, skill)` row
- Re-routes non-prefixed measurements (e.g. `attributionSkill: "audit"`) into their canonical library row via `CANONICAL_DUPLICATES`, accumulating when both a prefixed and non-prefixed measurement land on the same row
- Filters consumer-repo skills lists to drop library-canonical duplicates so the PDF shows one row per canonical skill
- Recomputes totals
- Writes the merged registry back to `public/data/skills-registry.json` in-place

Capture the script's stdout — the last line summarises (e.g. `Overlaid 12 rows (+1 accumulation onto existing rows). Dropped 4 canonical-to-library duplicate(s). New annual total: 17,546,624`).

### 4. Build the PDF

```bash
npm run build:skills-pdf
```

This runs `scripts/build-skills-pdf.mjs`. It:
- Locates a Chrome / Chromium binary on the system
- Renders `public/data/skills-registry.json` as HTML via the layout in `buildHtml()`
- Prints the HTML to PDF via Chrome's `--print-to-pdf`
- Writes `public/skills-registry.pdf`

CI / Vercel detection: the script short-circuits if it sees the CI / VERCEL env vars or if Chrome isn't on PATH. Locally, on a dev machine with Chrome installed, it runs.

### 5. Report + stop

Print a four-line summary:

```
skill-pdf — refreshed:
  inventory:   .claude/agent-verdicts/SKILL-REGISTRY-{date}.json
  data:        public/data/skills-registry.json
  pdf:         public/skills-registry.pdf  (NN KB, regenerated)

Open public/skills-registry.pdf to review. Commit when ready:
  git add public/data/skills-registry.json public/skills-registry.pdf .claude/agent-verdicts/SKILL-REGISTRY-*
  git commit -m "chore(skills): refresh skill-registry data + PDF"
```

**Stop.** Do not commit. Do not push. The user reviews the PDF visually and commits when ready.

## Output format

See step 5 above. Each step also prints its own status line as it runs:

```
[1/4] pre-flight... ok (SKILL-USAGE-LATEST.json generated 2 days ago)
[2/4] /skill-registry... 26 skills across 3 repos, 0 redirects
[3/4] apply-measurement-overlay... 12 rows overlaid, 4 duplicates dropped
[4/4] build:skills-pdf... public/skills-registry.pdf (147 KB)

Done. Review the PDF and commit when ready.
```

## What this skill does NOT do

- **Does not gather token usage.** That's `/mikko-skill-usage`, run separately. This skill assumes it's already been run.
- **Does not commit or push.** The user reviews the PDF visually and commits when ready.
- **Does not modify `scripts/build-skills-pdf.mjs` or the overlay script.** Those are the source of truth for their respective steps; this skill only invokes them.
- **Does not skip steps.** All four steps run on every invocation. If you only want the overlay refresh (no registry re-walk), run `node scripts/apply-measurement-overlay.mjs` directly — it's cheap.
- **Does not run on CI / Vercel.** Step 4 already short-circuits there; the committed PDF stays canonical on hosted builds.

## Failure modes

- **`SKILL-USAGE-LATEST.json` missing.** Step 1 bails with a clear "run /mikko-skill-usage first" message. Exit cleanly.
- **`/skill-registry` returns a malformed inventory.** The overlay script will surface schema mismatches (`SKIP <name> — repo not in registry`, etc.) — surface those to the user; do not silently swallow.
- **Chrome not on PATH (step 4).** `build-skills-pdf.mjs` already prints "no Chrome / Chromium on PATH — leaving existing PDF in place" and exits 0. The skill reports the existing PDF was kept rather than failing the run.
- **PDF render succeeds but visual layout is wrong.** This skill cannot detect that. The Step 5 hint to "open the PDF to review" is the human gate.

## Token expectations

Most of the work is in step 2 (`/skill-registry`, ~80K tokens for the parallel sub-agents) and step 4 (Chrome render, no model tokens — pure I/O + chromium). Steps 1, 3, 5 are negligible.

- Pre-flight: ~1K (one Read, one check)
- /skill-registry sub-agents: ~80K total (sum across the parallel Sonnet agents per its own `## Token expectations` section)
- Overlay script: 0 model tokens (pure Node script)
- PDF build: 0 model tokens (pure Node + Chrome)
- Final summary: ~1K

Total: ~80–85K tokens per invocation, dominated by `/skill-registry`. Wall-clock ~30–60s (parallel agents + render).

Cadence: per portfolio refresh — when you've shipped new skills, calibrated existing ones, or just want the deployed numbers to match the current measurements. Realistically 4–12 times/year.

## Why this skill exists

The four-step chain (registry → sync → overlay → PDF) used to be four separate manual commands, each easy to forget or run out of order. Empirically, the failure mode was: someone runs the overlay against a stale `skills-registry.json` (forgot to re-run `/skill-registry`), or builds the PDF against an un-overlaid JSON (forgot the overlay). Both produce a plausible-looking but wrong PDF.

This skill removes that risk by sequencing the chain. One slash command, four operations, in the right order, with a pre-flight that confirms the measurement step happened first. If you ever change the chain (add a new step, swap the overlay for something else), this is the single file to update.
