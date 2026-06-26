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

from .usage import UsageByModel, UsageSummary

# The migration SQL lives in sql/ beside the app/ package. Kept here — the
# schema/DB concern — so both the API and the offline indexer reach it via `db`
# without the query path importing the batch-indexer module.
SQL_DIR = Path(__file__).resolve().parent.parent / "sql"
# Back-compat alias for callers/tests that name the first migration directly;
# apply_schema(dsn) now applies every file in SQL_DIR in order.
SQL_PATH = SQL_DIR / "001_init.sql"


@dataclass(frozen=True)
class DocumentRow:
    """One chunk row, embedding included, ready to persist.

    `language` and `chunk_type` (added in migration 002) carry the Workstream-B
    metadata: source chunks are `chunk_type='code'` with a `language`, markdown
    is `chunk_type='prose'` with `language=None`. Both default so a caller that
    predates the columns still constructs a valid prose row. `content_tsv` is NOT
    here — it is a GENERATED column the database derives from `content`.
    """

    source: str
    project: str | None
    title: str
    kind: str
    chunk_index: int
    content: str
    content_hash: str
    embedding: list[float]
    language: str | None = None
    chunk_type: str = "prose"


async def apply_schema(dsn: str, sql_path: str | Path | None = None) -> None:
    """Run the migration SQL on a single throwaway connection.

    With `sql_path` omitted, every `sql/*.sql` file is applied in sorted filename
    order (001 before 002, ...) so additive migrations layer correctly; a
    specific file may still be passed. Idempotent (the SQL is all `IF NOT
    EXISTS` / `ADD COLUMN IF NOT EXISTS`). Runs before any pooled connection is
    opened because the pool's initializer registers the `vector` type, which the
    `CREATE EXTENSION` in 001 is what brings into existence.
    """
    paths = sorted(SQL_DIR.glob("*.sql")) if sql_path is None else [Path(sql_path)]
    conn = await asyncpg.connect(dsn)
    try:
        for path in paths:
            await conn.execute(path.read_text(encoding="utf-8"))
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
                             content, content_hash, embedding, language, chunk_type)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (source, chunk_index) DO UPDATE SET
                            project = EXCLUDED.project,
                            title = EXCLUDED.title,
                            kind = EXCLUDED.kind,
                            content = EXCLUDED.content,
                            content_hash = EXCLUDED.content_hash,
                            embedding = EXCLUDED.embedding,
                            language = EXCLUDED.language,
                            chunk_type = EXCLUDED.chunk_type
                        """,
                        row.source,
                        row.project,
                        row.title,
                        row.kind,
                        row.chunk_index,
                        row.content,
                        row.content_hash,
                        row.embedding,
                        row.language,
                        row.chunk_type,
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

    async def record_usage(
        self, model: str, completion_tokens: int | None, latency_ms: int | None
    ) -> None:
        """Append one row to the chat_usage log (one completed generation).

        Best-effort telemetry: the answer has already streamed by the time this
        runs, so the caller wraps it — a logging failure must never surface to
        the user as a broken chat.
        """
        await self._pool.execute(
            "INSERT INTO chat_usage (model, completion_tokens, latency_ms) "
            "VALUES ($1, $2, $3)",
            model,
            completion_tokens,
            latency_ms,
        )

    async def usage_summary(self, hours: int) -> UsageSummary:
        """Aggregate the last `hours` of chat usage: totals + per-model breakdown.

        The window is computed server-side (`make_interval(hours => $1)`), so it
        never depends on the client's clock. `COALESCE(SUM(...), 0)` keeps a
        model whose rows all have NULL token counts reporting 0, not NULL.
        """
        by_model_rows = await self._pool.fetch(
            """
            SELECT model,
                   count(*)                            AS requests,
                   COALESCE(SUM(completion_tokens), 0) AS tokens
            FROM chat_usage
            WHERE ts > now() - make_interval(hours => $1)
            GROUP BY model
            ORDER BY requests DESC, model
            """,
            hours,
        )
        totals = await self._pool.fetchrow(
            """
            SELECT count(*)                            AS requests,
                   COALESCE(SUM(completion_tokens), 0) AS tokens,
                   MIN(ts)                             AS since
            FROM chat_usage
            WHERE ts > now() - make_interval(hours => $1)
            """,
            hours,
        )
        return UsageSummary(
            window_hours=hours,
            since=totals["since"] if totals else None,
            total_requests=int(totals["requests"]) if totals else 0,
            total_tokens=int(totals["tokens"]) if totals else 0,
            by_model=[
                UsageByModel(r["model"], int(r["requests"]), int(r["tokens"]))
                for r in by_model_rows
            ],
        )

    async def search(
        self,
        embedding: list[float],
        top_k: int,
        projects: Sequence[str] | None = None,
    ) -> list[asyncpg.Record]:
        """Return the `top_k` chunks nearest the query embedding (dense).

        `<=>` is pgvector's cosine-distance operator (per the locked decision to
        use raw SQL, not an ORM's vector support); smaller distance = more
        similar. The same `<=>` ordering lets the HNSW cosine index serve the
        query. The query vector is parameterized — never string-interpolated.

        When `projects` is given, the search is HARD-restricted to those projects
        (`project = ANY($3)`) — the strict per-project filter for queries that
        name a project. Omitted ⇒ search the whole corpus.
        """
        if projects:
            rows: list[asyncpg.Record] = await self._pool.fetch(
                """
                SELECT source, project, title, kind, chunk_index, content, chunk_type, chunk_type,
                       embedding <=> $1 AS distance
                FROM documents
                WHERE project = ANY($3::text[])
                ORDER BY embedding <=> $1
                LIMIT $2
                """,
                embedding,
                top_k,
                list(projects),
            )
            return rows
        rows = await self._pool.fetch(
            """
            SELECT source, project, title, kind, chunk_index, content, chunk_type,
                   embedding <=> $1 AS distance
            FROM documents
            ORDER BY embedding <=> $1
            LIMIT $2
            """,
            embedding,
            top_k,
        )
        return rows

    async def search_lexical(
        self,
        query: str,
        top_k: int,
        projects: Sequence[str] | None = None,
    ) -> list[asyncpg.Record]:
        """Return the `top_k` chunks ranked by full-text (lexical) relevance.

        The lexical half of hybrid retrieval: `websearch_to_tsquery` parses the
        raw user question forgivingly (no syntax errors on arbitrary punctuation
        or quotes), matched against the GENERATED `content_tsv` via `@@` and
        ordered by `ts_rank`. This catches exact identifiers — class/engine names,
        file paths — that dense embeddings blur. `projects` applies the same hard
        per-project filter as the dense `search`. The query text is parameterized.
        """
        if projects:
            rows: list[asyncpg.Record] = await self._pool.fetch(
                """
                SELECT source, project, title, kind, chunk_index, content, chunk_type, chunk_type,
                       ts_rank(content_tsv, websearch_to_tsquery('english', $1))
                           AS rank
                FROM documents
                WHERE content_tsv @@ websearch_to_tsquery('english', $1)
                  AND project = ANY($3::text[])
                ORDER BY rank DESC
                LIMIT $2
                """,
                query,
                top_k,
                list(projects),
            )
            return rows
        rows = await self._pool.fetch(
            """
            SELECT source, project, title, kind, chunk_index, content, chunk_type,
                   ts_rank(content_tsv, websearch_to_tsquery('english', $1)) AS rank
            FROM documents
            WHERE content_tsv @@ websearch_to_tsquery('english', $1)
            ORDER BY rank DESC
            LIMIT $2
            """,
            query,
            top_k,
        )
        return rows
