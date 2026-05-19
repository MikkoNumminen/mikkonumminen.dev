# Skill registry agent — design verdict

**Created:** 2026-05-19. **Skill:** [.claude/skills/skill-registry/SKILL.md](../skills/skill-registry/SKILL.md).
**Status:** Draft. Not yet validated against a real run.

This is the companion to `skill-registry`. The skill itself is a procedure ("how to scan"); this document is the reasoning ("why those choices, and what they don't prove").

---

## What the skill is for

Produce, in one invocation, a single markdown document that names every Claude Code skill in the portfolio: which repo it lives in, what it does, and — where a per-repo receipt exists — how many tokens it's estimated to save per year. Output is a dated report under `.claude/agent-verdicts/`, tracked via the `SKILL-REGISTRY-*.md` gitignore exception so other Claude instances (other sessions, other machines) can read the current inventory without re-running the scan.

The primary audience is **Mikko**, but the secondary audience is **other Claude sessions** — when a future session asks "what skills do we have?" or "what's the current AI-tooling surface across the portfolio?", the committed report is the answer of record. If a recruiter clicks through, the per-repo receipts they land on (e.g. Spacepotatis's `docs/SKILLS.md`) are the linkable surface; this registry is the index that points at them.

## What it is NOT for

- **Not a token meter.** The numbers it surfaces are author estimates, copied from `docs/SKILLS.md`-style receipts. They are _not_ sampled from real sessions. The Spacepotatis methodology doc states this explicitly ("educated guesses, 3× error bars").
- **Not a code auditor.** It does not read skill _bodies_ for correctness. It reads frontmatter and copies receipt numbers; the registry trusts each per-repo audit to do its own quality check.
- **Not a site-surfacing tool.** The committed report lives in `.claude/agent-verdicts/` for Claude consumption, not on the portfolio's public surfaces. Whether the aggregate row should land on the site as a stat tile (alongside "387 commits") is a separate decision — the verdict's "Open questions" section still flags it as pending honest enough numbers.

## Design choices

### Why a SKILL.md, not a node script

Considered but rejected: `scripts/scan-skills.mjs`. The skill approach wins because:

1. **Discoverability** — the user already runs `/<skill-name>` for everything else; a node script needs different muscle memory and a place to live.
2. **Zero install cost** — a SKILL.md is a markdown file. A node script needs `node`, possibly dependencies, possibly a `package.json` entry.
3. **The work is light** — ~25 small file reads + 1 markdown write. Claude can do this in the main context faster than spinning up a process.

Considered but rejected: store the registry generator in `claude-audit-skill/` and distribute it. The registry is portfolio-specific (knows the directory layout, the receipt-doc conventions, which repos to exclude). Generalising it would require frontmatter schema adoption first — premature.

### Why output goes to `agent-verdicts/` and is checked in

Matches the existing pattern (`README-SYNC-AGENT.md` lives alongside as a sibling local-only verdict). But the registry report is _committed_ — other Claude sessions on other machines need to read it to know what the portfolio offers, and `git log` becomes the audit trail of quarter-over-quarter drift.

The tracking is narrowly scoped: only files matching `SKILL-REGISTRY-*.md` are tracked. Other future verdict docs stay local unless they explicitly opt in (one bang line in `.gitignore`). `README-SYNC-AGENT.md` is unaffected — it remains gitignored.

### Why receipts can come from three places (docs/SKILLS.md, agent-verdicts/\*.md, SKILL.md body)

Repos haven't standardised. Spacepotatis uses `docs/SKILLS.md` for its 10-skill catalog. mikkonumminen.dev uses `.claude/agent-verdicts/<NAME>.md` for the sync-readmes skill's token economics. AudiobookMaker has 10 skills with no aggregate doc yet. The skill accommodates all three sources rather than forcing a migration.

The cost: the parser is loose. A skill whose token estimate lives in three different places might get double-counted; a skill whose estimate is in _no_ place gets a dash. Both are surfaced in "Notes & gaps."

### Why `claude-audit-skill/` is excluded

It's a distribution repo, not a consumption repo. The same audit skill exists inside Spacepotatis and AudiobookMaker as `audit/` and `ai-codegen-smell-audit/`. Including the publishable copy in the count would double-bill the same recipe.

### Why commit the output report

Two reasons. First, other Claude instances on other machines need the report to answer "what skills do we have?" without re-running the scan — without the commit, every session that wanted the answer would have to enumerate all 26 SKILL.md files itself. Second, dated filenames become a `git log` of quarterly drift: "did the catalog grow this quarter, did any skill's token-savings receipt change, did a redirect appear" — all visible from the commit history.

This is enforced by `.gitignore`: `.claude/agent-verdicts/*` re-ignores everything in the directory, then a single `!`-bang opts in everything matching `SKILL-REGISTRY-*.md`. That covers both this verdict doc and every dated report (`SKILL-REGISTRY-2026-05-19.md`, `SKILL-REGISTRY-2026-08-19.md`, …). The SKILL.md itself is also tracked via the broader `!.claude/skills/`. Other verdict docs (e.g. `README-SYNC-AGENT.md`) stay local unless they explicitly opt in — one more bang line each.

## What's verifiable vs editorial

| Claim                       | Source of truth                      | Verifiable?                                                                 |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| Skill exists                | The `SKILL.md` file on disk          | ✅ Yes                                                                      |
| Skill name and description  | YAML frontmatter                     | ✅ Yes                                                                      |
| Total skill count per repo  | `ls .claude/skills/`                 | ✅ Yes                                                                      |
| Redirect vs catalog skill   | Body length + stub-keyword heuristic | 🟡 Heuristic — may misclassify                                              |
| Tokens per use              | Author's `docs/SKILLS.md` estimate   | 🔴 Editorial, not measured                                                  |
| Uses per year               | Author's `docs/SKILLS.md` estimate   | 🔴 Editorial, not measured                                                  |
| Annual savings total        | Product of the above two estimates   | 🔴 Editorial                                                                |
| "Audited quarterly" cadence | Dated audit docs in `docs/audits/`   | 🟡 Verifiable for Spacepotatis only, and there only one audit exists so far |

The registry is honest about which numbers are which by tagging the receipt column with the file path. A reader can trace any number to its source and see whether it's a measurement, an estimate, or missing.

## Validation plan

Before this skill is "shipped" (which here means "trusted to inform site copy"):

1. **Dry-run on the current portfolio.** [DONE 2026-05-19] Enumerated 26 SKILL.md files across 3 repos: 2 in mikkonumminen.dev (`sync-readmes`, `skill-registry`) + 14 in Spacepotatis (catalog of 13 + 1 redirect) + 10 in AudiobookMaker. Spacepotatis's `docs/SKILLS.md` now catalogs 13 entries totaling ~3.13M tokens/year (up from the 10 + ~2.76M referenced in the prior site copy — drift caught, fixed in the same PR). AudiobookMaker has no aggregate doc; all 10 of its skills are without receipts.
2. **Verify the redirect heuristic.** [DONE 2026-05-19] `new-weapon`'s body is 9 lines, not <5 — the original "short body + redirect-keyword" heuristic would have missed it. Tightened to read the YAML `description` field for "superseded / redirect / renamed / moved to / see also" instead. Description-based detection is more reliable because redirects almost always self-declare in the description regardless of body length.
3. **Catch one false positive.** [DONE 2026-05-19] The skill's original glob pattern (`d:/koodaamista/*/.claude/skills/*/SKILL.md` passed as `pattern:` only) returns zero results on Windows — the `Glob` tool requires the path as a separate `path:` parameter. Without correction, the registry would report "no skills found anywhere." Procedure rewritten in step 1 with the working invocation + a Bash fallback.
4. **Catch one false negative.** [DONE 2026-05-19] A recursive `**/.claude/skills/*/SKILL.md` glob surfaces many duplicate matches inside `.claude/worktrees/agent-*/` — those are runtime sandbox copies of real skills, not separate skills. The flat single-`*` glob naturally excludes them, so the documented procedure is tight; this was confirmed by comparing flat vs recursive results.
5. **Reconcile with the site copy.** [DONE 2026-05-19] Four spots in this repo previously said "~2.76M tokens" referencing Spacepotatis's older catalog count. With Spacepotatis now at ~3.13M (3 audit/meta skills got their own receipt rows since the last copy update), all four are updated in this PR: en.ts:110 (Velocity link label), en.ts:253 (AI-workflows lesson), en.ts:282 (Featured page lesson), commands.ts:54 (terminal `whoami` output). en.ts:253 also drops "audited quarterly" (missed by PR #102's sweep — only one audit doc exists in Spacepotatis still) and the unverifiable "caught two real ones in the last audit" (April 2026 audit findings are footnoted in `docs/SKILLS.md` but not in a dated audit doc).
6. **Run quarterly.** The reason to run this _again_ is to catch drift since the last run. Use `/schedule` (cron-style routine) for a real cadence, or a calendar reminder. Do NOT use a `Stop` hook — that fires on every session end and would re-run the registry constantly.

## Open questions / future work

- **Schema adoption.** The honest upgrade path is: add `tokens_per_use`, `uses_per_year`, `last_audited` frontmatter to every SKILL.md, deprecate the docs/SKILLS.md split, and let this skill pull everything from one place. ~25-file backfill. Worth it only if Mikko wants to commit to keeping numbers current; otherwise it's just moving the staleness from one file to another.
- **Real-token sampling.** A separate skill could parse Claude Code transcript JSONL (under `C:\Users\vandr\.claude\projects\<dir>/`) and produce _measured_ tokens-per-invocation per skill. That would replace the editorial estimates with receipts. Significantly more work; out of scope here.
- **Site surfacing.** Should the registry's aggregate row land in the portfolio site as a stat tile (alongside "387 commits" etc.)? Only if the numbers are honest enough — and they aren't yet. Revisit after schema adoption.
- **Should HRManager and Platform have skills?** They currently don't. The registry will note them as "no .claude/skills/". Not a defect; just visible now.

## Status

- [x] Skill drafted and committed
- [x] Verdict doc drafted (this file)
- [x] First dry-run completed (2026-05-19)
- [x] False-positive caught and addressed (Glob-pattern absolute-path issue + redirect-heuristic too tight)
- [x] False-negative search completed (recursive vs flat glob — flat is correct)
- [x] Site-copy reconciled with reality (~2.76M → ~3.13M across 4 spots)
- [ ] Frontmatter schema decision made (pending — AudiobookMaker still has 10 skills without receipts)
