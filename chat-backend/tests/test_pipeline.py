"""Tests for the /chat event-stream orchestration (all deps faked)."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Any

from app.pipeline import chat_event_stream


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

    async def stream_chat(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]:
        if self._fail:
            raise RuntimeError("llm down")
        for token in self._tokens:
            yield token


def _row(source: str) -> dict[str, Any]:
    return {
        "source": source,
        "title": source.upper(),
        "project": None,
        "content": f"about {source}",
        "distance": 0.1,
    }


def _collect(
    query: str,
    *,
    db: FakeDB,
    llm: FakeLLM,
    top_k: int = 5,
) -> list[str]:
    async def run() -> list[str]:
        gen = chat_event_stream(
            query, [], embedder=FakeEmbedder(), db=db, llm=llm, top_k=top_k
        )
        return [frame async for frame in gen]

    return asyncio.run(run())


def _events(frames: list[str]) -> list[str]:
    return [f.split("\n", 1)[0].removeprefix("event: ") for f in frames]


def test_happy_path_sources_then_tokens_then_done() -> None:
    frames = _collect(
        "what is hrm",
        db=FakeDB([_row("projects/hrm.md")]),
        llm=FakeLLM(["HRM ", "is great."]),
    )
    assert _events(frames) == ["sources", "token", "token", "done"]
    # sources frame carries the retrieved ref
    sources_data = json.loads(frames[0].split("data: ", 1)[1])
    assert sources_data["sources"][0]["source"] == "projects/hrm.md"
    text = "".join(
        json.loads(f.split("data: ", 1)[1])["text"]
        for f in frames
        if f.startswith("event: token")
    )
    assert text == "HRM is great."


def test_empty_retrieval_still_streams_with_empty_sources() -> None:
    frames = _collect(
        "obscure question",
        db=FakeDB([]),
        llm=FakeLLM(["I don't have anything on that."]),
    )
    assert _events(frames) == ["sources", "token", "done"]
    sources_data = json.loads(frames[0].split("data: ", 1)[1])
    assert sources_data["sources"] == []


def test_retrieval_failure_emits_error_and_stops() -> None:
    frames = _collect("q", db=FakeDB([], fail=True), llm=FakeLLM(["x"]))
    assert _events(frames) == ["error"]
    assert "retrieval" in json.loads(frames[0].split("data: ", 1)[1])["message"]


def test_generation_failure_emits_sources_then_error() -> None:
    frames = _collect("q", db=FakeDB([_row("cv.md")]), llm=FakeLLM([], fail=True))
    assert _events(frames) == ["sources", "error"]
    assert "generation" in json.loads(frames[1].split("data: ", 1)[1])["message"]
