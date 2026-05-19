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

### 1. Enumerate repos

Use `Glob` with pattern `*/.claude/skills/*/SKILL.md` and `path: d:/koodaamista`. Absolute paths in the pattern argument return zero results on Windows — the tool requires `path:` as a separate parameter with the pattern relative to it. If `Glob` still returns nothing for any reason, fall back to `ls d:/koodaamista/*/.claude/skills/*/SKILL.md` via Bash.

Group results by repo name (the segment after `koodaamista/`). Drop the `claude-audit-skill` repo if present.

### 2. Parse each SKILL.md

For each path, `Read` the first ~30 lines. Extract from YAML frontmatter:

- `name` — the skill's invocation slug
- `description` — the one-line summary Claude uses for skill matching

Mark a file as a **redirect stub** if the YAML `description` field contains "superseded", "redirect", "renamed", "moved to", or "see also". The description signal is more reliable than body-length heuristics — `new-weapon`'s body is 9 lines (would slip past a "< 5 lines" filter) but its description explicitly says _"Superseded by /equipment. ... This stub redirects."_ The first body line (after frontmatter) is also typically `# Superseded ...` or `# Renamed ...`, which is a secondary signal if the description is ambiguous.

### 3. Locate per-repo token-savings receipts

For each repo, in priority order:

1. **`docs/SKILLS.md`** — if present, parse the markdown table for `| skill | tokens-per-use | uses-per-year | total |` shape. Spacepotatis uses this pattern with footnotes.
2. **`.claude/agent-verdicts/*.md`** — if present, look for `## Token expectations` or `## Token economics` sections per skill.
3. **Embedded in the SKILL.md body** — last fallback. Look for `## Token expectations` or `Token economics` in the skill file itself.

If no receipt is found for a skill, mark the row as `—` (em-dash) for the token columns. Do not fabricate numbers.

### 4. Emit the report

Write `.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.md` using the user's local date (match `date +%Y-%m-%d` from their shell). Schema below. Print the absolute path of the written file to the user.

The dated filename matches the `SKILL-REGISTRY-*` pattern that `.gitignore` re-ignores, so the report stays local even though the parent directory is tracked.

### 5. Done

Report the file path and a one-line summary: `Wrote SKILL-REGISTRY-{date}.md — N repos, M skills (R redirects), T total catalog skills with receipts, U without.`

Do not commit. Do not open a PR. Do not mutate any other file. The user validates by reading the report and deciding whether to act on it.

## Output schema

```markdown
# Skill registry — {YYYY-MM-DD}

**Scope:** every `.claude/skills/*/SKILL.md` under `D:/koodaamista/*`, excluding `claude-audit-skill/`.

## Aggregate

| Repo              | Total skills | Redirects | With receipts | Estimated tokens saved/year |
| ----------------- | -----------: | --------: | ------------: | --------------------------: |
| mikkonumminen.dev |            N |         0 |             M |                           T |
| Spacepotatis      |            N |         1 |             M |                           T |
| AudiobookMaker    |            N |         0 |             M |                           T |
| **Total**         |        **N** |     **R** |         **M** |                       **T** |

Receipts column counts skills with token-savings estimates traceable to a docs/SKILLS.md or agent-verdicts/\*.md file.

## Per-repo

### mikkonumminen.dev

| Skill        | Description           | Tokens / use | Uses / year | Total | Receipt                                     |
| ------------ | --------------------- | -----------: | ----------: | ----: | ------------------------------------------- |
| sync-readmes | Audit project data... |            — |           — |     — | [agent-verdicts/README-SYNC-AGENT.md](path) |

(One section per repo. `—` means no receipt; the skill is real but the token-savings estimate hasn't been written up.)

## Notes & gaps

- Skills without receipts: N (across all repos). These exist but have no token-savings estimate in any companion doc. Backfilling them requires either (a) adding `tokens_per_use` / `uses_per_year` to each SKILL.md's frontmatter, or (b) writing a sibling docs/SKILLS.md for each repo.
- Redirect stubs counted separately so the "total catalog" number isn't inflated. Example: Spacepotatis's `new-weapon` is a redirect to `equipment`.
- All token-savings figures are author-estimated — see [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md) in Spacepotatis for the methodology and explicit 3× error bar.
```

## Token expectations

For a portfolio of ~25 skill files across 3-4 repos (current scale, 2026-05):

- 25 × `Read` of first 30 lines ≈ 30K tokens input
- 3 × `Read` of sibling SKILLS.md docs (~250 lines each) ≈ 30K tokens input
- 1 × `Write` of the report ≈ 5K tokens output
- Wall-clock: under 60s. No Sonnet sub-agents needed — scan is mechanical enough for the main thread.

If the portfolio grows past ~50 skills, consider extracting the file-read step to a Sonnet sub-agent and only synthesizing the table in the main context.

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
