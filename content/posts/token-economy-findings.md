---
title: What A/B-testing my Claude Code skills actually saved
kind: post
---

# What A/B-testing my Claude Code skills actually saved

After a year of claiming the AI workflow paid off, I ran the A/B. Every custom Claude Code skill measured against itself going cold — same task, sub-agent on versus sub-agent off. The first calibration used Sonnet sub-agents only; the suite calibration that followed extended to Sonnet, Opus, and Haiku. Here is what the data actually shows, and how I report it.

## The first calibration: Spacepotatis (2026-05-22)

I measured all 13 non-redirect Spacepotatis skills with paired A/B sub-agents. Arm A got no skill awareness and scouted the codebase cold. Arm B read the SKILL.md and followed its procedure exactly. Both arms ran in fresh worktrees; tokens were measured from each sub-agent's transcript (input + output + cache-creation; cache-read excluded).

**Aggregate result:**

| Arm | Tokens |
|---|---:|
| A (cold, 13 sub-agents) | 1,118,644 |
| B (with skill, 13 sub-agents) | 876,396 |
| Savings | 242,248 |
| Net savings rate | ~22% |

11 of 13 skills saved tokens. 2 cost more. Range: -5% to +48%.

The skills PDF had been modelling savings at a 67% rate (a 3x cost-per-use heuristic). The measured rate is about a third of that. The PDF's method page already called out that the heuristic was "not a benchmark"; this calibration confirmed it was overoptimistic by roughly 3x when averaged across this portfolio.

## The suite calibration: mikko- library + two other corpora (2026-06-02/03)

I then ran a broader calibration: 8 skills from the mikko- library across all three models (48 sub-agent arms), then Spacepotatis audit skills (24 arms), then AudiobookMaker audit skills (24 arms). 96 arms total.

**Aggregate across the mikko- suite:**

| Model | Cold (A) | With skill (B) | Savings |
|---|---:|---:|---:|
| Opus | 497,802 | 432,762 | +13% |
| Sonnet | 462,390 | 393,149 | +15% |
| Haiku | 435,166 | 316,327 | +27% |

## What actually replicates (and what does not)

Across three corpora — a portfolio site, a browser game, and a Python desktop app — two theses were tested.

**Thesis 1 (3/3, bankable): savings concentrate in procedure/script-backed skills; prose audits wash against a capable cold model.** The three genuinely script-backed skills (`skills-quality`, `skills-freshness`, `session-cost`) — which replace LLM reasoning with a Python pre-pass — save on every model in every corpus. The bounded-procedure skills (`balance-review`, `audit`) save in most corpora too, with one instructive exception: `audit` costs more than cold scouting on Opus in the mikko- suite (−51%), where the cold Opus arm is already cheap; it flips positive as the model weakens (+2% Sonnet, +7% Haiku). The prose audit skills (`ai-codegen-smell-audit`, `readme-drift-sync`) are wash-to-negative against a capable cold model and only turn clearly positive as the model weakens. This held across all three repos.

**Thesis 2 (1/3, do not generalize): savings scale inversely with model capability.** Clean in the mikko- suite (+13% Opus → +15% Sonnet → +27% Haiku). Non-monotonic in Spacepotatis (flat ~+15% across models). Non-monotonic in AudiobookMaker (+1% Opus, +24% Sonnet, +22% Haiku). The curve appears only when the cold arm's cost scales steeply as the model weakens — a property of the task, not a law of skills.

## The honest reporting standards

A few principles I applied when writing up these results:

**Colour only beyond the demonstrated noise floor.** The Spacepotatis re-measure accidentally demonstrated the noise floor: re-running the same arms on near-identical skill files produced an ~8-point swing from cross-session drift alone. So results tables colour only cells that clear ±20%; within that band is direction-at-best, not a magnitude.

**Separate claims by replication strength.** A finding that replicates 3/3 across repos earns a different label than one that holds 1/3. Thesis 1 is bankable; Thesis 2 is task-dependent and is noted as such.

**Recurring contamination is a harness bug, not a footnote.** Side-effect file reuse (a skill arm reading a report a sibling arm wrote) recurred in all three calibration runs. That's a harness isolation problem; it's called out as such, not buried.

**Skills that cost more are not failures.** Two Spacepotatis skills (`security-audit`, `equipment`) ran more expensive with the skill than without. They encode rigor: `security-audit` walks the full attack surface in a prescribed order; `equipment` enforces full CRUD lifecycle coverage. The cold arm had latitude to be less thorough. Their value is completeness, not token compression.

**N = 1 per cell.** Every result here is a single data point per cell. Direction and rough magnitude only; re-running yields different absolute numbers. Round 6 of the optimization study re-measured the noisiest cells at N=5/arm for confirmation; the others remain N=1.

The full calibration data, per-skill tables, and the methodology behind the savings estimates are downloadable from the contact terminal at mikkonumminen.dev (`download --skills`, `download --catalog`, `download --study`, `download --replicates`, `download --results`).
