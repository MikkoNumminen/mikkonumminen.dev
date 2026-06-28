"""Tests for the retrieval-strength guardrail."""

from __future__ import annotations

import pytest

from app.guardrails import (
    EXPANSION_OFFER,
    GENERATIVE_REPLY,
    WEAK_RETRIEVAL_REPLY,
    is_expansion_request,
    is_generative_request,
    is_translation_request,
    is_weak_retrieval,
    looks_non_english,
    smalltalk_route,
)
from app.retrieval import RetrievedChunk


@pytest.mark.parametrize(
    "query",
    [
        "hi",
        "Hello!",
        "hey there",
        "moi",
        "Good Morning",
        "huomenta",
        "what can you do",
        "kuka olet",
        "help",
    ],
)
def test_smalltalk_route_greeting(query: str) -> None:
    assert smalltalk_route(query) == "greeting"


@pytest.mark.parametrize("query", ["thanks", "Thanks!", "thank you", "kiitos", "cheers"])
def test_smalltalk_route_courtesy(query: str) -> None:
    assert smalltalk_route(query) == "courtesy"


@pytest.mark.parametrize(
    "query",
    [
        "what is HRM",
        "hi, how does your retrieval work",  # opens with a greeting, real question
        "thanks, but how do I run the indexer",  # opens with thanks, real question
        "tell me about hrm",
        "moikka, mitä kuuluu projekteille",  # FI greeting + real question
    ],
)
def test_smalltalk_route_none_for_real_questions(query: str) -> None:
    assert smalltalk_route(query) is None


@pytest.mark.parametrize("query", ["kerro lisää", "entä muut projektit", "berätta mer"])
def test_looks_non_english_true_for_finnish_swedish(query: str) -> None:
    assert looks_non_english(query)


@pytest.mark.parametrize(
    "query", ["tell me more", "what is HRM?", "how does ReadLog .NET work"]
)
def test_looks_non_english_false_for_ascii_english(query: str) -> None:
    assert not looks_non_english(query)


@pytest.mark.parametrize(
    "query",
    [
        "yes",
        "yes please",
        "tell me more",
        "more",
        "go deeper",
        "go on",
        "go ahead",
        "keep going",
        "deeper",
        "the rest",
        "continue",
        "elaborate",
        "Tell me more.",
        "and?",
    ],
)
def test_is_expansion_request_matches_topic_less_followups(query: str) -> None:
    assert is_expansion_request(query)


@pytest.mark.parametrize(
    "query",
    [
        "tell me more about HRM",  # carries a NEW topic -> a normal question
        "what is HRM",
        "how does the Finnish normalizer work",
        "more tests in HRM",
        "explain the SERIALIZABLE transaction",
    ],
)
def test_is_expansion_request_ignores_topic_bearing_questions(query: str) -> None:
    assert not is_expansion_request(query)


def test_expansion_offer_is_a_nonempty_string() -> None:
    assert isinstance(EXPANSION_OFFER, str) and EXPANSION_OFFER.strip()


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
        # verbs the first cut missed
        "pen a poem",
        "tell me a joke",
        "sing me a song",
        "come up with a haiku",
        "make up a story",
        "recite a limerick",
        # adjectives between the determiner and the artefact
        "write me a funny poem",
        # VERB-LESS artefact requests (live: a real haiku was written)
        "a haiku about ReadLog please",
        "I want a poem about X",
        "can I get a poem about Mikko's work",
        "I'd like a limerick",
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
        # artefact words NOT anchored to a producing determiner (was a false decline)
        "give me an overview of the songs feature",
        "give a summary of the essays project",
        "how would you describe Spacepotatis",
        "tell me about the songs feature",
        # leading determiner + topic noun (NOT an artefact) — verb-less guard
        "a question about the songs feature",
        "an overview of the audio bus",
        "how does the normalizer work",
    ):
        assert is_generative_request(q) is False, q


def test_generative_reply_is_nonempty() -> None:
    assert GENERATIVE_REPLY


def test_translation_tasks_are_declined() -> None:
    # Translating text into a named language is a task, not a question — and the
    # portfolio's own i18n keeps a prose chunk close enough to defeat the gate.
    for q in (
        "translate hello to spanish",
        "Translate this to Finnish",
        "please translate good morning into french",
        "can you translate the readme to german",
        # paraphrases the leading-"translate" form missed (live leaks)
        "say good morning in finnish",
        "spanish word for hello",
        "how do you say hello in spanish",
        "french phrase for thank you",
        "how to say thanks in german",
    ):
        assert is_translation_request(q) is True, q


def test_translation_questions_are_not_declined() -> None:
    # Genuine questions about the portfolio's i18n must still answer.
    for q in (
        "how does the site translate to Finnish?",
        "what languages does the portfolio support",
        "does ReadLog translate book titles",
        "how is the translation pipeline built",
        # the reviewer's over-gating guards (bare "what is X in LANG" not added)
        "is the portfolio available in finnish",
        "what is the project in finnish locale about",
    ):
        assert is_translation_request(q) is False, q
