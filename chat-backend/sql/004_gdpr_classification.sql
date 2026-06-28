-- Phase 2: GDPR-aware context control.
--
-- Additive + idempotent, layered on 001-003 (apply all in filename order).

-- Every STORED chunk carries a data classification. `pii` never reaches this
-- table — it is dropped at ingest, never embedded — so in practice the column
-- holds public | internal | restricted. The role-based retrieval filter gates on
-- it; existing rows backfill to 'public' (the corpus is public portfolio content).
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'public';

-- The role filter scans by classification, so index it.
CREATE INDEX IF NOT EXISTS documents_classification_idx ON documents (classification);

-- The pseudonym reverse map — a SEPARATE, access-controlled store. Person
-- references are replaced with stable tokens BEFORE embedding; the retrieval path
-- and the model never read this table, so the raw value is never reconstructable
-- through the chat. Only an out-of-band resolver reads it. `token` is the primary
-- key (a value always maps to the same token, idempotently).
CREATE TABLE IF NOT EXISTS pseudonym_map (
    token       TEXT        PRIMARY KEY,
    value       TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
