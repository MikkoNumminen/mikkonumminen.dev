"""Two defects found by reading the live request log on 2026-08-01.

1. Generation hitting LLM_NUM_PREDICT was indistinguishable from generation
   finishing: 169 of 2547 answered requests ended at exactly the cap, and a
   visitor saw three in a row stop mid-word.
2. A request for a Finnish answer written in English was answered in English,
   twice in a row, because routing asked whether the query WAS Finnish rather
   than whether it ASKED for Finnish.

The strings quoted here are the visitor's real messages from that session.
"""

from __future__ import annotations

import pytest

from app.guardrails import (
    is_translation_request,
    looks_finnish,
    requests_finnish_answer,
    truncation_notice,
)
from app.llm import parse_finish_reason


class TestParseFinishReason:
    def test_reads_length(self) -> None:
        line = 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}'
        assert parse_finish_reason(line) == "length"

    def test_reads_stop(self) -> None:
        line = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}'
        assert parse_finish_reason(line) == "stop"

    @pytest.mark.parametrize(
        "line",
        [
            "data: [DONE]",
            "",
            ": keep-alive",
            'data: {"choices":[{"delta":{"content":"hello"}}]}',  # a token chunk
            'data: {"choices":[{"delta":{},"finish_reason":null}]}',
            "data: not json",
            'data: {"choices":[]}',
            'data: {"choices":["not a dict"]}',
        ],
    )
    def test_no_reason_is_none(self, line: str) -> None:
        # Must never raise on a malformed or content-only chunk: this runs
        # inside an in-flight stream.
        assert parse_finish_reason(line) is None


class TestTruncationNotice:
    def test_length_is_reported(self) -> None:
        assert truncation_notice("length", finnish=False) is not None

    def test_finnish_notice_when_answering_finnish(self) -> None:
        fi = truncation_notice("length", finnish=True)
        en = truncation_notice("length", finnish=False)
        assert fi is not None and en is not None and fi != en

    @pytest.mark.parametrize("reason", ["stop", None, "", "content_filter"])
    def test_a_finished_answer_is_never_marked_truncated(
        self, reason: str | None
    ) -> None:
        # A false "I was cut off" on a complete answer is worse than the silence
        # this replaces, so only "length" counts.
        assert truncation_notice(reason, finnish=False) is None
        assert truncation_notice(reason, finnish=True) is None


class TestRequestsFinnishAnswer:
    """Every case here came from adversarially testing the first attempt, which
    was one anchored regex. It failed all four SERIOUS ways below."""

    @pytest.mark.parametrize(
        "query",
        [
            # The two the visitor actually sent, including the missing space.
            "Can you tellme about the site in finnish?",
            "But in finnish?",
            "Can you tell me about the site in Finnish?",
            "answer in finnish",
            "Please explain the RAG setup in Finnish.",
            "in finnish please",
            "And in Finnish?",
            "Sama suomeksi?",
            "vastaa suomeksi",
            # Topic first, language second, as its own sentence. The single most
            # natural phrasing, and the first attempt missed all of these.
            "Tell me about HRM. In Finnish.",
            "Tell me about HRM in Finnish. Thanks.",
            "What tech stack does HRM use? Also, in Finnish please.",
            "Tell me about HRM.\nIn Finnish.",
            # Trailing politeness, punctuation and emoji.
            "in Finnish, please",
            "Answer in Finnish, if you can",
            "Could you answer in Finnish this time?",
            "answer me in Finnish!",
            "Answer in Finnish 🙂",
            # Terse forms.
            "same in finnish",
            "can you do that in finnish",
        ],
    )
    def test_asks_for_finnish(self, query: str) -> None:
        assert requests_finnish_answer(query) is True

    @pytest.mark.parametrize(
        "query",
        [
            # NEGATION. The first attempt answered these in Finnish, which is
            # the single most visible way to misbehave: doing the one thing the
            # message says not to do.
            "Don't answer in Finnish",
            "Please don't reply in Finnish",
            "I don't want the answer in Finnish",
            "No need to answer in Finnish",
            # A QUESTION ABOUT BEHAVIOUR is not a request. The subject is the
            # system, not the assistant.
            "Does the RAG answer in Finnish?",
            "Is the site available in finnish?",
            "Which blog posts are available in Finnish?",
            "Is the blind study write-up published in Finnish?",
            # Questions ABOUT Finnish content.
            "Do you have Finnish translations?",
            "Tell me about the Finnish blind study",
            "Compare the English and Finnish versions",
            "How good is the Finnish translation?",
            # The word merely MENTIONED. This site's own language switcher is
            # labelled "Suomeksi", so a visitor asking about the nav trips a
            # bare substring test.
            "What does suomeksi mean?",
            "The button says Suomeksi",
            "Why does the language switcher say Suomeksi instead of Finnish?",
            # "in Finnish" modifying a noun mid-sentence.
            "Tell me about the tests in Finnish translations and how they run",
            # Translation trivia asks for one word, not a change of language.
            "How do you write thank you in Finnish?",
            "",
            "   ",
            "Tell me about the site",
        ],
    )
    def test_does_not_fire(self, query: str) -> None:
        assert requests_finnish_answer(query) is False

    def test_finnish_queries_still_route_by_language(self) -> None:
        # The original path is untouched: a Finnish question is Finnish whether
        # or not it contains an explicit request.
        assert looks_finnish("Kerro HRM-projektista ja sen testeistä tarkemmin")


class TestTranslationGateStillDeclines:
    """The widened language routing must not become a way to reach the
    translator that the task gate exists to refuse. The gate runs before
    retrieval, so these are declined regardless of what routing decides."""

    @pytest.mark.parametrize(
        "query",
        [
            "translate this paragraph to finnish",
            "how do you say cat in finnish",
            "say hello in finnish",
        ],
    )
    def test_translation_requests_are_still_caught(self, query: str) -> None:
        assert is_translation_request(query) is True
