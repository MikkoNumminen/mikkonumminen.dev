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
        prose_row: dict[str, Any] | None = None,
    ) -> None:
        self._rows = rows
        self._lexical = rows if lexical_rows is None else lexical_rows
        self._prose_row = prose_row
        self.calls: list[tuple[list[float], int]] = []
        self.lexical_calls: list[tuple[str, int]] = []
        self.prose_calls = 0
        # Every classifications arg the search paths received — lets a test assert
        # the role filter reached the dense, lexical, AND prose-anchor SQL.
        self.classification_args: list[Sequence[str] | None] = []

    async def closest_prose(
        self,
        embedding: list[float],
        classifications: Sequence[str] | None = None,
    ) -> Mapping[str, Any] | None:
        self.prose_calls += 1
        self.classification_args.append(classifications)
        if self._prose_row is None:
            return None
        ok = self._filter([self._prose_row], None, classifications)
        return ok[0] if ok else None

    @staticmethod
    def _filter(
        rows: list[dict[str, Any]],
        projects: Sequence[str] | None,
        classifications: Sequence[str] | None = None,
    ) -> list[dict[str, Any]]:
        out = rows
        if projects is not None:
            out = [r for r in out if r["project"] in projects]
        if classifications is not None:
            out = [
                r for r in out
                if r.get("classification", "public") in classifications
            ]
        return out

    async def search(
        self,
        embedding: list[float],
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        self.calls.append((embedding, top_k))
        self.classification_args.append(classifications)
        return self._filter(self._rows, projects, classifications)[:top_k]

    async def search_lexical(
        self,
        query: str,
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        self.lexical_calls.append((query, top_k))
        self.classification_args.append(classifications)
        return self._filter(self._lexical, projects, classifications)[:top_k]


def _row(
    source: str,
    distance: float,
    project: str | None = "p",
    chunk_index: int = 0,
    chunk_type: str = "prose",
    classification: str = "public",
) -> dict[str, Any]:
    return {
        "source": source,
        "title": source.upper(),
        "project": project,
        "content": f"content of {source}",
        "distance": distance,
        "chunk_index": chunk_index,
        "chunk_type": chunk_type,
        "classification": classification,
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


def test_strict_filter_with_no_matching_rows_fails_open() -> None:
    # Strict filter names readlog-dotnet, but the corpus only has a platform
    # chunk. A hard filter would return nothing and the gate would falsely
    # refuse; instead retrieval falls open to the global search so the close
    # platform chunk surfaces and the gate sees the true best distance.
    rows = [_row("projects/platform.md", 0.12, project="platform")]
    db = FakeDB(rows, lexical_rows=rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "ReadLog .NET find-or-create race",
            top_k=3,
            hybrid=True,
            project_filter_strict=True,
        )
    )
    assert result
    assert min(c.distance for c in result) == 0.12


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


def test_soft_boost_anchor_does_not_reintroduce_contamination() -> None:
    # Non-hybrid soft boost, top_k=1: platform (0.05) is closest but the WRONG
    # project; readlog (0.10) is the named one. The gate anchor must NOT pull the
    # closer wrong-project chunk back in — it anchors on the named project's
    # closest chunk, so the cross-project contamination fix stays intact.
    rows = [
        _row("projects/platform.md", 0.05, project="platform"),
        _row("projects/readlog-dotnet.md", 0.10, project="readlog-dotnet"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "ReadLog .NET race", top_k=1, hybrid=False)
    )
    assert [c.project for c in result] == ["readlog-dotnet"]


def test_hybrid_anchor_retains_closest_when_fusion_pushes_it_out() -> None:
    # No project named. Fusion ranks B first (strong in both lists), pushing the
    # closest dense chunk A (0.1, weak lexically) out of top_k=1. The anchor must
    # bring A back so the gate sees the true 0.1 (else a false refusal).
    dense = [_row("a.md", 0.10), _row("b.md", 0.50)]
    lexical = [_row("b.md", 0.0), _row("c.md", 0.0), _row("a.md", 0.10)]
    db = FakeDB(dense, lexical_rows=lexical)
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "keyword query", top_k=1, hybrid=True)
    )
    assert min(c.distance for c in result) == 0.10


# --- prose anchor for the gate when the top-k is all code (B1 completion) ---

from app.guardrails import is_weak_retrieval  # noqa: E402


def test_all_code_topk_with_far_prose_gates_weak() -> None:
    # Off-topic query matches only CODE chunks (coincidental tokens); the closest
    # PROSE is far (0.80). The injected prose anchor makes the gate refuse.
    code = [_row("code/audiobookmaker/src/tts.py", 0.30, chunk_type="code")]
    far_prose = _row("projects/audiobookmaker.md", 0.80, chunk_type="prose")
    db = FakeDB(code, lexical_rows=code, prose_row=far_prose)
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "translate hello to spanish", top_k=3, hybrid=True)
    )
    assert any(c.chunk_type == "prose" for c in result)  # anchor injected
    assert db.prose_calls == 1
    assert is_weak_retrieval(result, max_distance=0.45) is True


def test_all_code_topk_with_near_prose_still_answers() -> None:
    # Legit deep-code question: the project's PROSE doc is near (0.30), so the
    # gate must NOT over-gate — the answer goes through.
    code = [_row("code/audiobookmaker/src/tts.py", 0.20, chunk_type="code")]
    near_prose = _row("projects/audiobookmaker.md", 0.30, chunk_type="prose")
    db = FakeDB(code, lexical_rows=code, prose_row=near_prose)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "how does salvageRemovedWeapons work",
            top_k=3,
            hybrid=True,
        )
    )
    assert is_weak_retrieval(result, max_distance=0.45) is False


def test_prose_anchor_skipped_when_topk_already_has_prose() -> None:
    rows = [
        _row("projects/a.md", 0.20, chunk_type="prose"),
        _row("code/a/x.py", 0.30, chunk_type="code"),
    ]
    db = FakeDB(rows, lexical_rows=rows, prose_row=_row("projects/z.md", 0.9))
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "tell me about A", top_k=3, hybrid=True)
    )
    assert db.prose_calls == 0  # no extra fetch when prose already present
    assert all(c.source != "projects/z.md" for c in result)


def test_code_only_corpus_falls_back_to_all_chunks() -> None:
    # No prose anywhere in the corpus: closest_prose returns None, so the gate
    # falls back to all chunks and a near code chunk keeps the query answerable.
    code = [_row("code/a/x.py", 0.30, chunk_type="code")]
    db = FakeDB(code, lexical_rows=code, prose_row=None)
    result = asyncio.run(retrieve(FakeEmbedder(), db, "q", top_k=3, hybrid=True))
    assert is_weak_retrieval(result, max_distance=0.45) is False


def test_prose_anchor_is_in_sources_when_the_answer_goes_through() -> None:
    # Pins MINOR-3 as intentional: on an all-code top-k where the gate passes
    # (near prose), the injected prose chunk grounds the answer and appears in the
    # cited sources (+1), not just as a hidden gate probe.
    code = [_row("code/audiobookmaker/src/tts.py", 0.20, chunk_type="code")]
    near_prose = _row("projects/audiobookmaker.md", 0.30, chunk_type="prose")
    db = FakeDB(code, lexical_rows=code, prose_row=near_prose)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(), db, "how does the tts pipeline work", top_k=3, hybrid=True
        )
    )
    sources = [r["source"] for r in to_source_refs(result)]
    assert "projects/audiobookmaker.md" in sources


# --- GDPR role-based retrieval filter (Phase 2) ---


def test_role_filter_gates_restricted_on_every_search_path() -> None:
    # A public role (allowed=[public]) must never receive a restricted chunk —
    # the filter is applied IN SQL (the fake honours it) on the dense, lexical,
    # and prose-anchor paths, so restricted data is excluded pre-model, not after.
    rows = [
        _row("projects/a.md", 0.10, classification="public"),
        _row("restricted/secret.md", 0.05, classification="restricted"),
    ]
    db = FakeDB(rows, lexical_rows=rows, prose_row=rows[1])
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "q",
            top_k=5,
            hybrid=True,
            allowed_classifications=["public"],
        )
    )
    assert result  # the public chunk still answers
    assert all(c.classification == "public" for c in result)
    assert all(c.source != "restricted/secret.md" for c in result)
    # the allowed list reached the db on every path that was exercised
    assert db.classification_args
    assert all(arg == ["public"] for arg in db.classification_args)


def test_role_filter_gates_the_prose_anchor_on_code_only_topk() -> None:
    # When the top-k is all CODE chunks, retrieve() fetches the closest PROSE chunk
    # for the weak-retrieval gate — that anchor feeds the answer's context, so it
    # MUST be role-filtered too. A regression dropping the classifications arg from
    # the closest_prose call would leak restricted prose to a public role on a
    # code-only query; this test exercises that exact path.
    code_rows = [_row("code/p/a.py", 0.10, chunk_type="code", classification="public")]
    restricted_prose = _row("restricted/secret.md", 0.02, classification="restricted")
    db = FakeDB(code_rows, lexical_rows=code_rows, prose_row=restricted_prose)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "q",
            top_k=5,
            hybrid=True,
            allowed_classifications=["public"],
        )
    )
    assert db.prose_calls == 1  # the prose-anchor path WAS exercised
    assert ["public"] in db.classification_args  # ... and carried the role filter
    assert all(c.source != "restricted/secret.md" for c in result)
    assert all(c.classification == "public" for c in result)


def test_filter_clause_empty_classifications_matches_nothing() -> None:
    # The SQL builder must treat None and [] differently: None = no role filter
    # (feature off), [] = the role may see NOTHING (an ANY('{}') that matches no
    # row). Keying on truthiness would fail OPEN on [] and return every class.
    from app.db import _filter_clause

    assert "classification" not in _filter_clause(["e", 5], None, None)
    params: list[object] = ["e", 5]
    where = _filter_clause(params, None, [])
    assert "classification = ANY" in where
    assert params[-1] == []


def test_permitted_role_sees_restricted() -> None:
    rows = [_row("restricted/secret.md", 0.05, classification="restricted")]
    db = FakeDB(rows, lexical_rows=rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "q",
            top_k=5,
            hybrid=True,
            allowed_classifications=["public", "internal", "restricted"],
        )
    )
    assert any(c.source == "restricted/secret.md" for c in result)


def test_no_role_filter_forwards_none() -> None:
    # Default (no allowed_classifications): the filter is None everywhere, so the
    # behaviour is byte-identical to the pre-Phase-2 path.
    db = FakeDB([_row("a.md", 0.1)])
    asyncio.run(retrieve(FakeEmbedder(), db, "q", top_k=2))
    assert db.classification_args == [None]
