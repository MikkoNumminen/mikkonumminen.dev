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


async def retrieve(
    embedder: SupportsEmbedQuery,
    db: SupportsSearch,
    query: str,
    top_k: int,
) -> list[RetrievedChunk]:
    """Embed `query` and return its `top_k` nearest corpus chunks."""
    vector = embedder.embed_query(query)
    rows = await db.search(vector, top_k)
    return [
        RetrievedChunk(
            source=str(row["source"]),
            title=str(row["title"]),
            project=(None if row["project"] is None else str(row["project"])),
            content=str(row["content"]),
            distance=float(row["distance"]),
        )
        for row in rows
    ]


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
