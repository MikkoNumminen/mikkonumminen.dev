# Portfolio RAG chat backend

A small, fully local retrieval-augmented-generation service that answers
free-form questions about the portfolio from Mikko's own curated content. It is
a **separate service** the static Astro site calls over HTTPS — the site itself
stays fully static (see [ADR 0009](../docs/decisions/0009-rag-chat-backend.md)),
and the chat is progressive enhancement: when this backend is down, the terminal
behaves exactly as it does today.

Everything runs on Mikko's own machine via Docker Compose — **no hosted model,
no paid API, no cloud database, nothing per query, ever.**

```
Astro terminal (static) ──fetch──▶  FastAPI backend ──▶ Postgres + pgvector
                                                    └──▶ Ollama (gemma4:e4b)
Offline indexer ──embeds content──▶ Postgres + pgvector
Embeddings (bge-small-en-v1.5) run in-process inside the backend container.
```

This document covers **Phase 1 — content ingestion + indexing**. The retrieval/
generation API, the eval harness, and the one-command Docker stack arrive in
later phases.

## What's here

| Path | Role |
| --- | --- |
| `app/config.py` | Env-driven settings (one object for the whole service). |
| `app/content.py` | Loads the curated `content/` corpus into typed docs. |
| `app/chunking.py` | Markdown-aware chunking + a stable content hash per chunk. |
| `app/embeddings.py` | In-process `bge-small-en-v1.5` embeddings via fastembed. |
| `app/db.py` | Postgres + pgvector access (asyncpg, raw SQL). |
| `app/indexer.py` | The offline indexer — `python -m app.indexer`. |
| `sql/001_init.sql` | pgvector extension + the `documents` table (`vector(384)`). |
| `tests/` | Pure-logic unit tests (chunking, content, config). |

The corpus itself lives in the repo-root [`content/`](../content/) folder
(one markdown file per project, `cv.md`, and selected posts).

## Re-indexing

The corpus is static and changes rarely, so indexing is a **one-time offline
job**, not part of any deploy. Re-running is idempotent: each chunk is keyed by
its content hash, so unchanged content is neither re-embedded nor re-written, and
chunks that changed or were removed are pruned.

```bash
# Preview the chunk plan — no database, no model download. Fast sanity check
# after editing content.
docker compose run --rm backend python -m app.indexer --dry-run

# Index for real (embeds new/changed chunks, prunes stale ones).
docker compose run --rm backend python -m app.indexer
```

Output reports `N file(s), M chunk(s) (E embedded, S unchanged, D pruned) - T rows in DB`.
A run with no content changes embeds nothing and writes nothing.

> The `docker compose` wrapper and the `db` / `ollama` services land in Phase 5.
> Until then the indexer runs against any Postgres+pgvector you point
> `DATABASE_URL` at.

## Configuration

All configuration is environment-driven; see [`.env.example`](.env.example) for
the full list with defaults. The load-bearing invariant: the indexer and the
query path must use the **same** `EMBEDDING_MODEL` / `EMBEDDING_DIM`, and that
dimension must match the `vector(N)` column in `sql/001_init.sql`. A mismatch
returns silent garbage rather than failing loudly, so the dimension is locked to
bge-small's 384.

## Development

```bash
cd chat-backend
python -m venv .venv && . .venv/bin/activate      # (Windows: .venv\Scripts\activate)
pip install -e ".[dev]"
```

### Tests

The pure-logic suite (chunking, content loading, config) has no heavy
dependencies and runs anywhere:

```bash
python -m pytest                 # from chat-backend/
```

The database- and model-backed paths (`app/db.py`, `app/embeddings.py`) are
exercised against the live Docker stack rather than mocked into the fast suite.

### Lint / type-check

```bash
ruff check . && ruff format --check .
mypy app
```
