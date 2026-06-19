-- Schema for the portfolio RAG chat backend.
--
-- Idempotent (every statement is IF NOT EXISTS), so the indexer and the API can
-- both run it on startup without coordination.
--
-- The vector dimension is locked to 384 — the output size of bge-small-en-v1.5
-- (see config.EMBEDDING_DIM). Swapping the embedding model to a different
-- dimension is a breaking change that requires a new migration and a full
-- re-index, not just an env tweak: the column type below would no longer match
-- what the model emits.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source        TEXT        NOT NULL,   -- content-dir-relative path, e.g. projects/hrm.md
    project       TEXT,                   -- project id this chunk is about (nullable)
    title         TEXT        NOT NULL,
    kind          TEXT        NOT NULL,   -- project | cv | post
    chunk_index   INTEGER     NOT NULL,   -- ordinal of this chunk within its source
    content       TEXT        NOT NULL,
    content_hash  TEXT        NOT NULL,   -- sha256 of `content`; drives idempotent re-index
    embedding     vector(384) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A chunk's identity is its ordinal position within its source file (the
    -- N-th chunk of projects/hrm.md), NOT its text. The stored content_hash
    -- drives the skip-unchanged decision at re-index time but is deliberately
    -- absent from the key: keying on the hash would silently collapse two
    -- chunks that happen to hold identical text at different positions into one
    -- row. Re-index upserts by this key (INSERT ... ON CONFLICT DO UPDATE).
    CONSTRAINT documents_source_chunk_key UNIQUE (source, chunk_index)
);

-- HNSW index for cosine distance, matching the `<=>` operator the retrieval
-- query uses. The corpus is small enough that an exact sequential scan would be
-- fine today; the index keeps query latency flat as content grows and costs
-- nothing to carry now.
CREATE INDEX IF NOT EXISTS documents_embedding_cosine_idx
    ON documents USING hnsw (embedding vector_cosine_ops);

-- Lookups during re-index filter by source ("what hashes already exist for this
-- file?"), so an index on source pays for itself on every run.
CREATE INDEX IF NOT EXISTS documents_source_idx ON documents (source);
