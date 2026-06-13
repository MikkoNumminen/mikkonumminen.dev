---
name: skill-localUpdate
description: Refresh every local artifact the site renders about your portfolio skills — the JSON the /contact terminal fetches at runtime, the measurement-overlaid annual totals, and the downloadable skills-registry PDF — in one sequenced chain. Wraps a pre-flight check plus four sequenced actions that take a recent token-measurement snapshot and produce the deploy-ready outputs: (1) `/skill-registry` to re-walk the portfolio and emit a fresh inventory JSON, (2) `npm run sync:skills-registry` to copy the LATEST inventory into `public/data/` (this is the file the contact terminal's `skills` command reads), (3) `node scripts/apply-measurement-overlay.mjs` to merge transcript measurements into the inventory and dedupe library-canonical duplicates, (4) `npm run build:skills-pdf` to render the HTML and print to PDF via local Chrome. Use whenever the user says "refresh the local skills data", "rebuild the skill-registry PDF", "regenerate the skills data and PDF", "update the local skills numbers", "publish the skills PDF", "/skill-localUpdate", or refers to refreshing what the contact page or the downloadable PDF shows. Does NOT gather token usage — that's `/mikko-skill-usage`, run separately AND from inside `mikkonumminen.dev/` so the JSON lands at the path this skill expects. Does NOT commit or push.
barney: One command to refresh every local skills artifact the site reads — the /contact terminal's data, the measurement-merged inventory, and the downloadable PDF. Run after /mikko-skill-usage so fresh measurements land everywhere at once.
---

# skill-localUpdate

The thin orchestrator that wraps the five-step refresh chain (one pre-flight + four sequenced actions) into one slash command. The same chain feeds three site surfaces from one source of truth: the contact-page terminal's `skills` command, the downloadable PDF, and the dated registry snapshot. Assumes `/mikko-skill-usage` has already written a fresh `SKILL-USAGE-LATEST.json` — this skill takes it from there.

## When to invoke

- "/skill-localUpdate"
- "refresh the local skills data"
- "rebuild the skill-registry PDF"
- "regenerate the skills-registry document"
- "update the local skills numbers"
- "publish the skills PDF"
- After running `/mikko-skill-usage` and wanting the new numbers reflected on the deployed surfaces (the contact-page terminal's `skills` output and the downloadable PDF)

## When NOT to invoke

- **Before running `/mikko-skill-usage`.** This skill consumes the JSON that `/mikko-skill-usage` produces; if the file is missing the chain bails with a clear message.
- **In CI / on Vercel.** `scripts/build-skills-pdf.mjs` already short-circuits in those environments — the committed PDF stays canonical on hosted builds. Run this locally only.
- **For generic markdown-to-PDF.** That's `/md-to-pdf`.
- **As a substitute for the skill-registry skill itself.** This skill *invokes* `/skill-registry` as step 2 of the chain; it does not replace it. If you want only the inventory refresh without the rest, run `/skill-registry` directly.

## Site surfaces this chain feeds

Three places on the deployed site read from the artifacts this chain produces. One invocation refreshes all of them:

| Surface | Reads | When the surface updates |
| --- | --- | --- |
| `/contact` terminal's `skills` command | `public/data/skills-registry.json` (fetched at runtime via `src/lib/terminal/skills.ts`) | On next page load / cache expiry — no rebuild needed once the JSON is committed |
| `download --catalog` (terminal) | `public/skills-registry.pdf` | On next page load — same as above |
| Dated registry snapshot | `.claude/agent-verdicts/SKILL-REGISTRY-{date}.json` + `LATEST.json` | Persistent inventory history for other Claude sessions to read |

That's why this skill is named `skill-localUpdate` rather than `skill-pdf` (renamed 2026-05-21): the PDF is one of three outputs, not the headline.

## What this skill does

One pre-flight check + four sequenced actions, with the chain bailing on the first non-zero exit. Numbered 1–5 throughout the skill so description, table, and procedure section all agree:

| Step | Action | Reads | Writes |
| --- | --- | --- | --- |
| 1 | Pre-flight | `.claude/agent-verdicts/SKILL-USAGE-LATEST.json` | (nothing — verifies the file exists and is fresh enough) |
| 2 | `/skill-registry` | `<workspace>/*/.claude/skills/*/SKILL.md` (every sibling repo) | `.claude/agent-verdicts/SKILL-REGISTRY-{date}.json` + `SKILL-REGISTRY-LATEST.json` |
| 3 | `npm run sync:skills-registry` | `.claude/agent-verdicts/SKILL-REGISTRY-LATEST.json` | `public/data/skills-registry.json` (in-place copy of the latest dated JSON — **what the /contact terminal reads**) |
| 4 | `node scripts/apply-measurement-overlay.mjs` | `SKILL-USAGE-LATEST.json` + `public/data/skills-registry.json` | `public/data/skills-registry.json` (in-place — measurements merged, canonical duplicates dropped) |
| 5 | `npm run build:skills-pdf` | `public/data/skills-registry.json` | `public/skills-registry.pdf` |

End-to-end on a small portfolio: ~30–60s wall-clock, dominated by step 2's parallel sub-agents and step 5's Chrome render.

## Procedure

### 1. Pre-flight

**Working directory prerequisite.** This skill assumes the user is running Claude Code from inside `mikkonumminen.dev/`. `/mikko-skill-usage` writes its output to `<cwd>/.claude/agent-verdicts/SKILL-USAGE-LATEST.json` — if the user ran it in a different repo (e.g. `claude-skills/`), the JSON is in the wrong place and this chain will bail. If pre-flight can't find the file at the expected path, tell the user to either: (a) re-run `/mikko-skill-usage` from inside `mikkonumminen.dev/`, or (b) manually copy the JSON from wherever it landed into `mikkonumminen.dev/.claude/agent-verdicts/`.

`Read` the first line of `.claude/agent-verdicts/SKILL-USAGE-LATEST.json` to confirm it exists. If missing, bail with:

```
error: no SKILL-USAGE-LATEST.json found at .claude/agent-verdicts/.
       Run /mikko-skill-usage from inside mikkonumminen.dev/ first to
       gather token measurements, then re-run /skill-localUpdate.
       (If you ran /mikko-skill-usage in a different repo, the JSON
       landed there — either re-run it here or copy the file across.)
```

If the file's `generated_at` timestamp is older than 14 days, warn but proceed:

```
warning: SKILL-USAGE-LATEST.json is N days old. The deployed surfaces will
         reflect a stale measurement window. Consider re-running
         /mikko-skill-usage first for a fresh snapshot.
```

(14 days is a sensible default for a portfolio that gets light-to-moderate activity — picks up after a long break, doesn't nag on a daily refresh.)

### 2. Refresh the inventory — `/skill-registry`

Invoke the existing `/skill-registry` skill. It walks every sibling repo in the workspace (`<workspace>/*/.claude/skills/*/SKILL.md`), reads frontmatter, locates receipts, and writes the dated + LATEST registry JSONs to `.claude/agent-verdicts/`.

### 3. Sync the inventory into `public/data/`

```bash
npm run sync:skills-registry
```

That npm script wraps `node scripts/sync-skill-registry.mjs` and copies the latest dated JSON from `.claude/agent-verdicts/` into `public/data/skills-registry.json`. This is the file the contact-page terminal's `skills` command fetches at runtime — committing it ships the new numbers to the deployed site. The prebuild hook (`npm run prebuild`) does this automatically on every `npm run build`, but this skill runs it explicitly so the overlay in step 4 operates on the up-to-date file (we don't call `npm run build` end-to-end here — see step 5's note).

### 4. Apply the measurement overlay

```bash
node scripts/apply-measurement-overlay.mjs
```

This script:
- Reads `SKILL-USAGE-LATEST.json` (measurements) + `public/data/skills-registry.json` (inventory)
- Overlays transcript-measured token figures onto each matching `(repo, skill)` row
- Re-routes non-prefixed measurements (e.g. `attributionSkill: "audit"`) into their canonical library row via `CANONICAL_DUPLICATES`, accumulating when both a prefixed and non-prefixed measurement land on the same row
- Filters consumer-repo skills lists to drop library-canonical duplicates so the deployed surfaces show one row per canonical skill
- Recomputes totals
- Writes the merged registry back to `public/data/skills-registry.json` in-place

Capture the script's stdout — the last line summarises (e.g. `Overlaid 12 rows (+1 accumulation onto existing rows). Dropped 4 canonical-to-library duplicate(s). New annual total: 17,546,624`).

### 5. Build the PDF

```bash
npm run build:skills-pdf
```

This runs `scripts/build-skills-pdf.mjs`. It:
- Locates a Chrome / Chromium binary on the system
- Renders `public/data/skills-registry.json` as HTML via the layout in `buildHtml()`
- Prints the HTML to PDF via Chrome's `--print-to-pdf`
- Writes `public/skills-registry.pdf`

CI / Vercel detection: the script short-circuits if it sees the CI / VERCEL env vars or if Chrome isn't on PATH. Locally, on a dev machine with Chrome installed, it runs.

Note: we call `build:skills-pdf` directly rather than `npm run build` so we don't run the full Astro site build for a data-only refresh. The prebuild hook would also run the sync step (already done in step 3), so going through `build` would duplicate work without changing the output.

### 6. Report + stop

Print a four-line summary:

```
skill-localUpdate — refreshed:
  inventory:   .claude/agent-verdicts/SKILL-REGISTRY-{date}.json
  data:        public/data/skills-registry.json   ← /contact terminal reads this
  pdf:         public/skills-registry.pdf          ← download --catalog serves this

Open public/skills-registry.pdf to review. Commit when ready:
  git add public/data/skills-registry.json public/skills-registry.pdf .claude/agent-verdicts/SKILL-REGISTRY-*
  git commit -m "chore(skills): refresh local skill artifacts"
```

**Stop.** Do not commit. Do not push. The user reviews the PDF visually and commits when ready.

## Output format

See step 6 above for the final summary. Each step also prints its own status line as it runs:

```
[1/5] pre-flight... ok (SKILL-USAGE-LATEST.json generated 2 days ago)
[2/5] /skill-registry... 26 skills across 3 repos, 0 redirects
[3/5] sync:skills-registry... public/data/skills-registry.json updated
[4/5] apply-measurement-overlay... 12 rows overlaid, 4 duplicates dropped
[5/5] build:skills-pdf... public/skills-registry.pdf regenerated

Done. Review the PDF and commit when ready.
```

## What this skill does NOT do

- **Does not gather token usage.** That's `/mikko-skill-usage`, run separately. This skill assumes it's already been run.
- **Does not commit or push.** The user reviews the PDF visually and commits when ready.
- **Does not modify `scripts/build-skills-pdf.mjs` or the overlay script.** Those are the source of truth for their respective steps; this skill only invokes them.
- **Does not skip steps.** All five steps run on every invocation. If you only want the overlay refresh (no registry re-walk), run `node scripts/apply-measurement-overlay.mjs` directly — it's cheap.
- **Does not run on CI / Vercel.** Step 5 (`npm run build:skills-pdf`) already short-circuits there per `build-skills-pdf.mjs`'s CI/VERCEL env-var guard; the committed PDF stays canonical on hosted builds.

## Failure modes

- **`SKILL-USAGE-LATEST.json` missing.** Step 1 bails with a clear "run /mikko-skill-usage first" message. Exit cleanly.
- **`/skill-registry` returns a malformed inventory.** The overlay script will surface schema mismatches (`SKIP <name> — repo not in registry`, etc.) — surface those to the user; do not silently swallow.
- **Chrome not on PATH (step 5).** `build-skills-pdf.mjs` already prints "no Chrome / Chromium on PATH — leaving existing PDF in place" and exits 0. The skill reports the existing PDF was kept rather than failing the run. Note that steps 1-4 still landed, so the /contact terminal's data is refreshed even when the PDF isn't.
- **PDF render succeeds but visual layout is wrong.** This skill cannot detect that. The Step 5 hint to "open the PDF to review" is the human gate.

## Token expectations

Most model tokens go to step 2 (`/skill-registry` parallel sub-agents). Most wall-clock time goes to step 2 (sub-agents in parallel) plus step 5 (Chrome render). Steps 1, 3, 4 cost negligible tokens; step 3 is a synchronous file copy.

- Step 1 (pre-flight): ~1K (one Read, one check)
- Step 2 (`/skill-registry` sub-agents): ~80K total (sum across the parallel Sonnet agents per its own `## Token expectations` section)
- Step 3 (sync script): 0 model tokens (file copy)
- Step 4 (overlay script): 0 model tokens (pure Node)
- Step 5 (PDF build): 0 model tokens (pure Node + Chrome render)
- Final summary: ~1K

Total: ~80–85K tokens per invocation, dominated by `/skill-registry`. Wall-clock ~30–60s (parallel agents + render).

Cadence: per portfolio refresh — when you've shipped new skills, calibrated existing ones, or just want the deployed surfaces (terminal + PDF) to match the current measurements. Realistically 4–12 times/year.

## Why this skill exists

The four-step chain (registry → sync → overlay → PDF) used to be four separate manual commands, each easy to forget or run out of order. Empirically, the failure mode was: someone runs the overlay against a stale `skills-registry.json` (forgot to re-run `/skill-registry`), or builds the PDF against an un-overlaid JSON (forgot the overlay). Both produce a plausible-looking but wrong artifact — either a stale terminal table or a PDF that doesn't match what the terminal shows.

This skill removes that risk by sequencing the chain. One slash command, four operations, in the right order, with a pre-flight that confirms the measurement step happened first. The 2026-05-21 rename from `/skill-pdf` to `/skill-localUpdate` reflects that the PDF is one of three site surfaces this chain touches, not the headline output. If you ever change the chain (add a new step, swap the overlay for something else), this is the single file to update.
