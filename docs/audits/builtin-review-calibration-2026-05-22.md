# Built-in `/review`: measured token savings (2026-05-22)

Same A/B methodology as [`spacepotatis-skills-calibration-2026-05-22.md`](spacepotatis-skills-calibration-2026-05-22.md), this time applied to the Claude Code built-in `/review` slash command. Two parallel Sonnet sub-agents dispatched off `mikkonumminen.dev` master at `1b2fa55`. N=1.

## Setup

| | Arm A (no procedure) | Arm B (built-in recipe) |
|---|---|---|
| Brief | "Review PR #149. Produce a thorough code review." | The verbatim 7-step `/review` prompt + "PR number: 149." |
| Constraint | Do NOT read `.claude/skills/`, `CLAUDE.md`, or invoke `/review`. | Follow the procedure exactly. |
| Allowed tools | Bash + `gh` CLI + Read | Bash + `gh` CLI + Read |
| Output file | `D:\tmp\review-arm-A.md` | `D:\tmp\review-arm-B.md` |

Both arms reviewed the same PR (#149, the calibration overlay wiring) and produced real review markdown.

## Result

| Arm | Tokens | Tool uses |
|---|---:|---:|
| A (no procedure) | 72,170 | 33 |
| B (`/review` recipe) | 26,432 | 3 |
| **Saved** | **+45,738** |, |
| **% saved** | **63%** |, |

This is the largest saving observed so far: the Spacepotatis portfolio averaged 22% and topped out at 48% (`ai-codegen-smell-audit`).

## Why so big

The structured recipe collapses a tree of exploration into a straight line. Arm A:

1. Scouted the repo to understand the project (`README`, `package.json`, `scripts/` directory walk).
2. Read the four changed files at length.
3. Read several adjacent files to understand context (`renderRepoSection`, `tokensSavedAnnual`, the CSS).
4. Composed a long-form review with extensive prose around each finding.

Arm B:

1. `gh pr view 149 --json …`
2. `gh pr diff 149`
3. Wrote the review.

The recipe says exactly what to look at; arm A doesn't know that yet and has to figure it out. Both arms landed verdicts in the same neighborhood ("approved, minor low-severity notes"), but arm A surfaced more granular observations (e.g. the `last_invoked` semantic ambiguity, the invisible-bordered banner-row spacer) that arm B did not.

## What this means

Two readings, both true:

**(a) The built-in is a substantial token win for routine PR review.** If you're doing many small reviews, leaning on `/review` cuts cost dramatically. The recipe is well-tuned for the task: `gh pr view` for metadata, `gh pr diff` for content, structured sections for output. Hard to improve on without changing the tool's contract.

**(b) The cost saved is partly cost-of-thoroughness.** Arm A's extra 45K tokens bought more nuance: three additional low-severity observations the structured arm didn't reach. For high-stakes reviews (security-critical merges, large refactors), the structured arm may be undershooting. For day-to-day code review on a routine fix-up PR, the structured arm is more than sufficient.

This is the same pattern as `security-audit` and `equipment` in the Spacepotatis run, but in the opposite direction: those skills *cost more* than freestyle because they encode rigor. `/review` *saves more* because it encodes focus. Both directions are valid skill designs.

## Caveats

- **N=1.** Single PR, single dispatch per arm. Pick a different PR (especially one with a larger or more contentious diff), and the gap might compress (more code to review = both arms spend more in absolute terms = % saved shrinks).
- **Sub-agent vs interactive use.** Arm B pasted the prompt verbatim into a Sonnet sub-agent's brief; a real user typing `/review` invokes the same prompt via the Claude Code harness. Behaviour should match, but the integration path differs.
- **Quality grading was light.** Both reviews exist and cover the PR; no rubric beyond "did each arm produce a defensible code review?" was applied. The 63% saving is a token saving, not a quality saving: see point (b) above.

## Cost of this calibration

~99K tokens across two sub-agents. One-shot measurement.

Source data: [`.claude/agent-verdicts/SKILL-CALIBRATION-BUILTINS-2026-05-22.json`](../../.claude/agent-verdicts/SKILL-CALIBRATION-BUILTINS-2026-05-22.json).
