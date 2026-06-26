"""Top-k cosine retrieval over the indexed corpus.

Embeds the query with the SAME in-process model used at index time, then runs a
cosine-distance search in pgvector (the raw SQL lives in `db.search`). The
embedder and database are injected as small Protocols so this orchestration is
unit-tested with fakes — the heavy fastembed/asyncpg modules are imported only
for type-checking.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from .prompts import ContextChunk
from .query_projects import detect_projects


class SupportsEmbedQuery(Protocol):
    def embed_query(self, text: str) -> list[float]: ...


class SupportsSearch(Protocol):
    async def search(
        self,
        embedding: list[float],
        top_k: int,
        projects: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]: ...

    async def search_lexical(
        self,
        query: str,
        top_k: int,
        projects: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]: ...


@dataclass(frozen=True)
class RetrievedChunk:
    """One retrieved chunk plus its cosine distance (smaller = more similar).

    `distance` is always the DENSE cosine distance — that is what the
    weak-retrieval gate keys on, so hybrid fusion must never overwrite it. A
    chunk surfaced by the lexical search but absent from the dense candidates
    carries `_LEXICAL_ONLY_DISTANCE` (the cosine maximum) so it can be ranked
    without ever, on its own, making the dense-based gate judge the query
    relevant. `chunk_index` is the fusion identity (a source has many chunks).
    """

    source: str
    title: str
    project: str | None
    content: str
    distance: float
    chunk_index: int = 0


# When the query names a project, or hybrid fusion is on, pull this many * top_k
# candidates so the right chunks are present to fuse/float up; capped so a large
# top_k can't end up scanning a big slice of the table.
_CANDIDATE_MULTIPLIER = 4
_CANDIDATE_CAP = 50
# pgvector cosine distance is in [0, 2]; a lexical-only chunk gets the maximum so
# it never lowers the gate's "is anything relevant?" minimum on its own.
_LEXICAL_ONLY_DISTANCE = 2.0


def _to_chunk(row: Mapping[str, Any]) -> RetrievedChunk:
    return RetrievedChunk(
        source=str(row["source"]),
        title=str(row["title"]),
        project=(None if row["project"] is None else str(row["project"])),
        content=str(row["content"]),
        distance=float(row["distance"]),
        chunk_index=int(row["chunk_index"]),
    )


def _to_lexical_chunk(row: Mapping[str, Any]) -> RetrievedChunk:
    """A lexical-search row as a RetrievedChunk with a sentinel dense distance."""
    return RetrievedChunk(
        source=str(row["source"]),
        title=str(row["title"]),
        project=(None if row["project"] is None else str(row["project"])),
        content=str(row["content"]),
        distance=_LEXICAL_ONLY_DISTANCE,
        chunk_index=int(row["chunk_index"]),
    )


def _key(chunk: RetrievedChunk) -> tuple[str, int]:
    return (chunk.source, chunk.chunk_index)


def _project_boost(
    chunks: list[RetrievedChunk], wanted: set[str]
) -> list[RetrievedChunk]:
    """Stable-partition the named project's chunks to the front (soft boost).

    Preserves the incoming order within each group, so the most-relevant chunk
    still leads — only the named project's chunks are lifted above the rest.
    """
    matched = [c for c in chunks if c.project in wanted]
    others = [c for c in chunks if c.project not in wanted]
    return matched + others


def _rrf_fuse(
    dense: list[RetrievedChunk],
    lexical_rows: Sequence[Mapping[str, Any]],
    *,
    rrf_k: int,
    dense_weight: float,
    lexical_weight: float,
) -> list[RetrievedChunk]:
    """Fuse the dense and lexical rankings with reciprocal rank fusion.

    RRF scores each chunk by Σ weight_list / (rrf_k + rank_in_list), summed over
    the lists it appears in (rank starting at 1). It needs only the ORDER of each
    list, not comparable raw scores — which is why it combines cosine distance and
    ts_rank cleanly. Ties break toward the smaller dense distance, so a chunk
    strong in both beats a lexical-only one. Dense chunks keep their real
    distance; lexical-only chunks carry the sentinel (see RetrievedChunk).
    """
    scores: dict[tuple[str, int], float] = {}
    chunks: dict[tuple[str, int], RetrievedChunk] = {}

    for rank, chunk in enumerate(dense, start=1):
        k = _key(chunk)
        scores[k] = scores.get(k, 0.0) + dense_weight / (rrf_k + rank)
        chunks[k] = chunk
    for rank, row in enumerate(lexical_rows, start=1):
        chunk = _to_lexical_chunk(row)
        k = _key(chunk)
        scores[k] = scores.get(k, 0.0) + lexical_weight / (rrf_k + rank)
        chunks.setdefault(k, chunk)  # keep the dense copy (real distance) if present

    return sorted(
        chunks.values(),
        key=lambda c: (-scores[_key(c)], c.distance),
    )


def _ensure_gate_anchor(
    result: list[RetrievedChunk], dense: list[RetrievedChunk], top_k: int
) -> list[RetrievedChunk]:
    """Guarantee the single closest dense chunk is in the returned top_k.

    The weak-retrieval gate refuses when the BEST dense distance in the returned
    chunks exceeds the threshold. Fusion could, in principle, rank that closest
    chunk just out of the top_k; prepending it (and re-truncating) keeps the gate
    anchored on the true closest distance so a relevant query is never refused
    for a fusion-ordering accident. A no-op in the overwhelmingly common case
    where the closest chunk already ranks highly.
    """
    if not dense:
        return result
    best = min(dense, key=lambda c: c.distance)
    if any(_key(c) == _key(best) for c in result):
        return result
    return ([best] + result)[:top_k]


async def retrieve(
    embedder: SupportsEmbedQuery,
    db: SupportsSearch,
    query: str,
    top_k: int,
    *,
    hybrid: bool = False,
    rrf_k: int = 60,
    dense_weight: float = 1.0,
    lexical_weight: float = 1.0,
    project_filter_strict: bool = False,
) -> list[RetrievedChunk]:
    """Embed `query` and return its `top_k` most relevant corpus chunks.

    Dense cosine search is always run (its closest distance anchors the
    weak-retrieval gate). With `hybrid`, a lexical (BM25-style) search is run too
    and the two rankings are fused with RRF, so exact identifiers the embeddings
    blur are still surfaced. When the query NAMES a project: `project_filter_strict`
    HARD-restricts both searches to those projects; otherwise the named project's
    chunks are soft-boosted to the front (the cross-project contamination fix).
    With `hybrid=False` and no project named this is byte-for-byte a plain `top_k`
    cosine search — the feature is fully reversible from config.
    """
    vector = embedder.embed_query(query)
    wanted = detect_projects(query)
    strict = bool(wanted) and project_filter_strict
    project_filter: list[str] | None = sorted(wanted) if strict else None

    widen = hybrid or (bool(wanted) and not strict)
    candidate_k = min(top_k * _CANDIDATE_MULTIPLIER, _CANDIDATE_CAP) if widen else top_k

    if project_filter is not None:
        dense_rows = await db.search(vector, candidate_k, project_filter)
    else:
        dense_rows = await db.search(vector, candidate_k)
    dense_chunks = [_to_chunk(row) for row in dense_rows]

    if not hybrid:
        result = dense_chunks
        if wanted and not strict:
            result = _project_boost(result, wanted)
        return result[:top_k]

    if project_filter is not None:
        lexical_rows = await db.search_lexical(query, candidate_k, project_filter)
    else:
        lexical_rows = await db.search_lexical(query, candidate_k)

    fused = _rrf_fuse(
        dense_chunks,
        lexical_rows,
        rrf_k=rrf_k,
        dense_weight=dense_weight,
        lexical_weight=lexical_weight,
    )
    if wanted and not strict:
        fused = _project_boost(fused, wanted)
    result = fused[:top_k]
    return _ensure_gate_anchor(result, dense_chunks, top_k)


def to_context(chunks: Sequence[RetrievedChunk]) -> list[ContextChunk]:
    """Adapt retrieved chunks into the prompt's context shape."""
    return [
        ContextChunk(source=c.source, title=c.title, content=c.content, project=c.project)
        for c in chunks
    ]


def to_source_refs(chunks: Sequence[RetrievedChunk]) -> list[dict[str, Any]]:
    """Deduped, order-preserving source references for the `sources` SSE event."""
    seen: set[str] = set()
    refs: list[dict[str, Any]] = []
    for c in chunks:
        if c.source in seen:
            continue
        seen.add(c.source)
        refs.append({"source": c.source, "title": c.title, "project": c.project})
    return refs
