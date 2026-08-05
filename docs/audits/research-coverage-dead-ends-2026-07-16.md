# Research-coverage precision: dead ends (2026-07-16)

Companion note to PRs #369–#372 (deterministic research-coverage: the RAG chat
guarantees the newest research post reaches the model and gets named in the
answer). The precision fix in #372 tried and rejected three approaches before
finding the real bug; that history currently lives only in the PR #372 commit
body, so it is recorded here to save a future agent from re-trying them.

**The bug:** asked for "latest research on quantum computing" (off-corpus), the
model fabricated a bridge, claiming a portfolio post "mentions AI-native
development including quantum computing." It does not.

## Dead ends

1. **Distance threshold.** Leaning on the existing weak-retrieval gate (chunks
   past a cosine-distance cutoff get refused) to catch the off-corpus case.
   Rejected: the coverage layer force-injects the newest research chunks
   regardless of distance, and those chunks are prose: measured at 0.4466,
   inside the 0.45 gate. Injection can only move the gate *toward* answering,
   never away from it, so distance cannot discriminate a genuine sweep from an
   off-corpus one here.

2. **Framing-vocabulary whitelist.** Enumerate the words ("key", "interesting",
   "shown", etc.) that signal a genuine research question and gate on their
   presence. Rejected: framing vocabulary in English is unbounded, the list
   vetoed 13 of 15 genuine sweeps (false negatives) while still letting
   "latest research on love" through (a false positive), because "love"
   happened to be on the list.

3. **Preposition adjacency.** Narrow the subject check to the noun immediately
   after the preposition ("research on X"). Rejected: it fixed the strict
   adjacency cases but broke on strand constructions like "what research have
   you been working ON lately," where the adverbial tail sits away from the
   preposition: the fix traded one class of false negative for another.

## What actually fixed it

Both the fabrication and the model's earlier "I don't have information"
non-answer trace to the same root cause, and it was **ours, not the model's**:
`doc_date` was parsed and stored but dropped at the prompt boundary:
`format_context` rendered title and source only, so a "what's newest" question
was put to a model holding no dates at all. This had been read, before the fix
landed, as Poro "synthesis infidelity" (the model failing to use context it
had). It wasn't: the context never carried the date. Plumbing `doc_date`
through the retrieval selects, `RetrievedChunk`, and `ContextChunk`, and
asserting `max(doc_date)` outright in the coverage layer, closed both.

Precision on the off-corpus case came from a closed, already-maintained
lexicon instead: the subject after a research noun is only treated as
off-corpus if it fails to match `detect_projects`, no free-text vocabulary
list, no distance heuristic.

## Operational caveat

Poro runs at temperature 0.4. A single generation is a sample, not a proof:
the PR's own verification ran genuine and off-corpus batteries (49/49, 24/24)
rather than trusting one output. Don't treat one good or one bad answer from
this pipeline as evidence of a fix or a regression.
