"""Postgres + pgvector access layer (asyncpg, raw SQL).

Deliberately not an ORM: the vector search is hand-written SQL using pgvector's
`<=>` cosine-distance operator (per the locked tech decision), and the write
path is a small reconcile that keeps re-indexing idempotent. Vectors cross the
wire via the `pgvector` codec registered on every pooled connection, so Python
`list[float]` maps straight to the `vector(384)` column.

`apply_schema` must run before `Database.connect`: the connection initializer
registers the `vector` type, which only exists once the extension is created.

Imports asyncpg / pgvector at module load; exercised against a real database,
not in the fast unit suite.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import asyncpg
from pgvector.asyncpg import register_vector


@dataclass(frozen=True)
class DocumentRow:
    """One chunk row, embedding included, ready to persist."""

    source: str
    project: str | None
    title: str
    kind: str
    chunk_index: int
    content: str
    content_hash: str
    embedding: list[float]


async def apply_schema(dsn: str, sql_path: str | Path) -> None:
    """Run the migration SQL on a single throwaway connection.

    Idempotent (the SQL is all `IF NOT EXISTS`). Runs before any pooled
    connection is opened because the pool's initializer registers the `vector`
    type, which the `CREATE EXTENSION` here is what brings into existence.
    """
    sql = Path(sql_path).read_text(encoding="utf-8")
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(sql)
    finally:
        await conn.close()


class Database:
    """Connection pool plus the handful of queries the chat backend runs."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str, *, min_size: int = 1, max_size: int = 5) -> Database:
        pool = await asyncpg.create_pool(
            dsn, min_size=min_size, max_size=max_size, init=register_vector
        )
        if pool is None:  # pragma: no cover - asyncpg only returns None on misuse
            raise RuntimeError("failed to create database pool")
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()

    async def existing_chunk_hashes(self, source: str) -> dict[int, str]:
        """`{chunk_index: content_hash}` already stored for a source.

        Drives the skip-unchanged decision: a current chunk needs re-embedding
        only when its index is absent here, or its hash differs from the stored
        one (see `indexer.select_chunks_to_embed`).
        """
        rows = await self._pool.fetch(
            "SELECT chunk_index, content_hash FROM documents WHERE source = $1",
            source,
        )
        return {row["chunk_index"]: row["content_hash"] for row in rows}

    async def upsert_documents(self, rows: Sequence[DocumentRow]) -> int:
        """Upsert chunk rows keyed by (source, chunk_index). Returns the count.

        A chunk is identified by its ordinal position within its source, so an
        edited chunk overwrites the row at that index (DO UPDATE) and two chunks
        holding identical text at different positions remain distinct rows. The
        caller passes only the chunks it chose to (re-)embed, so the row count is
        exactly the number embedded this run — DO UPDATE's command tag does not
        distinguish insert from update, so the count is taken from the input.
        """
        if not rows:
            return 0
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                for row in rows:
                    await conn.execute(
                        """
                        INSERT INTO documents
                            (source, project, title, kind, chunk_index,
                             content, content_hash, embedding)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (source, chunk_index) DO UPDATE SET
                            project = EXCLUDED.project,
                            title = EXCLUDED.title,
                            kind = EXCLUDED.kind,
                            content = EXCLUDED.content,
                            content_hash = EXCLUDED.content_hash,
                            embedding = EXCLUDED.embedding
                        """,
                        row.source,
                        row.project,
                        row.title,
                        row.kind,
                        row.chunk_index,
                        row.content,
                        row.content_hash,
                        row.embedding,
                    )
        return len(rows)

    async def delete_stale_chunks(self, source: str, chunk_count: int) -> int:
        """Prune rows for `source` left over from a longer previous version.

        Chunks are numbered 0..chunk_count-1, so any row at index >= chunk_count
        belongs to a since-shortened file and is removed. In-range rows are kept
        — `upsert_documents` already refreshed the ones whose content changed.
        Returns the number of rows deleted.
        """
        status = await self._pool.execute(
            "DELETE FROM documents WHERE source = $1 AND chunk_index >= $2",
            source,
            chunk_count,
        )
        return int(status.rsplit(" ", 1)[-1])

    async def delete_sources_absent_from(self, present_sources: Sequence[str]) -> int:
        """Delete every row whose source is no longer in the corpus.

        Handles a content file being deleted entirely between runs (its source
        never appears in the reconcile loop, so per-source pruning would miss
        it). Returns the number of rows deleted.
        """
        status = await self._pool.execute(
            "DELETE FROM documents WHERE source <> ALL($1::text[])",
            list(present_sources),
        )
        return int(status.rsplit(" ", 1)[-1])

    async def count_documents(self) -> int:
        value = await self._pool.fetchval("SELECT count(*) FROM documents")
        return int(value or 0)

    async def search(self, embedding: list[float], top_k: int) -> list[asyncpg.Record]:
        """Return the `top_k` chunks nearest the query embedding.

        `<=>` is pgvector's cosine-distance operator (per the locked decision to
        use raw SQL, not an ORM's vector support); smaller distance = more
        similar. The same `<=>` ordering lets the HNSW cosine index serve the
        query. The query vector is parameterized — never string-interpolated.
        """
        rows: list[asyncpg.Record] = await self._pool.fetch(
            """
            SELECT source, project, title, kind, chunk_index, content,
                   embedding <=> $1 AS distance
            FROM documents
            ORDER BY embedding <=> $1
            LIMIT $2
            """,
            embedding,
            top_k,
        )
        return rows
