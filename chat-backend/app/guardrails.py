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

import re
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


# Out-of-scope reply for requests to WRITE creative/generic content. Distinct
# from WEAK_RETRIEVAL_REPLY because these are declined on the QUERY pattern, not
# on retrieval strength.
GENERATIVE_REPLY = (
    "I only answer questions about Mikko's projects and work — I don't write "
    "poems, stories, or other content like that."
)

# A request like "write me a poem about Helsinki" names an on-corpus topic, so it
# retrieves real content and slips past is_weak_retrieval; and a small local model
# does not reliably refuse it from the system prompt alone (especially once the
# corpus holds source code, which lowers off-topic distances). Match an imperative
# verb followed (within one clause) by an unambiguously creative artefact, so
# legitimate questions — "how does X work", "the story behind ReadLog", "write a
# test for Y" — don't trip it.
_GENERATIVE_RE = re.compile(
    r"\b(write|compose|create|generate|draft|make|give)\b[^.?!]{0,30}?\b"
    r"(poems?|haikus?|limericks?|sonnets?|verses?|rhymes?|songs?|lyrics|raps?|"
    r"jokes?|riddles?|essays?|screenplays?|novels?|short stor(?:y|ies))\b",
    re.IGNORECASE,
)


def is_generative_request(query: str) -> bool:
    """True when the message asks the assistant to WRITE creative/generic content
    (a poem, story, song, joke, ...) instead of asking about Mikko's work.

    A deterministic query-pattern gate ahead of retrieval/generation: such
    requests can name an on-corpus topic (so the retrieval gate misses them) and
    a small LLM won't reliably refuse them from the system prompt alone.
    """
    return bool(_GENERATIVE_RE.search(query))
