---
title: Skill-suite calibration: 96 A/B arms across three codebases and three models
project: portfolio
date: 2026-06-02
kind: post
type: research
---

# Skill-suite calibration: 96 A/B arms across three codebases and three models

This is the broadest run in the calibration line. I measured cold-vs-with-skill token cost — arm A scouts from first principles, arm B reads the `SKILL.md`, runs any companion script and follows the procedure, same deliverable per pair — across all three models (Opus 4.8, Sonnet 4.6, Haiku 4.5) over three different codebases: the mikko- library measured against `mikkonumminen.dev` (8 cleanly-A/B-able skills, 48 arms, 2026-06-02); Spacepotatis, a game (4 read-only audit skills, 24 arms, 2026-06-03); and AudiobookMaker, a Python desktop app (4 read-only skills, 24 arms, 2026-06-03). 96 arms across all three. Accounting is per-arm `subagent_tokens` (input + output + cache-creation), read-only, N = 1 per cell.

One finding survived all three corpora: token savings concentrate in procedure/script-backed skills, and prose audits wash against a capable cold model — 3/3, bankable. One did not: the inverse-capability curve, clean in the mikko- suite (+13% Opus → +15% Sonnet → +27% Haiku) but flat in Spacepotatis and non-monotonic in AudiobookMaker — 1/3, do not generalize. And a third result was a null: an after-optimization re-measure of three trimmed skills moved numbers that had nothing to do with the trim.

The aggregates and the two theses are summarised in [what A/B-testing my Claude Code skills actually saved](/posts/token-economy-findings). This is the detail underneath them. The PDF is `download --calibration` from the contact terminal at mikkonumminen.dev.

## The mikko- suite, skill by skill

The corpus was `audit`, `ai-codegen-smell-audit`, `react-anti-patterns-audit`, `readme-drift-sync`, `skills-quality`, `skills-freshness`, `skill-usage`, `session-cost`. Orchestrator, installer, lister and recursive skills were excluded as not cleanly measurable. Tasks were auto-synthesized against pinned targets: code audits → `mikkonumminen.dev/src/lib`(+`/terminal`); react → Spacepotatis; readme → the repo's `README.md`; skills-quality/freshness → the live `~/.claude/skills/mikko-*`; skill-usage/session-cost → `~/.claude/projects`.

| Skill | Opus A | Opus B | Opus % | Sonnet A | Sonnet B | Sonnet % | Haiku A | Haiku B | Haiku % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| skills-freshness | 101,969 | 23,215 | +77% | 82,177 | 18,083 | +78% | 88,412 | 29,948 | +66% |
| skills-quality | 75,323 | 21,829 | +71% | 83,680 | 14,895 | +82% | 55,753 | 23,637 | +58% |
| session-cost | 31,926 | 22,572 | +29% | 19,823 | 15,859 | +20% | 69,520 | 23,054 | +67% |
| react-anti-patterns-audit | 103,254 | 97,460 | +6% | 73,050 | 68,354 | +6% | 55,856 | 57,445 | −3% |
| audit | 94,777 | 142,666 | −51% | 130,314 | 127,089 | +2% | 64,032 | 59,455 | +7% |
| skill-usage | 22,946 | 32,014 | −40% | 21,899 | 21,938 | ~0% | 28,879 | 28,147 | +3% |
| readme-drift-sync | 33,383 | 44,341 | −33% | 24,539 | 74,709 | −204% | 41,126 | 39,715 | +3% |
| ai-codegen-smell-audit | 34,224 | 48,665 | −42% | 26,908 | 52,222 | −94% | 31,588 | 54,926 | −74%* |
| **Aggregate (ratio-of-sums)** | **497,802** | **432,762** | **+13%** | **462,390** | **393,149** | **+15%** | **435,166** | **316,327** | **+27%** |

\* `ai-codegen` Haiku-B was contaminated — it found and reused the `ai-smell-2026-06-02.md` report a *Sonnet* arm wrote earlier. Treat that cell as unreliable.

The savings live in the three script-backed skills. `skills-quality` (+71/+82/+58%), `skills-freshness` (+77/+78/+66%) and `session-cost` (+29/+20/+67%) save on every model, because they replace LLM reasoning with a Python pre-pass or `scan.mjs`. Strip the two meta-skills and the suite goes net-negative on Opus and Sonnet. `react` calibrates neutral everywhere (+6/+6/−3%) — its structured 6-check pass costs about what cold scouting costs on any model. `audit` is the textbook monotonic case (−51% → +2% → +7%): on Opus a cold scout is cheap (95K), so the orchestrator-run skill (143K) loses badly; on Haiku the cold scout is dearer relative to the skill and it flips positive.

The big meta-skill saves are "save by not looking." On all three models the skill arms short-circuited via pre-pass or sha256 hash to "nothing to review" while the cold arms caught real issues: bloat (`ai-codegen` 655 lines, `audit`'s 5× duplicated prompt boilerplate), `security-audit` targeting a non-existent codebase, broken cross-repo links, a stale "13 skills" count. The savings are partly a coarser read. Haiku was the least reliable arm throughout — it hallucinated a finding (`skill-calibration` "has no freshness check" — it does), wrongly concluded "token data unavailable" on skill-usage, and one Haiku arm tripped a security flag by running PowerShell through Bash to circumvent a deny rule.

Skills that cost more are not failures here. `skill-usage`'s extra cost comes with better fidelity, and the prose audits' cost is the structural finding, not a defect.

## The after-optimization re-measure is a null result

The suite was framed as the "before" baseline for a planned optimization pass. That pass (claude-skills #24) trimmed three skills — `ai-codegen-smell-audit` 655→580 lines (Provenance extracted to a companion file, 5 dead links removed), `audit` 410→390 (the 5×-duplicated sub-agent prompt footer deduped), `readme-drift-sync` 325→310 (dated content-calibration narrative extracted). Each skill's arm B was re-measured on all three models, same tasks, same accounting. A negative Δ means cheaper after.

| Skill (arm B) | Opus → | Δ | Sonnet → | Δ | Haiku → | Δ |
|---|---:|---:|---:|---:|---:|---:|
| ai-codegen-smell-audit | 48,665 → 50,044 | +3% | 52,222 → 39,148 | −25% | 54,926 → 47,403 | −14% |
| audit | 142,666 → 82,841 | −42% | 127,089 → 142,847 | +12% | 59,455 → 56,378 | −5% |
| readme-drift-sync | 44,341 → 43,303 | −2% | 74,709 → 37,044 | −50% | 39,715 → 40,704 | +2% |
| **Aggregate (3 skills)** | **235,672 → 176,188** | **−25%** | **254,020 → 219,039** | **−14%** | **154,096 → 144,485** | **−6%** |

That delta is not the optimization. The per-cell swings have no relationship to the 1–3 KB of body each skill shed. The same `audit` task cost 56K, 59K, 83K, 127K and 143K across these runs; that ±40–60K task-work variance dwarfs the body trim by 20–60×. The overall −16% (all nine cells, 643,788 → 539,712) is the before pass's high outliers — `audit` Opus 143K, `readme` Sonnet 75K — regressing toward the mean.

The lesson is about the metric, not the trim. Trimming `SKILL.md` body size buys about zero measurable per-invocation tokens for task-heavy skills: the one-time body read is a rounding error against the audit work itself. The #24 payoff is real but lives where this metric cannot see it — the always-loaded `description` (charged on every matching turn, not just on invocation), context cleanliness, and the correctness of removing dead links and stale narrative. To measure a body-size win you need a skill whose body dominates its task (none of these three), or paired measurement — same-dispatch, same-hour A/B in isolated sandboxes. The fixable lever here is pairing, not sample size.

## The other two corpora

Spacepotatis (2026-06-03), measured after the skills were finetuned on merged #286:

| Skill | Opus % | Sonnet % | Haiku % |
|---|---:|---:|---:|
| balance-review | +43% | +58% | +39% |
| content-audit | +45% | +28% | +8% |
| ai-codegen-smell-audit | −21% | −9% | −2% |
| save-roundtrip-audit | −12% | −30% | +16% |
| **Aggregate (ratio-of-sums)** | **+16%** (371,743 → 311,666) | **+14%** (290,057 → 248,189) | **+15%** (259,481 → 219,846) |

`balance-review` is the standout — the Spacepotatis analogue of the mikko- script-backed skills. `content-audit` saves on Opus and Sonnet (+45/+28%, both clearing the floor); its Haiku +8% is positive but within-band, direction-at-best. `ai-codegen` is wash-to-negative, the same prose-audit pattern as its mikko- copy on a different repo. Net is a flat ~+15%, not monotonic.

AudiobookMaker (2026-06-03), a Python desktop app:

| Skill | Opus % | Sonnet % | Haiku % |
|---|---:|---:|---:|
| audit | +13% | +16% | +25% |
| ai-codegen-smell-audit | ~0% | +51% | +32% |
| release-bundle-audit | −16% | +11% | +18% |
| copyright-scan | −19% | −53% | −5% |
| **Aggregate (ratio-of-sums)** | **+1%** (263,263 → 260,071) | **+24%** (347,706 → 264,695) | **+22%** (251,642 → 196,495) |

`audit` is positive on all three models, but only its Haiku +25% clears the ±20% noise floor; +13% and +16% are direction-at-best, inside the cross-session and N=1 band. Read it as "positive everywhere, convincingly only on Haiku," not as a clean +13/+16/+25 magnitude curve. `ai-codegen` washes on Opus (~0%) and saves big on Sonnet/Haiku (+51/+32%), because the cold Sonnet/Haiku arms ran exhaustive audits (122K / 71K tokens) while the skill arm short-circuited on a prior-audit calibration log ("0 findings, already reviewed"); cold Opus was already efficient at 76K, so there was nothing to save. `copyright-scan` is wash-to-negative — the fixed procedure overhead dominates when the target is a 2-file diff.

The per-model aggregates here are not broad-based. Sonnet's +24% is ~76% a single cell — `ai-codegen`'s short-circuit, 62.8K of the 83K Sonnet net save — and that cell's cold-arm depth (122K) is the noisiest reading in the corpus. Opus is flat-by-offset, not flat-by-wash: `audit`'s +15.5K is mostly cancelled by the `copyright` and `release-bundle` losses (≈ −12K). Only Haiku is genuinely broad (`audit` ~46% and `ai-codegen` ~41% of the net). Overall +16%, resting on one fragile N = 1 cell.

## Why the tables colour at ±20%

The doc demonstrates its own noise floor by accident, and it is the cleanest demonstration in either corpus. A first Spacepotatis pass read the *pre-finetune* skills because the local checkout lagged the #286 merge, giving an aggregate of +6/+8/+7%. Re-running the same arms against the finetuned skills — differing by a few KB of body plus a freshness block — gave +16/+14/+15%. An ~8-point swing; `content`-Opus alone moved 100.9K → 66.7K. Two compounding sources explain it, neither a finetune effect: the two skill versions are near-identical, and the cold A arms were not re-run, so each cell pairs a run-1 A against a run-2 B. Which skill saves versus washes is stable across both runs; only the magnitudes wobble.

That band is not special to the accident. Every A/B pair in this study was measured non-simultaneously, so ~8pp of cross-session drift plus N=1 task-work variance rides on every cell. So the tables colour only cells clearing ±20%; within that is direction-at-best, not a magnitude. That is why the mikko- Opus and Sonnet aggregates (+13/+15) render neutral in the source despite being positive; only the Haiku +27 clears the floor.

The aggregate sub-rule is worth stating carefully, because it is easy to flatten. ±20% is a per-cell floor; ratio-of-sums aggregates average over N skills and carry ~÷√N less noise, so neutralising a small aggregate like the mikko- +13/+15 is conservative. But ÷√N assumes roughly equal, independent contributions, and a concentrated aggregate does not inherit it. When one cell is ~76% of the sum — AudiobookMaker's Sonnet +24% — the effective N ≈ 1, not 4, so it earns no tighter floor than a single cell: it clears ±20% by only ~4pp on essentially one measurement. A fragile pass, not a robust aggregate. And one cell is left uncoloured against the rule in the other direction: the contaminated `ai-codegen` Haiku −74%, because a value carrying a contamination footnote should not be painted as a confident magnitude regardless of size.

Contamination itself is a harness isolation bug, not a footnote. Side-effect-file reuse and the PowerShell-via-Bash deny-flag trip (which hit Haiku twice) recurred in all three runs. Recurrence across three independent runs locates the fault in the harness: arms are not isolated from each other's side effects. Until arms run in isolated sandboxes, every cell of a report-writing skill is potentially contaminated — not only the cases caught here.

The three corpora are also not equal in evidence tier. mikko- and Spacepotatis were measured against skills merged on their mainlines (Spacepotatis #286). AudiobookMaker is one tier lower: its arm-B skills were read from an unmerged branch, now PR #84, so its numbers aren't yet reproducible from that repo's mainline. It is the most provisional of the three.

## The predecessor: what the savings cost in fidelity

The narrower calibration a day earlier (2026-06-01) measured exactly two skills — `mikko-skills-quality` and `mikko-skills-freshness` — across the same three models, 12 A/B arms, against a fixed 4-skill fixture: `mikko-audit` (389 lines), `mikko-help` (264), `mikko-skill-calibration` (289), `mikko-skills` (62). Its second dimension is what makes it worth reading alongside the suite: a 12-agent adversarial workflow checked whether the cheaper arm hid a miss. One Sonnet judge per (skill, model) pair compared the two findings files against the actual SKILL.md files, and any finding present in one arm but not the other was re-examined by a skeptic instructed to refute it.

| Skill | Model | Cold (arm A) | Skill (arm B) | Saved | % | Equivalent? |
|---|---|---:|---:|---:|---:|:--:|
| quality | Haiku | 38,975 | 24,338 | 14,637 | 38% | yes |
| quality | Sonnet | 33,540 | 17,486 | 16,054 | 48% | no |
| quality | Opus | 44,316 | 20,227 | 24,089 | 54% | no |
| freshness | Haiku | 39,300 | 34,869 | 4,431 | 11% | yes |
| freshness | Sonnet | 34,535 | 24,127 | 10,408 | 30% | yes |
| freshness | Opus | 48,437 | 31,161 | 17,276 | 36% | yes |

Overall +36% (239,103 → 152,208; 86,895 saved). Per-skill: quality +47% (116,831 → 62,051), freshness +26% (122,272 → 90,157). 4 of 6 pairs equivalent, with 2 confirmed regressions, both on `mikko-skills-quality`, both on the stronger models. Quality is the biggest saver because its triage explicitly says "don't open the SKILL.md by default" — and that is exactly why it missed real findings. On Sonnet the cold arm flagged a hardcoded Windows path at `mikko-skills/SKILL.md` line 21 (`C:/Users/vandr/.claude/skills/mikko-*/SKILL.md`) that works on this machine and breaks everywhere else; the skill arm passed it clean. On Opus the cold arm rated `mikko-audit` HIGH and named the cause — ~400 lines of duplicated embedded sub-agent prompt templates plus a per-language tool-runner loop — where the skill arm issued a generic MEDIUM "loop-style prose" flag and identified none of it. Freshness saved less because its triage reads each flagged skill at `limit=80`, and that extra reading is why it was judged outcome-equivalent on all three models, catching the same hardcoded-path bug the quality arm missed.

Read-light saves more and misses more; read-some saves less and stays faithful. The fix is not "read everything" — that erases the saving — it is to widen the deterministic ruleset, e.g. a regex for absolute home-dir paths, so the cheap pass catches more without an LLM read. No portfolio-wide claim comes out of that run: two skills, a small fixed fixture, N=1 per cell, and Haiku the noisiest model on both arms.

## Where the two documents disagree

They disagree on the sign of the capability curve, and I am not going to smooth it over. The 06-01 calibration reports savings scaling *with* capability: 24% → 39% → 45% by model (Haiku → Sonnet → Opus, Opus best). The 06-02 suite reports the aggregate scaling *inversely*: +13% (Opus) → +15% (Sonnet) → +27% (Haiku), Haiku best. These overlap on `skills-quality` and `skills-freshness` and point in opposite directions. The suite doc never reconciles the reversal, and it ends by ruling the inverse-capability curve 1/3, do not generalize.

The synthesis is the honest reading of both. The curve appears only when the cold arm's cost scales steeply as the model weakens, which is a property of the task, not a law of skills. Where a capable cold model already scouts efficiently, there is nothing for the weaker-model curve to recover. Thesis 2 is task-dependent and must not ride on Thesis 1's replication.

Thesis 1 does replicate 3/3, and it is worth noting what part of it is actually falsifiable. Two claims are welded into the headline and only one half is tautological: a script or pre-pass that moves work off the model necessarily costs the model less. The empirical claims are the other two — that a bounded procedure (`audit`'s, `balance-review`'s) beats unbounded cold scouting, and that prose audits wash against a capable cold model — and those are precisely what the 3/3 replication establishes. Neither leans on the tautology to stand.

## What it cost to find out

The mikko- suite alone cost ~2.54M `subagent_tokens` across its 48 arms (Opus ~931K, Sonnet ~856K, Haiku ~751K); Spacepotatis and AudiobookMaker add 24 arms each. The 06-01 predecessor cost 391,311 tokens for its 12 A/B arms plus 401,602 for the 12-agent equivalence workflow, on top of main-thread orchestration. Its small fixture kept each cold arm bounded at ~33–48K; the 3-model dimension is what multiplied the count.
