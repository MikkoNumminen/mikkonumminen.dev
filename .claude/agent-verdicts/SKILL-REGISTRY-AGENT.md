# Skill registry agent — design verdict

**Created:** 2026-05-19. **Skill:** [.claude/skills/skill-registry/SKILL.md](../skills/skill-registry/SKILL.md).
**Status:** Draft. Not yet validated against a real run.

This is the companion to `skill-registry`. The skill itself is a procedure ("how to scan"); this document is the reasoning ("why those choices, and what they don't prove").

---

## What the skill is for

Produce, in one invocation, a single markdown document that names every Claude Code skill in the portfolio: which repo it lives in, what it does, and — where a per-repo receipt exists — how many tokens it's estimated to save per year. Output is a dated report under `.claude/agent-verdicts/`. The `SKILL-REGISTRY-*` filename pattern is re-ignored by `.gitignore`, so the output stays local even though the parent directory is tracked.

The audience is **Mikko**, not a recruiter. The site copy talks about "audited Claude Code skills" in the abstract; this skill is what makes that claim defensible against drift on his own machine. If a recruiter ever does click through, the per-repo receipts they land on (e.g. Spacepotatis's `docs/SKILLS.md`) are the linkable surface — this registry is the index that points at them.

## What it is NOT for

- **Not a token meter.** The numbers it surfaces are author estimates, copied from `docs/SKILLS.md`-style receipts. They are _not_ sampled from real sessions. The Spacepotatis methodology doc states this explicitly ("educated guesses, 3× error bars").
- **Not a code auditor.** It does not read skill _bodies_ for correctness. It reads frontmatter and copies receipt numbers; the registry trusts each per-repo audit to do its own quality check.
- **Not a deployment surface.** The output is local — the dated `SKILL-REGISTRY-*.md` filename is re-ignored by `.gitignore` so the report doesn't accidentally land in a PR. Surfacing it on the site or in CI is a separate decision.

## Design choices

### Why a SKILL.md, not a node script

Considered but rejected: `scripts/scan-skills.mjs`. The skill approach wins because:

1. **Discoverability** — the user already runs `/<skill-name>` for everything else; a node script needs different muscle memory and a place to live.
2. **Zero install cost** — a SKILL.md is a markdown file. A node script needs `node`, possibly dependencies, possibly a `package.json` entry.
3. **The work is light** — ~25 small file reads + 1 markdown write. Claude can do this in the main context faster than spinning up a process.

Considered but rejected: store the registry generator in `claude-audit-skill/` and distribute it. The registry is portfolio-specific (knows the directory layout, the receipt-doc conventions, which repos to exclude). Generalising it would require frontmatter schema adoption first — premature.

### Why output goes to `agent-verdicts/`, not stdout

Matches the existing pattern (`README-SYNC-AGENT.md`). The user can re-read the last run without re-invoking the skill. Dated filenames preserve history without git tracking, so quarter-over-quarter drift is visible by `ls`-ing the directory.

### Why receipts can come from three places (docs/SKILLS.md, agent-verdicts/\*.md, SKILL.md body)

Repos haven't standardised. Spacepotatis uses `docs/SKILLS.md` for its 10-skill catalog. mikkonumminen.dev uses `.claude/agent-verdicts/<NAME>.md` for the sync-readmes skill's token economics. AudiobookMaker has 10 skills with no aggregate doc yet. The skill accommodates all three sources rather than forcing a migration.

The cost: the parser is loose. A skill whose token estimate lives in three different places might get double-counted; a skill whose estimate is in _no_ place gets a dash. Both are surfaced in "Notes & gaps."

### Why `claude-audit-skill/` is excluded

It's a distribution repo, not a consumption repo. The same audit skill exists inside Spacepotatis and AudiobookMaker as `audit/` and `ai-codegen-smell-audit/`. Including the publishable copy in the count would double-bill the same recipe.

### Why no commit of the output report

Two reasons. First, the report is point-in-time; persisting it in git creates expectation of update cadence that the skill doesn't currently fulfill (no cron, no GH Actions trigger). Second, dated output filenames are easier to reason about as a local quarterly artefact than as an ever-bumping committed file.

This is enforced by `.gitignore`: `.claude/agent-verdicts/*` re-ignores everything in the directory, then a `!`-bang opts THIS verdict file in by exact path. The SKILL.md is also tracked (via the broader `!.claude/skills/`). The runtime _output_ (matching `SKILL-REGISTRY-2026-*.md`) is never tracked. Adding a future verdict that should ship with its skill is one more bang line in `.gitignore`.

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

1. **Dry-run on the current portfolio.** Invoke the skill, read the output report, count by hand: expected ~25 skills (1 in mikkonumminen.dev + 14 in Spacepotatis + 10 in AudiobookMaker, with `new-weapon` flagged as a redirect so 24 catalog + 1 redirect). Are the receipts that exist (Spacepotatis `docs/SKILLS.md`, this repo's `README-SYNC-AGENT.md`) extracted correctly?
2. **Verify the redirect heuristic.** Open `D:/koodaamista/Spacepotatis/.claude/skills/new-weapon/SKILL.md` by hand and confirm the file matches the "short body + redirect-keyword" pattern. If it doesn't (e.g. the file is long, or uses a phrasing the heuristic doesn't match), tighten the heuristic in `SKILL.md` step 2 before trusting the redirect column.
3. **Catch one false positive.** Look for at least one row in the output where the registry is wrong — wrong description, wrong category, missing receipt. Fix the heuristic in `SKILL.md` and re-run.
4. **Catch one false negative.** Search the working tree for any `.md` file under `.claude/` containing skill-shaped content (frontmatter with `name:` and `description:`) that the registry missed. If none, the glob is tight enough.
5. **Reconcile with the site copy.** Compare the aggregate count + receipt count to the current `en.ts` claims. The recent PR #102 softened the copy to "a catalog of …"; check that this is still a defensible reading once the registry reports an actual number.
6. **Run quarterly.** The reason to run this _again_ is to catch drift since the last run. Use `/schedule` (cron-style routine) for a real cadence, or a calendar reminder. Do NOT use a `Stop` hook — that fires on every session end and would re-run the registry constantly.

## Open questions / future work

- **Schema adoption.** The honest upgrade path is: add `tokens_per_use`, `uses_per_year`, `last_audited` frontmatter to every SKILL.md, deprecate the docs/SKILLS.md split, and let this skill pull everything from one place. ~25-file backfill. Worth it only if Mikko wants to commit to keeping numbers current; otherwise it's just moving the staleness from one file to another.
- **Real-token sampling.** A separate skill could parse Claude Code transcript JSONL (under `C:\Users\vandr\.claude\projects\<dir>/`) and produce _measured_ tokens-per-invocation per skill. That would replace the editorial estimates with receipts. Significantly more work; out of scope here.
- **Site surfacing.** Should the registry's aggregate row land in the portfolio site as a stat tile (alongside "387 commits" etc.)? Only if the numbers are honest enough — and they aren't yet. Revisit after schema adoption.
- **Should HRManager and Platform have skills?** They currently don't. The registry will note them as "no .claude/skills/". Not a defect; just visible now.

## Status

- [x] Skill drafted and committed
- [x] Verdict doc drafted (this file)
- [ ] First dry-run completed
- [ ] False-positive caught and addressed
- [ ] False-negative search completed
- [ ] Frontmatter schema decision made (pending)
