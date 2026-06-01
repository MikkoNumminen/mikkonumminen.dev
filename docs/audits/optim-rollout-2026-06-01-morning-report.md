# optim-rollout — Morning report (2026-06-01)

Autonomous overnight run. **Nothing was merged. Nothing was pushed. No skill file was edited.**
Everything below lives on local branches for your review. Full decision trail: companion
[`optim-rollout-2026-06-01-ledger.md`](./optim-rollout-2026-06-01-ledger.md).

## tl;dr

The audit/fix queue ran to completion: **32 skills audited, 0 fixes warranted.** Every flagged skill
was either rigor-exempt (audit family — never auto-edit), flagged only for *structural* smells
(loop-prose / oversized file — out of the "bounded guard-wording" scope this rollout is limited to),
or a **regex false-positive** where the cost-trap guard already exists in wording the detector's
`rules.py` doesn't recognize. The canonical skill sources are already optimized for the three bounded
cost-traps (prior PRs #18/#21/#280 did that work). Because nothing changed, there was nothing to
measure from fixes — so per the task's fallback clause, remaining quota went to **replicates on the
noisiest existing cells** (opus, where the study's N=1 numbers are least trustworthy).

## Counts

| Bucket | N | Notes |
| --- | ---: | --- |
| **Audited** | 32 | 14 global library + 14 Spacepotatis project + 4 mikkonumminen.dev project |
| **Changed (fixes applied)** | **0** | No skill had a clear, bounded, non-rigor-exempt, not-already-guarded finding |
| **Measured (from fixes)** | 0 | Nothing changed → nothing to measure (by rule) |
| **Skipped + logged** | 16 | 9 rigor-exempt · 4 structural-only · 3 bounded-mechanism false-positives |
| **Audited, no change (clean)** | 16 | No pre-findings |
| **Failed / errored** | 0 | — |
| **Still pending** | replicate cells | Phase 5 in progress — see below |

## Branches & tags (for your review / cleanup)

| Repo | Branch (all work here) | `pre-optim-rollout` tag (before-arm) | Commits on branch |
| --- | --- | --- | --- |
| mikkonumminen.dev | `optim-rollout-2026-06-01` | n/a (no skill edits) | ledger + this report + scoreboard |
| claude-skills | `optim-rollout-2026-06-01` (off `origin/main` @ 2be360e) | `pre-optim-rollout` → 2be360e | **none** (0 fixes) |
| Spacepotatis | `optim-rollout-2026-06-01` (off `master` @ 885aa77) | `pre-optim-rollout` → 885aa77 | **none** (0 fixes) |

Worktrees: `mikkonumminen.dev/.claude/worktrees/optim-rollout`, `d:/tmp/optim-rollout-claude-skills`,
`d:/tmp/optim-rollout-spacepotatis`. The dirty `chore/skills-token-estimates` checkout in claude-skills
was **left untouched** (it had staged in-progress work — I branched off canonical `origin/main` instead).

### Reverting / cleaning up

**No fix to revert — 0 skill files were edited.** To tear down the scaffolding after review:

```bash
# mikkonumminen.dev (run from the main checkout)
git worktree remove .claude/worktrees/optim-rollout            # add --force if it complains
git branch -D optim-rollout-2026-06-01

# claude-skills
git -C d:/koodaamista/claude-skills worktree remove d:/tmp/optim-rollout-claude-skills
git -C d:/koodaamista/claude-skills branch -D optim-rollout-2026-06-01
git -C d:/koodaamista/claude-skills tag -d pre-optim-rollout

# Spacepotatis
git -C d:/koodaamista/Spacepotatis worktree remove d:/tmp/optim-rollout-spacepotatis
git -C d:/koodaamista/Spacepotatis branch -D optim-rollout-2026-06-01
git -C d:/koodaamista/Spacepotatis tag -d pre-optim-rollout
```

*(If a future run DOES land fixes, each is its own atomic commit on the relevant `optim-rollout-…`
branch — revert one with `git -C <repo> revert <sha>`; the ledger lists the sha per fix.)*

## Per-skill verdicts (one line each)

**No fix (rigor-exempt — never auto-edit):**
- `mikko-audit` (global) — batch_invitation, but audit orchestrator → skip
- `mikko-security-audit` (global) — batch_invitation, but security audit → skip
- `modular-architecture-audit` (Spacepotatis) — batch_invitation, but explicitly rigor-exempt → skip
- `security-audit` (Spacepotatis) — batch_invitation, but security audit → skip
- `mikko-ai-codegen-smell-audit`, `ai-codegen-smell-audit` (Spacepotatis) — loop_prose/very_long, audit → skip
- `mikko-react-anti-patterns-audit` (global) — loop_prose, audit → skip
- `mikko-audit-suite` (global) — loop_prose, audit orchestrator → skip
- `content-audit` (Spacepotatis) — long_imperative[HIGH]; structural + already got Round-4 cap → skip

**No fix (structural smell only — out of bounded guard-wording scope; fix = extract script / split file):**
- `mikko-help`, `mikko-readme-drift-sync`, `mikko-skill-calibration` (global), `balance-review` (Spacepotatis)

**No fix (bounded-mechanism flag, but FALSE-POSITIVE / already guarded on inspection):**
- `sync-readmes` (mn.dev) — batch already guarded by "All in the same message"; the unlimited_read hit reads bounded *agent return values*, not files
- `skill-registry` (mn.dev) — batch already guarded by "all in the same message"; reads are frontmatter-only
- `skill-localUpdate` (mn.dev) — "in parallel" appears only in a descriptive cost-note about a downstream skill

**Audited, no change (clean — no pre-findings):**
- global: `mikko-install`, `mikko-session-cost`, `mikko-skill-usage`, `mikko-skills`, `mikko-skills-freshness`, `mikko-skills-quality`
- Spacepotatis: `equipment`, `new-enemy`, `new-migration`, `new-mission`, `new-perk`, `new-solar-system`, `new-story`, `new-weapon`, `save-roundtrip-audit`
- mn.dev: `md-to-pdf`

## One actionable recommendation (logged, NOT auto-applied)

The detector's `batch_invitation` rule in `rules.py` doesn't recognize **"all in the same message" /
"in a single message"** as a single-batch guard — the idiomatic phrasing for `Agent`-tool dispatch.
This produced 2 false positives (sync-readmes, skill-registry). Adding those alternations to the
batch-guard regex would cut the false-positive rate. *Not applied:* editing `rules.py` re-keys every
skill and is a detector-tuning change, not a per-skill guard-wording fix — out of this run's scope.

## Phase 5 — replicate measurements (in progress)

> Re-measuring the noisiest opus cells at depth (≥5 draws/arm, before-arm pinned by averaging) to
> resolve the study's N=1 anomalies. Numbers and the updated scoreboard land here and in the
> `skills-optim-study-2026-06-01-replicates.json` scoreboard when the draws complete.

_(filled on stop)_
