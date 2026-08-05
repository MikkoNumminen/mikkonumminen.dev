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

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
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
    # Source genre (migration 003): 'prose' | 'code' | 'adr' (+ 'pr'/'commit'/
    # 'narrative' later). Distinct from chunk_type (which the gate anchors on) —
    # an ADR is chunk_type='prose', doc_type='adr'. `doc_date` is the source's date
    # where one exists (ADRs), else NULL. Both default so a pre-003 caller still
    # builds a valid row.
    doc_type: str = "prose"
    doc_date: date | None = None
    # Data classification (migration 004): public | internal | restricted. `pii`
    # never reaches a row — it is dropped at ingest, never embedded. The
    # role-based retrieval filter gates on this; defaults public so a pre-004
    # caller still builds a valid row.
    classification: str = "public"


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


def _filter_clause(
    params: list[object],
    projects: Sequence[str] | None,
    classifications: Sequence[str] | None,
    doc_types: Sequence[str] | None = None,
    exclude_doc_types: Sequence[str] | None = None,
    kinds: Sequence[str] | None = None,
    base: list[str] | None = None,
) -> str:
    """Build a parameterized WHERE for the optional project + classification
    filters, appending each array to `params`. Only the placeholder INDEX is
    interpolated into the SQL — values are always bound, never string-formatted.
    `base` carries conditions already keyed to existing placeholders (e.g. the
    lexical `@@` match on $1)."""
    conditions = list(base or [])
    if projects:
        params.append(list(projects))
        conditions.append(f"project = ANY(${len(params)}::text[])")
    # `classifications is None` means "no role filter" (the feature off). An EMPTY
    # list means "this role may see NOTHING" and MUST match no rows —
    # `classification = ANY('{}')` is always false. Keying on truthiness here would
    # collapse [] onto the no-filter branch and FAIL OPEN, silently returning every
    # class to a role with no permissions (a privilege-escalation inversion).
    if classifications is not None:
        params.append(list(classifications))
        conditions.append(f"classification = ANY(${len(params)}::text[])")
    # doc_type is a POSITIVE genre filter (retrieve ONLY these types, e.g.
    # 'narrative'); unlike the role filter an empty/None list means "no genre
    # restriction", so keying on truthiness is correct here.
    if doc_types:
        params.append(list(doc_types))
        conditions.append(f"doc_type = ANY(${len(params)}::text[])")
    # exclude_doc_types is a NEGATIVE genre filter (hide these types, e.g. 'adr',
    # from visitor retrieval so self-documentation doesn't crowd out project chunks).
    # NULL doc_type rows are kept — the NULL guard prevents them being accidentally
    # excluded when the column predates the doc_type migration.
    if exclude_doc_types:
        params.append(list(exclude_doc_types))
        conditions.append(
            f"(doc_type IS NULL OR doc_type <> ALL(${len(params)}::text[]))"
        )
    # kind is a POSITIVE source-kind filter (retrieve ONLY these kinds, e.g. 'cv'
    # for the CV-intent boost); like doc_types, empty/None means "no restriction".
    if kinds:
        params.append(list(kinds))
        conditions.append(f"kind = ANY(${len(params)}::text[])")
    return ("WHERE " + " AND ".join(conditions)) if conditions else ""


# Advisory-lock key for the shoutbox write path. A constant, so every submission
# serialises against every other: see `enqueue_shout_gated` for why the queue cap
# needs that and a per-hash key would not give it.
_SHOUT_WRITE_LOCK_KEY = 0x53484F55  # "SHOU"


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
                             content, content_hash, embedding, language, chunk_type,
                             doc_type, doc_date, classification)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                        ON CONFLICT (source, chunk_index) DO UPDATE SET
                            project = EXCLUDED.project,
                            title = EXCLUDED.title,
                            kind = EXCLUDED.kind,
                            content = EXCLUDED.content,
                            content_hash = EXCLUDED.content_hash,
                            embedding = EXCLUDED.embedding,
                            language = EXCLUDED.language,
                            chunk_type = EXCLUDED.chunk_type,
                            doc_type = EXCLUDED.doc_type,
                            doc_date = EXCLUDED.doc_date,
                            classification = EXCLUDED.classification
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
                        row.doc_type,
                        row.doc_date,
                        row.classification,
                    )
        return len(rows)

    async def refresh_doc_metadata(
        self,
        source: str,
        *,
        project: str | None,
        title: str,
        kind: str,
        doc_type: str,
        doc_date: date | None,
        classification: str,
    ) -> int:
        """Refresh the DOC-LEVEL columns for every stored chunk of `source`.

        A front-matter-only edit (doc_type / project / doc_date / title / kind, or a
        reclassification) leaves chunk CONTENT — and thus its content_hash —
        unchanged, so `select_chunks_to_embed` re-embeds nothing and the
        metadata-carrying `upsert_documents` never runs for that source. This UPDATE
        runs regardless, so the stored metadata always reflects the current front
        matter — e.g. tagging a post `type: research` takes effect on the next index
        with no manual SQL.

        The `IS DISTINCT FROM` guard is load-bearing, not an optimisation. Without
        it the UPDATE matches on `source` alone, so every re-index rewrites every
        row whether or not the front matter moved. Measured on the 508-row corpus:
        one no-op run doubled the heap (928 kB -> 1848 kB) and left 508 dead tuples,
        with HOT saving only 2 of 508 rows — the ~1.9 kB rows leave no same-page
        room for it. That turns an indexer documented as idempotent into per-run
        bloat.

        The guard also keeps the returned count meaningful — rows whose metadata
        ACTUALLY changed — so an unchanged corpus reports 0 and the count is a real
        signal that a front-matter edit landed, which is what the deploy runbook
        tells operators to watch. NULL-safe, hence IS DISTINCT FROM rather than `<>`
        (`doc_date` is frequently NULL).
        """
        status = await self._pool.execute(
            """
            UPDATE documents
            SET project = $2, title = $3, kind = $4, doc_type = $5,
                doc_date = $6, classification = $7
            WHERE source = $1
              AND (project, title, kind, doc_type, doc_date, classification)
                  IS DISTINCT FROM ($2, $3, $4, $5, $6, $7)
            """,
            source,
            project,
            title,
            kind,
            doc_type,
            doc_date,
            classification,
        )
        return int(status.split()[-1]) if status else 0

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

    async def has_narrative(
        self, project: str, classifications: Sequence[str] | None = None
    ) -> bool:
        """True when `project` has a precomputed narrative chunk THIS ROLE may see —
        drives the progressive-disclosure offer (never offer to expand into a
        narrative that doesn't exist or that the role can't retrieve, which would be
        an offer the expansion then can't keep). The role filter mirrors `search`:
        an empty allowed list matches nothing."""
        params: list[object] = [project]
        clause = ""
        if classifications is not None:
            params.append(list(classifications))
            clause = f" AND classification = ANY(${len(params)}::text[])"
        row = await self._pool.fetchrow(
            "SELECT 1 FROM documents WHERE doc_type = 'narrative' AND project = $1"
            + clause
            + " LIMIT 1",
            *params,
        )
        return row is not None

    async def search(
        self,
        embedding: list[float],
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
        doc_types: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
        kinds: Sequence[str] | None = None,
    ) -> list[asyncpg.Record]:
        """Return the `top_k` chunks nearest the query embedding (dense).

        `<=>` is pgvector's cosine-distance operator (per the locked decision to
        use raw SQL, not an ORM's vector support); smaller distance = more
        similar. The same `<=>` ordering lets the HNSW cosine index serve the
        query. The query vector is parameterized — never string-interpolated.

        `projects` HARD-restricts to those projects (the strict per-project
        filter). `classifications` is the GDPR role filter — when given, only rows
        in those classes are eligible, applied IN SQL so restricted data is never
        even fetched. `exclude_doc_types` hides specific genres (e.g. 'adr') from
        visitor retrieval. `kinds` restricts to specific source kinds (e.g. 'cv'
        for the CV-intent boost). All filters are built from parameterized
        placeholders; only the placeholder INDEX is interpolated into the SQL,
        never any value.
        """
        params: list[object] = [embedding, top_k]
        where = _filter_clause(
            params, projects, classifications, doc_types, exclude_doc_types, kinds
        )
        rows: list[asyncpg.Record] = await self._pool.fetch(
            f"""
            SELECT source, project, title, kind, chunk_index, content, chunk_type,
                   doc_date, classification, embedding <=> $1 AS distance
            FROM documents
            {where}
            ORDER BY embedding <=> $1
            LIMIT $2
            """,
            *params,
        )
        return rows

    async def search_lexical(
        self,
        query: str,
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
    ) -> list[asyncpg.Record]:
        """Return the `top_k` chunks ranked by full-text (lexical) relevance.

        The lexical half of hybrid retrieval: `websearch_to_tsquery` parses the
        raw user question forgivingly (no syntax errors on arbitrary punctuation
        or quotes), matched against the GENERATED `content_tsv` via `@@` and
        ordered by `ts_rank`. This catches exact identifiers — class/engine names,
        file paths — that dense embeddings blur. `projects`, `classifications`, and
        `exclude_doc_types` apply the same filters as the dense `search` (the role
        filter must gate the lexical path too, or restricted data would leak through
        it). The query text is parameterized.
        """
        params: list[object] = [query, top_k]
        match = "content_tsv @@ websearch_to_tsquery('english', $1)"
        where = _filter_clause(
            params,
            projects,
            classifications,
            exclude_doc_types=exclude_doc_types,
            base=[match],
        )
        rows: list[asyncpg.Record] = await self._pool.fetch(
            f"""
            SELECT source, project, title, kind, chunk_index, content, chunk_type,
                   doc_date, classification,
                   ts_rank(content_tsv, websearch_to_tsquery('english', $1)) AS rank
            FROM documents
            {where}
            ORDER BY rank DESC
            LIMIT $2
            """,
            *params,
        )
        return rows

    async def closest_prose(
        self,
        embedding: list[float],
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
    ) -> asyncpg.Record | None:
        """The single PROSE chunk nearest the query embedding, or None.

        The weak-retrieval gate keys on prose distance, but an off-topic query
        ("translate hello to spanish") can retrieve ONLY code chunks (coincidental
        token overlap) with no prose in the top-k — leaving the gate nothing prose
        to judge. This fetches the corpus's closest prose chunk explicitly so the
        gate always has the honest relevance signal: far prose ⇒ refuse, near
        prose ⇒ a real description grounds the answer. Returns None for a corpus
        with no prose at all (the gate then falls back to all chunks). The role
        filter (`classifications`) and `exclude_doc_types` apply here too — the
        prose anchor feeds the answer's context, so it must never surface a class
        the role can't see or a genre that's hidden from the main retrieval path.
        """
        params: list[object] = [embedding]
        where = _filter_clause(
            params,
            None,
            classifications,
            exclude_doc_types=exclude_doc_types,
            base=["chunk_type = 'prose'"],
        )
        row = await self._pool.fetchrow(
            f"""
            SELECT source, project, title, kind, chunk_index, content, chunk_type,
                   doc_date, classification, embedding <=> $1 AS distance
            FROM documents
            {where}
            ORDER BY embedding <=> $1
            LIMIT 1
            """,
            *params,
        )
        return row

    async def recent_research(
        self,
        embedding: list[float],
        top_k: int,
        classifications: Sequence[str] | None = None,
    ) -> list[asyncpg.Record]:
        """The leading chunk of each of the `top_k` NEWEST research sources.

        The deterministic coverage set for a research/recency intent (see
        `query_projects.is_research_coverage_request`): the title+abstract chunk
        (`chunk_index = 0`) of the most recent `doc_type='research'` sources by
        `doc_date`, so the guaranteed newest research reaches the model even when
        the per-project diversity cap (all research is `project='portfolio'`) would
        collapse it or cosine alone favours an older post. `doc_date` — dead weight
        everywhere else in retrieval — is the ordering key here.

        Each row carries its REAL `embedding <=> query` distance (same column shape
        as `search`, so `retrieval._to_chunk` consumes it): the injected chunks are
        prose with honest distances, so the weak-retrieval gate can only get a
        CLOSER prose signal from them, never a falsely-relaxed one (an off-topic
        "latest research on X" injects far chunks and still refuses). The role
        filter (`classifications`) applies exactly as `search`/`closest_prose`, so
        restricted research is never even fetched. `NULLS LAST` keeps a research
        post that somehow lacks a date from crowding out dated ones.
        """
        params: list[object] = [embedding, top_k]
        where = _filter_clause(
            params,
            None,
            classifications,
            doc_types=["research"],
            base=["chunk_index = 0"],
        )
        rows: list[asyncpg.Record] = await self._pool.fetch(
            f"""
            SELECT source, project, title, kind, chunk_index, content, chunk_type,
                   doc_date, classification, embedding <=> $1 AS distance
            FROM documents
            {where}
            ORDER BY doc_date DESC NULLS LAST, source
            LIMIT $2
            """,
            *params,
        )
        return rows

    async def upsert_pseudonyms(self, mapping: Mapping[str, str]) -> int:
        """Persist `{token: original}` pairs into the separate, access-controlled
        reverse store. Idempotent on the token PK. The retrieval path and the model
        never read this table — only an out-of-band resolver does — so the raw
        value is never reconstructable through the chat. Returns the pair count.
        """
        if not mapping:
            return 0
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                for token, value in mapping.items():
                    await conn.execute(
                        """
                        INSERT INTO pseudonym_map (token, value)
                        VALUES ($1, $2)
                        ON CONFLICT (token) DO UPDATE SET value = EXCLUDED.value
                        """,
                        token,
                        value,
                    )
        return len(mapping)

    async def resolve_pseudonyms(self, tokens: Sequence[str]) -> dict[str, str]:
        """Resolve tokens back to originals — the out-of-band lookup, NEVER called
        from retrieval or the pipeline. This is the only path back from a token to
        a name; it lives behind whatever access control the operator puts in front
        of it, deliberately separate from the model's reach.
        """
        if not tokens:
            return {}
        rows = await self._pool.fetch(
            "SELECT token, value FROM pseudonym_map WHERE token = ANY($1::text[])",
            list(tokens),
        )
        return {row["token"]: row["value"] for row in rows}

    # --- shoutbox ----------------------------------------------------------
    #
    # The first visitor-written content this backend stores. Three columns are
    # deliberately absent (ip, author, a rejected status) — see
    # sql/005_shoutbox.sql for why. Rejecting DELETEs, so there is no purge job
    # to forget to write.

    async def shout_duplicate_exists(self, body_hash: str, window_seconds: int) -> bool:
        """Has this exact text been submitted inside the window?

        Keys on the text hash, never on the sender, so it needs no identity to
        work. The window is computed server-side so it never trusts a client
        clock. Approved rows count too: re-sending a message that is already
        published is still a duplicate.
        """
        row = await self._pool.fetchval(
            "SELECT EXISTS (SELECT 1 FROM shout_queue "
            "WHERE body_hash = $1 AND created_at > now() - make_interval(secs => $2))",
            body_hash,
            window_seconds,
        )
        return bool(row)

    async def shout_pending_count(self) -> int:
        """Queue depth, for the backpressure limit and the notification digest."""
        row = await self._pool.fetchval(
            "SELECT count(*) FROM shout_queue WHERE status = 'pending'"
        )
        return int(row or 0)

    async def enqueue_shout(self, body: str, body_hash: str) -> int:
        """Insert a submission unconditionally and return its id.

        The id is a small integer because the moderator types it by hand
        (`approve 7`). This does NOT gate: it is the raw write, kept for the
        moderation tooling and the tests that build fixtures directly. The public
        endpoint must use `enqueue_shout_gated`, which is the only path that
        enforces the duplicate window and the queue cap atomically.
        """
        row = await self._pool.fetchval(
            "INSERT INTO shout_queue (body, body_hash) VALUES ($1, $2) RETURNING id",
            body,
            body_hash,
        )
        return int(row)

    async def enqueue_shout_gated(
        self, body: str, body_hash: str, *, window_seconds: int, max_pending: int
    ) -> tuple[int | None, str | None]:
        """Check the duplicate window and the queue cap, then insert, atomically.

        Returns `(id, None)` on insert, or `(None, reason)` where reason is
        `"duplicate"` or `"queue_full"`.

        Why a lock rather than a constraint: the obvious fix for the duplicate
        race is a UNIQUE index on `body_hash`, and sql/005_shoutbox.sql explains
        why that is wrong here. The same text IS allowed again once the window
        has passed, so uniqueness is time-scoped and a plain UNIQUE would refuse
        a legitimate resubmission forever.

        Why an advisory lock rather than `INSERT ... WHERE NOT EXISTS`: under
        READ COMMITTED, the default, two concurrent transactions can both
        evaluate NOT EXISTS against a snapshot taken before either insert, so
        both proceed. The subquery reads like a guard and is not one.

        The lock key is a constant, so every shoutbox write serialises against
        every other, not just against the same text. That is deliberate. Keying
        on the hash would let concurrent DIFFERENT texts each observe a
        below-cap count and overshoot the queue limit, which is the second half
        of the same bug. Serialising all writes costs nothing on a
        human-moderated queue capped at a couple of hundred items, and it makes
        both invariants exact instead of nearly exact.
        """
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "SELECT pg_advisory_xact_lock($1)", _SHOUT_WRITE_LOCK_KEY
                )
                duplicate = await conn.fetchval(
                    "SELECT EXISTS (SELECT 1 FROM shout_queue "
                    "WHERE body_hash = $1 "
                    "AND created_at > now() - make_interval(secs => $2))",
                    body_hash,
                    window_seconds,
                )
                if duplicate:
                    return None, "duplicate"
                pending = await conn.fetchval(
                    "SELECT count(*) FROM shout_queue WHERE status = 'pending'"
                )
                if int(pending or 0) >= max_pending:
                    return None, "queue_full"
                row = await conn.fetchval(
                    "INSERT INTO shout_queue (body, body_hash) "
                    "VALUES ($1, $2) RETURNING id",
                    body,
                    body_hash,
                )
                return int(row), None

    async def list_pending_shouts(self, limit: int = 50) -> list[asyncpg.Record]:
        """Oldest first — the queue is worked front to back."""
        return list(
            await self._pool.fetch(
                "SELECT id, body, created_at FROM shout_queue "
                "WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1",
                limit,
            )
        )

    async def approve_shout(self, shout_id: int) -> bool:
        """Mark one pending message approved. False if it was not pending.

        Guarded on `status = 'pending'` rather than id alone so approving twice
        is a no-op that reports honestly instead of silently rewriting
        `approved_at`.
        """
        result = await self._pool.execute(
            "UPDATE shout_queue SET status = 'approved', approved_at = now() "
            "WHERE id = $1 AND status = 'pending'",
            shout_id,
        )
        return str(result).endswith(" 1")

    async def reject_shout(self, shout_id: int) -> bool:
        """DELETE the row. False if there was nothing to delete.

        Deliberately destructive: content the owner declined to publish does not
        sit on disk waiting for a retention sweep that might never be written.
        There is no undo, which is the accepted cost of that.
        """
        result = await self._pool.execute(
            "DELETE FROM shout_queue WHERE id = $1", shout_id
        )
        return str(result).endswith(" 1")

    async def reply_to_shout(self, shout_id: int, reply: str) -> bool:
        """Attach the owner's reply. Only to an APPROVED message.

        The status guard is the owner-only path the brief asked for: a reply
        cannot conjure a published thread out of a pending one, so replying can
        never publish a message that was not approved on its own merits.
        """
        result = await self._pool.execute(
            "UPDATE shout_queue SET reply = $2, replied_at = now() "
            "WHERE id = $1 AND status = 'approved'",
            shout_id,
            reply,
        )
        return str(result).endswith(" 1")

    async def list_approved_shouts(self, limit: int = 200) -> list[asyncpg.Record]:
        """Newest first — the snapshot's order, so the generator does not sort."""
        return list(
            await self._pool.fetch(
                "SELECT id, body, approved_at, reply, replied_at FROM shout_queue "
                "WHERE status = 'approved' ORDER BY approved_at DESC LIMIT $1",
                limit,
            )
        )
