# Skill calibration: `mikko-skills-quality` + `mikko-skills-freshness`, 3 models

*A/B token measurement (cold vs with-skill) for the two skill-auditing skills, across Haiku 4.5, Sonnet 4.6, and Opus 4.8, with an adversarial check on whether the cheaper arm hid any missed findings. 2026-06-01.*

## tl;dr

Both skills save tokens on **every** model, and the savings rise with model capability, but the two skills sit on opposite sides of the savings-vs-fidelity trade.

- **`mikko-skills-quality`** saved **38% / 48% / 54%** (Haiku / Sonnet / Opus). The biggest saver. Its triage explicitly says "don't open the SKILL.md by default," so the skill arm reads almost nothing. **That is exactly why it missed real findings on Sonnet and Opus**: the cold arm caught a hardcoded-path portability bug in `mikko-skills` and named the specific 400-line block of duplicated prompt templates in `mikko-audit`; the skill arm, trusting its line-count/loop-prose pre-pass, cleared the first and gave the second only a generic flag. The savings are partly a coarser read.
- **`mikko-skills-freshness`** saved **11% / 30% / 36%**. Smaller savings, because its triage reads each flagged skill at `limit=80`, and that extra reading is why it was judged **outcome-equivalent to the cold arm on all three models**, even catching the same hardcoded-path bug the quality arm missed.

**Aggregate (ratio-of-sums): +36%** across both skills and all three models (239,103 → 152,208 tokens). The honest one-liner: *these skills do save tokens, and freshness saves them without missing anything; quality saves more but, on capable models, by reading less than the task deserved.*

No portfolio-wide claim is made here. This is two skills on a small fixed fixture, N=1 per cell.

## Method

- **Two arms, same task.** Arm A (cold) gets no skill awareness and must scout + reason. Arm B (skill) reads the SKILL.md, runs the skill's deterministic Python pre-pass, and reviews only what it flags. Each arm produced the same deliverable: a findings table over the same four skills.
- **Fixture, not production.** The audited corpus was a fixed set of 4 installed skills (`mikko-audit` (389 lines), `mikko-help` (264), `mikko-skill-calibration` (289), `mikko-skills` (62)) chosen to be diverse and to over-weight verbose skills (the ones with the most to find). Small on purpose, for cost efficiency.
- **Scope pinning.** Both skills default to scanning the real global `~/.claude/skills/`. To keep the A/B controlled and reproducible, both arms were pinned to the fixture with `--scope project --project-root <fixture>`; the real global set was never scanned.
- **Isolation.** These two skills are installed-only (not in a git repo), so the calibration skill's git-worktree isolation does not apply. Arms shared a read-only fixture and wrote findings to separate scratch files; the skill arm ran its pre-pass without `--update` (no manifest write, no collision).
- **Accounting.** Per-arm tokens are the harness's `subagent_tokens` (input + output + cache-creation; cache-read excluded). N = 1 per cell.
- **Equivalence verification.** A 12-agent adversarial workflow: one Sonnet judge per `(skill, model)` pair compared the two findings files against the **actual** SKILL.md files; any finding present in one arm but not the other was re-examined by a skeptic instructed to refute it. A pair is "equivalent" only if the cheaper arm missed nothing material.

## Results

| Skill | Model | Cold (arm A) | Skill (arm B) | Saved | % | Equivalent? |
|---|---|---:|---:|---:|---:|:--:|
| quality | Haiku | 38,975 | 24,338 | 14,637 | 38% | yes |
| quality | Sonnet | 33,540 | 17,486 | 16,054 | 48% | **no** |
| quality | Opus | 44,316 | 20,227 | 24,089 | 54% | **no** |
| freshness | Haiku | 39,300 | 34,869 | 4,431 | 11% | yes |
| freshness | Sonnet | 34,535 | 24,127 | 10,408 | 30% | yes |
| freshness | Opus | 48,437 | 31,161 | 17,276 | 36% | yes |

**Per-skill aggregate (ratio-of-sums):** quality **+47%** (116,831 → 62,051); freshness **+26%** (122,272 → 90,157).

**Per-model aggregate (both skills):** Haiku **+24%** (78,275 → 59,207); Sonnet **+39%** (68,075 → 41,613); Opus **+45%** (92,753 → 51,388).

**Overall:** **+36%** (239,103 → 152,208; 86,895 saved).

## Outcome-equivalence: did the cheaper arm hide a miss?

4 of 6 pairs equivalent; **2 confirmed regressions, both on `mikko-skills-quality`, both on the stronger models:**

- **quality / Sonnet: missed a real bug.** The cold arm flagged `mikko-skills` LOW for a hardcoded Windows path (`C:/Users/vandr/.claude/skills/...`) at SKILL.md line 21 that silently fails on any other machine. The skill arm passed `mikko-skills` as clean. Its pre-pass checks line count and loop-prose, and a hardcoded path is neither. Confirmed material: the sibling skill `mikko-help` does the same lookup portably (`~`) and explicitly warns against hardcoded author paths.
- **quality / Opus (missed the specifics.** The cold arm rated `mikko-audit` HIGH and named the cause: ~400 lines of duplicated embedded sub-agent prompt templates plus a per-language tool-runner loop) concrete, scriptable bloat. The skill arm issued a generic MEDIUM "loop-style prose" flag and identified none of it.

The two freshness divergences (cold flagged 2/4, skill flagged 1/4 on Haiku and Opus) were examined and **dismissed as cold-arm false positives**: the skill arm was right to skip them. Notably, the freshness skill arm, because it reads each flagged file at `limit=80`, **caught the same `mikko-skills` hardcoded path the quality skill arm missed.** That single contrast is the whole trade in one data point: read-light saves more and misses more; read-some saves less and stays faithful.

## What the data shows

- **A pre-pass that doesn't read the file can only flag the smells it can compute.** `mikko-skills-quality` is the portfolio's cheapest auditor precisely because it trusts its line-count + loop-prose rules and doesn't open the SKILL.md. That design wins tokens and loses specifics: it cannot see a hardcoded path or quantify which 400 lines are bloat. The fix is not "read everything" (that erases the saving). It is to widen the deterministic ruleset (e.g. a regex for absolute home-dir paths) so the cheap pass catches more without an LLM read.
- **Savings scale with model capability: same shape as the portfolio's other calibrations.** 24% → 39% → 45% by model. The skill arm doesn't get more expensive; the cold arm gets cheaper on weaker models because Haiku scouts less efficiently, so the recipe's relative advantage shrinks. (Freshness/Haiku at +11% with a 21-tool-use skill arm is the floor: Haiku flailed even with the skill.)
- **A real bug fell out of the exercise.** `mikko-skills/SKILL.md` line 21 hardcodes `C:/Users/vandr/.claude/skills/mikko-*/SKILL.md`. It happens to work on this machine but breaks everywhere else; `mikko-help` already does this lookup portably. Worth a one-line fix in the skill source.

## Implications for the registry

- These two skills are **not yet in the registry** (the scan covers consumer repos + `claude-skills/skills/`; these live only as installs). This PR adds them to the `claude-skills` bucket with measured receipts: Sonnet as the primary calibration, Opus/Haiku in `alt_model_measurements`, matching every other row. Because they aren't in a scanned source repo, a future `/skill-registry` run won't re-emit them until they're added to `claude-skills/skills/`; the rows are a manual addition for now (flagged in the PR).
- Per-use cost is taken from the Sonnet skill arm (no production transcripts exist for either skill): quality 17,486; freshness 24,127. Savings use the measured Sonnet deltas.

## Caveats

- **N = 1 per cell.** A re-run yields different absolute numbers. Direction and rough magnitude only.
- **Sub-agent ≠ main thread.** Representative of a fresh-session invocation, not identical to it.
- **Fixture, not production.** A 4-skill corpus picked for cost and signal density; not a full global audit.
- **Equivalence is a measured check, not a proof**: Sonnet judges plus an adversarial skeptic, grounded against the real SKILL.md files.
- **Haiku was the noisiest model** on both arms (a cold-arm path mis-citation on `mikko-help`), so its equivalence verdicts carry the least confidence.

## Experiment cost

12 A/B arms = **391,311** tokens; the 12-agent equivalence workflow = **401,602** tokens; plus main-thread orchestration. The small fixture kept each cold arm bounded (~33–48K); the 3-model dimension is what multiplied the count.
