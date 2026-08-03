# AI-First Rating — instrument definition (2026-08-03 campaign)

The rubric the 2026-08-03 campaign measures against. Frozen at the start of the
campaign so the score cannot be moved by moving the ruler: any change to weights
or dimension definitions after iteration 0 invalidates comparability and must be
recorded here with a reason.

## Scope

**Whole repo.** `src/`, `chat-backend/`, `content/`, `docs/`, `scripts/`,
`.claude/`, `.github/`, and the root config. This is wider than the 2026-06-14
measurement, which was frontend-centric and predates roughly half the current
code — so a *lower* number this round would not necessarily mean regression. The
weights are unchanged from June specifically so the per-dimension shape stays
comparable even though the scope does not.

## Dimensions and weights

| # | Dimension | Weight | What it asks |
| --- | --- | ---: | --- |
| 1 | Onboarding & navigation | 18% | Can an agent that has never seen this repo become productive from the committed docs alone — README, CLAUDE.md, AGENTS.md, per-directory entry points, env checks — without asking a human? |
| 2 | Code legibility | 18% | Do files explain their own purpose and constraints at the top; are modules small and single-responsibility; are magic numbers justified; is the why-not-what comment discipline actually held? |
| 3 | Self-verification gates | 16% | Can an agent prove its change is correct without a human? Unit/e2e/eval coverage, invariant tests, coverage ratchets, and whether the gates catch the failures that actually occur here. |
| 4 | Decision & rationale | 12% | Are non-obvious choices recorded with rejected alternatives, and is supersession disciplined? ADRs, audit docs, and in-file rationale. |
| 5 | Automation & tooling | 12% | CI as a hard gate: least privilege, timeouts, concurrency, security scanning, drift guards, and one-command local reproduction of what CI does. |
| 6 | Type safety & data | 10% | Strictness settings actually held (no escape-hatch casts), validated trust boundaries, typed data modules, runtime shape guards where types cannot reach. |
| 7 | Machine-readable artifacts | 7% | Schemas, validators, and structured outputs that a machine can consume and check — not prose an agent must parse. |
| 8 | Security/ops docs | 7% | Threat model, headers/CSP, containment invariants, secret handling, and runbooks accurate enough to act on. |

## Scoring rules (the "fair panel" calibration)

These are the rules that produced the best-calibrated of June's three
calibrations, and they are kept verbatim:

1. **One decimal place, 0.0–10.0.** Integer scores discard ~0.5 point of real
   signal per dimension by rounding a 8.7-quality dimension to "8".
2. **Verify before deducting.** No gap costs points until the assessor has
   opened the real file and can cite `path:line`. June's strict panel deducted
   for three gaps that were false on inspection.
3. **Log rejected suspicions.** An assessor that investigated a suspected gap
   and found it unfounded records that, so the next round does not re-litigate
   it.
4. **Deterministic aggregation.** The overall is `sum(weight × score)`,
   computed from the per-dimension numbers, never estimated holistically.

## Target

Campaign stops when **overall ≥ 9.5 and every dimension ≥ 9.3**.

## Known instrument limits

- ±~0.2 single-assessor variance per dimension. A 0.1 move between rounds is
  noise, not progress; only moves beyond ~0.2 are reportable as real.
- The assessors are the same model family as the author of the fixes. This is
  self-grading with a paper trail, not an independent benchmark, and the score
  should never be quoted without that caveat.
- Scores measured before a dimension's own fix merges are conservative for that
  dimension; the ledger records which reading each number came from.
