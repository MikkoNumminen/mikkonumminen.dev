# optim-rollout 2026-06-01: execution ledger

Autonomous overnight run. Crash-safe: appended after every skill. Every decision logged.
Branch/tag names and revert commands are in the **Morning report** section at the bottom
(filled on stop). This file is the source of truth if the run dies mid-flight.

---

## Phase 0: safety net (done once)

**Run start:** 2026-06-01 (currentDate). Operator: Claude (Opus 4.8, ultracode).

### Discovered reality vs. the task's mental model

The task assumed a single repo, on main, clean, where "tag every skill / branch off main /
commit atomically" applies uniformly. The actual state:

- **Skills span 3 repos**, not one:
  - `claude-skills` (library: audit, security-audit, skills-freshness, skills-quality, skill-usage,
    skill-calibration, session-cost, readme-drift-sync, react-anti-patterns-audit,
    ai-codegen-smell-audit, mikko-help, mikko-install, mikko-audit-suite, _lib).
  - `Spacepotatis/.claude/skills` (project: content-audit, balance-review, equipment, new-*,
    modular-architecture-audit, save-roundtrip-audit, security-audit, ai-codegen-smell-audit).
  - `~/.claude/skills/` (installed copies, **NOT a git repo**, so un-taggable/un-committable;
    these are what the detector actually audits, but fixes must land in the git sources above).
- **claude-skills working tree was DIRTY**: on stale feature branch `chore/skills-token-estimates`
  (predates PRs #14–#21) with staged-but-uncommitted changes (`session-cost/`, `skill-calibration/`).
  Branching/committing there would have entangled someone's in-progress work into my "atomic" commits
  and tagged a non-canonical mid-edit state as the before-arm. **CONSERVATIVE BRANCH TAKEN:** did not
  touch that checkout at all; branched off `origin/main` (canonical, post-#21) via a fresh worktree.

### Safety net as actually built (worktrees off canonical refs: non-destructive)

| Repo | Worktree path | Branch | Base ref | `pre-optim-rollout` tag |
| --- | --- | --- | --- | --- |
| mikkonumminen.dev (study/scoreboard/ledger/report home) | `.claude/worktrees/optim-rollout` | `optim-rollout-2026-06-01` | `master` @ 05b5864 | n/a (no skill edits here) |
| claude-skills (library skill sources) | `d:/tmp/optim-rollout-claude-skills` | `optim-rollout-2026-06-01` | `origin/main` @ 2be360e (PR #21) | `pre-optim-rollout` → 05fc5a2 |
| Spacepotatis (project skill sources) | `d:/tmp/optim-rollout-spacepotatis` | `optim-rollout-2026-06-01` | `master` @ 885aa77 (PR #280) | `pre-optim-rollout` → 5099807 |

- Every skill change = its own atomic commit on the `optim-rollout-2026-06-01` branch of its repo.
- The `pre-optim-rollout` tag pins each repo's canonical pre-edit state as the fixed before-arm.
- **Nothing is pushed. Nothing merges to main/master. No force-push, no deletes, no edits outside skill dirs.**
- The dirty `chore/skills-token-estimates` checkout in claude-skills is **left exactly as found**.

### Note on the canonical baseline

`origin/main` of claude-skills (PR #21) and `master` of Spacepotatis (PR #280) already carry the
prior study's optimizations (the three cost-trap guards on skills-freshness; the content-audit step-2
cap). So the headline skills are expected to audit clean: the fix candidates this round are the
**un-optimized** skills the prior rounds never touched.

---

## Phase 1: detector findings (mikko-skills-quality, canonical rules.py @ ruleset_hash 8320e59…)

Ran the deterministic detector (`skills-quality.py --json`) across all three skill sets:
global (`~/.claude/skills`, 14 installed library skills), Spacepotatis project (14),
mikkonumminen.dev project (4). 32 skills audited total.

**Only the three BOUNDED-mechanism rules are auto-fixable per the APPLY rule**
(`unlimited_read_in_procedure` → `limit=`, `uncapped_followup` → trace cap,
`batch_invitation` → batch cap). `imperative_prose_no_script` / `very_long_skill` /
`long_imperative_no_script` are STRUCTURAL smells (fix = extract a script / split the file),
explicitly out of the "bounded guard-wording" scope → SKIP+log by rule.

Bounded-mechanism hits found:
- `batch_invitation`: mikko-audit, mikko-security-audit (global); modular-architecture-audit,
  security-audit (Spacepotatis); sync-readmes, skill-registry, skill-localUpdate (mn.dev).
- `unlimited_read_in_procedure`: sync-readmes (mn.dev) only.
- `uncapped_followup`: none anywhere.

## Phase 2: priority queue + per-skill verdicts

Priority = (production cost/use from registry) × (clarity of cost-trap match). Worked highest-first.
Candidates with a bounded-mechanism hit that are NOT rigor-exempt: sync-readmes (~157K/use, 2 hits),
skill-registry (~65K/use, 1 hit), skill-localUpdate (1 hit). All three inspected line-by-line.

### APPLY: none this round.

### Verdict table (32 skills)

| Skill (scope) | Detector finding | Verdict | Reason |
| --- | --- | --- | --- |
| **sync-readmes** (mn.dev) | unlimited_read + batch_invitation | **SKIP+log** | FALSE-POSITIVE on inspection. Batch already guarded: line 42 "**All in the same message** so they run in parallel" = single-batch dispatch (regex doesn't recognize this phrasing). unlimited_read hit (line 50 "read each agent's structured report") = reading **bounded agent return values** (schema'd block, ~1–2 lines/field), not files, `limit=` is nonsensical. The one real file read (README, agent prompt L156-158) **must be complete** for drift-detection and is inherently tiny (skill handles `<500 bytes`). No safe additive guard. |
| **skill-registry** (mn.dev) | batch_invitation | **SKIP+log** | FALSE-POSITIVE. Line 65/67 "Dispatch one Sonnet agent per repo (parallel, **in a single message**) … **all in the same message**" = single-batch guard already present. Agents read **frontmatter only** (already `limit`-bounded in spirit). Other regex hit is in the `description:` frontmatter, not the procedure. |
| **skill-localUpdate** (mn.dev) | batch_invitation | **SKIP+log** | FALSE-POSITIVE. Skill is a 4-step **sequencer**; "in parallel" (line 172) appears only in a descriptive **cost-note** about the downstream `/skill-registry` sub-agents, not a batch this skill issues. A batch cap here would be meaningless. |
| mikko-audit (global) | batch_invitation + loop_prose + very_long | **SKIP+log** | **Rigor-exempt** (audit orchestrator, never auto-edit). |
| mikko-security-audit (global) | batch_invitation + loop_prose | **SKIP+log** | **Rigor-exempt** (security audit). |
| modular-architecture-audit (Spacepotatis) | batch_invitation + loop_prose | **SKIP+log** | **Rigor-exempt** (explicitly named). |
| security-audit (Spacepotatis) | batch_invitation + loop_prose | **SKIP+log** | **Rigor-exempt**. |
| mikko-ai-codegen-smell-audit (global) | loop_prose + very_long | **SKIP+log** | Rigor-exempt; finding is structural anyway. |
| ai-codegen-smell-audit (Spacepotatis) | loop_prose + very_long | **SKIP+log** | Rigor-exempt; structural. |
| mikko-react-anti-patterns-audit (global) | loop_prose | **SKIP+log** | Rigor-exempt (audit); structural. |
| mikko-audit-suite (global) | loop_prose | **SKIP+log** | Rigor-exempt (audit orchestrator); structural. |
| content-audit (Spacepotatis) | long_imperative_no_script [HIGH] | **SKIP+log** | Finding is structural (loop-prose), out of bounded-wording scope; already received its Round-4 step-2 cap (PR #280). |
| mikko-help (global) | loop_prose | **SKIP+log** | Structural (fix = script); out of bounded-wording scope. |
| mikko-readme-drift-sync (global) | loop_prose + very_long | **SKIP+log** | Structural; out of scope. |
| mikko-skill-calibration (global) | loop_prose | **SKIP+log** | Structural; out of scope. |
| balance-review (Spacepotatis) | loop_prose | **SKIP+log** | Structural; out of scope. |
| mikko-install, mikko-session-cost, mikko-skill-usage, mikko-skills, mikko-skills-freshness, mikko-skills-quality (global) | clean | **audited, no change** | No pre-findings. No measurement. |
| equipment, new-enemy, new-migration, new-mission, new-perk, new-solar-system, new-story, new-weapon, save-roundtrip-audit (Spacepotatis) | clean | **audited, no change** | No pre-findings. No measurement. |
| md-to-pdf (mn.dev) | clean | **audited, no change** | No pre-findings. No measurement. |

### Why zero fixes (this is the correct result, not a stall)

The canonical sources are **already optimized for the three bounded cost-traps**: the prior study's
PRs #18/#21 (skills-freshness/-quality guards) and #280 (content-audit cap) did that work, and the
mn.dev project skills were authored token-consciously ("all in the same message" batch guards,
frontmatter-bounded reads). The detector's remaining hits are either (a) rigor-exempt audit skills
(never auto-edit), (b) structural smells whose fix is a script/file-split (out of the bounded
guard-wording scope this rollout is limited to), or (c) **regex false-positives** where the guard
exists in wording `rules.py` doesn't recognize.

### META-finding (logged, NOT auto-applied)

`rules.py`'s `batch_invitation` guard set ({`single batch`, `one batch`, `all at once`,
`don't stage`, `not in multiple batches`}) does **not** recognize **"all in the same message" /
"in a single message"**: the idiomatic single-batch guard for `Agent`-tool dispatch. This produced
2 false positives (sync-readmes, skill-registry). Recommended ruleset improvement: add those
alternations to `BATCH_GUARD`. **Not applied**: editing `rules.py` is a detector-tuning change
(re-keys every skill), not a skill guard-wording fix, so it's out of this run's allowed scope.

### Measurement consequence

**0 skills changed → nothing to measure from fixes.** Proceeding to the task's explicit fallback:
*"IF THE QUEUE FINISHES AND QUOTA REMAINS: spend the rest adding replicates to the cells with the
widest spread."* See Phase 5.

## Phase 5: replicates on widest-spread / N=1 cells

**Design.** Re-measure the noisiest cells fresh tonight at depth (both arms in the same window),
pinning the before-arm by averaging cold draws. Opus first (study: "most variable model, swings up
to 67pp"; methodology wants ≥5 opus draws). Faithful to `mikko-skill-calibration`: arm A = cold
(no skills-quality SKILL.md / script, but DOES inspect the target skills since auditing them is the
task), arm B = read the SKILL.md + run its script (read-only, no `--update`). Worktree isolation
skipped. Both arms read-only against `~/.claude/skills/` (same call the round-1 study made).

**Accounting instrument:** `d:/tmp/draw-tokens.mjs`, sums `input + output + cache_creation` per
assistant msg, dedup by `(sessionId,requestId)`, excludes `cache_read`. Validated against existing
transcripts (e.g. 55,244 tok / 40 turns / opus). Each draw carries a `DRAW_ID:` marker in its prompt
for bulletproof transcript→cell mapping.

**Priority queue (widest spread / lowest N / opus-first):**
1. `skills-quality/opus`: pool N=2, pct +5%(R1)/−62%(R5), **saved crosses zero** → new draws. The
   −62% was an N=1 anomaly (cold arm short-circuited at 31K). **Highest value.**
2. `skills-freshness/opus`: pool N=3, pct −21/+1/−1, saved crosses zero → new draws.
3. (if quota remains) skills-quality/sonnet, skills-freshness/haiku, etc. at N≥3.

### Stage 1: skills-quality/opus: LAUNCHED

- Workflow `wf_eb3d085c-094` (background): 5×arm-A (`q-opus-A-1..5`) + 5×arm-B (`q-opus-B-1..5`), all opus.
- Transcript dir: `…/4647675b…/subagents/workflows/wf_eb3d085c-094`.
- Stage 2 (skills-freshness/opus) held until Stage 1 returns and draws are verified to have done real
  work (guards against burning ~1M more tokens on a flawed prompt design).

### Stage 1: skills-quality/opus: DONE ✓ (workflow wen9wzyee, 10 agents, 140s)

All 10 draws `completed:true`; **no short-circuit recurred** (cold arms did full audits, 10-12 turns each).

| Arm | Draws (tokens) | median | mean | spread | turns |
| --- | --- | ---: | ---: | --- | --- |
| A (cold) | 130827, 126654, 121426, 125778, 116085 | **125,778** | 124,154 | sd ~5.0K | 10-12 |
| B (with-skill) | 34540, 28790, 28648, 30060, 30015 | **30,015** | 30,411 | sd ~2.1K | 8-9 |

**Cell: saved 95,763 → +76%.** Both arms tight; no N=1 fragility.
**Resolves the R5 −62% anomaly:** that came from a short-circuited cold arm (31K). When the cold arm
does the full audit (116-131K) and the script-backed skill runs the audit in ~0 LLM tokens (~30K),
the save is large and stable. This is the strongest, best-supported skills-quality/opus number in the
study. Prior: R1 +5%, R5 −62% (N=1). Now: **+76% (N=5/arm)**.
→ scoreboard `skills-optim-study-2026-06-01-replicates.json`.

### Stage 2: skills-freshness/opus: DONE ✓ (workflow wxirdto7p, 10 agents, 437s)

All 10 draws `completed:true`.

| Arm | Draws (tokens) | median | mean | spread | turns |
| --- | --- | ---: | ---: | --- | --- |
| A (cold) | 200044, 191519, 196357, 179196, 171714 | **191,519** | 187,766 | sd ~10K | 16-31 |
| B (with-skill) | 40764, 53351, 52386, 45913, 40843 | **45,913** | 46,651 | sd ~5.4K | 9-13 |

**Cell: saved 145,606 → +76%.** **Overturns the prior near-zero/negative opus rounds** (R1 −21%,
R2 +1%, R5 −1%). At depth the cold arm does a full staleness audit (verifying file:line citations
against source: 172-200K) while the sha256 change-detection script short-circuits unchanged skills
(~46K). The prior near-zero numbers were N=1 artifacts of an unusually shallow cold arm (R1: 135K/9 turns).

### Cross-opus finding (both cells)

**Both opus cells = +76% at N=5/arm.** The consistent story: the script-backed audit skills
(skills-quality, skills-freshness) are **strong opus savers once the baseline does real work**; the
study's prior near-zero/negative opus numbers (R1 quality +5%/R5 −62%; R1-R5 freshness −21/+1/−1) were
**N=1 artifacts of unusually cheap cold arms** (short-circuited or shallow). This is precisely the
opus-variance the study flagged ("most variable model, swings up to 67pp"), and exactly what the
pinned/averaged-baseline design at N≥5 was meant to resolve. Caveat (carried from the calibration
skill): the absolute cold-arm cost depends on how deeply it verifies, which is task-framing-sensitive;
trust direction + magnitude, not the exact %.

### Stage 3: sonnet+haiku cells (N=3/arm): DONE ✓ (workflow w01t7rdr4, 24 agents, 669s)

All 24 draws `completed:true`.

| Cell | arm_A median (draws) | arm_B median (draws) | saved | % | prior rounds |
| --- | --- | --- | ---: | ---: | --- |
| skills-quality/sonnet | 94,849 (93k,95k,102k) | 13,988 (14k,14k,16k) | 80,861 | **+85%** | R1 −12%, R5 +2% |
| skills-quality/haiku | 74,612 (54k,75k,119k) | 34,511 (30k,35k,50k) | 40,101 | **+54%** | R1 +17%, R5 +54% |
| skills-freshness/sonnet | 146,622 (140k,147k,151k) | 32,872 (30k,33k,37k) | 113,750 | **+78%** | R1 +43%, R2 +14%, R5 +1% |
| skills-freshness/haiku | 115,388 (81k,115k,126k) | 31,175 (27k,31k,41k) | 84,213 | **+73%** | R1 −70%, R2 +20%, R5 +48% |

---

## Phase 5 synthesis: all 6 cells

| Cell | N/arm | % saved (this round) | prior N=1 history | resolution |
| --- | ---: | ---: | --- | --- |
| skills-quality/opus | 5 | **+76%** | +5% / **−62%** | −62% anomaly overturned |
| skills-quality/sonnet | 3 | **+85%** | −12% / +2% | −12% sign-flip overturned |
| skills-quality/haiku | 3 | **+54%** | +17% / +54% | confirmed (matches R5) |
| skills-freshness/opus | 5 | **+76%** | −21% / +1% / −1% | near-zero overturned |
| skills-freshness/sonnet | 3 | **+78%** | +43% / +14% / +1% | confirmed positive, firmed |
| skills-freshness/haiku | 3 | **+73%** | **−70%** / +20% / +48% | headline swing confirmed positive |
| **Aggregate** |, | **+75%** (560,294 tok) | R1 +2.5% |, |

**The durable result of this round.** At N≥3 (≥5 on opus) with the before-arm pinned by averaging,
**every one of the 6 cells is a strong net saver (+54% to +85%)**. Every prior negative/near-zero cell
(quality/opus −62%, quality/sonnet −12%, freshness/opus −21%, freshness/haiku −70%) **flips strongly
positive at depth**: confirming they were N=1 artifacts of cold arms that happened to short-circuit
cheaply, exactly the failure mode the pinned-baseline design targets. This **overturns the original
study's headline** ("3 of 6 cells negative, +2.5% aggregate, no portfolio save claim"): with replication
at depth there IS a consistent, large save.

**The honest caveat (load-bearing, do not drop it).** Tonight's save % is driven by how *thorough*
the cold arm is, and that is **task-framing-sensitive**. The script-backed skills cost ~14–46K because
their Python script does the audit in near-zero LLM tokens; the cold arm costs 54–200K because it must
read everything itself, and the deeper it verifies (one freshness/sonnet cold draw ran **109 turns**),
the larger the gap. My calibration prompt ("audit ALL skills, per-skill findings with severity")
encourages a thorough cold audit; a cold arm that short-circuits (as several original N=1 draws did)
shrinks or flips the save. So: **trust the consistent positive DIRECTION across all 6 cells and the
rough magnitude; do not treat the exact percentages as a universal guarantee.** This is still a
*skill-vs-cold* comparison (it answers "is the skill, in its current state, cheaper than no skill?" →
yes at depth), NOT an optimization *swing* (no skill was changed tonight, so there is no pre/post-fix
swing to measure).

Phase 5 cost: 3 workflows, 44 sub-agents, ~3.55M sub-agent tokens (Stage1 0.77M + Stage2 1.17M +
Stage3 1.65M, per-draw JSONL recompute). Scoreboard: `skills-optim-study-2026-06-01-replicates.json`.



---

## RUN COMPLETE (2026-06-01)

Queue empty, all stages done, no errors. Final tally:
- **Audited:** 32 skills · **Changed:** 0 · **Fixes measured:** 0 · **Replicate cells measured:** 6
- **Skipped+logged:** 16 (9 rigor-exempt, 4 structural-only, 3 false-positive) · **Clean:** 16 · **Failed:** 0 · **Pending:** 0
- **Replicate result:** all 6 cells +54%..+85% at depth (aggregate +75%); overturns the original +2.5%/3-negative N=1 headline. Caveat: cold-arm thoroughness is task-framing-sensitive → trust direction + magnitude, not exact %.

**Deliverables (all on branch `optim-rollout-2026-06-01`, mikkonumminen.dev, NOT pushed):**
- `docs/audits/optim-rollout-2026-06-01-ledger.md` (this file)
- `docs/audits/optim-rollout-2026-06-01-morning-report.md`
- `docs/audits/skills-optim-study-2026-06-01-replicates.json`
- `docs/audits/skills-optim-study-2026-06-01-replicates.pdf`

**Git state:** nothing merged, nothing pushed, 0 skill files edited. claude-skills + Spacepotatis
`optim-rollout-2026-06-01` branches have 0 commits (no fixes); `pre-optim-rollout` tags pin the
before-arm in both. The dirty `chore/skills-token-estimates` checkout in claude-skills was left exactly
as found. Teardown commands are in the morning report.
