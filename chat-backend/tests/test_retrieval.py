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
        research_rows: list[dict[str, Any]] | None = None,
    ) -> None:
        self._rows = rows
        self._lexical = rows if lexical_rows is None else lexical_rows
        self._prose_row = prose_row
        self._research = research_rows or []
        self.calls: list[tuple[list[float], int]] = []
        self.lexical_calls: list[tuple[str, int]] = []
        self.prose_calls = 0
        self.recent_research_calls = 0
        # Every classifications arg the search paths received — lets a test assert
        # the role filter reached the dense, lexical, AND prose-anchor SQL.
        self.classification_args: list[Sequence[str] | None] = []

    async def recent_research(
        self,
        embedding: list[float],
        top_k: int,
        classifications: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        # Mirror the real SQL so tests exercise the filter+ordering, not the order
        # rows were handed in: leading chunk (index 0) of doc_type='research'
        # sources, role-filtered, newest doc_date first (NULLs last).
        self.recent_research_calls += 1
        self.classification_args.append(classifications)
        candidates = [
            r
            for r in self._research
            if r.get("doc_type") == "research" and r.get("chunk_index", 0) == 0
        ]
        candidates = self._filter(candidates, None, classifications)
        candidates.sort(
            key=lambda r: (r.get("doc_date") is not None, r.get("doc_date") or ""),
            reverse=True,
        )
        return candidates[:top_k]

    async def closest_prose(
        self,
        embedding: list[float],
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
    ) -> Mapping[str, Any] | None:
        self.prose_calls += 1
        self.classification_args.append(classifications)
        if self._prose_row is None:
            return None
        ok = self._filter([self._prose_row], None, classifications, exclude_doc_types)
        return ok[0] if ok else None

    @staticmethod
    def _filter(
        rows: list[dict[str, Any]],
        projects: Sequence[str] | None,
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
        kinds: Sequence[str] | None = None,
    ) -> list[dict[str, Any]]:
        out = rows
        if projects is not None:
            out = [r for r in out if r["project"] in projects]
        if classifications is not None:
            out = [
                r for r in out
                if r.get("classification", "public") in classifications
            ]
        if exclude_doc_types:
            out = [r for r in out if r.get("doc_type", "prose") not in exclude_doc_types]
        if kinds:
            out = [r for r in out if r.get("kind", "project") in kinds]
        return out

    async def search(
        self,
        embedding: list[float],
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
        doc_types: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
        kinds: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        self.calls.append((embedding, top_k))
        self.classification_args.append(classifications)
        return self._filter(
            self._rows, projects, classifications, exclude_doc_types, kinds
        )[:top_k]

    async def search_lexical(
        self,
        query: str,
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        self.lexical_calls.append((query, top_k))
        self.classification_args.append(classifications)
        return self._filter(
            self._lexical, projects, classifications, exclude_doc_types
        )[:top_k]


def _row(
    source: str,
    distance: float,
    project: str | None = "p",
    chunk_index: int = 0,
    chunk_type: str = "prose",
    classification: str = "public",
    doc_type: str = "prose",
    kind: str = "project",
    doc_date: str | None = None,
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
        "doc_type": doc_type,
        "kind": kind,
        "doc_date": doc_date,
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


# --- ADR exclusion + per-project diversity (Phase fix-retrieval-diversity) ---


def test_adr_rows_excluded_from_retrieve() -> None:
    # ADR chunks (doc_type='adr') must be filtered out so they don't crowd out
    # showcased project chunks on generic "tell me about the projects" queries.
    rows = [
        _row("docs/decisions/001-stack.md", 0.10, project="portfolio", doc_type="adr"),
        _row("projects/hrm.md", 0.15, project="hrm"),
        _row("docs/decisions/002-db.md", 0.20, project="portfolio", doc_type="adr"),
        _row("projects/audiobookmaker.md", 0.25, project="audiobookmaker"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "q", top_k=5, exclude_doc_types=("adr",))
    )
    sources = [c.source for c in result]
    assert "docs/decisions/001-stack.md" not in sources
    assert "docs/decisions/002-db.md" not in sources
    assert "projects/hrm.md" in sources
    assert "projects/audiobookmaker.md" in sources


def test_adr_exclusion_also_covers_hybrid_and_lexical_path() -> None:
    # Both the dense and lexical branches must honour exclude_doc_types so ADRs
    # can't slip through the lexical search even when filtered out by dense.
    adr = _row("docs/decisions/001-stack.md", 0.05, project="portfolio", doc_type="adr")
    proj = _row("projects/hrm.md", 0.20, project="hrm")
    db = FakeDB([adr, proj], lexical_rows=[adr, proj])
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "q",
            top_k=5,
            hybrid=True,
            exclude_doc_types=("adr",),
        )
    )
    assert all(c.source != "docs/decisions/001-stack.md" for c in result)
    assert any(c.source == "projects/hrm.md" for c in result)


def test_generic_query_diversity_caps_per_project() -> None:
    # A generic query (no project named) with diversify_max_per_project=2 must
    # allow at most 2 chunks from any single project so multiple projects spread
    # across the top_k instead of one project monopolising all slots.
    rows = [
        _row("projects/hrm-a.md", 0.10, project="hrm"),
        _row("projects/hrm-b.md", 0.11, project="hrm"),
        _row("projects/hrm-c.md", 0.12, project="hrm"),
        _row("projects/platform-a.md", 0.15, project="platform"),
        _row("projects/platform-b.md", 0.16, project="platform"),
        _row("projects/audiobookmaker.md", 0.20, project="audiobookmaker"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            # query must NOT name a project — "q" safely matches nothing
            "q",
            top_k=5,
            diversify_max_per_project=2,
        )
    )
    from collections import Counter

    counts = Counter(c.project for c in result)
    assert counts["hrm"] <= 2
    assert counts["platform"] <= 2
    # Multiple distinct projects surface
    assert len(counts) >= 2


def test_diversity_preserves_rank_order_within_project_budget() -> None:
    # Within a project's capped slots, the MOST relevant chunks must still lead
    # (rank order is preserved, not scrambled by the diversity walk).
    rows = [
        _row("projects/hrm-best.md", 0.05, project="hrm"),
        _row("projects/hrm-second.md", 0.10, project="hrm"),
        _row("projects/hrm-third.md", 0.15, project="hrm"),  # over cap, must be dropped
        _row("projects/platform.md", 0.20, project="platform"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "q", top_k=4, diversify_max_per_project=2)
    )
    hrm_chunks = [c for c in result if c.project == "hrm"]
    assert len(hrm_chunks) == 2
    assert hrm_chunks[0].source == "projects/hrm-best.md"
    assert hrm_chunks[1].source == "projects/hrm-second.md"


def test_named_project_query_is_not_diversified() -> None:
    # When the query names a project, diversity must NOT cap its chunks — the user
    # asked about a specific project and deserves its full relevant context.
    rows = [
        _row("projects/hrm-a.md", 0.10, project="hrm"),
        _row("projects/hrm-b.md", 0.11, project="hrm"),
        _row("projects/hrm-c.md", 0.12, project="hrm"),
        _row("projects/platform.md", 0.20, project="platform"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "how does HRM handle JWT permissions",
            top_k=4,
            diversify_max_per_project=1,  # would cap to 1 if diversity fired
            project_filter_strict=False,
        )
    )
    hrm_chunks = [c for c in result if c.project == "hrm"]
    # diversity must NOT have fired — hrm should contribute more than 1 chunk
    assert len(hrm_chunks) > 1


def test_multi_project_query_is_diversified() -> None:
    # The live failure this exists for: a language alias implicates several
    # projects at once ("python" -> audiobookmaker, claude-continue, portfolio).
    # Detection is non-empty, so the old `not wanted` guard skipped the cap and
    # the largest project took every slot — the two Python-first projects were
    # absent from an answer about Python.
    rows = [
        _row("narratives/portfolio.md", 0.10, project="portfolio"),
        _row("posts/skills-auditor-results.md", 0.11, project="portfolio"),
        _row("projects/portfolio-architecture.md", 0.12, project="portfolio"),
        _row("projects/portfolio-deepdive.md", 0.13, project="portfolio"),
        _row("projects/audiobookmaker.md", 0.20, project="audiobookmaker"),
        _row("projects/claude-continue.md", 0.22, project="claude-continue"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "which projects are written in python?",
            top_k=5,
            diversify_max_per_project=2,
        )
    )
    projects = {c.project for c in result}
    assert "audiobookmaker" in projects
    assert "claude-continue" in projects
    assert sum(1 for c in result if c.project == "portfolio") <= 2


def test_single_named_project_still_beats_diversity_when_others_detected() -> None:
    # The single-project exemption must survive the multi-project arm: naming one
    # project still returns that project's full context, uncapped.
    rows = [
        _row("projects/hrm-a.md", 0.10, project="hrm"),
        _row("projects/hrm-b.md", 0.11, project="hrm"),
        _row("projects/hrm-c.md", 0.12, project="hrm"),
        _row("projects/platform.md", 0.30, project="platform"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "how does HRM handle JWT permissions",
            top_k=4,
            diversify_max_per_project=1,
        )
    )
    assert sum(1 for c in result if c.project == "hrm") > 1


def test_no_diversity_when_diversify_max_is_none() -> None:
    # Default (diversify_max_per_project=None): byte-identical to pre-change behaviour —
    # all chunks from the closest project fill the top_k slots if they rank highest.
    rows = [
        _row("projects/hrm-a.md", 0.10, project="hrm"),
        _row("projects/hrm-b.md", 0.11, project="hrm"),
        _row("projects/hrm-c.md", 0.12, project="hrm"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(retrieve(FakeEmbedder(), db, "q", top_k=3))
    assert len(result) == 3
    assert all(c.project == "hrm" for c in result)


def test_cv_intent_injects_cv_chunks_cosine_missed() -> None:
    # The motivating live failure: "mitä työkokemusta?" — the English embedder
    # ranks every project chunk above the CV's Experience chunk, so the model
    # presented projects AS work experience. The CV-intent boost must carry the
    # kind='cv' chunks into the returned top_k anyway.
    rows = [
        _row("projects/hrm.md", 0.10, project="hrm"),
        _row("projects/platform.md", 0.11, project="platform"),
        _row("projects/spacepotatis.md", 0.12, project="spacepotatis"),
        _row("cv.md", 0.90, project=None, kind="cv"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(retrieve(FakeEmbedder(), db, "mitä työkokemusta?", top_k=3))
    assert result[0].source == "cv.md"
    assert len(result) == 3


def test_cv_intent_english_phrasing_also_boosts() -> None:
    rows = [
        _row("projects/hrm.md", 0.10, project="hrm"),
        _row("cv.md", 0.90, project=None, kind="cv"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(FakeEmbedder(), db, "what is your work experience?", top_k=2)
    )
    assert result[0].source == "cv.md"


def test_cv_intent_does_not_duplicate_cv_chunk_already_ranked() -> None:
    rows = [
        _row("cv.md", 0.10, project=None, kind="cv"),
        _row("projects/hrm.md", 0.20, project="hrm"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(retrieve(FakeEmbedder(), db, "kerro työkokemuksesta", top_k=5))
    assert [c.source for c in result].count("cv.md") == 1


def test_non_cv_query_never_fetches_cv() -> None:
    rows = [_row("projects/hrm.md", 0.10, project="hrm")]
    db = FakeDB(rows)
    asyncio.run(retrieve(FakeEmbedder(), db, "how does hrm cache tokens?", top_k=3))
    # exactly one dense search — no second kind-filtered fetch
    assert len(db.calls) == 1


def test_cv_boost_respects_classification_filter() -> None:
    # The role filter must reach the CV fetch too — a restricted CV chunk must
    # never surface through the boost path.
    rows = [
        _row("projects/hrm.md", 0.10, project="hrm"),
        _row("cv.md", 0.90, project=None, kind="cv", classification="restricted"),
    ]
    db = FakeDB(rows)
    result = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "mitä työkokemusta?",
            top_k=3,
            allowed_classifications=["public"],
        )
    )
    assert all(c.source != "cv.md" for c in result)


def test_research_coverage_injects_newest_and_leads() -> None:
    # A research/recency query forces the guaranteed research set to the FRONT of
    # the returned top_k, ahead of the semantic picks, ORDERED newest-first.
    semantic = [_row("projects/hrm.md", 0.20, project="hrm")]
    research = [  # handed in OUT of date order; recent_research must sort by date
        # skills is the CLOSER of the two (0.10) but OLDER — so poro leading can
        # only come from doc_date ordering, not distance.
        _row(
            "posts/skills.md", 0.10, project="portfolio",
            doc_type="research", doc_date="2026-06-02",
        ),
        _row(
            "posts/poro.md", 0.30, project="portfolio",
            doc_type="research", doc_date="2026-07-15",
        ),
    ]
    db = FakeDB(semantic, research_rows=research)
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "tell me about Mikko's latest research",
            top_k=3,
            research_coverage_top_n=2,
        )
    )
    sources = [c.source for c in got]
    assert db.recent_research_calls == 1
    # poro (2026-07-15) leads despite being handed in second AND being the farther
    # chunk — the ordering key is doc_date, not cosine distance.
    assert sources[:2] == ["posts/poro.md", "posts/skills.md"]
    assert "projects/hrm.md" in sources  # semantic still fills the remainder
    # Real distances preserved (not a sentinel), so the weak-retrieval gate sees an
    # honest prose signal.
    poro = next(c for c in got if c.source == "posts/poro.md")
    assert poro.distance == 0.30
    # Injected chunks are flagged so the completeness footer can find the newest
    # research; organic chunks are not.
    assert poro.is_coverage
    assert not next(c for c in got if c.source == "projects/hrm.md").is_coverage


def test_offcorpus_research_topic_injects_but_may_not_claim_recency() -> None:
    # "latest research on quantum computing" still INJECTS — measured harmless, and
    # the posts keep the gate anchored on honest prose distances. What stands down
    # is the recency CLAIM: with the note asserting "Mikko's most recent research is
    # <post>", an 8B model welded a bridge to the asked-about topic (live: the Poro
    # post "mentions AI-native development including quantum computing"; it does
    # not). is_coverage=False is what withholds the note and the completeness footer.
    semantic = [_row("projects/hrm.md", 0.20, project="hrm")]
    research = [
        _row(
            "posts/poro.md", 0.30, project="portfolio",
            doc_type="research", doc_date="2026-07-15",
        ),
    ]
    db = FakeDB(semantic, research_rows=research)
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "what is the latest research on quantum computing",
            top_k=3,
            research_coverage_top_n=2,
        )
    )
    assert db.recent_research_calls == 1  # injection preserved, deliberately
    assert "posts/poro.md" in [c.source for c in got]
    assert all(not c.is_coverage for c in got)


def test_translated_finnish_sweep_claims_off_the_english_line() -> None:
    # The real retrieval input shape. A genuine Finnish sweep translates to an
    # English line carrying NO bound subject, so the claim stands — while the
    # Finnish original's copula ("...on tehnyt" = "has done") sits on line 2 where
    # the veto structurally cannot read it as the English preposition "on".
    research = [
        _row(
            "posts/poro.md", 0.30, project="portfolio",
            doc_type="research", doc_date="2026-07-15",
        ),
    ]
    db = FakeDB([_row("projects/hrm.md", 0.20, project="hrm")], research_rows=research)
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "what research has Mikko done",
            intent_query="mitä tutkimuksia mikko on tehnyt",
            top_k=3,
            research_coverage_top_n=2,
        )
    )
    assert next(c for c in got if c.source == "posts/poro.md").is_coverage


def test_translated_offcorpus_query_may_not_claim_off_the_finnish_line() -> None:
    # Containment for Finnish input rides on the ENGLISH line: Finnish marks its
    # topic with a case ending ("...ilmastonmuutoksesta") and offers no preposition
    # to bind, but English grammar REQUIRES one, so the translation reliably
    # materialises the structure the veto reads.
    research = [
        _row(
            "posts/poro.md", 0.30, project="portfolio",
            doc_type="research", doc_date="2026-07-15",
        ),
    ]
    db = FakeDB([_row("projects/hrm.md", 0.20, project="hrm")], research_rows=research)
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "what is the latest research on climate change",
            intent_query="viimeisin tutkimus ilmastonmuutoksesta",
            top_k=3,
            research_coverage_top_n=2,
        )
    )
    assert db.recent_research_calls == 1
    assert all(not c.is_coverage for c in got)


def test_research_coverage_bypasses_diversity_cap() -> None:
    # The feature's raison d'etre: all research is project='portfolio', so the
    # per-project diversity cap (1) would collapse it to ONE chunk on a generic
    # query. The guaranteed set is prepended AFTER diversify, so multiple portfolio
    # research posts survive the cap.
    semantic = [  # three portfolio-research chunks; diversify(cap=1) keeps ONE
        _row("posts/a.md", 0.20, project="portfolio", doc_type="research"),
        _row("posts/b.md", 0.21, project="portfolio", doc_type="research"),
        _row("posts/c.md", 0.22, project="portfolio", doc_type="research"),
    ]
    research = [
        _row(
            "posts/poro.md", 0.30, project="portfolio",
            doc_type="research", doc_date="2026-07-15",
        ),
        _row(
            "posts/blind.md", 0.31, project="portfolio",
            doc_type="research", doc_date="2026-07-02",
        ),
    ]
    db = FakeDB(semantic, research_rows=research)
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "tell me about your latest research",
            top_k=4,
            diversify_max_per_project=1,
            research_coverage_top_n=2,
        )
    )
    sources = [c.source for c in got]
    # Both guaranteed research posts lead, though every doc is 'portfolio'.
    assert sources[:2] == ["posts/poro.md", "posts/blind.md"]
    # Without the feature, diversify(cap=1) leaves exactly ONE portfolio chunk;
    # with it, the cap is bypassed for the guaranteed set.
    assert sum(1 for c in got if c.project == "portfolio") >= 2


def test_research_coverage_injection_preserves_far_gate_signal() -> None:
    # CONTAINMENT: on a query that FIRES the intent but is off-corpus, the injected
    # research chunks carry their REAL (far) distances, so the closest prose stays
    # far and the weak-retrieval gate still refuses. Injection never fabricates a
    # near chunk — the guarantee is coverage, never relevance.
    from app.guardrails import is_weak_retrieval

    semantic = [_row("projects/hrm.md", 0.80, project="hrm")]  # far
    research = [
        _row(
            "posts/poro.md", 0.85, project="portfolio",
            doc_type="research", doc_date="2026-07-15",
        ),
    ]
    db = FakeDB(semantic, research_rows=research)
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "what's the latest research on quantum computing?",
            top_k=6,
            research_coverage_top_n=3,
        )
    )
    assert db.recent_research_calls == 1  # the intent fired and injection ran
    # Every returned prose chunk is far, so the gate (threshold 0.45) still refuses.
    assert is_weak_retrieval(got, 0.45)


def test_research_coverage_not_injected_without_intent() -> None:
    # A non-research query never triggers the guaranteed set, even with the knob on.
    research = [_row("posts/poro.md", 0.30, project="portfolio", doc_type="research")]
    db = FakeDB(
        [_row("projects/hrm.md", 0.20, project="hrm")], research_rows=research
    )
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "how does hrm cache permissions?",
            top_k=3,
            research_coverage_top_n=2,
        )
    )
    assert db.recent_research_calls == 0
    assert "posts/poro.md" not in [c.source for c in got]


def test_research_coverage_disabled_by_zero_knob() -> None:
    # research_coverage_top_n=0 (the default) is byte-identical to the old flow:
    # the intent fires but the fetch is never made.
    research = [_row("posts/poro.md", 0.30, project="portfolio", doc_type="research")]
    db = FakeDB(
        [_row("projects/hrm.md", 0.20, project="hrm")], research_rows=research
    )
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "tell me about your latest research",
            top_k=3,
            research_coverage_top_n=0,
        )
    )
    assert db.recent_research_calls == 0
    assert "posts/poro.md" not in [c.source for c in got]


def test_research_coverage_respects_classification_filter() -> None:
    # The role filter must reach the research-coverage fetch too — a restricted
    # research chunk must never surface through the guaranteed set.
    semantic = [_row("projects/hrm.md", 0.10, project="hrm")]
    research = [
        _row(
            "posts/secret.md",
            0.20,
            project="portfolio",
            doc_type="research",
            classification="restricted",
        ),
    ]
    db = FakeDB(semantic, research_rows=research)
    got = asyncio.run(
        retrieve(
            FakeEmbedder(),
            db,
            "tell me about your latest research",
            top_k=3,
            research_coverage_top_n=3,
            allowed_classifications=["public"],
        )
    )
    assert db.recent_research_calls == 1
    assert all(c.source != "posts/secret.md" for c in got)
