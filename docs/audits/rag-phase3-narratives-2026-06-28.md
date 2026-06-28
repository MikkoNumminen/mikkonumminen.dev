# RAG chat — Phase 3: precomputed per-project development narratives (2026-06-28)

Live top-k retrieval structurally cannot assemble a whole development arc from
scattered chunks — Phase 0 measured exactly this (deep "how did you build X"
questions retrieved *a* relevant source but not the whole multi-source set). Phase
3 precomputes the arc once, offline, and indexes it as a single high-signal
document per project, typed `narrative` so Phase 5 can expand into it.

## What changed

- **9 grounded development narratives** (`content/narratives/<project>.md`), one
  per project, typed `doc_type='narrative'`. Each has: Origin · Key technical
  choices and the why · Dead ends and how they resolved · Notable implementation
  details · Outcome.
- No app code — Phase 1's loader already maps a `type:` front-matter field to
  `doc_type`, so narratives index as `narrative` with no change.
- **5 "how did you build X" eval questions** added (53 → 58).

## How they were generated (build-time, not query-time)

A workflow of 18 agents: per project, a generator read the **actual git history**
of the sibling repo (`git log`, commit messages, dates) plus the corpus docs and
ADRs, and synthesised the arc; an adversarial verifier re-ran the git log and
re-read the docs, **removing any claim it could not trace to a commit or doc**
(model improvisation is the failure mode — a small model later reads this as
fact). All 9 returned `grounding_ok=true` (ReadLog's verifier cut 7 claims; the
portfolio narrative was additionally spot-checked by hand against this repo:
origin date, the ADRs, the CLS-1.0 fix, the DPR-cap regression, the registry
auto-sync bug, Lighthouse 96–99 — all confirmed).

## Result (live, hybrid; 58-question set)

| Metric | Before (no narratives) | After | Δ |
| --- | --- | --- | --- |
| **Source coverage** | 0.762 | **0.857** | **+0.095** |
| Retrieval hit-rate (strict, all sources) | 0.595 | 0.643 | +0.048 |
| MRR | 0.576 | 0.581 | +0.005 |

- **Coverage rose +0.095 with no coverage regression** — every question still
  surfaces a relevant source. This is the fair headline: the narratives add a
  high-signal source without starving any question.
- **4 of the 5 arc questions** (AudiobookMaker, HRM, Spacepotatis, ReadLog) go
  corpus-miss → PASS. The live chat now retrieves the narrative for "how did you
  build AudiobookMaker" and answers with the origin, the engine-registry choice,
  the Chatterbox venv isolation, and dead-ends — a development arc, not the flat
  feature list Phase 0 recorded.
- **Two multi-source deep questions** (Platform shared-DB, ReadLog Neon adapter)
  show a *strict*-hit dip: a narrative chunk displaced one of their several
  expected sources. Coverage held for both and the narrative carries the same
  information, so the answer is not degraded — this is the Phase-0
  multi-source-scoring tension, not a content regression.
- **The portfolio narrative** is crowded out of top-6 by its unusually rich
  ADR + design-doc corpus (it is the one project already over-covered, so the
  narrative is most redundant there). Phase 5 targets narratives by
  `doc_type='narrative'` for the "tell me more" expansion, which surfaces them
  directly rather than via open top-k competition.

## Acceptance

- Each project has a generated narrative ✓
- Claims trace to real git/PR/doc sources (adversarially verified + spot-checked) ✓
- Deep "how did you build X" questions return a factual, structured arc and improve
  vs baseline (coverage +0.095; 4/5 arc questions PASS; live arc answer is grounded
  and development-arc-shaped) ✓

Stacked on Phase 2b.
