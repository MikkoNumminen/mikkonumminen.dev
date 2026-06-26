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
    def __init__(
        self,
        rows: list[dict[str, Any]],
        lexical_rows: list[dict[str, Any]] | None = None,
    ) -> None:
        self._rows = rows
        self._lexical = rows if lexical_rows is None else lexical_rows
        self.calls: list[tuple[list[float], int]] = []
        self.lexical_calls: list[tuple[str, int]] = []

    @staticmethod
    def _filter(
        rows: list[dict[str, Any]], projects: Sequence[str] | None
    ) -> list[dict[str, Any]]:
        if projects is None:
            return rows
        return [r for r in rows if r["project"] in projects]

    async def search(
        self,
        embedding: list[float],
        top_k: int,
        projects: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        self.calls.append((embedding, top_k))
        return self._filter(self._rows, projects)[:top_k]

    async def search_lexical(
        self,
        query: str,
        top_k: int,
        projects: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        self.lexical_calls.append((query, top_k))
        return self._filter(self._lexical, projects)[:top_k]


def _row(
    source: str, distance: float, project: str | None = "p", chunk_index: int = 0
) -> dict[str, Any]:
    return {
        "source": source,
        "title": source.upper(),
        "project": project,
        "content": f"content of {source}",
        "distance": distance,
        "chunk_index": chunk_index,
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


def test_named_project_chunks_float_to_front() -> None:
    # Candidates in cosine order: a Platform chunk is the closest, but the query
    # names ReadLog .NET, so that project's chunks must lead the returned top_k —
    # the cross-project contamination fix.
    db = FakeDB(
        [
            _row("projects/platform-deepdive.md", 0.10, project="platform"),
            _row(
                "projects/readlog-dotnet-architecture.md", 0.20, project="readlog-dotnet"
            ),
            _row("projects/hrm.md", 0.25, project="hrm"),
            _row("projects/readlog-dotnet.md", 0.30, project="readlog-dotnet"),
        ]
    )
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "ReadLog .NET find-or-create race", top_k=2)
    )
    assert [c.project for c in result] == ["readlog-dotnet", "readlog-dotnet"]
    # cosine order preserved within the boosted group
    assert [c.source for c in result] == [
        "projects/readlog-dotnet-architecture.md",
        "projects/readlog-dotnet.md",
    ]
    # a wider candidate set was pulled (top_k * 4) so the named chunks were present
    assert db.calls[0][1] == 8


def test_no_project_named_is_byte_identical_to_plain_search() -> None:
    db = FakeDB(
        [_row("a.md", 0.1, project="hrm"), _row("b.md", 0.2, project="platform")]
    )
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "what is the most complex thing here?", top_k=2)
    )
    assert [c.source for c in result] == ["a.md", "b.md"]
    # exactly top_k requested, no widening, no re-rank
    assert db.calls == [([0.1, 0.2, 0.3], 2)]


# --- hybrid retrieval (Workstream B) ---


def test_hybrid_disabled_never_runs_lexical_search() -> None:
    db = FakeDB([_row("a.md", 0.1)])
    asyncio.run(retrieve(FakeEmbedder(), db, "q", top_k=2, hybrid=False))
    assert db.lexical_calls == []  # pure dense path is byte-identical to before


def test_hybrid_fusion_surfaces_a_lexical_only_match() -> None:
    # Dense misses d.md; lexical ranks it first (an exact identifier). RRF must
    # lift d.md into the top_k while keeping a.md (strong in both).
    dense = [_row("a.md", 0.10), _row("b.md", 0.20), _row("c.md", 0.30)]
    lexical = [_row("d.md", 0.0), _row("a.md", 0.10)]
    db = FakeDB(dense, lexical_rows=lexical)
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "ExactClassName", top_k=3, hybrid=True)
    )
    sources = [c.source for c in result]
    assert "d.md" in sources
    assert "a.md" in sources
    assert len(db.lexical_calls) == 1


def test_hybrid_keeps_dense_gate_anchor_distance() -> None:
    # The closest dense chunk's real distance must survive fusion so the
    # dense-based weak-retrieval gate still sees it; lexical-only chunks carry the
    # sentinel max distance and never lower that minimum.
    dense = [_row("close.md", 0.12)]
    lexical = [_row("kw.md", 0.0), _row("close.md", 0.12)]
    db = FakeDB(dense, lexical_rows=lexical)
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "keyword", top_k=3, hybrid=True)
    )
    assert min(c.distance for c in result) == 0.12  # the dense anchor
    kw = next(c for c in result if c.source == "kw.md")
    assert kw.distance == 2.0  # lexical-only sentinel, can't satisfy the gate


def test_strict_project_filter_hard_restricts_both_searches() -> None:
    rows = [
        _row("projects/readlog-dotnet.md", 0.10, project="readlog-dotnet"),
        _row("projects/platform.md", 0.05, project="platform"),  # closer, wrong project
    ]
    db = FakeDB(rows, lexical_rows=rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "ReadLog .NET find-or-create race",
            top_k=5,
            hybrid=True,
            project_filter_strict=True,
        )
    )
    # Hard filter: the closer platform chunk is excluded entirely, not just demoted.
    assert result
    assert all(c.project == "readlog-dotnet" for c in result)


def test_soft_boost_when_strict_filter_off() -> None:
    rows = [
        _row("projects/platform.md", 0.05, project="platform"),
        _row("projects/readlog-dotnet.md", 0.10, project="readlog-dotnet"),
    ]
    db = FakeDB(rows, lexical_rows=rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "ReadLog .NET race",
            top_k=2,
            hybrid=True,
            project_filter_strict=False,
        )
    )
    # Soft boost keeps the other project present but floats readlog-dotnet first.
    assert result[0].project == "readlog-dotnet"
    assert any(c.project == "platform" for c in result)
