-- Moderated shoutbox queue (contact page).
--
-- Additive + idempotent, layered on 001-004 (apply all in filename order).
--
-- This is the FIRST table in this backend that stores visitor-written content.
-- Everything else here is corpus text the owner wrote, or counts. Three
-- deliberate absences follow from that, and none of them is an oversight:
--
--   * No `ip` column. An IP is personal data (CJEU Breyer, C-582/14), and the
--     rate limiter already keeps addresses in memory only, never on disk. Adding
--     a column here would be the moment this backend started persisting
--     identifiers. Duplicate detection uses `body_hash` instead — a hash of the
--     normalised TEXT, which says nothing about who sent it.
--   * No `author` / `name` column. Submissions are anonymous by decision; only
--     owner replies are attributed, and the owner is not a row in this table.
--   * No `rejected` status. Rejecting DELETEs the row. Content the owner
--     declined to publish does not sit on disk waiting for a retention sweep.
--
-- Status is therefore only ever 'pending' or 'approved', and the CHECK enforces
-- that a third state cannot be introduced without editing this file and thinking
-- about the two rules above.
CREATE TABLE IF NOT EXISTS shout_queue (
    -- BIGSERIAL, not a uuid: the moderator types this id by hand into ragctl
    -- (`approve 7`). A uuid would make the primary interaction hostile.
    id          BIGSERIAL   PRIMARY KEY,
    body        TEXT        NOT NULL,
    -- sha256 of the normalised body. Carries no sender information; exists so the
    -- gate can reject a resubmission of the same text inside its window.
    body_hash   TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    -- The owner's reply, published with the message as a thread. Nullable: most
    -- messages never get one. It lives on the message row rather than in its own
    -- table because a message has at most one reply, and a join for a 0..1
    -- relation buys nothing here.
    reply       TEXT,
    replied_at  TIMESTAMPTZ
);

-- The queue listing (`ragctl queue`) reads pending oldest-first; the snapshot
-- generator reads approved newest-first. One composite index serves both.
CREATE INDEX IF NOT EXISTS shout_queue_status_created_idx
    ON shout_queue (status, created_at DESC);

-- The duplicate check is `body_hash = $1 AND created_at > $2`, so it needs the
-- hash indexed. Not UNIQUE: the same text is allowed again once the window has
-- passed, and an approved message must not block a later legitimate repeat.
CREATE INDEX IF NOT EXISTS shout_queue_body_hash_idx
    ON shout_queue (body_hash);
