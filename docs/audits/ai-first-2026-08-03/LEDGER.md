# AI-First campaign ledger — 2026-08-03

The running record of the campaign. One row per iteration, appended never
rewritten, so the progression stays auditable after the fact. Instrument and
target are defined in [`RUBRIC.md`](RUBRIC.md).

**Target:** overall ≥ 9.5 **and** every dimension ≥ 9.3.
**Branch:** `chore/ai-first-push` (single long-lived branch, one PR).
**Baseline to beat:** 9.12 (2026-06-14, frontend-only scope — see the caveat in
`RUBRIC.md`; this campaign measures the whole repo, so iteration 0 is not
directly comparable).

## Score progression

| Iteration | Onboard 18% | Legible 18% | Verify 16% | Decide 12% | Auto 12% | Types 10% | Machine 7% | Sec 7% | **Overall** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 (baseline) | 8.7 | 9.3 | 7.7 | 8.3 | 6.8 | 8.3 | 7.6 | 6.8 | **8.12** |

## Iteration log

### Iteration 0 — baseline (2026-08-03)

Whole-repo scope, 8 assessors, fair calibration (decimals + verify-before-deduct).
Raw returns in [`00-baseline-raw.md`](00-baseline-raw.md). Overall computed as
`sum(weight × score)` = **8.12**.

**Why this is a point below June's 9.12, and why that is not a regression:** the
scope now includes `chat-backend/` — a FastAPI + Postgres service that did not
exist in the frontend-only measurement — and seven weeks of shipping have left
several canonical docs describing a system that changed underneath them. Only
one dimension (legibility, 9.3) is already at target.

**Weighted deficit by dimension** — the work queue, largest first:

| Dimension | Deficit × weight | Dominated by |
| --- | ---: | --- |
| Automation | 0.384 | branch protection not requiring the `check`/`scenes`/CodeQL jobs |
| Self-verification | 0.368 | same branch-protection gap; boot-only e2e; untested `lifecycle.ts` |
| Onboarding | 0.234 | stale harness/eval counts in five files; LAUNCH.md documents the wrong tunnel |
| Security docs | 0.224 | SECURITY.md + threat-model describe a static site with no backend |
| Decision | 0.198 | no record of the Poro swap; audits index covers 7 of ~30 files |
| Types | 0.190 | `scripts/*.mjs` unchecked; `ragctl.py` outside CI mypy |
| Machine-readable | 0.175 | eval fixtures have no declared shape; registry schema has no value constraints |
| Legibility | 0.090 | `ragctl.py` docstring omits its own moderation verbs |

Total deficit 1.863, which reconciles with the 8.12 overall to within assessor
rounding. Reaching the target means closing roughly 1.38 of it **and** lifting
every dimension to ≥9.3 — in practice, nearly every gap listed.

**Cross-confirmed finding.** Three assessors (automation, self-verification,
types) independently queried the GitHub API and found `required_status_checks`
on `master` contains only `chat-backend`; `gh api .../rulesets` returns `[]`, so
nothing supplements it. The `check` job — typecheck, format, lint,
`test:coverage`, build — and the `scenes` e2e job can be red and the PR still
merges. Worth 0.352 weighted points across three dimensions, the single largest
item in the campaign. It is a **repository settings change, not a file change**:
it cannot land in this PR, and it changes what the owner themselves can merge,
so it needs an explicit decision rather than being applied silently.

## Rules this campaign holds itself to

- **The ruler does not move.** Weights and dimension definitions are frozen in
  `RUBRIC.md`. Any change is recorded there with a reason and invalidates
  comparability.
- **Fixes are real or they are not counted.** A gap is closed when the change is
  committed and the repo's own gate (`typecheck` + `lint` + `test`, plus the
  backend checkers when backend files change) passes — not when an assessor is
  re-run and happens to score higher.
- **Rejected suspicions are recorded**, so later iterations do not re-litigate
  gaps that inspection already disproved.
- **A 0.1 move is noise.** Single-assessor variance is ±~0.2 per dimension; only
  moves beyond that are reported as progress.
