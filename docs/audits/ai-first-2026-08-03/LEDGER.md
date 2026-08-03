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
| 1-2 (docs + code) | 8.2 ▼ | 9.6 | 8.4 | 9.3 | 7.6 | 8.8 | 9.2 | 9.2 | **8.74** |

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

### Iterations 1-2 — documentation, then code (2026-08-03)

Commits `9dacfa7`, `ad9ca77`, `ce2a419`. Overall **8.12 → 8.74**. Six dimensions
up, one flat, **one down**.

| Dimension | Δ | What moved it |
| --- | ---: | --- |
| Security/ops docs | +2.4 | SECURITY.md and the threat model now describe the backend that exists; CSP agreement enforced by a test rather than asserted |
| Machine-readable | +1.6 | eval fixtures gained an enforced shape; registry schema gained value constraints the validator actually implements |
| Decision | +1.0 | ADR 0009's Poro update, ADR 0017 for the shoutbox, a complete audits index, dead-ends recorded |
| Automation | +0.8 | CodeQL concurrency, `npm run verify`, dependabot docker, doc/CI gate alignment |
| Self-verification | +0.7 | `lifecycle.ts` 0→94%, `commands.ts` 33→81%, ratchet re-anchored 34→54 against measured 56.4 |
| Type safety | +0.5 | `ragctl.py` under CI mypy with 9 real errors fixed and zero `# type: ignore`; platform pinned; 404 cast guarded |
| Legibility | +0.3 | `ragctl.py` docstring; invariant comments on the three.js assertions |
| **Onboarding** | **−0.5** | see below |

**Onboarding went down, and that is the most useful result of the round.** The
baseline panel scored it 8.7 against gaps that were mostly stale numbers. The
re-measure found something bigger that the baseline missed entirely: the
`rag-backend` skill and `docs/rag-chat.md` never mention session memory,
progressive disclosure, or Finnish language routing — three pipeline stages live
for over a month. The skill's frontmatter promises "the exact /chat pipeline
order", "every config knob with defaults" and "the `app/` file map"; all three
promises are broken. Worth 1.4 points, which swamped the 0.9 of fixes.

A score that only ever rises is measuring the fixer, not the codebase.

**An overclaim in this campaign's own work, recorded rather than quietly fixed.**
`test_doc_counts.py`'s docstring asserts that "every other mention describes the
harness structurally". That was false when written. The stale "9 cases"/"9/9"
claim also lives in `docs/rag-chat.md`, two `.claude/skills/` files, and ADRs
0010 and 0011 — five files that were not checked before the claim was made. The
guard is real; the sentence around it was not earned. The fix is to make the
guard cover what the sentence claims, not to soften the sentence.

**Cross-confirmed, still open:** branch protection was independently re-verified
by four assessors this round (automation, self-verification, types, and again
via `gh api .../rulesets` returning `[]`). It alone accounts for 1.4 of
automation's 2.4-point deficit — that dimension **cannot** reach the 9.3 floor
without it, and it cannot be changed from inside a pull request.

### Iteration 3 — the rest of the queue (2026-08-03)

Commits `1ae9255`, `505df8b`, `93bb433`, plus the e2e spec. Not yet re-measured
at time of writing.

**Deliberately NOT done, with reasons**, so a later reader does not mistake
these for oversights:

| Gap | Points | Why not |
| --- | ---: | --- |
| Split `ragctl.py` into modules | 0.2 (legibility) | Refactors live operational code — watchdog, funnel control, shoutbox moderation — for points on a dimension already at 9.6, above the 9.3 floor. The bundle is labelled and its co-location is explicitly justified in the file. |
| Extract GSAP timeline logic into tested helpers | 0.3 (verification) | **Reason corrected after review.** This first read "not needed once the e2e work lands" — which does not survive inspection, because the e2e work that landed types terminal commands and never scrolls or touches GSAP. The honest reason is narrower: `homeTimeline.ts` and `experienceTimeline.ts` are ~1000 lines of working scroll-driven animation, and extracting their interpolation math means touching code whose failure mode is *visual* and therefore invisible to the unit tests that would replace the risk. That is a real trade, not a free win, and it is the kind of change to make deliberately rather than inside a scoring campaign. The gap is genuine and stays open. |
| Enable `checkJs` over `scripts/*.mjs` | 0.5 (types) | Measured at **339 errors**. ~260 are mechanical missing-parameter types, but the rest need real shape decisions (interfaces for the receipt/skill JSON) and null-guards through non-trivial control flow. Doing it properly is a multi-PR effort; doing it quickly would mean `any`/`@ts-expect-error` suppressions, trading a real repo-wide property for a nominal flag. Scoped as future work. |

**Known limitation in the new e2e coverage.** `e2e/interaction.spec.ts` covers
terminal command entry in CI, but its two shoutbox submit tests **skip** there:
`PUBLIC_CHAT_API_URL` is a build-time variable that CI leaves unset, so
`getChatBaseUrl()` compiles to `null` and the write form never renders. They
skip with an explicit reason rather than passing vacuously, and were verified
for real against a local build with the variable set. Closing this properly
means giving the e2e job a build with the variable set — which would also make
the existing scene smoke tests probe `/health` and needs its own route stub, so
it is a change to make deliberately rather than as a footnote here.

**One defect found and fixed while measuring, not while looking for it.** Two
JSDoc blocks in `scripts/lib/chrome-pdf.mjs` were stacked with a `const`
between the parameter docs and the function, so the docs attached to nothing:
no editor signature help, and type tooling read the optional `chromePath` as
required. The code was always correct; only the documentation was misplaced.

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
