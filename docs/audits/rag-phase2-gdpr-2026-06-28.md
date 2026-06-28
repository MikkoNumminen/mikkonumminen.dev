# RAG chat — Phase 2: GDPR-aware ingest-time context control (2026-06-28)

A configurable, demonstrable reference implementation of how a RAG system handles
sensitive data. The corpus itself is public portfolio content, so the policy ships
**benign** (everything `public`, one `public` role, pseudonymisation off) and the
live chat is unchanged by default; the capability is driven by a policy file
(`GDPR_POLICY_FILE`) and proven by tests + a live demonstration.

**Core principle: isolate at ingest, do not filter in front of the model.** Data
that must never reach the model is never embedded — not filtered out after
retrieval, where one bug would leak it.

## The five mechanisms

1. **Classification at ingest** (`app/gdpr.py:classify`, config rules). Every doc
   is labelled `public | internal | restricted | pii` by source-prefix and/or
   content-regex rules; the **most-closed** matching rule wins (fail safe).
2. **`pii` never embedded** (`app/indexer.py`). A pii doc yields **zero chunks** at
   plan time — it never becomes a `DocumentRow`, never reaches the vector store.
   The strongest isolation: not "filtered", never created. A doc reclassified to
   pii has its prior rows pruned.
3. **Pseudonymisation before embedding** (`app/gdpr.py:pseudonymize`). Person
   references are replaced with stable, deterministic tokens **before chunking**,
   so the token text is what gets hashed, embedded, and stored — the model only
   ever sees tokens. The reverse map lives in a separate, access-controlled table
   (`pseudonym_map`) resolved out-of-band, never via retrieval or the model.
4. **Role-based retrieval filter** (`app/db.py`, `app/retrieval.py`). Each query
   carries a server-set role; retrieval is restricted to that role's permitted
   classifications **in SQL, before any row leaves the database** — on all three
   paths (dense, lexical, and the prose-anchor). The role is decided by the server
   (`policy.default_role`), never claimed by the client.
5. **Audit log** (`app/request_log.py`). Every request records the query, the
   retrieved chunks' classifications, the requester role, and whether anything was
   gated — the compliance trail.

Plus **data residency**: the local Ollama model means sensitive classes never
leave the infrastructure; there is no third-party LLM call path. Asserted as a
validated config invariant (`validate_policy`), not just a comment.

## Acceptance proof

| Invariant | How proven |
| --- | --- |
| pii / excluded content never in the vector store | unit: a pii doc → 0 chunks at plan level (never a row) |
| restricted retrievable by a permitted role, not a non-permitted one | **live**: a public role never sees the restricted row via dense, lexical, *or* prose-anchor; all-roles does (synthetic rows, cleaned up) + unit |
| pseudonymised content embeds tokens, not raw names | unit: the stored chunk text contains the token, not the name; the mapping is captured |
| every query produces an audit entry with classifications + role | unit: `format_log_record` carries role + per-classification counts |

Validation: `ruff` clean (the only ruff finding is the pre-existing `test_usage.py`
UP017, untouched), `mypy --strict` clean (25 files), `pytest` **239 passing**
(+32). The role-filter SQL was additionally proven against the live database (above).

## Config surface

`chat-backend/gdpr-policy.example.json` demonstrates each class, the role ladder,
and a pseudonymisation pattern. Point `GDPR_POLICY_FILE` at a copy to enable; the
shipped default (no file) is benign. A malformed policy fails startup loudly
rather than silently widening access.

## Scope notes

- This is a **reference implementation**, not a certified compliance product. The
  plain-language buyer-facing companion is Phase 2b
  (`rag-phase2b-*`), which states the engineer/lawyer boundary explicitly.
- The role mechanism supports differentiation, but the public deployment pins the
  role to least-privilege `public`. An authenticated deployment would set the role
  server-side from its own auth.
- Stacked on Phase 1.
