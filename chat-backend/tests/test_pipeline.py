"""Tests for the /chat event-stream orchestration (all deps faked)."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Any

from app.guardrails import WEAK_RETRIEVAL_REPLY
from app.pipeline import LLM_BUSY_REPLY, chat_event_stream


class FakeEmbedder:
    def embed_query(self, text: str) -> list[float]:
        return [0.0]


class FakeDB:
    def __init__(self, rows: list[dict[str, Any]], fail: bool = False) -> None:
        self._rows = rows
        self._fail = fail

    async def search(
        self, embedding: list[float], top_k: int
    ) -> Sequence[Mapping[str, Any]]:
        if self._fail:
            raise RuntimeError("db down")
        return self._rows[:top_k]


class FakeLLM:
    def __init__(self, tokens: list[str], fail: bool = False) -> None:
        self._tokens = tokens
        self._fail = fail
        self.called = False

    async def stream_chat(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]:
        self.called = True
        if self._fail:
            raise RuntimeError("llm down")
        for token in self._tokens:
            yield token


def _row(source: str, distance: float = 0.1) -> dict[str, Any]:
    return {
        "source": source,
        "title": source.upper(),
        "project": None,
        "content": f"about {source}",
        "distance": distance,
    }


def _collect(
    query: str,
    *,
    db: FakeDB,
    llm: FakeLLM,
    top_k: int = 5,
    weak_distance: float = 0.7,
) -> list[str]:
    async def run() -> list[str]:
        gen = chat_event_stream(
            query,
            [],
            embedder=FakeEmbedder(),
            db=db,
            llm=llm,
            top_k=top_k,
            weak_retrieval_distance=weak_distance,
        )
        return [frame async for frame in gen]

    return asyncio.run(run())


def _events(frames: list[str]) -> list[str]:
    return [f.split("\n", 1)[0].removeprefix("event: ") for f in frames]


def _token_text(frames: list[str]) -> str:
    return "".join(
        json.loads(f.split("data: ", 1)[1])["text"]
        for f in frames
        if f.startswith("event: token")
    )


def test_happy_path_sources_then_tokens_then_done() -> None:
    llm = FakeLLM(["HRM ", "is great."])
    frames = _collect("what is hrm", db=FakeDB([_row("projects/hrm.md")]), llm=llm)
    assert _events(frames) == ["sources", "token", "token", "done"]
    sources_data = json.loads(frames[0].split("data: ", 1)[1])
    assert sources_data["sources"][0]["source"] == "projects/hrm.md"
    assert _token_text(frames) == "HRM is great."
    assert llm.called is True


def test_empty_retrieval_refuses_without_calling_the_model() -> None:
    llm = FakeLLM(["should not be used"])
    frames = _collect("obscure question", db=FakeDB([]), llm=llm)
    assert _events(frames) == ["sources", "token", "done"]
    assert json.loads(frames[0].split("data: ", 1)[1])["sources"] == []
    assert _token_text(frames) == WEAK_RETRIEVAL_REPLY
    assert llm.called is False  # the guardrail short-circuits generation


def test_far_only_retrieval_refuses_without_calling_the_model() -> None:
    # Chunks come back but the closest is beyond the weak threshold.
    llm = FakeLLM(["should not be used"])
    frames = _collect(
        "off topic", db=FakeDB([_row("cv.md", distance=0.95)]), llm=llm, weak_distance=0.7
    )
    assert _events(frames) == ["sources", "token", "done"]
    assert json.loads(frames[0].split("data: ", 1)[1])["sources"] == []
    assert _token_text(frames) == WEAK_RETRIEVAL_REPLY
    assert llm.called is False


def test_retrieval_failure_emits_error_and_stops() -> None:
    frames = _collect("q", db=FakeDB([], fail=True), llm=FakeLLM(["x"]))
    assert _events(frames) == ["error"]
    assert "retrieval" in json.loads(frames[0].split("data: ", 1)[1])["message"]


def test_generation_failure_emits_sources_then_error() -> None:
    frames = _collect("q", db=FakeDB([_row("cv.md")]), llm=FakeLLM([], fail=True))
    assert _events(frames) == ["sources", "error"]
    assert "generation" in json.loads(frames[1].split("data: ", 1)[1])["message"]


def test_markdown_markers_are_stripped_from_streamed_tokens() -> None:
    # The model emits markdown despite the prompt; the terminal renders raw text,
    # so it must arrive stripped — even when a `**` straddles two token chunks.
    llm = FakeLLM(["**HR", "M** ", "is ", "`great`", "."])
    frames = _collect("what is hrm", db=FakeDB([_row("projects/hrm.md")]), llm=llm)
    assert _token_text(frames) == "HRM is great."


def test_markup_only_token_is_dropped_not_emitted_empty() -> None:
    llm = FakeLLM(["Hello", "**", " world"])
    frames = _collect("q", db=FakeDB([_row("cv.md")]), llm=llm)
    # The "**" token collapses to empty and is skipped, not sent as a blank token.
    assert _events(frames) == ["sources", "token", "token", "done"]
    assert _token_text(frames) == "Hello world"


def test_hash_in_content_is_preserved() -> None:
    # `#` is NOT stripped — it appears in real tech names like "C#".
    llm = FakeLLM(["Built with C# ", "and .NET."])
    frames = _collect("tech", db=FakeDB([_row("projects/readlog.md")]), llm=llm)
    assert _token_text(frames) == "Built with C# and .NET."


def test_force_english_threads_into_the_assembled_messages() -> None:
    # The force_english flag must reach build_messages: when on, the system rule
    # AND the in-message directive are present; when off, neither is.
    captured: dict[str, Any] = {}

    class CapturingLLM:
        async def stream_chat(
            self, messages: Sequence[dict[str, str]]
        ) -> AsyncIterator[str]:
            captured["messages"] = messages
            yield "ok"

    def collect(force_english: bool) -> None:
        async def run() -> None:
            gen = chat_event_stream(
                "kuka on mikko?",
                [],
                embedder=FakeEmbedder(),
                db=FakeDB([_row("cv.md")]),
                llm=CapturingLLM(),
                top_k=5,
                weak_retrieval_distance=0.7,
                force_english=force_english,
            )
            async for _ in gen:
                pass

        asyncio.run(run())

    collect(True)
    assert captured["messages"][-1]["content"].startswith("Respond ONLY in English")
    assert "ENTIRE reply in English" in captured["messages"][0]["content"]

    collect(False)
    assert "Respond ONLY in English" not in captured["messages"][-1]["content"]
    assert "ENTIRE reply in English" not in captured["messages"][0]["content"]


def test_busy_when_no_generation_slot_is_free() -> None:
    # All generation permits taken: the request is shed with a clean "busy"
    # reply and the model is NEVER called — shedding, not queueing.
    llm = FakeLLM(["should not be used"])

    async def run() -> list[str]:
        sem = asyncio.Semaphore(1)
        await sem.acquire()  # exhaust the only permit
        gen = chat_event_stream(
            "what is hrm",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            semaphore=sem,
            acquire_timeout=0.01,
        )
        return [frame async for frame in gen]

    frames = asyncio.run(run())
    assert _events(frames) == ["sources", "token", "done"]
    assert json.loads(frames[0].split("data: ", 1)[1])["sources"] == []
    assert _token_text(frames) == LLM_BUSY_REPLY
    assert llm.called is False


def test_generation_permit_is_released_after_a_successful_answer() -> None:
    # After a normal answer the permit must return so the next request can
    # generate — a leaked permit would wedge the gate at "busy" forever.
    llm = FakeLLM(["HRM ", "is great."])

    async def run() -> tuple[list[str], bool]:
        sem = asyncio.Semaphore(1)
        gen = chat_event_stream(
            "what is hrm",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            semaphore=sem,
            acquire_timeout=0.5,
        )
        frames = [frame async for frame in gen]
        return frames, sem.locked()

    frames, still_held = asyncio.run(run())
    assert _events(frames) == ["sources", "token", "token", "done"]
    assert _token_text(frames) == "HRM is great."
    assert still_held is False  # permit released back to the pool
