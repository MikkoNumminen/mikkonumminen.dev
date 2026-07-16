---
title: The first calibration: what 13 Spacepotatis skills actually cost
project: portfolio
date: 2026-05-22
kind: post
type: research
---

# The first calibration: what 13 Spacepotatis skills actually cost

I A/B-tested every non-redirect skill in my Spacepotatis game repo against a no-skill baseline: 13 skills, one pair each, 26 Sonnet sub-agent invocations. The cold arms burned 1,118,644 tokens; the with-skill arms burned 876,396. That is 242,248 saved, a net rate of ~22%. The skills-registry PDF I ship (`public/skills-registry.pdf`) was modelling savings at ~67%, off an editorial 3× heuristic. Measurement put the real rate at about a third of that — the heuristic is overoptimistic by about a factor of three when averaged across this portfolio. This is the first time measurement contradicted the heuristic, and the whole study line that followed is built on it.

| Aggregate | Tokens |
| --- | ---: |
| Arm A (no skill, 13 sub-agents) | 1,118,644 |
| Arm B (with skill, 13 sub-agents) | 876,396 |
| Savings | 242,248 |
| Net savings rate | ~22% |

11 of 13 skills saved tokens. 2 cost more per use. Range: −5% to +48%.

## How it was measured

Arm A: a Sonnet sub-agent given the task and instructed NOT to read `.claude/skills/*` or any `SKILL.md`. It scouts the codebase cold, mirrors patterns from similar existing code, writes the artifact. Arm B: a Sonnet sub-agent given the same task, instructed to read the relevant `SKILL.md` and follow its procedure exactly.

Both arms ran in fresh worktrees branched from Spacepotatis master at `94655a9`. Each produced real files — the work is the work; the tokens are the tokens. Each sub-agent's transcript reports its own usage in the harness's `task-notification` payload, and that is the number recorded. Accounting matches `/mikko-skill-usage` and `/mikko-session-cost`: input + output + cache_creation, cache_read excluded. Each sub-agent is its own session, so dedupe-by-requestId is implicit.

Sonnet only — no Opus or Haiku arms; the per-model comparison is a later study. N = 1 per skill. This is a calibration pass, not a benchmark.

## Per-skill results

| Skill | Arm-A | Arm-B | Saved | % | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `modular-architecture-audit` | 175,187 | 128,773 | +46,414 | 26% | |
| `ai-codegen-smell-audit` | 157,348 | 81,119 | +76,229 | 48% | quality regression — A found 11 smells, B found 1 |
| `security-audit` | 107,885 | 112,211 | −4,326 | −4% | skill encodes rigor, costs more |
| `content-audit` | 99,335 | 77,026 | +22,309 | 22% | |
| `equipment` | 89,006 | 93,683 | −4,677 | −5% | skill enforces full CRUD lifecycle, costs more |
| `new-perk` | 82,299 | 55,705 | +26,594 | 32% | |
| `new-mission` | 78,730 | 49,780 | +28,950 | 37% | arm-B blocked mid-work by classifier; partial run |
| `new-enemy` | 75,309 | 68,353 | +6,956 | 9% | |
| `save-roundtrip-audit` | 70,080 | 62,874 | +7,206 | 10% | |
| `new-solar-system` | 65,319 | 59,603 | +5,716 | 9% | |
| `new-story` | 47,182 | 33,460 | +13,722 | 29% | |
| `balance-review` | 46,279 | 33,160 | +13,119 | 28% | |
| `new-migration` | 24,685 | 20,649 | +4,036 | 16% | |
| **Aggregate** | **1,118,644** | **876,396** | **+242,248** | **22%** | |

## What the data shows

**Skills that save tokens by encoding "where to write what."** The new-* family — `new-enemy`, `new-mission`, `new-perk`, `new-solar-system`, `new-story`, `new-migration` — plus `balance-review` show 9–37% savings. The procedure tells the agent which files to touch and how; the no-skill arm has to scout that information cold by reading similar existing entries, and the scout cost is the savings.

**Skills that save tokens but at a quality cost.** `ai-codegen-smell-audit` saves 48%, the highest single number — but arm A found 11 smells while arm B found 1. The "savings" partly reflect the skill's stricter pattern definitions filtering out noise. That is a real efficiency win if you trust the skill's discrimination, but it is also a token comparison between "finding more stuff" and "finding less stuff" — not apples-to-apples. The 48% is not a clean win and I don't present it as one.

**Skills that cost MORE per use.** `security-audit` (−4%) and `equipment` (−5%) both ran more expensive in the with-skill arm. These skills encode rigor: security-audit walks the full attack surface in a prescribed order; equipment requires data + types + sprite + rewards + loot + schemas + tests. The no-skill arm has latitude to be less thorough; the with-skill arm doesn't. Their value is in completeness, not token compression. The PDF's "saved" column gives them positive savings, which is wrong by the measurement here.

**Skills with thin gain.** `new-enemy`, `new-solar-system` and `save-roundtrip-audit` all came in at 9–10%. The no-skill arm could already mirror existing patterns effectively, so the skill's procedure didn't add much over what a careful Sonnet sub-agent would do on its own. Real savings, but smaller than the procedural skills in the new-* family.

## What I did about the PDF

The registry PDF modelled savings as:

> Saved = (3× cost-per-use − 1× cost-per-use) × annual uses = 2× cost-per-use × annual uses

That implies a ~67% rate for every skill. Its method page had already hedged: *"the 3× number comes from a handful of side-by-side runs I did on my own machine. It is not a benchmark. It is not a guarantee."* This pass confirmed the hedge and put a number on it.

Three options were open. Lower the multiplier from 3× to ~1.28× (saved ≈ 0.28× cost-per-use) — cleanest, smallest change, easiest to defend. Per-skill overrides, setting `tokens_saved_per_use` on the receipts where measurement disagrees with the heuristic: security-audit and equipment to zero or slightly negative, the new-* family to 0.25× cost, the audits to ~0.20× cost — more granular, more bookkeeping. Or drop the savings column, present cost-per-use only, and stop claiming savings until there is more A/B data than N=1 — most honest, but it loses a useful framing. I took option 1 for now: pin the multiplier to 1.28 (measured), with a footnote on the method page citing this calibration and noting that some skills don't compress at all.

## What it cost

| Item | Value |
| --- | ---: |
| Cost to run this calibration | ~2.0M tokens |
| Portfolio modeled annual saved tokens at measured 22% | ~5.5M |
| Portfolio modeled annual saved tokens per the PDF's current model | ~25M |
| Break-even on the calibration cost | roughly 4-5 months of normal use |

The ~2.0M is the sum of all 26 sub-agent invocations. That's substantial — roughly the cost of a full week of normal skill use across the portfolio. One-shot calibration, not a routine check.

## Honest caveats

- **N = 1 per skill.** Single data point. Don't read precision into individual percentages. Re-running an A/B would produce a different absolute number for both arms. Trust the direction and rough magnitude; don't trust two-significant-digit precision.
- **Sub-agent != main-thread.** Sub-agents have their own context-loading characteristics; this is roughly representative but not identical to a user running the skill in their main session.
- **Outcome equivalence not verified.** Both arms produced "something", but I didn't check that the two arms' artifacts solve the same problem at the same quality level. The smell-audit row makes this explicit. For the create skills, both arms reportedly passed the existing test suite, which is the closest thing to an equivalence check.
- **`new-mission` arm B was blocked partway** by the auto-mode classifier — the skill requires adding a weapon to satisfy a bijection invariant, and the classifier flagged that as scope escalation. The token count is still real for the work done; the run just didn't finish. Its 37% is a partial run.
- **`ai-codegen-smell-audit` arm B wrote outside its worktree**, into the main Spacepotatis checkout. Token measurement still valid; the file is being cleaned up.
- **Selection bias on tasks.** I picked tasks I thought were small and well-bounded. The audits naturally cost more tokens regardless of skill; the new-* family is naturally bounded by data-file size. A different task selection could shift averages.

This aggregate is the Spacepotatis figure summarised in "What A/B-testing my Claude Code skills actually saved", which covers the whole research line — including the later suite calibration across Sonnet, Opus and Haiku, and which findings replicate. This post is the detail underneath it. The scope here is narrow on purpose: one repo, one model, 13 non-redirect skills, one run each.
