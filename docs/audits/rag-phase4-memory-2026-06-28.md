# RAG chat — Phase 4: stateful conversation memory (2026-06-28)

The foundation for progressive disclosure (Phase 5) and the context bar (Phase 6):
without it, "tell me more" / "yes" has no referent and the context bar has nothing
real to measure. The backend now remembers prior turn(s) per session and threads
them into the next prompt — bounded on every axis so it can never become an
unbounded-growth or injection vector.

## What changed

- **`app/memory.py`** — `SessionMemory`: in-process, **bounded** (≤`max_turns`
  per session via `deque(maxlen)`, ≤`max_sessions` total via `OrderedDict` LRU
  eviction, idle entries expire after `ttl`), **resettable**, stored text capped.
  Not persistent — session-scoped and cleared on restart. No lock: single worker,
  no `await` between a read and its dependent write (mirrors `ratelimit`/`usage`).
  The clock is injected (`now`), so the bounds are unit-tested deterministically.
- **`app/pipeline.py`** — an `on_answer(query, answer)` hook, awaited **only after
  a successful full stream** (never on a gate refusal, busy shed, or error), so a
  refusal is never remembered. `build_messages` is unchanged — the history seam
  already existed.
- **`app/main.py`** — `SessionMemory` in the lifespan; `ChatRequest.session_id`
  (≤200 chars); when set, server memory is the source of truth for history (else
  the client `history` field, for back-compat); the turn is recorded after a
  successful answer; new `POST /session/reset` (used by Phase 6's `/clear`).
- **`app/config.py`** — `MEMORY_MAX_TURNS` (6), `MEMORY_MAX_SESSIONS` (1000),
  `MEMORY_TTL_SECONDS` (1800), validated positive.

## Acceptance (live-proven)

| Criterion | Result |
| --- | --- |
| A follow-up turn resolves to the prior turn's topic | ✓ — the follow-up prompt carries the prior question AND answer |
| Session reset clears it | ✓ — `reset` empties the session |
| Caps and gates still fire with memory on | ✓ — the input cap, relevance gate, generative/translation gates, role filter, and output cap key on the CURRENT turn; history is bounded by `max_turns` |
| Bounded against abuse | ✓ — `max_turns` caps growth, `max_sessions` LRU-evicts, idle TTL expires, stored text is truncated, no `session_id` → no memory |

Validation: `ruff` + `mypy --strict` clean (26 files), `pytest` **258** (+19).

## Design notes

- The "yes" / "tell me more" → expand-into-narrative interpretation is **Phase 5**;
  Phase 4 only provides and threads the memory.
- In-process / single-worker — a multi-worker deployment would need shared storage
  (the same limitation the rate limiter and usage log already carry).
- `POST /session/reset` is unauthenticated by design (session ids are
  client-generated opaque tokens); it sits behind the body-size + rate-limit guard.

Stacked on Phase 3.
