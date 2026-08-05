# AI-First Rating: mikkonumminen.dev

**2026-08-03 · Overall: 9.09/10**, whole-repo scope, 8 weighted dimensions,
measured across three iterations. Supersedes
[`ai-first-rating-2026-06-14.md`](ai-first-rating-2026-06-14.md) (9.12,
frontend-only).

**The stated target was not met.** The campaign aimed for ≥9.5 overall with
every dimension ≥9.3. It reached 9.09, with four dimensions below the floor.
What that shortfall consists of is in [Remaining gaps](#remaining-gaps).

## Read this first: 9.09 is not worse than June's 9.12

The June measurement covered `src/`, `docs/` and CI. This one covers those plus
`chat-backend/`: a FastAPI + Postgres service with a local LLM and a public
write endpoint that did not exist in the earlier reading, as well as
`.claude/skills/`, `content/`, and `scripts/`. Roughly half of what is measured
here was invisible to the previous number.

The two figures are not comparable and should not be quoted as a trend. The
weights are unchanged specifically so the per-dimension *shape* stays legible
across the scope change.

## Progression

| Iteration | Onboard 18% | Legible 18% | Verify 16% | Decide 12% | Auto 12% | Types 10% | Machine 7% | Sec 7% | **Overall** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0, baseline | 8.7 | 9.3 | 7.7 | 8.3 | 6.8 | 8.3 | 7.6 | 6.8 | **8.12** |
| 1–2, docs, then code | 8.2 ▼ | 9.6 | 8.4 | 9.3 | 7.6 | 8.8 | 9.2 | 9.2 | **8.74** |
| 3, final | 9.3 | 9.4 | 8.9 | 9.4 | 8.3 | 8.9 | 9.0 | 9.4 | **9.09** |

Overall is `sum(weight × score)`, computed from the per-dimension numbers, never
estimated holistically.

## Method

Eight assessors, one per weighted dimension, read-only, each required to open the
real file and cite `path:line` before a gap could cost points. Instrument frozen
in [`ai-first-2026-08-03/RUBRIC.md`](ai-first-2026-08-03/RUBRIC.md) before any fix
landed. Raw returns and every disproved suspicion are in
[`00-baseline-raw.md`](ai-first-2026-08-03/00-baseline-raw.md); the iteration log
is [`LEDGER.md`](ai-first-2026-08-03/LEDGER.md).

**This is self-grading with a paper trail, not an independent benchmark.** The
assessors are the same model family as the author of the fixes. A 9.09 here means
"no verified gap survives inspection against these eight definitions", not
"objectively better than a repo scoring 8.9". Later rounds were told to attack
the campaign's own work: to hunt for comment padding, to prove a drift guard
could actually fail, to check whether required-check names were real. That
catches more than a friendly panel would; it does not make the instrument
independent.

## What the campaign actually found

The rating is the least interesting output. Four defects surfaced that no gate
was catching, none of which were the thing being looked for:

1. **`chat-backend/.env.example` shipped the bug PR #425 fixed.** It set
   `RETRIEVAL_DIVERSITY_MAX_PER_PROJECT=1` with a comment arguing for 1, months
   after the default moved to 3 because a cap of 1 starves the one project that
   can answer a question omitting its name. Invisible to the golden set:
   file-level hit-rate stays 100% while the retrieved text goes thin.
2. **A live high-severity dependency advisory.** `postcss` path traversal, fix
   available. The security docs described `esbuild` advisories that had stopped
   applying and missed this one entirely: drift in both directions, because
   nothing runs `npm audit` in CI.
3. **A guessable session id keying server-side conversation memory.** The
   fallback path used `Math.random()`; that id is what the backend threads
   conversation state on, so predicting one lets a third party read or poison
   another visitor's context. Found by CodeQL: within minutes of CodeQL being
   repaired.
4. **An accessibility trap in the projects drawer.** `close()`'s fall-back focus
   path is dead (`document.body.focus()` is a no-op without `tabindex`), so when
   the opening element has been removed, focus stays on a control that has just
   been marked `aria-hidden`. Documented in a test, deliberately not fixed:
   the correct behaviour is a product decision.

## Two defects this campaign itself introduced

Recorded because a quality report that hides its own failures is the exact
document this rubric exists to prevent.

- **CodeQL produced zero check-runs for three commits.** A language matrix was
  added with its `concurrency` block at workflow level, referencing
  `${{ matrix.language }}`: a context that only exists inside a job. The file
  stopped parsing; GitHub reports that as a run with zero jobs and no syntax
  error. It was validated locally with `yaml.safe_load`, which passed. Parsing
  was never the question. **Near-miss:** `ci.yml` had just been given a comment
  telling the owner to mark those two contexts as required: doing so while they
  were silent would have deadlocked every PR.
- **A red `check` job shipped.** A Playwright option that type-checks as unknown
  (`reducedMotion` at test level rather than in `contextOptions`) failed
  `npm run typecheck`. It was missed because the verification command was piped
  through `tail -3`, which prints the warning and hint counts and cuts off the
  error count directly above them.

Both were caught by asking GitHub what happened rather than trusting local
output. The general lesson is in the ledger: **the verification and the risk have
to be the same thing.** A local parser is not GitHub's validator; a truncated log
is not a passing gate.

## Remaining gaps

The distance from 9.09 to the 9.5 target, largest first:

> **Resolved after measurement (2026-08-04):** branch protection now requires
> all five contexts (`check`, `chat-backend`, `Scene smoke (Playwright)`,
> `Analyze (javascript-typescript)`, `Analyze (python)`) with `enforce_admins`
> on. The scores below were taken while it was still open, so they do NOT
> include its ~0.27; the next measurement should. Left in the table because a
> rating doc that quietly absorbs a post-hoc fix stops being a record of what
> was measured.

| Gap | Dimensions affected | Weighted cost |
| --- | --- | ---: |
| ~~Branch protection requires only `chat-backend`~~ (resolved 2026-08-04) | Automation, verification, types | ~0.27 |
| No gate detects a workflow that silently stops running | Verification | ~0.06 |
| Shoutbox write-path e2e skips in CI (`PUBLIC_CHAT_API_URL` unset at build) | Verification | ~0.03 |
| `checkJs` off over `scripts/*.mjs` (measured: 339 errors) | Types | ~0.05 |
| ~1000 lines of GSAP timeline math untested | Verification | ~0.02 |
| Calibration/usage verdict inputs unvalidated | Machine-readable | ~0.02 |

**Branch protection was the single largest item and could not be changed from a
pull request.** It was applied on 2026-08-04, after this measurement: all five
contexts are now required with `enforce_admins` on, so a red run blocks the merge
for everyone including the owner. The precondition matters and was met first:
every context was confirmed reporting green before being required, because a
required context that never reports blocks every PR permanently, which is not
hypothetical here given the CodeQL outage above.

**Deliberately not done**, with reasons, so these are not mistaken for oversights:
splitting `ragctl.py` (refactors live operational code for points on a dimension
already above target); extracting the GSAP math (touching working animation whose
failure mode is visual and therefore invisible to the tests that would replace
the risk); enabling `checkJs` (339 errors, ~80 needing real shape decisions:
clearing it quickly would mean suppressions the repo currently has none of).

## Caveats

- ±~0.2 single-assessor variance per dimension. A 0.1 move between rounds is
  noise; only moves beyond ~0.2 are reported as progress.
- Three dimensions were re-measured after their own fixes landed, because their
  first reading measured a state that no longer existed. Type safety corrected
  itself 8.5 → 8.9 on exactly that basis and said so.
- Onboarding **dropped** 8.7 → 8.2 in the middle round. That is the most useful
  single result in the campaign: the baseline had scored it against stale numbers
  and missed that the `rag-backend` skill omitted three pipeline stages live for
  over a month. A score that only ever rises is measuring the fixer, not the
  codebase.
