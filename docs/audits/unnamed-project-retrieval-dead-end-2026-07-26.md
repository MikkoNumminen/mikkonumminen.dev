# Unnamed-project retrieval: a dead end (2026-07-26)

Companion note to PR #425 (a visitor asked how many shapes the home particle
field cycles through (no project named), and the chat invented "8 distinct
shapes, one for each planet of the Solar System," attributing it to
Spacepotatis). The fix tried and rejected one approach before landing on the
real one; that record currently lives only in the PR #425 body, so it is
recorded here to save a future agent from re-deriving it.

## What it actually was

Not routing, and not the corpus. `RETRIEVAL_DIVERSITY_MAX_PER_PROJECT` was
**1**. That cap exists so a survey question ("tell me about the projects")
spreads across projects instead of one monopolising the answer, and it
applies whenever no project is named: on the assumption that naming no
project means wanting a survey. That assumption is wrong for a *specific*
question that merely omits the name: with `top_k=6` and the cap at 1, the
owning project got exactly one chunk and the other five slots went to the
best chunk of five unrelated projects. The model was handed one relevant
paragraph and five irrelevant ones, and filled the gap.

The golden set could not see this. It scores at file level, and file-level
hit-rate was already 100% (the right document ranked #1). The retrieved
*chunk* was the neighbour of the one holding the answer, not the answer
itself.

## Dead end

**Ranking-concentration heuristic.** Before settling for a flat cap, detect
whether a query is "specific" or "survey" from how concentrated the raw
ranking is, and only raise the cap for concentrated ones. Measured over 12
specific and 6 survey questions:

```
specific: min=0.33 mean=0.76 max=1.00
survey  : min=0.33 mean=0.69 max=1.00
```

Fully overlapping, no threshold separates them. Same shape as the
retrieval-distance threshold that already failed elsewhere in this codebase
(see [research-coverage-dead-ends-2026-07-16.md](research-coverage-dead-ends-2026-07-16.md)).
Rejected; recorded rather than retried.

## What actually fixed it

Raising `RETRIEVAL_DIVERSITY_MAX_PER_PROJECT` from 1 to 3: the measured
knee: answer-phrase presence on the 12-question unnamed-project probe went
6/12 (50%) at cap 1 to 10/12 (83%) at cap 3; cap 6 answered nothing extra.
The golden set was byte-identical at every cap value, since its questions
name their projects and named-project queries are never capped. The cost is
real and not hidden: survey breadth (distinct projects per survey query)
dropped from 4.00 to 2.75.

## Operational caveat

This changes a default, so it takes effect only on the next backend rebuild
of the WSL stack: the corpus itself needed no change.
