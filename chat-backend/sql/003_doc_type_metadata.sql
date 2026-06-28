-- Phase 1: richer source-genre metadata for corpus expansion.
--
-- Additive and idempotent (every statement is IF NOT EXISTS / guarded), layered
-- on top of 001+002 — apply all in filename order on startup.
--
-- `doc_type` is the SOURCE GENRE (prose | code | pr | commit | adr | narrative),
-- distinct from `chunk_type` (prose | code) which the weak-retrieval gate anchors
-- on and must keep its two values. A design note ingested in Phase 1 is
-- chunk_type='prose' (so the gate treats it as prose) AND doc_type='adr' (so
-- retrieval/UX can later target the genre). `doc_date` carries the source's date
-- where one exists (ADRs have an explicit Date line; older prose/code rows stay
-- NULL).

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'prose';

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS doc_date date;

-- Backfill rows indexed before doc_type existed: everything was prose markdown
-- or code, so a code chunk must read 'code', not the 'prose' default. Guarded by
-- `doc_type = 'prose'` so it only touches not-yet-backfilled rows and is a no-op
-- on re-run; it never overwrites a genre the indexer set (adr/narrative are
-- chunk_type='prose' or carry their own doc_type, so this WHERE skips them).
UPDATE documents
    SET doc_type = 'code'
    WHERE chunk_type = 'code' AND doc_type = 'prose';

-- Genre filtering (Phase 3 targets doc_type='narrative'; UX may surface 'adr')
-- scans by doc_type, so index it — cheap to carry, keeps those lookups flat.
CREATE INDEX IF NOT EXISTS documents_doc_type_idx ON documents (doc_type);
