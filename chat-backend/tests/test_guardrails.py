"""Tests for the retrieval-strength guardrail."""

from __future__ import annotations

from app.guardrails import (
    GENERATIVE_REPLY,
    WEAK_RETRIEVAL_REPLY,
    is_generative_request,
    is_weak_retrieval,
)
from app.retrieval import RetrievedChunk


def _chunk(distance: float, chunk_type: str = "prose") -> RetrievedChunk:
    return RetrievedChunk(
        source="projects/hrm.md",
        title="HRM",
        project="hrm",
        content="x",
        distance=distance,
        chunk_type=chunk_type,
    )


def test_empty_retrieval_is_weak() -> None:
    assert is_weak_retrieval([], max_distance=0.7) is True


def test_close_chunk_is_not_weak() -> None:
    assert is_weak_retrieval([_chunk(0.2)], max_distance=0.7) is False


def test_all_far_chunks_is_weak() -> None:
    assert is_weak_retrieval([_chunk(0.8), _chunk(0.9)], max_distance=0.7) is True


def test_best_chunk_decides() -> None:
    # One close chunk among far ones is enough to NOT be weak.
    assert is_weak_retrieval([_chunk(0.9), _chunk(0.3)], max_distance=0.7) is False


def test_boundary_is_inclusive_of_relevant() -> None:
    # Exactly at the threshold is treated as relevant (only strictly beyond is weak).
    assert is_weak_retrieval([_chunk(0.7)], max_distance=0.7) is False


def test_gate_anchors_on_prose_not_a_near_code_chunk() -> None:
    # An off-topic query can land a near CODE chunk (0.3) while the prose is far
    # (0.8). At threshold 0.45 the gate must still refuse — it keys on the prose
    # distance (the honest relevance signal), not the stray code chunk.
    chunks = [_chunk(0.3, chunk_type="code"), _chunk(0.8, chunk_type="prose")]
    assert is_weak_retrieval(chunks, max_distance=0.45) is True


def test_gate_falls_back_to_all_chunks_when_no_prose() -> None:
    # A code-only retrieval (no prose at all) still works: the gate uses every
    # chunk, so a close code chunk keeps the query answerable.
    assert is_weak_retrieval([_chunk(0.3, chunk_type="code")], max_distance=0.45) is False


def test_refusal_reply_is_nonempty_and_points_to_help() -> None:
    assert WEAK_RETRIEVAL_REPLY
    assert "help" in WEAK_RETRIEVAL_REPLY


def test_generative_requests_are_declined() -> None:
    # Creative/generic writing asks — declined on the QUERY pattern, even when
    # they name an on-corpus topic the retrieval gate would let through.
    for q in (
        "write me a poem about Helsinki",
        "Write a poem about cats",
        "compose a song about ReadLog",
        "give me a joke",
        "can you make a haiku about Finland",
        "generate a short story set in space",
        "draft an essay on TTS",
        "write me a rap about audiobooks",
    ):
        assert is_generative_request(q) is True, q


def test_real_questions_are_not_generative() -> None:
    # Legitimate questions that share words with the gate must NOT trip it.
    for q in (
        "how does the Finnish text normalizer work?",
        "what's the story behind ReadLog?",
        "write a test for the chunker",  # 'test' is not a creative artefact
        "how do I create a new project?",
        "what song-playback library does strudel use?",
        "generate the build script — how is it set up?",
        "tell me about AudiobookMaker",
    ):
        assert is_generative_request(q) is False, q


def test_generative_reply_is_nonempty() -> None:
    assert GENERATIVE_REPLY
