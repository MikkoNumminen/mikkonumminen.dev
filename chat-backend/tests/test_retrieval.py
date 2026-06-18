"""Tests for the retrieval orchestration (embedder + db injected as fakes)."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from typing import Any

from app.retrieval import RetrievedChunk, retrieve, to_context, to_source_refs


class FakeEmbedder:
    def __init__(self) -> None:
        self.seen: list[str] = []

    def embed_query(self, text: str) -> list[float]:
        self.seen.append(text)
        return [0.1, 0.2, 0.3]


class FakeDB:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows
        self.calls: list[tuple[list[float], int]] = []

    async def search(
        self, embedding: list[float], top_k: int
    ) -> Sequence[Mapping[str, Any]]:
        self.calls.append((embedding, top_k))
        return self._rows[:top_k]


def _row(source: str, distance: float, project: str | None = "p") -> dict[str, Any]:
    return {
        "source": source,
        "title": source.upper(),
        "project": project,
        "content": f"content of {source}",
        "distance": distance,
    }


def test_retrieve_embeds_query_and_maps_rows() -> None:
    embedder = FakeEmbedder()
    db = FakeDB([_row("cv.md", 0.1), _row("projects/hrm.md", 0.2)])
    result = asyncio.run(retrieve(embedder, db, "who is mikko", top_k=5))
    assert embedder.seen == ["who is mikko"]
    assert db.calls == [([0.1, 0.2, 0.3], 5)]
    assert [c.source for c in result] == ["cv.md", "projects/hrm.md"]
    assert result[0].distance == 0.1
    assert isinstance(result[0], RetrievedChunk)


def test_retrieve_respects_top_k() -> None:
    db = FakeDB([_row("a.md", 0.1), _row("b.md", 0.2), _row("c.md", 0.3)])
    result = asyncio.run(retrieve(FakeEmbedder(), db, "q", top_k=2))
    assert [c.source for c in result] == ["a.md", "b.md"]


def test_to_source_refs_dedupes_preserving_order() -> None:
    chunks = [
        RetrievedChunk("cv.md", "CV", None, "x", 0.1),
        RetrievedChunk("cv.md", "CV", None, "y", 0.2),
        RetrievedChunk("projects/hrm.md", "HRM", "hrm", "z", 0.3),
    ]
    refs = to_source_refs(chunks)
    assert [r["source"] for r in refs] == ["cv.md", "projects/hrm.md"]


def test_to_context_adapts_fields() -> None:
    chunks = [RetrievedChunk("cv.md", "CV", "proj", "body", 0.1)]
    ctx = to_context(chunks)
    assert ctx[0].source == "cv.md"
    assert ctx[0].project == "proj"
    assert ctx[0].content == "body"
