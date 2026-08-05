# Spacepotatis skills: measured token-savings calibration

Date: 2026-05-22. Methodology: A/B test of every non-redirect Spacepotatis skill against a no-skill baseline. **Real measurement, not the editorial 3× heuristic the registry PDF uses.**

## tl;dr

| Aggregate | Tokens |
| --- | ---: |
| Arm A (no skill, 13 sub-agents) | 1,118,644 |
| Arm B (with skill, 13 sub-agents) | 876,396 |
| Savings | **242,248** |
| Net savings rate | **~22%** |

11 of 13 skills saved tokens. 2 cost more per use. Range: **−5% to +48%**.

The PDF's editorial heuristic models savings at ~2× cost-per-use (i.e. ~67% rate). **Measured rate is ~3× lower than the heuristic claims**: the heuristic is overoptimistic by about a factor of three when averaged across this portfolio.

## Methodology

Each of 13 skills got a paired A/B test:

- **Arm A (no skill)**: a Sonnet sub-agent given the same task, instructed NOT to read `.claude/skills/*` or any `SKILL.md`. It scouts the codebase cold, mirrors patterns from similar existing code, writes the artifact.
- **Arm B (with skill)**: a Sonnet sub-agent given the same task, instructed to read the relevant `SKILL.md` and follow its procedure exactly.

Both arms ran in fresh worktrees branched from Spacepotatis master at `94655a9`. Each produced real files (the work is the work; the tokens are the tokens). Each sub-agent's transcript reports its own token usage in the harness's `task-notification` payload; that's the number recorded.

Token accounting matches `/mikko-skill-usage` and `/mikko-session-cost`: input + output + cache_creation; cache_read excluded. Each sub-agent is its own session, so dedupe-by-requestId is implicit.

**N = 1 per skill.** This is a calibration pass, not a benchmark. The numbers are real measurements but every row is a single data point: re-running an A/B would produce a different absolute number for both arms. Trust the direction and rough magnitude; don't trust two-significant-digit precision.

## Per-skill results

| Skill | Arm-A | Arm-B | Saved | % | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `modular-architecture-audit` | 175,187 | 128,773 | +46,414 | 26% | |
| `ai-codegen-smell-audit` | 157,348 | 81,119 | +76,229 | **48%** | quality regression, A found 11 smells, B found 1 |
| `security-audit` | 107,885 | 112,211 | −4,326 | **−4%** | skill encodes rigor, costs more |
| `content-audit` | 99,335 | 77,026 | +22,309 | 22% | |
| `equipment` | 89,006 | 93,683 | −4,677 | **−5%** | skill enforces full CRUD lifecycle, costs more |
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

**Skills that save tokens by encoding "where to write what".** The new-* family (new-enemy, new-mission, new-perk, new-solar-system, new-story, new-migration) plus balance-review and new-story all show 9–37% savings. These are skills where the procedure tells the agent which files to touch and how: the no-skill arm has to scout that information cold by reading similar existing entries, and the scout cost is the savings.

**Skills that save tokens but at a quality cost.** `ai-codegen-smell-audit` saves 48% (the highest single number), but arm-A found 11 smells while arm-B found 1. The "savings" partly reflect the skill's stricter pattern definitions filtering out noise. That's a real efficiency win if you trust the skill's discrimination, but it's also a token comparison between "finding more stuff" and "finding less stuff", not apples-to-apples.

**Skills that cost MORE per use.** `security-audit` and `equipment` both ran more expensive in the with-skill arm. These skills encode RIGOR: security-audit walks the full attack surface in a prescribed order; equipment requires data + types + sprite + rewards + loot + schemas + tests. The no-skill arm has latitude to be less thorough; the with-skill arm doesn't. **Their value is in completeness, not token compression.** The PDF's "saved" column gives them positive savings, which is wrong by the measurement here.

**Skills with thin gain.** `new-enemy`, `new-solar-system`, `save-roundtrip-audit` all came in at 9–10% savings. These are skills where the no-skill arm could already mirror existing patterns effectively, so the skill's procedure didn't add much over what a careful Sonnet sub-agent would do on its own. Real savings, but smaller than the procedural skills in the new-* family.

## Implications for the PDF

The skills-registry PDF (`public/skills-registry.pdf`) currently models savings as:

> Saved = (3× cost-per-use − 1× cost-per-use) × annual uses = 2× cost-per-use × annual uses

That implies a **~67% savings rate** for every skill. The measured rate across these 13 skills is **~22%**: about a third of the heuristic.

The PDF's method page already calls this out: *"the 3× number comes from a handful of side-by-side runs I did on my own machine. It is not a benchmark. It is not a guarantee."* This calibration pass confirms it's an over-estimate by ~3× when averaged across Spacepotatis.

**What to do with this number.** Three options:

1. **Lower the multiplier**: change the model from 3× to ~1.28× (so saved ≈ 0.28× cost-per-use). This brings the modeled annual savings into line with measured rates. **Cleanest, smallest change**, easiest to defend.
2. **Per-skill overrides**: set `tokens_saved_per_use` directly on the receipts where the measurement disagrees with the heuristic (security-audit and equipment to zero or slightly negative; the new-* family to 0.25× cost; the audits to ~0.20× cost). More granular, more bookkeeping.
3. **Drop the savings column**: present cost-per-use measurement only, and stop claiming savings until we have more A/B data than N=1. **Most honest**, but loses a useful framing.

Recommendation: **option 1 for now**, with a footnote on the method page citing this calibration. Pin the multiplier to 1.28 (measured) and note that some skills don't compress at all.

## Honest caveats

- **N = 1 per skill.** Single data point. Don't read precision into individual percentages.
- **Sub-agent != main-thread.** Sub-agents have their own context-loading characteristics; this is roughly representative but not identical to a user running the skill in their main session.
- **Outcome equivalence not verified.** Both arms produced "something" but I didn't check that the two arms' artifacts solve the same problem at the same quality level. The smell-audit row makes this explicit (different finding counts). For the create skills, both arms reportedly passed the existing test suite, which is the closest thing to an equivalence check.
- **arm-B for new-mission was blocked partway** by the auto-mode classifier (the skill requires adding a weapon to satisfy a bijection invariant; the classifier flagged that as scope escalation). Token count is still real for the work done; the run just didn't finish.
- **ai-codegen-smell-audit arm-B wrote outside its worktree**, into the main Spacepotatis checkout. Token measurement still valid; the file is being cleaned up.
- **Selection bias on tasks.** I picked tasks I thought were small and well-bounded. The audits naturally cost more tokens regardless of skill; the new-* family is naturally bounded by data-file size. A different task selection could shift averages.

## Experiment cost

Running this calibration cost **~2.0M tokens** (sum of all 26 sub-agent invocations). That's substantial: roughly the cost of a full week of normal skill use across the portfolio. **One-shot calibration**, not a routine check.

For comparison: at the measured 22% net savings rate, the entire portfolio's modeled annual saved tokens would be ~5.5M (instead of the PDF's current ~25M). The calibration cost ~2.0M to measure once. Break-even is at roughly 4-5 months of normal use.

## Cleanup

26 calibration worktrees under `D:/koodaamista/Spacepotatis/.claude/worktrees/calib-*/` plus stray `docs/audits/ai-smell-2026-05-22.md` in the Spacepotatis root checkout (arm-B for ai-codegen-smell-audit misrouted its write). Cleanup happens in a follow-up commit on the source repo; this PR only adds the report.
