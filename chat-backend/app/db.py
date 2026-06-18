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

    async def existing_hashes(self, source: str) -> set[str]:
        """Content hashes already stored for a source — the skip set."""
        rows = await self._pool.fetch(
            "SELECT content_hash FROM documents WHERE source = $1", source
        )
        return {row["content_hash"] for row in rows}

    async def insert_documents(self, rows: Sequence[DocumentRow]) -> int:
        """Insert chunk rows, skipping any whose (source, content_hash) exists.

        Returns the number of rows actually inserted. `ON CONFLICT DO NOTHING`
        on the unique (source, content_hash) key makes a concurrent or repeated
        insert a no-op rather than an error.
        """
        if not rows:
            return 0
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                inserted = 0
                for row in rows:
                    status = await conn.execute(
                        """
                        INSERT INTO documents
                            (source, project, title, kind, chunk_index,
                             content, content_hash, embedding)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (source, content_hash) DO NOTHING
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
                    # asyncpg returns e.g. "INSERT 0 1"; the trailing count is 0
                    # when the conflict clause skipped the row.
                    if status.rsplit(" ", 1)[-1] == "1":
                        inserted += 1
                return inserted

    async def delete_stale(self, source: str, keep_hashes: Sequence[str]) -> int:
        """Delete rows for `source` whose hash is not in `keep_hashes`.

        This is the other half of idempotent re-indexing: chunks that changed or
        were removed from the source file get their old rows pruned. Returns the
        number of rows deleted.
        """
        status = await self._pool.execute(
            "DELETE FROM documents WHERE source = $1 AND content_hash <> ALL($2::text[])",
            source,
            list(keep_hashes),
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
