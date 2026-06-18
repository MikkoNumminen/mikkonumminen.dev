"""Retrieval-strength guardrail — the deterministic anti-hallucination gate.

The grounded system prompt (prompts.py) already tells the model to refuse when
the context is irrelevant, but that is advisory. This adds a hard gate in front
of generation: when retrieval is empty (un-indexed DB) or every retrieved chunk
is too far in cosine distance to be relevant, the pipeline returns a clean
canned refusal WITHOUT calling the LLM — so a clearly off-topic question can
never be answered from hallucinated content.

The distance threshold is conservative (errs toward answering) because the
prompt-level guardrail handles the borderline cases; the gate exists to catch
the clearly-irrelevant tail. Tune `WEAK_RETRIEVAL_DISTANCE` against the eval
harness (evals/run_eval.py). Pure and stdlib-only, so it is unit-tested.
"""

from __future__ import annotations

from collections.abc import Sequence

from .retrieval import RetrievedChunk

# Shown verbatim (not LLM-generated) when retrieval is too weak to ground an
# answer. Matches the grounded prompt's refusal wording so the two paths read
# the same to a visitor.
WEAK_RETRIEVAL_REPLY = (
    "I don't have anything on that. Try `help` to see what I can answer "
    "about Mikko's projects."
)


def is_weak_retrieval(chunks: Sequence[RetrievedChunk], max_distance: float) -> bool:
    """True when retrieval is too weak to ground an answer.

    Weak means either no chunks at all (an un-indexed corpus) or the best
    (smallest-distance) chunk is still farther than `max_distance` — i.e. even
    the closest match is irrelevant. Cosine distance: smaller is more similar.
    """
    if not chunks:
        return True
    best = min(chunk.distance for chunk in chunks)
    return best > max_distance
