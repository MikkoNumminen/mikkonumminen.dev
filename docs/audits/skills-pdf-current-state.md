# Skills-registry PDF: current state audit

Audit date: 2026-05-21. Source commit: `3e66649` (`feat(skills): rename /skill-pdf to /skill-localUpdate`).

This document is the baseline reference for the redesign in PR-`chore/skills-pdf-redesign`. Every design decision in the new renderer points back to one of the three legibility problems named below.

## Pipeline, end to end

The PDF is the last hop of a five-step chain, exposed as the `/skill-localUpdate` slash command (formerly `/skill-pdf`, renamed in PR #141):

1. **Measurement**: `mikko-skill-usage` (lives in `~/.claude/skills/`, not this repo) walks every `~/.claude/projects/<dir>/<session>.jsonl` transcript, filters assistant messages by the harness-emitted `attributionSkill` field, dedupes by `requestId`, and writes a dated `SKILL-USAGE-{YYYY-MM-DD}.json` (plus a `LATEST.json` symlink-equivalent) to `.claude/agent-verdicts/`. This is the only source of measured data. Nothing else looks at transcripts.
2. **Inventory**: `/skill-registry` (this repo, `.claude/skills/skill-registry/SKILL.md`) walks `D:/koodaamista/*/.claude/skills/*/SKILL.md` plus the `claude-skills` library's `skills/*/SKILL.md`, dispatches one Sonnet sub-agent per repo, and aggregates the per-skill frontmatter + editorial receipts into `.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.json`. Editorial only, no measurement overlay happens here.
3. **Sync**: `scripts/sync-skill-registry.mjs` copies the latest dated registry JSON to `public/data/skills-registry.json` so the contact-page terminal and the PDF renderer both read the same file.
4. **Overlay**: `scripts/apply-measurement-overlay.mjs` reads `SKILL-USAGE-LATEST.json` and `public/data/skills-registry.json`, replaces editorial receipts with measurement-derived ones where the skill name matches (with an `INSTALL_PREFIX = "mikko-"` strip and a `CANONICAL_DUPLICATES` map that folds consumer-repo duplicates into the library row), preserves the displaced editorial figures under `receipt.prior_estimate` for the calibration line, and rewrites `public/data/skills-registry.json` in place. Bare measurement names (e.g. `mikko-help`) match library rows via the install-prefix strip; session-attributed names use `SESSION_TO_REPO` to find the right consumer repo.
5. **Render**: `scripts/build-skills-pdf.mjs` reads the merged JSON, builds an HTML string with embedded CSS, writes it to a temp file, then drives a locally-installed Chrome via `--print-to-pdf` (`scripts/lib/chrome-pdf.mjs`). Output lands at `public/skills-registry.pdf`. Short-circuits on CI / Vercel, the committed PDF is canonical for hosted builds.

The renderer's only input is the merged `public/data/skills-registry.json`. The redesign only needs to touch step 5; steps 1–4 stay as-is.

## Data shape after overlay

A single skill row looks like this on disk (`AudiobookMaker.copyright-scan`, the most useful sample because it has both measured data and a prior editorial estimate):

```json
{
  "name": "copyright-scan",
  "description": "Scan a git diff ... for accidental third-party copyright leaks ...",
  "redirect": false,
  "receipt": {
    "path": ".claude/agent-verdicts/SKILL-USAGE-LATEST.json",
    "source": "transcript-measurement",
    "tokens_per_use": 13881,
    "uses_per_year": 4,
    "annual_total": 55524,
    "measurement_window_days": 90,
    "invocations_in_window": 1,
    "total_tokens_in_window": 13881,
    "last_invoked": "2026-05-12T03:01:51.715Z",
    "prior_estimate": {
      "tokens_per_use": 3100,
      "uses_per_year": 0,
      "annual_total": 0,
      "source": "readme.md",
      "path": "https://github.com/MikkoNumminen/AudiobookMaker/blob/master/README.md"
    }
  }
}
```

Key invariants:

- **`receipt.source === "transcript-measurement"`** is the only way a row is "measured." Everything else (`docs/SKILLS.md`, `readme.md`, `skill-body`, `agent-verdicts/...`) is editorial.
- **Measured rows always carry** `invocations_in_window`, `total_tokens_in_window`, `measurement_window_days`, and `last_invoked`. They may also carry `prior_estimate` when the editorial value being displaced was a non-null number.
- **Editorial rows carry** `tokens_per_use`, `uses_per_year`, `annual_total`, `source`, `path`. Any of the three numeric fields may be `null` when the source only stated qualitative evidence.
- **Redirect rows** (`redirect: true`) carry `receipt: null` and exist purely to document a rename. Currently one row: `Spacepotatis.new-weapon`.

Top-level shape:

```json
{
  "generated_at": "<ISO>",
  "repos": [{ "name": "...", "github_url": "...", "skills": [...] }],
  "built_in_references": [{ "name": "review", "label": "/review", "description": "...", "tokens_per_use_avg": 1025060, "invocations_in_window": 14, ... }],
  "totals": { "skills": 33, "redirects": 1, "with_receipts": 32, "annual_tokens_saved": 20482860 }
}
```

The `totals.annual_tokens_saved` figure is *not* used by the current renderer (the renderer re-derives totals from `repo.skills[].receipt.annual_total`). Worth noting because it's a small inconsistency: the JSON-consumer-of-record (the contact-page terminal) does read `totals` directly.

The portfolio at the time of this audit (the snapshot the PDF was generated from):

- **33 skills** across 4 repos (AudiobookMaker 8, Spacepotatis 12, claude-skills 9, mikkonumminen.dev 4) plus 1 redirect.
- **12 measured rows**, 20 editorial.
- **`/review` built-in reference**: 14 invocations / 14.35M tokens in 90 days, projected to 57 uses / ~58.4M tokens per year. This number matters: the rest of the portfolio's measured annual is ~6.5M, so the built-in alone is ~9× the custom-skill measured cost.

## Current layout (what `build-skills-pdf.mjs` renders today)

A4 landscape, 9.5pt body. Single HTML string with embedded `<style>`. Sections in order:

1. **Title + meta paragraph**: one sentence, ~10 lines, explaining the green-left-border convention, the calibration line convention, and the tokens-saved heuristic (3× baseline, 2× savings). This paragraph is the *only* place those conventions are explained.
2. **`Reference: Claude Code built-ins`**: a one-row table showing `/review` with the same 6 columns the per-repo tables use. Marked as excluded from totals.
3. **`Aggregate`**: 5 columns (Repo / Skills / Times run / Tokens used / yr / Tokens saved / yr), one row per repo + a totals row.
4. **Per-repo sections**: one `<h2>` per repo, each with a 6-column table: Skill / Description / Cost / use / Times run / Tokens used / Tokens saved (est.).
5. **Footer**: generation timestamp, measured invocation count, measured token sum.

Row treatment within per-repo tables:

- Measured rows get a 3px green left border on the first cell (`tr.measured td:first-child { border-left: 3px solid #2e7d32; }`).
- The `Cost / use` cell carries a calibration subline on measured rows when a `prior_estimate` exists: `est. 3K · 4× under` or `est. 4K · 93× under`, green when within ±10%, orange when off by ≥5×.
- The `Times run` cell shows `<N> in 90d / → ~<M>/yr` for measured rows, `<N> / yr (est.)` for editorial rows.
- The `Tokens used` cell shows `<window-total> in window / ~<annual>/yr proj.` for measured, `~<annual>/yr (est.)` for editorial.
- The `Tokens saved (est.)` cell is `~<annual>/yr (est.)` for every non-redirect row.

## Three biggest legibility problems

These are the only findings worth carrying into the redesign. Smaller readability nits (the meta paragraph runs ten lines, line-height could be tighter, etc.) are noise compared to these three.

### 1. The measured-vs-estimated signal is too quiet

The current signal is a 3-pixel green left border on the first cell, plus a small `(measured)` or `(est.)` tag in the same gray as every other subline. At arm's length the green border disappears and the tag is unreadable. A reader scanning the page cannot distinguish a row backed by transcript receipts from a row that was an off-the-top-of-the-head guess by the skill author.

This is the single biggest failure of the current design. The whole document's credibility depends on this distinction being immediate, and right now it is not.

Concrete example: rows 1 and 3 in the AudiobookMaker table (`ai-codegen-smell-audit` measured, `ci-failure-triage` editorial) look almost identical at normal reading distance, despite one being a 200K-token measured fact and the other being a 1.9K-token guess that the author made up in a README.

### 2. The calibration delta is the smallest type on the page

When a measured row has a `prior_estimate`, the renderer shows a calibration line: `est. 4K · 93× under` in 7.5pt type (a `.subtle` class), sitting *inside* the Cost-per-use cell as the third visual line of that cell. This is the most senior-engineer-coded data in the entire document (the author admits in print "I guessed 4K and the truth was 200K, off by 93×"), and it is rendered smaller than the column header.

Concrete examples from the current snapshot:

- `AudiobookMaker.ai-codegen-smell-audit`: est. 7.3K · **27× under** (true: 199K).
- `claude-skills.audit`: est. 425K · **3× over** (true: ~150K once both `audit` and `mikko-audit` measurements accumulated).
- `Spacepotatis.equipment`: est. 4K · **93× under** (true: 401K).

A senior reader scans this column and sees the order-of-magnitude misses; that's the moment the document earns trust. The current treatment hides it.

### 3. Tokens-saved gives editorial rows equal billing with measured ones

The `Tokens saved (est.)` column carries an annualized savings figure (~2× cost-per-use × uses-per-year) for every row that has any receipt: measured *or* editorial. The aggregate row says "Total tokens saved / yr ~20.5M," and that 20.5M includes contributions from rows where both `tokens_per_use` and `uses_per_year` are pure author guesses. There is no visual cue distinguishing the ~3.5M annual savings that derive from measurement-backed multipliers from the ~17M that derive from editorial multipliers stacked on editorial uses-per-year.

This is the document's biggest honesty problem. The hero number a senior reader will quote ("Mikko's portfolio saves ~20M tokens a year") is roughly 80% editorial, but the document does nothing to flag that. The redesign needs to either visually downweight editorial savings contributions, split the headline number into "measured savings" + "estimated savings" pair, or both.

## Bonus: description column

Not in the top three because it's a layout problem rather than an honesty problem, but worth recording: each skill row carries 4–8 lines of description prose in a tiny column. The "scan a row in under 2 seconds" target in the redesign brief is impossible against the current layout: a reader cannot help reading the description before they get to the numbers, because the description occupies more vertical space than every other cell combined.

The redesign should drop the description to a single-sentence tagline (computed from the first sentence of the existing description), or move it to a smaller secondary line.

## What the redesign must preserve

- All the data fields the contact-page terminal reads from `public/data/skills-registry.json`. The renderer is allowed to *use* fewer fields; it must not require new fields that the pipeline doesn't currently produce.
- The CI / Vercel short-circuit behavior in `build-skills-pdf.mjs`. CI must not regenerate the committed PDF.
- The Chrome-PDF call path (`scripts/lib/chrome-pdf.mjs`) and its CLI ergonomics. No new npm dependencies.
- The `/review` built-in row as the scale anchor. It already exists in the data; the redesign needs to make it more visually comparable to the portfolio totals, not less.

## What the redesign explicitly may change

- The HTML/CSS template inside `build-skills-pdf.mjs`. The current single-string template is fine for the file size; an external CSS file is also fine if it stays one file.
- Column layout, ordering, and which columns exist. The current 6-column table can shrink or rearrange freely.
- The aggregate-table shape. The current "5 columns × 5 rows" treatment is one option among many.
- Where the methodology lives. Right now it's one meta paragraph at the top; the redesign brief says it gets a full page at the end.
