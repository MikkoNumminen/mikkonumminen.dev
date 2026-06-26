-- Workstream B: hybrid (lexical + dense) retrieval + richer chunk metadata.
--
-- Additive and idempotent (every statement is IF NOT EXISTS), layered on top of
-- 001 — apply both on startup in filename order. Existing rows backfill with no
-- indexer involvement:
--   * chunk_type defaults to 'prose' (everything indexed before Workstream B was
--     markdown prose);
--   * content_tsv is a GENERATED STORED column, so Postgres computes the lexical
--     vector for every present and future row directly from `content`. Keeping it
--     database-maintained means the write path can never forget to refresh it and
--     it stays consistent with the text by construction.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS language text;

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS chunk_type text NOT NULL DEFAULT 'prose';

-- Lexical search vector, maintained by the database from `content`.
-- `to_tsvector('english', content)` is immutable (literal regconfig), which is
-- what lets it back a GENERATED column. The lexical half of hybrid retrieval
-- ranks on this via websearch_to_tsquery + ts_rank.
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
        GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for the @@ / ts_rank lexical lookups, the lexical counterpart to the
-- HNSW cosine index in 001. Cheap to carry; keeps lexical latency flat as the
-- corpus grows to include source code.
CREATE INDEX IF NOT EXISTS documents_content_tsv_idx
    ON documents USING gin (content_tsv);

-- Per-project filtering (hard filter when the query names a project) scans by
-- `project`; 001 already indexes `source` but not `project`, so add it.
CREATE INDEX IF NOT EXISTS documents_project_idx ON documents (project);
