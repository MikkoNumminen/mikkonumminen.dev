---
name: skill-registry
description: Scan every sibling repo under D:/koodaamista for `.claude/skills/*/SKILL.md` files and emit a consolidated registry — per-repo tables of skill name, description, and (where receipts exist) token-savings estimates. Output goes to a dated markdown report under `.claude/agent-verdicts/` for the user to validate.
---

# Skill registry

Walk every sibling repo under `D:/koodaamista`, find each Claude Code skill, and produce one consolidated markdown report listing every skill the portfolio operates: name, description, token-savings estimate (if a per-repo receipt exists), and the file path that backs each claim.

**Companion doc:** [.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md](../../agent-verdicts/SKILL-REGISTRY-AGENT.md) — design rationale, what's verifiable vs editorial, schema gaps, validation notes.

## When to use

- "/skill-registry", "scan all skills", "audit the portfolio skill catalog", "what skills do we ship", "how many tokens do we save across the portfolio"
- Before updating any site copy that quantifies skills, audits, or token savings (e.g. `src/i18n/locales/en.ts` mentions of Spacepotatis's catalog)
- Quarterly drift-check: confirm the public claim matches the file system

NOT for: editing skills, validating skill correctness, measuring actual run-time token usage. This is an inventory tool, not a code reviewer.

## What this skill does

1. Walk `D:/koodaamista/*` for sibling directories.
2. For each directory, look for `.claude/skills/*/SKILL.md`.
3. Parse each `SKILL.md`'s YAML frontmatter (`name`, `description`).
4. Detect "redirect" stubs (single-line `# Renamed → ...` or `See <other>`) and mark them separately so they're not double-counted.
5. For each repo, look for a sibling token-savings doc in known locations (see "Token-savings receipts" below) and extract per-skill estimates.
6. Emit a single markdown report grouped per repo, with an aggregate table at the top.
7. Write the report to `.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.md` and print the path. Do not commit.

End-to-end with no user pauses. The report is editorial-grade until a frontmatter schema is adopted — see "Limitations" below.

## Scope

**Repos scanned:** every direct subdirectory of `D:/koodaamista/` that contains a `.claude/skills/` directory.

**Repos excluded:**

- `claude-audit-skill/` — meta-repo distributing a skill, not a repo _using_ skills. Its skill lives at `skill/` (no `.claude/skills/` directory), so the glob below naturally won't match it; this entry is documented as a guard in case that repo ever adopts the standard layout.

**Files read:**

- `D:/koodaamista/*/.claude/skills/*/SKILL.md` — every skill file under every sibling
- `D:/koodaamista/*/docs/SKILLS.md` — Spacepotatis's methodology doc (and any repo that adopts the same pattern)
- `D:/koodaamista/*/.claude/agent-verdicts/*.md` — per-skill verdict docs (mikkonumminen.dev pattern); look for "Token expectations" sections

**Files written:** one dated report under `.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.md` in this repo only.

## Procedure

The expensive part (reading 26 SKILL.md files + 3 receipt sources) is parallelised across one Sonnet sub-agent per repo. Main thread handles enumeration and final aggregation.

### 1. Enumerate repos (main thread)

`ls d:/koodaamista/*/.claude/skills/*/SKILL.md` via Bash. (Equivalent `Glob` invocations have proven unreliable in some Windows sessions — see [SKILL-REGISTRY-AGENT.md "Open questions"](../../agent-verdicts/SKILL-REGISTRY-AGENT.md); the `ls` fallback always works.)

Group the resulting paths by repo name (the segment after `koodaamista/`). Drop the `claude-audit-skill` repo if present.

### 2. Dispatch one Sonnet agent per repo (parallel, in a single message)

Spawn **N parallel** `Agent` tool calls — one per repo with skills, **all in the same message** so they run concurrently. Use `subagent_type: "general-purpose"`, `model: "sonnet"`, `run_in_background: true`. Each agent does the read-heavy work for its repo and returns a structured JSON blob; the main thread does NOT read SKILL.md frontmatter itself.

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
   a. `D:/koodaamista/{REPO}/docs/SKILLS.md` — markdown table with rows like `| /<skill> | ~X K | Y | ~Z K |`
   b. `D:/koodaamista/{REPO}/.claude/agent-verdicts/<NAME>-AGENT.md` — `## Token expectations` section
   c. The SKILL.md body — `## Token expectations` section
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
      "source": "docs/SKILLS.md" | "agent-verdicts/<NAME>-AGENT.md" | "frontmatter",
      "tokens_per_use": <int or null>,
      "uses_per_year": <int or null>,
      "annual_total": <int or null>
    }
  }, ...]
}

Conventions: integers (no commas, no "K" suffix — `13500` not `"13.5K"`); `annual_total = tokens_per_use × uses_per_year` when both known; redirect skills get `receipt: null`.
```

### 3. Wait for completion + aggregate (main thread)

Each agent posts a `task-notification` when done; the harness re-invokes the main thread. Do not poll.

When all agents have returned, parse each per-repo JSON and assemble the final document:

- `generated_at`: current UTC ISO 8601 timestamp.
- `repos`: array of agent outputs, ordered alphabetically by repo name.
- `totals`: computed from `repos`:
  - `skills`: sum of `repos[].skills.length`.
  - `redirects`: count where `redirect === true`.
  - `with_receipts`: count where `receipt !== null`.
  - `annual_tokens_saved`: sum of `receipt.annual_total` where present.

Validate that `totals.annual_tokens_saved` equals the sum of all `receipt.annual_total` values before writing. If a sub-agent returned a malformed entry (missing required field, inconsistent total), flag the entry in a one-line note when reporting the path back to the user.

### 4. Emit the report

Write `.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.json` using the user's local date (match `date +%Y-%m-%d` from their shell). Schema below — output is **structured JSON, not markdown**, so other Claude sessions can parse it reliably and consumers can check `receipt === null` instead of regex-scraping em-dashes. Print the absolute path of the written file to the user.

The `SKILL-REGISTRY-*` filename pattern (no extension) is tracked by `.gitignore`, so both `.json` reports and the companion `.md` verdict doc enter git when committed. Checking in the report lets other Claude instances (other sessions, other machines) read the current portfolio inventory without re-running the scan. Dated filenames preserve history so quarter-over-quarter drift is visible by `git log`.

### 5. Done

Report the file path and a one-line summary: `Wrote SKILL-REGISTRY-{date}.json — N repos, M skills (R redirects), T total catalog skills with receipts, U without.`

If the report introduces new findings or supersedes a prior dated report, commit and push it as a fresh registry snapshot — the JSON is the canonical "what skills the portfolio operates today" document. Do not mutate any other file as part of the run. The user reviews the report contents and decides whether to act on its findings (e.g. update site copy, backfill receipts).

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
        source: string,           // "docs/SKILLS.md" | "agent-verdicts/X.md" | "frontmatter"
        tokens_per_use: number | null,
        uses_per_year: number | null,
        annual_total: number | null
      },
      last_audited?: string       // ISO date, optional — populated only if a per-skill audit timestamp exists
    }]
  }],
  totals: {
    skills: number,               // sum of skills[] across all repos, INCLUDING redirects
    redirects: number,            // sum of skills where redirect === true
    with_receipts: number,        // sum of skills where receipt !== null
    annual_tokens_saved: number   // sum of receipt.annual_total where present
  }
}
```

**Conventions:**

- `generated_at` is ISO 8601 with `Z` suffix for UTC.
- Numbers are integers (not strings, not formatted with commas).
- `annual_total` should equal `tokens_per_use × uses_per_year` whenever both are present; if only the annual figure is known directly (e.g. extracted from a docs/SKILLS.md "Total" column), per-use and per-year can stay `null`.
- `path` for Spacepotatis-style receipts is the GitHub URL to `docs/SKILLS.md`; for local-only verdicts it is the relative path (e.g. `.claude/agent-verdicts/README-SYNC-AGENT.md`).
- `redirect: true` rows have `receipt: null` and are excluded from `with_receipts` and `annual_tokens_saved` totals.

A human-readable view can be rendered from this JSON by any consumer (Claude session, dashboard, script). The JSON is the source of truth; renderings are derived.

## Token expectations

For a portfolio of ~25 skill files across 3 repos (current scale, 2026-05), running with one Sonnet sub-agent per repo:

- Sub-agent input (parallel, across 3 agents): ~80K total — each agent reads its repo's SKILL.md files (~30 lines each) plus the per-repo receipt doc (`docs/SKILLS.md` or `agent-verdicts/<NAME>.md`)
- Sub-agent output: ~10K total — each returns a structured JSON blob for its repo
- Main-context absorption: ~5K — read N small JSON blobs + write the aggregate report
- Wall-clock: ~30s parallel agents + ~5s main-thread aggregation
- Sonnet pricing is materially cheaper per token than Opus, so the dollar-equivalent cost is well under the raw 80K input figure

Compare to a serial main-thread version of the same work (~60K input read directly into Opus context): the parallel version is roughly the same total token cost, but ~3-5× faster in wall-clock and keeps the main context free for synthesis. Worth it for a quarterly run; mandatory if the portfolio grows past ~50 skills.

## Failure modes

- **Repo deleted or renamed:** Glob returns no match for that path; skip silently. Report excludes the missing repo.
- **Malformed frontmatter** (no `name` or `description`): use the parent directory name as the skill name, mark description as `(missing frontmatter)`, log in the "Notes & gaps" section.
- **Token-savings doc points to a skill not in `.claude/skills/`** (drift between receipts and reality): list the orphan in the "Notes & gaps" section.
- **`.claude/` is gitignored on most repos / most paths:** that's expected. The report runs against the local working tree, not git history. Even in this repo (which tracks `.claude/skills/` and the verdict file specifically), the dated output report is re-ignored — it's point-in-time data, not a checked-in artifact.

## Limitations (editorial-grade, not audit-grade)

This skill produces an **inventory**, not a verified audit. The token-savings numbers it surfaces are author-estimated educated guesses (see Spacepotatis's `docs/SKILLS.md` methodology section, which states this explicitly). Aggregating them across repos does not make them more verifiable — it makes them visible.

To upgrade this skill from inventory to audit:

1. Adopt a frontmatter schema across all SKILL.md files: `tokens_per_use`, `uses_per_year`, `last_audited` (ISO date).
2. Backfill the schema across every existing skill file (~25 files as of 2026-05).
3. Run a quarterly audit that re-estimates token usage by sampling actual sessions.

Until those happen, the registry is a useful drift-detector and surface-area map — and an honest receipt that the catalog _exists_ — but the totals are not load-bearing.
