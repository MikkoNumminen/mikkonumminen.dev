---
title: Why "read each SKILL.md" costs tokens: five rounds of before/after testing
project: portfolio
date: 2026-05-31
kind: post
type: research
---

# Why "read each SKILL.md" costs tokens: five rounds of before/after testing

I optimized two of my Claude Code skills and wanted to know whether the optimization actually worked: does bounded, scoped procedural language in a SKILL.md cut token use? Five rounds of paired A/B before/after testing across three skills (skills-freshness, skills-quality, content-audit) on three models (sonnet, opus, haiku). 42 sub-agents total, ~4.48M subagent tokens spent measuring, N=1 per cell. The one durable result: bounded, scoped procedural language in a SKILL.md reliably cuts token use for **Haiku-class models**; for **Opus-class** the effect sits inside the measurement noise. There is **no portfolio-level save claim** in this data. Three skills, N=1 per cell. The strongest single piece of evidence is a swing, not an aggregate: skills-freshness on Haiku went −70% → +20% (a +90pp swing) once a `limit=80` / "don't spelunk" guard landed in the SKILL.md. The transferable output is a taxonomy of three cost-trap mechanisms; the percentages are the evidence that they are real.

## Two questions, two different numbers

This is the study's spine, and collapsing it is the easiest way to misread everything below.

*Did the optimization actually work?* Read the **swing** (R1→R2, R3→R4). Across rounds the cold arm holds the same role (no skill) while the SKILL.md content is what changes, so the swing targets the optimization, but because the cold arm is re-run rather than pinned, it also carries run-to-run variance, which is why only the large swings are trustworthy.

*Is the skill, in its current state, cheaper than no skill at all?* Read the **within-round aggregate** (R1, R5). That is close to what my earlier Spacepotatis calibration already answered (~22% net savings across 13 skills: a different, portfolio-level question), and it bundles the fixed cost of loading a SKILL.md and dispatching its script into the AFTER arm. That overhead is exactly why 3 of 6 Round-1 cells went negative. The aggregates are honest, but they are not the optimization's effect.

## The three cost-trap mechanisms

| # | Mechanism | How the prose triggered it | Guard wording that fixes it | Rule ID |
| --- | --- | --- | --- | --- |
| 1 | **Unlimited read** | "read each SKILL.md" → the AFTER arm read **233,876 chars** across **14 files** in full vs the cold arm's **116,731** | `limit=80`, frontmatter + first one or two sections is all you need; no deep read | `unlimited_read_in_procedure` |
| 2 | **Uncapped follow-up / spelunking** | a missing cap let the agent chase broken path refs into the source repo: **+4 Bash calls, +28K tokens** | "one `ls` per finding, max 3 traces total, don't spelunk into source repos" | `uncapped_followup` |
| 3 | **Batch invitation** | "read in parallel" was staged as a **6+8-file batch**, paying **+27K cache_creation tokens** | cap the batch; don't pre-stage a large parallel read on the model's behalf | `batch_invitation` |

Each fired because the SKILL.md procedure removed the scoping pressure the improvised (cold) arm still felt. An unguided model rations its own reads when it is paying for them; a procedure that says "read each X" hands it permission to stop rationing. The guard wording puts the ceiling back. Each mechanism was observed on a single cell here, so the *frequency* is unmeasured, but the *susceptibility* is structural: any SKILL.md written in imperative prose can trigger all three. The char and token figures above are forensic readings from Round 1's per-agent JSONL transcripts, not fields in the summary JSON.

## The rounds

| Round | Skills measured | Cells | Agg. (skill vs cold) | What it showed |
| --- | --- | ---: | ---: | --- |
| 1 | skills-freshness, skills-quality | 6 | **+2.5%** | 3 of 6 cells sign-flipped, surfaced the cost-trap mechanisms |
| 2 | skills-freshness (post-fix) | 3 | **+11%** | all 3 cells turned around; freshness/haiku **+90pp** swing |
| 3 | content-audit (rigor-exempt test) | 3 | **+1%** | rigor-exempt label inflated, sat at break-even |
| 4 | content-audit (post-fix) | 3 | **+4%** | MIXED, haiku **+16pp** flip; sonnet −6pp swing (within noise) |
| 5 | both new skills (re-validation) | 6 | **+16%** | MIXED, strongest aggregate, but concentrated in two haiku cells |

Round 1's per-cell spread is the interesting part: skills-freshness/sonnet saved 83,923 tokens (+43%), while skills-freshness/haiku *cost* 44,614 more (−70%), the largest sign-flip in the study. Haiku's cold arm was unusually cheap (32 small assistant turns, 64K total: many tiny look-ups instead of fewer big reads), and the SKILL.md context, script dispatch and result review carry overhead a cost-pinched cold walk avoids.

Round 2 re-ran skills-freshness after the guard fixes shipped. All three cells turned positive: sonnet +14%, opus +1%, haiku +20%. Aggregate skills-freshness went +2.7% → +11%.

Round 3 tested a label rather than a fix. content-audit was marked "rigor-exempt": cost is the point, don't measure it. It sat at break-even (+1%), not deep-negative as the label assumed. The label was inflated; wholesale exemption from cost-trap rules would silence a genuine signal. Five remaining rigor-exempt skills are still labeled exempt by assumption only.

Round 4's post-fix re-run was **MIXED** against thresholds stated before the results were known (PASS = ≥2 of 3 cells flip AND aggregate > +5%): haiku flipped −5% → +11%, sonnet moved −3% → −9%, opus +8% → +10%, aggregate +1% → +4%. The cost-trap rule's prediction is correct on smaller models; the fix may slightly hurt larger models that don't over-execute. R3 and R4 used independent BEFORE arms whose baseline drifted +7–13% per model between runs, so the opus +2pp sits inside its own drift. The robust signal is the haiku sign-flip.

Round 5's +16% is the strongest aggregate of any round and the most misleading. The two haiku cells (skills-freshness +52,289, skills-quality +55,623) sum to ~108K (more than the entire net save of 90,288), while the other four cells net **−17,624**, three of them inside the noise floor. Read it as "two strong haiku saves outweighing four flat-to-negative cells," not an across-the-board gain. The skills-quality/opus −62% is an N=1 anomaly: its BEFORE cell was 31K tokens (opus short-circuited cold without thoroughly auditing); the AFTER (51K) was the more representative number.

## What I won't claim

**N=1 per cell**: sufficient to surface direction, not magnitude.

**The noise floor is estimated, not measured.** The true run-to-run noise on a single N=1 arm is unmeasured: pinning it down would require repeated identical runs, which this study did not do. When I call a ±1–2% cell "inside the noise floor," that floor is itself an estimate (roughly the BEFORE-arm drift seen between rounds, +7–13% on content-audit), and the real floor could be wider. The working rule: cells within roughly ±2% carry no signed signal.

**A swing carries more noise than a level**, being a difference of two N=1 ratios, which is why only the large swings (+90pp, +16pp) are headline-safe and the small ones (sonnet −6pp, opus +2pp, both R3→R4) are the worst of both worlds. Even a large-looking swing can be pure baseline movement: skills-freshness on sonnet read −29pp R1→R2 not from a regression but because its cold BEFORE arm moved 194,751 → 106,046 between rounds. Re-running the cold baseline every round neutralises model drift but lands the cold arm's variance directly in the swing. The better design is a small *averaged* cold reference per (model, task), pinned across rounds.

**Aggregates are ratio-of-sums**: net tokens saved ÷ total BEFORE tokens, volume-weighted, not the mean of per-cell percentages. The two diverge sharply at N=1: Round 1's +2.5% becomes −6.3% as an unweighted mean; Round 5's +16% becomes +7%.

**The headline aggregates are not a like-for-like series.** R1 and R5 are 6 cells, R2 is 3 (quality was skipped), R3–R4 measure a different skill. The composition-matched freshness-only series climbs cleanly: **+2.7% (R1) → +10.7% (R2) → +14.9% (R5)**. That is the real trend.

The PASS/MIXED/FAIL thresholds were pre-registered, which prevents post-hoc goalpost-moving, but a `> +5%` cutoff at N=1 with a noise floor of unknown width below it is a triage rule, not a measurement gate. Maintenance cost of writing the rules and SKILL.md edits isn't folded in. Per-model dollar pricing isn't either: raw token totals only. And with per-cell variance up to 67pp on Opus (skills-quality/opus +5% in R1 → −62% in R5), I can't claim a second N=1 re-run would land within 5% of these numbers.

## The round-6 correction

A later depth re-measurement (2026-06-01, N=5 per arm, both arms stable) measured the Opus *level* (skill-vs-cold) rather than the fragile N=1 swing, and found a real **+76%** save for both auditor skills: at depth the cold arm does the full audit while the script-backed skill short-circuits, and the earlier near-zero/negative reads were N=1 artifacts of an unusually shallow cold arm. The fragile N=1 swings were noise; the underlying Opus save at depth is real. Everything above is the rounds-1–5 record; the correction lives in the replicates.

The full study PDF is on mikkonumminen.dev: run `download --research` in the contact terminal, then `download --study`. The summary that sits above this one is in the token-economy write-up.
