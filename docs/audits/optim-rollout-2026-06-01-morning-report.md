# optim-rollout: Morning report (2026-06-01)

Autonomous overnight run. **Nothing was merged. Nothing was pushed. No skill file was edited.**
Everything below lives on local branches for your review. Full decision trail: companion
[`optim-rollout-2026-06-01-ledger.md`](./optim-rollout-2026-06-01-ledger.md).

## tl;dr

The audit/fix queue ran to completion: **32 skills audited, 0 fixes warranted.** Every flagged skill
was either rigor-exempt (audit family, never auto-edit), flagged only for *structural* smells
(loop-prose / oversized file, out of the "bounded guard-wording" scope this rollout is limited to),
or a **regex false-positive** where the cost-trap guard already exists in wording the detector's
`rules.py` doesn't recognize. The canonical skill sources are already optimized for the three bounded
cost-traps (prior PRs #18/#21/#280 did that work). Because nothing changed, there was nothing to
measure from fixes, so per the task's fallback clause, remaining quota went to **replicates on the
noisiest existing cells** (opus, where the study's N=1 numbers are least trustworthy).

## Counts

| Bucket | N | Notes |
| --- | ---: | --- |
| **Audited** | 32 | 14 global library + 14 Spacepotatis project + 4 mikkonumminen.dev project |
| **Changed (fixes applied)** | **0** | No skill had a clear, bounded, non-rigor-exempt, not-already-guarded finding |
| **Measured (from fixes)** | 0 | Nothing changed → nothing to measure (by rule) |
| **Measured (replicate cells)** | 6 | Fallback: re-measured the noisiest study cells at depth (44 draws). See Phase 5. |
| **Skipped + logged** | 16 | 9 rigor-exempt · 4 structural-only · 3 bounded-mechanism false-positives |
| **Audited, no change (clean)** | 16 | No pre-findings |
| **Failed / errored** | 0 | All 44 draws completed; no short-circuits |
| **Still pending** | 0 | Queue empty; run complete |

## Branches & tags (for your review / cleanup)

| Repo | Branch (all work here) | `pre-optim-rollout` tag (before-arm) | Commits on branch |
| --- | --- | --- | --- |
| mikkonumminen.dev | `optim-rollout-2026-06-01` | n/a (no skill edits) | ledger + this report + scoreboard |
| claude-skills | `optim-rollout-2026-06-01` (off `origin/main` @ 2be360e) | `pre-optim-rollout` → 2be360e | **none** (0 fixes) |
| Spacepotatis | `optim-rollout-2026-06-01` (off `master` @ 885aa77) | `pre-optim-rollout` → 885aa77 | **none** (0 fixes) |

Worktrees: `mikkonumminen.dev/.claude/worktrees/optim-rollout`, `d:/tmp/optim-rollout-claude-skills`,
`d:/tmp/optim-rollout-spacepotatis`. The dirty `chore/skills-token-estimates` checkout in claude-skills
was **left untouched** (it had staged in-progress work, I branched off canonical `origin/main` instead).

### Reverting / cleaning up

**No fix to revert, 0 skill files were edited.** To tear down the scaffolding after review:

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
branch: revert one with `git -C <repo> revert <sha>`; the ledger lists the sha per fix.)*

## Per-skill verdicts (one line each)

**No fix (rigor-exempt, never auto-edit):**
- `mikko-audit` (global): batch_invitation, but audit orchestrator → skip
- `mikko-security-audit` (global): batch_invitation, but security audit → skip
- `modular-architecture-audit` (Spacepotatis): batch_invitation, but explicitly rigor-exempt → skip
- `security-audit` (Spacepotatis): batch_invitation, but security audit → skip
- `mikko-ai-codegen-smell-audit`, `ai-codegen-smell-audit` (Spacepotatis): loop_prose/very_long, audit → skip
- `mikko-react-anti-patterns-audit` (global): loop_prose, audit → skip
- `mikko-audit-suite` (global): loop_prose, audit orchestrator → skip
- `content-audit` (Spacepotatis): long_imperative[HIGH]; structural + already got Round-4 cap → skip

**No fix (structural smell only, out of bounded guard-wording scope; fix = extract script / split file):**
- `mikko-help`, `mikko-readme-drift-sync`, `mikko-skill-calibration` (global), `balance-review` (Spacepotatis)

**No fix (bounded-mechanism flag, but FALSE-POSITIVE / already guarded on inspection):**
- `sync-readmes` (mn.dev): batch already guarded by "All in the same message"; the unlimited_read hit reads bounded *agent return values*, not files
- `skill-registry` (mn.dev): batch already guarded by "all in the same message"; reads are frontmatter-only
- `skill-localUpdate` (mn.dev): "in parallel" appears only in a descriptive cost-note about a downstream skill

**Audited, no change (clean, no pre-findings):**
- global: `mikko-install`, `mikko-session-cost`, `mikko-skill-usage`, `mikko-skills`, `mikko-skills-freshness`, `mikko-skills-quality`
- Spacepotatis: `equipment`, `new-enemy`, `new-migration`, `new-mission`, `new-perk`, `new-solar-system`, `new-story`, `new-weapon`, `save-roundtrip-audit`
- mn.dev: `md-to-pdf`

## One actionable recommendation (logged, NOT auto-applied)

The detector's `batch_invitation` rule in `rules.py` doesn't recognize **"all in the same message" /
"in a single message"** as a single-batch guard: the idiomatic phrasing for `Agent`-tool dispatch.
This produced 2 false positives (sync-readmes, skill-registry). Adding those alternations to the
batch-guard regex would cut the false-positive rate. *Not applied:* editing `rules.py` re-keys every
skill and is a detector-tuning change, not a per-skill guard-wording fix: out of this run's scope.

## Phase 5: replicate measurements (done)

The audit/fix queue found 0 fixes, so per the task's fallback clause remaining quota went to
**re-measuring the study's noisiest cells at depth**. Both arms in the same window, before-arm pinned
by averaging, ≥5 draws/arm on opus and ≥3 elsewhere. 6 cells, 44 sub-agent draws, ~3.55M tokens.
Scoreboard: [`skills-optim-study-2026-06-01-replicates.json`](./skills-optim-study-2026-06-01-replicates.json).
Per-draw raw numbers + accounting in the [ledger](./optim-rollout-2026-06-01-ledger.md).

| Cell | N/arm | **% saved** | prior N=1 history | resolution |
| --- | ---: | ---: | --- | --- |
| skills-quality/opus | 5 | **+76%** | +5% / −62% | −62% anomaly **overturned** |
| skills-quality/sonnet | 3 | **+85%** | −12% / +2% | −12% sign-flip **overturned** |
| skills-quality/haiku | 3 | **+54%** | +17% / +54% | confirmed |
| skills-freshness/opus | 5 | **+76%** | −21% / +1% / −1% | near-zero **overturned** |
| skills-freshness/sonnet | 3 | **+78%** | +43% / +14% / +1% | confirmed + firmed |
| skills-freshness/haiku | 3 | **+73%** | −70% / +20% / +48% | headline swing **confirmed +** |
| **Aggregate** |, | **+75%** | (orig. study: +2.5%) |, |

**Headline.** At depth (N≥3, ≥5 on opus) with a pinned/averaged before-arm, **all 6 cells are strong
net savers (+54% to +85%)**. Every prior negative/near-zero cell flips strongly positive. They were
**N=1 artifacts of cold arms that short-circuited cheaply**, exactly the failure the pinned-baseline
design targets. This overturns the original study's "3 of 6 negative, +2.5%, no portfolio save claim."

**Caveat (do not drop).** The save % is driven by how thorough the cold arm is, which is
**task-framing-sensitive** (the script-backed skill costs ~14–46K because its Python script does the
audit in ~0 LLM tokens; the cold arm costs 54–200K reading everything: one cold draw ran 109 turns).
Trust the consistent positive **direction** and rough magnitude, not the exact %. This is a
*skill-vs-cold* result ("is the skill cheaper than no skill?" → yes at depth), not an optimization
*swing*, no skill was changed tonight.

---

*Render note: the companion PDF (`skills-optim-study-2026-06-01-replicates.pdf`) carries this table +
the synthesis in registry style.*
