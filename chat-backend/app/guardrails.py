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

    The gate anchors on the best PROSE chunk: once the corpus holds source code,
    an off-topic query ("how do I lose weight", "what time is it in New York")
    can land a stray code chunk just inside the threshold and get answered
    off-corpus. Prose chunks are the human-readable description of Mikko's work,
    so they are the honest relevance signal. Falls back to all chunks only when
    no prose was retrieved, so a code-only corpus still works.
    """
    if not chunks:
        return True
    prose = [c for c in chunks if c.chunk_type == "prose"]
    best = min(c.distance for c in (prose or chunks))
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
# corpus holds source code, which lowers off-topic distances). Match a producing
# VERB, then a PRODUCING DETERMINER (a/an/some/another/one/your — deliberately NOT
# "the"/"of the"), then 0-2 adjectives, then a creative ARTEFACT. The determiner
# anchor is what keeps legitimate questions out: "the story behind ReadLog", "an
# overview of the songs feature", "a summary of the essays project" don't match
# (no producing determiner immediately before the artefact), while "a story" /
# "a joke" / "me a funny poem" do.
_GENERATIVE_RE = re.compile(
    r"\b(?:come up with|make up|write|compose|create|generate|draft|pen|recite|"
    r"sing|tell|make|give)\b\s+"
    r"(?:me\s+|us\s+)?(?:a|an|some|another|one|your)\s+"
    r"(?:\w+\s+){0,2}"
    r"(?:poems?|haikus?|limericks?|sonnets?|verses?|rhymes?|songs?|lyrics|raps?|"
    r"jokes?|riddles?|essays?|screenplays?|novels?|poetry|stor(?:y|ies)|tales?)\b",
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
