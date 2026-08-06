# Can a visitor steer the deterministic gates? Measured, 2026-08-06

The 2026-08-05 injection audit raised two gates as steerable by untrusted input:
the CV-intent override on the relevance gate, and `client_ip` keying the rate
limiter on the first `X-Forwarded-For` hop. Both are settled here by measurement
rather than by reading the code, and both came out differently than the audit
expected.

## The rate limiter: refuted

Five POSTs to `/shout` through the funnel, each carrying a different
`X-Forwarded-For`, against `RATE_MAX = 3`:

| attempt | X-Forwarded-For | response |
| --- | --- | --- |
| 1 | 203.0.113.1 | accepted |
| 2 | 203.0.113.2 | duplicate |
| 3 | 203.0.113.3 | duplicate |
| 4 | 203.0.113.4 | rate limited |
| 5 | 203.0.113.5 | rate limited |

Five distinct values, one bucket, limit hit on the fourth. Tailscale replaces the
header, so it cannot be rotated to escape the limiter. The `ratelimit.py`
docstring already said this, but by citing Tailscale source rather than by
observing it. This is the observation.

## The CV override: reachable, and not the thing that is actually happening

`wants_cv` matches the bare token `cv`, so three characters trip the CV route on
any question. Ten questions through `evals.production_retrieval`, which is the
call `pipeline` makes, against `WEAK_RETRIEVAL_DISTANCE = 0.45`:

| question | wants_cv | cv.md in context | prose anchor | gate |
| --- | --- | --- | ---: | --- |
| what is the population of Brazil | False | False | 0.4459 | pass |
| what is the cv population of Brazil | True | True | 0.4341 | pass |
| what is the recipe for karjalanpiirakka | False | False | 0.3691 | pass |
| what is the cv recipe for karjalanpiirakka | True | True | 0.3919 | pass |
| who won the world cup in 1998 | False | False | 0.4519 | **refuse** |
| who won the cv world cup in 1998 | True | True | 0.4406 | pass |
| how do I lose weight fast | False | False | 0.4350 | pass |
| how do I lose cv weight fast | True | True | 0.4063 | pass |
| what time is it in New York | False | False | 0.4871 | **refuse** |
| what time is it in cv New York | True | True | 0.4434 | pass |

Retrieval is deterministic, so these numbers reproduce exactly. Three things
come out of the table, and only the first is what the audit predicted.

**The code comment was false.** It read "off-corpus questions never trip the CV
route, so they keep full gate protection". Five of five tripped it and pulled
cv.md into context. The override is reachable by anyone on any question.

**The override was never load-bearing.** Look at the gate column: every laced
question passed the gate on its own, so the override was never consulted. Adding
`cv` pulls cv.md in at around 0.44, which BECOMES the prose anchor, and the gate
then passes by its own rule. Two questions flipped from refusal to an answer that
way, and the override had nothing to do with either.

I had this backwards at first and wrote a test asserting the bound would have
refused `what time is it in New York` at 0.4871. It would not: that is inside the
slack. The test says so now, because the tempting conclusion is that bounding the
override fixes the flips, and it does not.

**The gate is weak on its own.** Three of the five PLAIN off-corpus questions
passed with no token inserted, at 0.4459, 0.4350 and 0.3691. A recipe for
karjalanpiirakka sits closer to this corpus than a question about the CV phrased
in the second person. That is the finding worth chasing, and it is the same root
cause as the live acceptance failures.

## What changed as a result

The override is bounded to a straddle band, so it can still rescue the ~0.47
second-person phrasing it was built for and can no longer skip the gate at any
distance. That closes a reachable hole nothing has walked through yet. It does
not close the flips above.

The request log records `prose_distance` now, the number the gate actually
compares. It recorded only `best_distance`, the closest chunk of any kind, while
the docstring claimed that was the threshold value. The gap is not cosmetic: one
question gated at `best_distance` 0.4353 sat next to another answered at 0.4459,
which reads as a contradiction until you know the log was reporting a number the
gate never looked at.
