---
name: skill-registry
description: Scan every sibling repo in the workspace for `.claude/skills/*/SKILL.md` files and emit a consolidated registry as a structured JSON document — per-skill name, description, redirect flag, and (where receipts exist) token-savings estimates. Runs one Sonnet sub-agent per repo in parallel for swiftness. Output goes to a dated JSON file under `.claude/agent-verdicts/`, committed so other Claude sessions can read the current inventory without re-running.
---

# Skill registry

Walk every sibling repo in the workspace, find each Claude Code skill, and produce one consolidated JSON document listing every skill the portfolio operates: name, description, token-savings estimate (if a per-repo receipt exists), and the file path that backs each claim. Reads are parallelised — one Sonnet sub-agent per repo — so the whole run lands in ~30s.

**Workspace root.** This skill refers to the directory that holds this repo and its siblings as `$WS`. Resolve it portably as the parent of the current repo — `WS="$(dirname "$(git rev-parse --show-toplevel)")"` — which is `~/koodailua` on the current macOS setup and was `$WS` on the original Windows setup. Override by exporting `WS` if the layout differs. Every path below is written relative to `$WS`.

**Companion doc:** [.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md](../../agent-verdicts/SKILL-REGISTRY-AGENT.md) — design rationale, what's verifiable vs editorial, schema gaps, validation notes.

## When to use

- "/skill-registry", "scan all skills", "audit the portfolio skill catalog", "what skills do we ship", "how many tokens do we save across the portfolio"
- Before updating any site copy that quantifies skills, audits, or token savings (e.g. `src/i18n/locales/en.ts` mentions of Spacepotatis's catalog)
- Quarterly drift-check: confirm the public claim matches the file system

NOT for: editing skills, validating skill correctness, measuring actual run-time token usage. This is an inventory tool, not a code reviewer.

## What this skill does

1. **Main thread** enumerates `$WS/*/.claude/skills/*/SKILL.md` plus `$WS/claude-skills/skills/*/SKILL.md` (library layout — no `.claude/` prefix) and groups paths by repo.
2. **Dispatches one Sonnet sub-agent per repo in parallel** (all in a single message) — each agent reads the YAML frontmatter (`name`, `description`) of every SKILL.md in its repo, classifies redirects from the description, locates a token-savings receipt from `docs/SKILLS.md` / `agent-verdicts/*-AGENT.md` / the SKILL.md body, and returns a structured per-repo JSON blob.
3. **Main thread aggregates** the per-repo blobs into the final document, computes `totals`, validates the arithmetic. Editorial-only — no transcript-measurement overlay happens in this skill (that's a separate step in the `/skill-localUpdate` chain).
4. Writes `.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.json` and prints the path.
5. If the report introduces new findings or supersedes a prior dated report, commits and pushes it as a fresh registry snapshot — the JSON is the canonical "what skills the portfolio operates today" document, and other Claude sessions read it without re-running.

End-to-end with no user pauses. The numbers are editorial-grade until a frontmatter schema is adopted — see "Limitations" below.

## Scope

**Repos scanned:**

- Every direct subdirectory of `$WS/` that contains a `.claude/skills/` directory (the standard consumer-repo layout).
- The `claude-skills/` library at `$WS/claude-skills/` — uses `skills/<name>/SKILL.md` (no `.claude/` prefix). Treated as a 4th virtual repo entry in the output so newly authored library skills appear in the registry automatically.

**Repos excluded:**

- Meta-repos that distribute a single skill under a `skill/` (singular) directory rather than the `skills/` or `.claude/skills/` layout — the globs below naturally won't match them. The newer `skills/` (plural) layout IS scanned (see the `claude-skills` library above).

**Files read:**

- `$WS/*/.claude/skills/*/SKILL.md` — every skill file under every sibling consumer repo
- `$WS/claude-skills/skills/*/SKILL.md` — every skill file in the library (no `.claude/` prefix)
- `$WS/*/docs/SKILLS.md` — Spacepotatis's methodology doc (and any repo that adopts the same pattern)
- `$WS/*/.claude/agent-verdicts/*.md` — per-skill verdict docs (mikkonumminen.dev pattern); look for "Token expectations" sections

**Files written:** one dated report under `.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.json` in this repo only.

## Procedure

The expensive part (reading ~37 SKILL.md files + per-repo receipt sources) is parallelised across one Sonnet sub-agent per repo. Main thread handles enumeration and final aggregation.

### 1. Enumerate repos (main thread)

Run both via Bash and concatenate the output:

- `ls "$WS"/*/.claude/skills/*/SKILL.md` — standard consumer-repo layout.
- `ls "$WS"/claude-skills/skills/*/SKILL.md` — library layout (no `.claude/` prefix).

(Equivalent `Glob` invocations have proven unreliable in some Windows sessions — see [SKILL-REGISTRY-AGENT.md "Open questions"](../../agent-verdicts/SKILL-REGISTRY-AGENT.md); the `ls` fallback always works.)

Group the resulting paths by repo name (the path segment directly under `$WS`). The `claude-skills` repo's paths group under `claude-skills` and feed step 2's dispatch as a 4th sub-agent. Drop any meta-repo entries whose layout uses a singular `skill/` directory.

### 2. Dispatch one Sonnet agent per repo (parallel, in a single message)

Spawn **N parallel** `Agent` tool calls — one per repo with skills, **all in the same message** so they run concurrently. Use `subagent_type: "general-purpose"`, `model: "sonnet"`, `run_in_background: true`. Each agent does the read-heavy work for its repo and returns a structured JSON blob; the main thread does NOT read SKILL.md frontmatter itself.

**Note on the `claude-skills` library agent:** it follows the same prompt shape as the consumer-repo agents, but the library has no `docs/SKILLS.md` and no `agent-verdicts/`. Its receipts come from each SKILL.md body's own `## Token expectations` section — label `source: "skill-body"` and use `skills/<NAME>/SKILL.md` as `path` (library layout, no `.claude/` prefix). Sources 3a / 3b / 3c in the template below won't match for library skills; that's expected — fall through to 3d.

**Agent prompt template** — substitute `{REPO}` and `{PATHS}` per dispatch:

```
You are processing one repo for the portfolio skill registry. READ-ONLY — do not edit, do not commit.

**Repo:** {REPO}
**Skill paths (already enumerated):**
{PATHS}

For each path, do all of:

1. Read the first 30 lines and extract YAML frontmatter `name` and `description`.
2. Classify as a redirect stub if `description` contains "superseded", "redirect", "renamed", "moved to", or "see also" (case-insensitive). Redirect stubs have `receipt: null`.
3. For non-redirect skills, locate a token-savings receipt by checking these sources in order:
   a. `$WS/{REPO}/docs/SKILLS.md` — markdown table with rows like `| /<skill> | ~X K | Y | ~Z K |`. Label `source: "docs/SKILLS.md"`. Use `https://github.com/MikkoNumminen/{REPO}/blob/master/docs/SKILLS.md` for `path`.
   b. `$WS/{REPO}/.claude/agent-verdicts/<NAME>-AGENT.md` — `## Token expectations` or `## Token economics` section per skill. Label `source: "agent-verdicts/<NAME>-AGENT.md"`.
   c. `$WS/{REPO}/README.md` — look for a heading containing "Skill catalog" (or similar phrasing like "Skills inventory") with a per-skill table that has at least a "saves/inv" or "tokens/use"-equivalent column. AudiobookMaker uses this pattern. Use `https://github.com/MikkoNumminen/{REPO}/blob/master/README.md` for `path`. Label `source: "readme.md"`. **Extraction conventions:** ranges (e.g. `~5-6k`) → midpoint integer; qualitative entries (`load-bearing`, `negligible`) → `null`; numeric N-day usage counts (e.g. `22 commits` in a "90-day usage" column) → multiply by `365/N` (typically ×4 for 90-day evidence) and round to integer; explicit zeros (`0 invocations`, `corpus empty`) → `0`; qualitative usage (`actively used`) and outstanding-count phrasing (`63 active worktrees`) → `null`. This is **unit conversion from stated evidence**, not imputation.
   d. The SKILL.md body itself — `## Token expectations` section. Label `source: "skill-body"` and use the SKILL.md's own path (e.g. `.claude/skills/<NAME>/SKILL.md`) as `path`.
   Use the first source that names the skill. If none, `receipt: null`.

Return EXACTLY this JSON (no preamble, no markdown):

{
  "name": "{REPO}",
  "github_url": "https://github.com/MikkoNumminen/{REPO}" or null,
  "skills": [{
    "name": "...",
    "description": "...",
    "redirect": true | false,
    "receipt": null | {
      "path": "<URL or relative path>",
      "source": "docs/SKILLS.md" | "agent-verdicts/<NAME>-AGENT.md" | "readme.md" | "skill-body",
      "tokens_per_use": <int or null>,
      "uses_per_year": <int or null>,
      "annual_total": <int or null>
    }
  }, ...]
}

Conventions: integers (no commas, no "K" suffix — `13500` not `"13.5K"`); `annual_total = tokens_per_use × uses_per_year` when both known; redirect skills get `receipt: null`; **no HTML entities — bare `<` and `>` are valid in JSON strings** (write `<word>` not `&lt;word&gt;`); leave fields `null` when the source doesn't state them or only states qualitative descriptors (do NOT impute cadence from absence — but DO unit-convert stated numeric evidence, e.g. a stated 90-day count multiplied by 4 ≈ annual, per source (c)'s extraction rules).
```

### 3. Wait for completion + aggregate (main thread)

Each agent posts a `task-notification` when done; the harness re-invokes the main thread. Do not poll.

When all agents have returned, parse each per-repo JSON and assemble the final document:

- `generated_at`: current UTC ISO 8601 timestamp.
- `repos`: array of agent outputs, **ASCII-sorted by repo name** (uppercase letters before lowercase). Current portfolio orders as `AudiobookMaker, Spacepotatis, claude-skills, mikkonumminen.dev`.
- `totals`: computed from `repos`:
  - `skills`: sum of `repos[].skills.length`.
  - `redirects`: count where `redirect === true`.
  - `with_receipts`: count where `receipt !== null`. A receipt can have a non-null `path` / `source` but still have `tokens_per_use`, `uses_per_year`, or `annual_total` set to null — that skill counts toward `with_receipts` but contributes nothing to `annual_tokens_saved`. The gap between these two counts is meaningful and is visible in [the verdict doc's "with_receipts vs annual contributors" note](../../agent-verdicts/SKILL-REGISTRY-AGENT.md#open-questions--future-work).
  - `annual_tokens_saved`: sum of `receipt.annual_total` where non-null.

Validate that `totals.annual_tokens_saved` equals the sum of all `receipt.annual_total` values before writing. If a sub-agent returned a malformed entry (missing required field, inconsistent total), flag the entry in a one-line note when reporting the path back to the user.

**Post-process: strip HTML entities.** Sonnet sub-agents have repeatedly returned descriptions with `&lt;` / `&gt;` / `&amp;` despite explicit "no HTML entities" instructions in the agent prompt. The convention text alone is insufficient. As defense-in-depth, before writing the aggregated JSON, replace `&lt;` → `<`, `&gt;` → `>`, `&amp;` → `&` across every `description` field. This is mechanical and safe — JSON strings never legitimately contain HTML entities.

**Transcript-measurement overlay:** this step is intentionally NOT done here. The `/skill-localUpdate` chain runs `scripts/apply-measurement-overlay.mjs` as a separate step after `/skill-registry` writes the inventory — that script handles the measurement overlay with proper `prior_estimate` snapshotting, `mikko-` prefix routing, and library-canonical accumulation. `/skill-registry` produces editorial-only receipts; measurements land later in the chain.

### 4. Emit the report

Write **two** files:

1. `.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.json` — dated snapshot (use the user's local date, match `date +%Y-%m-%d`). Preserves history; `git log` shows quarter-over-quarter drift.
2. `.claude/agent-verdicts/SKILL-REGISTRY-LATEST.json` — byte-identical copy of the dated file. README.md and other consumers link this filename so they don't go stale when the next run lands.

Schema below — output is **structured JSON, not markdown**, so other Claude sessions can parse it reliably and consumers can check `receipt === null` instead of regex-scraping em-dashes. Print both absolute paths to the user.

The `SKILL-REGISTRY-*` filename pattern (no extension) is tracked by `.gitignore`, so the dated `.json` reports, the `LATEST.json` pointer, and the companion `.md` verdict doc all enter git when committed. Checking in the report lets other Claude instances (other sessions, other machines) read the current portfolio inventory without re-running the scan.

**Receipt fidelity reminder:** when a sub-agent reports a `tokens_per_use` figure, cross-check it against the explicit numbers in the receipt source (`docs/SKILLS.md` table cell, or the `## Token expectations` / `## Token economics` section in the verdict doc / SKILL body). If the sub-agent's number doesn't appear verbatim in that source, prefer the source. The whole point of the receipt is that the public claim is anchored to a real file.

### 5. Done

Report the file path and a one-line summary: `Wrote SKILL-REGISTRY-{date}.json — N repos, M skills (R redirects), T total catalog skills with receipts, U without.`

If the report introduces new findings or supersedes a prior dated report, commit and push it as a fresh registry snapshot — the JSON is the canonical "what skills the portfolio operates today" document. Do not mutate any other file as part of the run. The user reviews the report contents and decides whether to act on its findings (e.g. update site copy, backfill receipts).

**Auto-sync to the site surface.** The contact-page terminal reads the registry from `public/data/skills-registry.json`. A `prebuild` hook (see [package.json](../../../package.json) and [scripts/sync-skill-registry.mjs](../../../scripts/sync-skill-registry.mjs)) finds the latest dated `SKILL-REGISTRY-*.json` in this directory and copies it into place on every `npm run build` — so committing a fresh dated JSON is enough; no manual copy needed. The companion `scripts/build-skills-pdf.mjs` regenerates `public/skills-registry.pdf` on local builds (skipped in CI to keep the committed PDF canonical). When you ship a registry refresh that should also update the PDF, run `npm run build:skills-pdf` locally before pushing.

## Output schema

```ts
{
  generated_at: string,           // ISO 8601 UTC timestamp
  repos: [{
    name: string,                 // directory name (e.g. "Spacepotatis")
    github_url?: string,          // optional; rendered as a link if https://
    skills: [{
      name: string,               // from YAML frontmatter `name:`
      description: string,        // from YAML frontmatter `description:` (full, not truncated)
      redirect: boolean,          // true if description matches the redirect heuristic
      receipt: null | {
        path: string,             // file path or URL (only http(s) is clickable)
        source: string,           // "transcript-measurement" | "docs/SKILLS.md" | "agent-verdicts/X.md" | "readme.md" | "skill-body"
        tokens_per_use: number | null,
        uses_per_year: number | null,
        annual_total: number | null,
        measurement_window_days?: number  // set only when source == "transcript-measurement"; e.g. 90
      },
      last_audited?: string       // ISO date, optional — populated only if a per-skill audit timestamp exists
    }]
  }],
  totals: {
    skills: number,               // sum of skills[] across all repos, INCLUDING redirects
    redirects: number,            // sum of skills where redirect === true
    with_receipts: number,        // count of skills with any receipt object (non-null). NOTE: receipts can have null tokens_per_use / uses_per_year / annual_total — those skills count here but don't contribute to annual_tokens_saved. See verdict doc.
    annual_tokens_saved: number   // sum of receipt.annual_total where non-null. Strictly less than or equal to the contribution from with_receipts skills (≥ 0 of those can have null annual_total).
  }
}
```

**Conventions:**

- `generated_at` is ISO 8601 with `Z` suffix for UTC.
- Numbers are integers (not strings, not formatted with commas).
- `annual_total` should equal `tokens_per_use × uses_per_year` whenever both are present; if only the annual figure is known directly (e.g. extracted from a docs/SKILLS.md "Total" column), per-use and per-year can stay `null`.
- `path` for Spacepotatis-style receipts is the GitHub URL to `docs/SKILLS.md`; for local-only verdicts it is the relative path (e.g. `.claude/agent-verdicts/README-SYNC-AGENT.md`).
- `redirect: true` rows have `receipt: null` and are excluded from `with_receipts` and `annual_tokens_saved` totals.
- `transcript-measurement` is a valid `source` value in downstream artifacts (the registry JSON as published in `public/data/skills-registry.json`), but `/skill-registry` itself never writes it — `scripts/apply-measurement-overlay.mjs` adds those receipts in a later step of the `/skill-localUpdate` chain, preserving the editorial figure as a `prior_estimate` snapshot. The schema lists `transcript-measurement` so consumers know what to expect after the overlay runs.

A human-readable view can be rendered from this JSON by any consumer (Claude session, dashboard, script). The JSON is the source of truth; renderings are derived.

## Token expectations

For a portfolio of ~37 skill files across 4 repos (current scale, 2026-05; consumer repos plus the `claude-skills` library), running with one Sonnet sub-agent per repo:

- Sub-agent input (parallel, across 4 agents): ~110K total — each agent reads its repo's SKILL.md files (~30 lines each) plus the per-repo receipt doc (`docs/SKILLS.md` or `agent-verdicts/<NAME>.md`); the library agent reads only SKILL.md bodies
- Sub-agent output: ~14K total — each returns a structured JSON blob for its repo
- Main-context absorption: ~6K — read N small JSON blobs + write the aggregate report
- Wall-clock: ~30s parallel agents + ~5s main-thread aggregation
- Sonnet pricing is materially cheaper per token than Opus, so the dollar-equivalent cost is well under the raw 110K input figure
- ~12 uses/year — monthly during active skill-development phases, quarterly otherwise; run total ~12 × 130K ≈ 1.56M tokens/year. Author estimate pending the in-flight skill-usage measurement tool.

Compare to a serial main-thread version of the same work (~80K input read directly into Opus context): the parallel version is roughly the same total token cost, but ~3-5× faster in wall-clock and keeps the main context free for synthesis. Worth it for a quarterly run; mandatory if the portfolio grows past ~50 skills.

## Failure modes

- **Repo deleted or renamed:** Glob returns no match for that path; skip silently. Report excludes the missing repo.
- **Malformed frontmatter** (no `name` or `description`): use the parent directory name as the skill name, mark description as `(missing frontmatter)`, log in the "Notes & gaps" section.
- **Token-savings doc points to a skill not in `.claude/skills/`** (drift between receipts and reality): list the orphan in the "Notes & gaps" section.
- **`.claude/` is gitignored on most repos / most paths:** that's expected. Sub-agents read the local working tree, not git history. In **this** repo, `.claude/skills/` is tracked and the `SKILL-REGISTRY-*` pattern is opted in — both the verdict doc and dated JSON reports land in git so other Claude sessions can read them. Sibling repos (Spacepotatis, AudiobookMaker) keep their `.claude/` local; their `docs/SKILLS.md` is what gets read across machines.

## Limitations (editorial-grade, not audit-grade)

This skill produces an **inventory**, not a verified audit. The token-savings numbers it surfaces are author-estimated educated guesses (see Spacepotatis's `docs/SKILLS.md` methodology section, which states this explicitly). Aggregating them across repos does not make them more verifiable — it makes them visible.

To upgrade this skill from inventory to audit:

1. Adopt a frontmatter schema across all SKILL.md files: `tokens_per_use`, `uses_per_year`, `last_audited` (ISO date).
2. Backfill the schema across every existing skill file (~37 files across 4 repos as of 2026-05).
3. Run a quarterly audit that re-estimates token usage by sampling actual sessions.

Until those happen, the registry is a useful drift-detector and surface-area map — and an honest receipt that the catalog _exists_ — but the totals are not load-bearing.
