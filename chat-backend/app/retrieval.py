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
        self, embedding: list[float], top_k: int
    ) -> Sequence[Mapping[str, Any]]: ...


@dataclass(frozen=True)
class RetrievedChunk:
    """One retrieved chunk plus its cosine distance (smaller = more similar)."""

    source: str
    title: str
    project: str | None
    content: str
    distance: float


# When the query names a project, pull this many * top_k candidates so that
# project's chunks are present to float up; capped so a large top_k can't end up
# scanning a big slice of the table.
_CANDIDATE_MULTIPLIER = 4
_CANDIDATE_CAP = 50


def _to_chunk(row: Mapping[str, Any]) -> RetrievedChunk:
    return RetrievedChunk(
        source=str(row["source"]),
        title=str(row["title"]),
        project=(None if row["project"] is None else str(row["project"])),
        content=str(row["content"]),
        distance=float(row["distance"]),
    )


async def retrieve(
    embedder: SupportsEmbedQuery,
    db: SupportsSearch,
    query: str,
    top_k: int,
) -> list[RetrievedChunk]:
    """Embed `query` and return its `top_k` nearest corpus chunks.

    When the query NAMES a project (see `query_projects.detect_projects`), pull a
    wider candidate set and float that project's chunks to the front before
    truncating to `top_k` — so a semantically-similar passage from a DIFFERENT
    project can't outrank the named project's own chunks (the cross-project
    contamination bug). When no project is named, this is byte-for-byte a plain
    `top_k` cosine search.
    """
    vector = embedder.embed_query(query)
    wanted = detect_projects(query)
    if not wanted:
        rows = await db.search(vector, top_k)
        return [_to_chunk(row) for row in rows]

    candidate_k = min(top_k * _CANDIDATE_MULTIPLIER, _CANDIDATE_CAP)
    rows = await db.search(vector, candidate_k)
    chunks = [_to_chunk(row) for row in rows]
    # Stable partition: db rows arrive in ascending cosine distance and list
    # comprehensions preserve that order, so within each group the most-similar
    # chunk still leads — we only lift the named project's chunks above the rest.
    matched = [c for c in chunks if c.project in wanted]
    others = [c for c in chunks if c.project not in wanted]
    return (matched + others)[:top_k]


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
