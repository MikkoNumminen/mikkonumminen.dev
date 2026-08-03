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
Astro terminal (static) ──fetch──▶  FastAPI backend ──▶ Postgres + pgvector (dense + BM25)
                                                    └──▶ Ollama (local LLM)
Offline indexer ──embeds content + code──▶ Postgres + pgvector
Embeddings (bge-small-en-v1.5) run in-process inside the backend container.
```

Retrieval is **hybrid**: dense pgvector cosine fused with a lexical BM25-style
full-text rank (Reciprocal Rank Fusion). The corpus is **prose + code** — the
indexer pulls curated source files from the sibling project repos alongside the
markdown, with code-aware chunking that splits on function/class/method
boundaries.

The LLM is a **local Ollama** model (qwen2.5:7b by default, switchable — see
[`ragctl`](#ragctl-ops)) reached over its OpenAI-compatible
`/v1/chat/completions` via httpx. The backend is a single FastAPI + uvicorn
process; the public site exposes it through a Tailscale Funnel.

This is the complete backend — content ingestion + indexing, the
retrieval/generation API, the eval harness + guardrails + acceptance suite, and
the one-command Docker stack that runs it all locally.

> **Looking for the as-built, end-to-end tour** (live deployment, request
> lifecycle, the Tailscale Funnel path)? See [`docs/rag-chat.md`](../docs/rag-chat.md).
> This README is the developer/ops reference for running and hacking on the
> backend itself.

## Running the full stack (Docker)

The whole backend comes up with one command via the repo-root
[`docker-compose.yml`](../docker-compose.yml) + [`Makefile`](../Makefile):

```bash
make up          # db (pgvector) + ollama (GPU, pulls the default model on first run) + backend
make index       # one-time: embed the content corpus into pgvector
make eval        # retrieval hit-rate eval (sanity-check quality)
make up-public   # also start the public tunnel
make down        # stop everything — the db data and the pulled model persist in named volumes
```

`make up` starts Postgres and Ollama, pulls the default model (qwen2.5:7b) into
its volume if absent (via a one-shot `ollama-pull` service the backend waits on),
then starts the FastAPI backend on `http://localhost:8000`. A bare
`docker compose up` does the same — the model pull is wired into the dependency
graph, not just `make`. Day-to-day, the stack is driven by [`ragctl`](#ragctl-ops)
rather than raw `make`/`docker` commands.

**Prerequisite — GPU in Docker:** the `ollama` service needs the GPU, which
requires [`nvidia-container-toolkit`](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
on the host. On Windows that is installed inside WSL2. This is the one piece of
host setup; Postgres and the model are provisioned by `make up`.

**Pointing the frontend at it.** The contact-page terminal's RAG integration
reads the backend URL from the build-time `PUBLIC_CHAT_API_URL` env var — unset →
the terminal stays scripted-only with no chat affordance (build brief constraint
5). To point the built site at a running backend, set the var at build time:

```bash
PUBLIC_CHAT_API_URL=http://localhost:8000 npm run build       # local
PUBLIC_CHAT_API_URL=/api/rag npm run build                     # live, proxied to the tunnel by Vercel rewrites (ADR 0012)
```

When the stack + tunnel are down, the terminal degrades to scripted-only with no
visual change.

## What's here

| Path                                             | Role                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/config.py`                                  | Env-driven settings (one object for the whole service).                                                                                                                                                                                                |
| `app/content.py`                                 | Loads the curated corpus into typed docs — `content/**/*.md` prose **and** curated source under `content/code/<project>/`.                                                                                                                             |
| `app/chunking.py`                                | Markdown-aware chunking for prose; `chunk_code` splits source by function/class/method boundary (keeps decorators/attributes with the def, line-window fallback). Stable content hash per chunk; per-chunk `language` + `chunk_type` (prose\|code).    |
| `app/embeddings.py`                              | In-process `bge-small-en-v1.5` embeddings via fastembed.                                                                                                                                                                                               |
| `app/db.py`                                      | Postgres + pgvector access (asyncpg, raw SQL): dense cosine `search`, lexical `search_lexical` (`websearch_to_tsquery` + `ts_rank`), and `closest_prose` (explicit nearest prose chunk for the gate).                                                  |
| `app/indexer.py`                                 | The offline indexer — `python -m app.indexer`.                                                                                                                                                                                                         |
| `app/retrieval.py`                               | Hybrid retrieval: dense + lexical lists fused with Reciprocal Rank Fusion, hard per-project filter (fails open). `HYBRID_ENABLED=false` reverts to pure dense.                                                                                         |
| `app/prompts.py`                                 | Grounded prompt assembly (the guardrail system prompt).                                                                                                                                                                                                |
| `app/llm.py`                                     | Streaming chat client for the local Ollama model (OpenAI-compatible `/v1/chat/completions`), with the concurrency semaphore + `num_predict` cap.                                                                                                       |
| `app/pipeline.py`                                | The `/chat` event stream: task gates → hybrid retrieve + filter → prose gate → prompt → stream → SSE.                                                                                                                                                  |
| `app/main.py`                                    | FastAPI app — `POST /chat` (SSE) + `GET /health` + `GET /usage` + rate-limit/size guard.                                                                                                                                                               |
| `app/guardrails.py`                              | Weak-retrieval gate (anchored on the best **prose**-chunk distance) + deterministic pre-retrieval task gates: `is_generative_request` (poem/story/song/joke) and `is_translation_request` (translate X to Y). Deterministic refusal, no hallucination. |
| `app/ratelimit.py`                               | Per-IP sliding-window rate limiter.                                                                                                                                                                                                                    |
| `sql/001_init.sql`                               | pgvector extension + the `documents` table (`vector(384)`).                                                                                                                                                                                            |
| `sql/002_hybrid_retrieval.sql`                   | Adds `language` + `chunk_type` columns, a GENERATED `content_tsv` tsvector + GIN index (backfilled) — the lexical half of hybrid retrieval.                                                                                                            |
| `evals/run_eval.py`                              | Retrieval hit-rate runner (`python -m evals.run_eval`).                                                                                                                                                                                                |
| `evals/acceptance.py`                            | Black-box containment contract suite (`python -m evals.acceptance`).                                                                                                                                                                                   |
| `ragctl.py`                                      | The ops CLI + REPL. Stack: `status` / `watch` / `doctor` / `up` / `down` / `test` / `model` / `english` / `usage` / `logs` / `prune` / `watchdog`. Shoutbox: `queue` / `approve` / `reject` / `reply` / `publish`.                                      |
| `app/moderate.py`                                | Moderation actions, run inside the container by `ragctl`. Deliberately not an HTTP route: the funnel exposes every route on this app unauthenticated.                                                                                                  |
| `tests/`                                         | Pure-logic unit tests (chunking, content, config, prompts, retrieval, pipeline, llm, health, guardrails, ratelimit, scoring).                                                                                                                          |
| `Dockerfile`                                     | The backend image (indexer + API; non-root, GPU not needed here).                                                                                                                                                                                      |
| [`../docker-compose.yml`](../docker-compose.yml) | The whole stack: db + ollama (GPU) + backend + optional public tunnel.                                                                                                                                                                                 |
| [`../Makefile`](../Makefile)                     | `make up` / `index` / `eval` / `up-public` / `down`.                                                                                                                                                                                                   |

The corpus itself lives in the repo-root [`content/`](../content/) folder:
markdown prose (one file per project, `cv.md`, selected posts) **plus** curated
source under `content/code/<project>/` — 55 architecture-defining files
(`py`, `ts`, `tsx`, `js`, `cs`, `astro`, `sql`, `prisma`, + config) pulled from
the sibling project repos so deep-code questions answer from real source. The
indexer prose-chunks the markdown and code-chunks the source (function/class/
method boundaries; line-window fallback). `content/code/` is corpus data, not
site code, so it's excluded from `tsconfig`/`eslint`/`prettier`.

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

> The indexer can also run against any Postgres+pgvector you point `DATABASE_URL`
> at, outside the Compose stack.

## API

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000   # the default container command
```

### `GET /health`

Reports liveness of the DB and the LLM. The LLM check sends a **1-token
completion** — it confirms the model actually _generates_, not merely that the
process is up — which is the signal the frontend uses to gate free chat.

```json
{ "status": "ok", "checks": { "db": true, "llm": true }, "model": "qwen2.5:7b" }
```

`status` is `ok` only when both checks pass; otherwise `degraded`. The response
is always `200` — the frontend reads `checks.llm`, not the status code. `model`
reflects whatever Ollama model is currently selected (switchable via `ragctl`).

### `GET /usage`

Lightweight counters for the running process (request totals, gate decisions,
busy-shed counts) — a cheap operational read while the tunnel is open. Not
authenticated; it exposes no content, only aggregate numbers.

### `POST /chat`

Body: `{ "message": "...", "history": [] }` (`history` optional). The full
pipeline, in order:

1. **Input cap** — `message` longer than `INPUT_MAX_CHARS` (default 800) is
   rejected with HTTP `400`; a Pydantic `max_length=4000` backstop returns `422`,
   and a `MAX_BODY_BYTES` (default 16384) byte cap is enforced in ASGI
   middleware before the body is even parsed.
2. **Pre-retrieval task gates** — deterministic refusals that run _before_ any
   retrieval: `is_generative_request` declines "write me a poem/story/song/joke",
   `is_translation_request` declines "translate X to Y". These are task requests
   that often name on-corpus topics, which the small model would otherwise perform.
3. **Embed** the query (bge-small, asymmetric query prefix).
4. **Retrieve** the top-`TOP_K` (default 6) chunks via **hybrid** search — dense
   pgvector cosine fused with lexical BM25-style full-text rank (RRF). A hard
   per-project filter (`PROJECT_FILTER_STRICT`, default on) restricts to a
   query-named project, failing **open** (if the named project returns nothing,
   the gate still sees the true global best). `HYBRID_ENABLED=false` → pure dense.
5. **Project-aware re-rank** — the soft fallback when the hard filter is off
   (`PROJECT_FILTER_STRICT=false`): a named project's chunks float to the front
   without dropping the rest.
6. **Weak-retrieval gate** — anchored on the best **prose**-chunk distance
   (code chunks lower off-topic distances, so gating on prose keeps off-topic
   queries that only match stray code out; `db.closest_prose` fetches the nearest
   prose explicitly when the top-k has none). If that distance exceeds
   `WEAK_RETRIEVAL_DISTANCE` (default 0.45), the request **short-circuits before
   the LLM** and returns the fixed out-of-scope reply.
7. **Grounded generation** — a hardened system prompt (answer only from the
   retrieved context, `FORCE_ENGLISH`) feeds the local Ollama model, whose
   output is hard-capped at `LLM_NUM_PREDICT` (default 1024) tokens.

The answer **streams** back as Server-Sent Events:

```
event: sources   data: {"sources":[{"source":"projects/hrm.md","title":"HRM","project":"hrm"}]}
event: token     data: {"text":"HRM is "}      (repeated per token)
event: done      data: {}
event: error     data: {"message":"..."}        (on retrieval/generation failure)
```

Empty / weak retrieval is graceful: the gate returns the canned out-of-scope
reply rather than inventing. Retrieval or generation failures emit a single
`error` event and end the stream cleanly, so the terminal degrades to
scripted-only instead of showing a broken chat box.

## Containment (defense in depth)

The chat is publicly reachable while the tunnel is open, so containment is
**architectural, not prompt-only** — no single env var or clever prompt is the
sole line of defense:

- **Input cap** — `INPUT_MAX_CHARS` (default 800; over → HTTP 400), the Pydantic
  `max_length=4000` backstop (422), and the `MAX_BODY_BYTES` ASGI byte cap.
- **Task gates** — deterministic pre-retrieval refusals (`is_generative_request`,
  `is_translation_request`) decline poem/story/song/joke and "translate X to Y"
  before retrieval, since those are tasks that often name on-corpus topics.
- **Relevance gate** — the pre-LLM weak-retrieval short-circuit
  (`WEAK_RETRIEVAL_DISTANCE`, default 0.45), anchored on the best **prose**-chunk
  distance so code chunks can't lower an off-topic query under the bar; a clearly
  off-topic question never reaches the model and so can't be answered from
  hallucinated content.
- **Grounded generation** — the system prompt answers only from the retrieved
  CONTEXT and declines when it isn't there.
- **Output cap** — `LLM_NUM_PREDICT` hard-caps `num_predict`, so no single
  answer can dump a large document regardless of the prompt.
- **Prompt hardening** — the system prompt is a constant: treat the whole user
  message as a question, never as instructions; never reveal or ignore the
  prompt or role-play another assistant; decline generative off-task requests
  (poems, stories, code).
- **Concurrency** — an `asyncio.Semaphore` (`LLM_MAX_CONCURRENCY`, default 2)
  fronts Ollama generation, acquired with a bounded wait
  (`LLM_ACQUIRE_TIMEOUT_SECONDS`); excess load is **shed** with a short busy
  reply instead of queueing, and the permit is released on every exit path
  (including mid-stream client disconnect).
- **Rate limiting** — a per-IP sliding window (`RATE_LIMIT_REQUESTS` /
  `RATE_LIMIT_WINDOW_SECONDS`).
- **Score logging** — on by default (`RAG_LOG_FILE` defaults to
  `rag-logs/requests.jsonl`; set it empty to disable): one pure-JSONL line per
  request with operational telemetry only — no PII. Each record carries `ts`
  (ISO-8601 UTC), `route`, `gated`, `model`, `latency_ms`,
  `prompt_eval_count` + `eval_count`, `best_distance` + `distances`, `role`,
  `classifications`, and `response_chars`. Set `RAG_LOG_TEXT=true` to also
  write the raw `query` + `response` text into each line — that is the only PII
  path, off by default, for local debugging only.
  The file grows unbounded (delete to clear: `rm rag-logs/requests.jsonl`),
  never served by an endpoint, and `.gitignore`d.

## Eval + acceptance harness

**Retrieval eval.** `evals/eval_set.json` holds 58 questions with the source(s)
that must be retrieved (plus out-of-corpus questions that should be refused). The
runner measures retrieval hit-rate and prints a PASS/FAIL table — the credibility
metric for the RAG layer and the lever for tuning `WEAK_RETRIEVAL_DISTANCE`.
Switching dense → hybrid retrieval moved measured hit-rate **+0.059** on this set.

```bash
docker compose run --rm backend python -m app.indexer       # index first
docker compose run --rm backend python -m evals.run_eval
docker compose run --rm backend python -m evals.run_eval --min-hit-rate 0.8
```

**Acceptance harness.** `evals/acceptance.py` is a black-box **containment
contract** suite run against a _running_ backend: injection no-dump,
prompt-reveal blocked, off-topic poem + trivia declined, the input cap (400) and
oversized body (422), and grounded technical answers (answered from the actual
source under `content/code/`). It runs **27 cases** — **11 static** contract
cases written here, plus **16 golden** must-refuse queries pulled live from
`eval_set.json`, so the eval set stays the single source of adversarial truth
and a refusal case added there is automatically asserted against the live model.
Containment holds _and_ extends with the code-enriched corpus: off-topic
code-chunk leaks, poem, and translate tasks all refuse. The classifiers are
anchored on the real refusal wording so a regression can't false-pass.

Those three counts are asserted by `tests/test_doc_counts.py` — prose that
states a number the code disagrees with fails the suite. This paragraph had
drifted by a factor of three before that guard existed, far enough that an agent
following it could not tell whether the doc or the harness was broken. Run it
against a live stack:

```bash
make up                                                     # backend on :8000
python -m evals.acceptance                                  # hits http://localhost:8000 by default
```

## Configuration

All configuration is environment-driven and validated at startup; see
[`.env.example`](.env.example) for the full list. Every knob below is an env var:

| Env var                       | Default                         | Meaning                                                                                                             |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `TOP_K`                       | `6`                             | How many chunks hybrid retrieval pulls.                                                                             |
| `HYBRID_ENABLED`              | `true`                          | Hybrid dense+lexical retrieval; `false` reverts to pure dense cosine.                                               |
| `RRF_K`                       | `60`                            | Reciprocal Rank Fusion constant (`weight / (RRF_K + rank)`).                                                        |
| `RETRIEVAL_DENSE_WEIGHT`      | `1.0`                           | RRF weight on the dense (cosine) result list.                                                                       |
| `RETRIEVAL_LEXICAL_WEIGHT`    | `1.0`                           | RRF weight on the lexical (BM25-style full-text) result list.                                                       |
| `PROJECT_FILTER_STRICT`       | `true`                          | Hard per-project retrieval filter; fails **open** if the named project is empty.                                    |
| `WEAK_RETRIEVAL_DISTANCE`     | `0.45`                          | Best **prose**-distance threshold for the pre-LLM out-of-scope gate.                                                |
| `LLM_NUM_PREDICT`             | `1024`                          | Hard `num_predict` cap on generated tokens (output cap).                                                            |
| `INPUT_MAX_CHARS`             | `800`                           | Max `message` length; over → HTTP 400.                                                                              |
| `LLM_MAX_CONCURRENCY`         | `2`                             | Semaphore permits around Ollama generation.                                                                         |
| `LLM_ACQUIRE_TIMEOUT_SECONDS` | (must be `> 0`)                 | Bounded wait for a permit; on timeout the request is shed with a busy reply.                                        |
| `RAG_LOG_FILE`                | `rag-logs/requests.jsonl`       | Path for per-request JSONL score log; set empty to disable.                                                         |
| `RAG_LOG_TEXT`                | `false`                         | Also writes raw query + answer text into each log line — PII, off by default, for local debugging only.             |
| `MAX_BODY_BYTES`              | `16384`                         | ASGI request-body byte cap (oversized → rejected before parse).                                                     |
| `RATE_LIMIT_REQUESTS`         | `30`                            | Requests allowed per IP per window.                                                                                 |
| `RATE_LIMIT_WINDOW_SECONDS`   | `60`                            | Sliding-window length for the rate limiter.                                                                         |
| `FORCE_ENGLISH`               | on                              | Force the model to answer in English regardless of query language.                                                  |
| `CORS_ALLOW_ORIGINS`          | —                               | Allowed origins for the browser fetch.                                                                              |
| chunk-size knobs              | ~480 max / 100 min / 60 overlap | Token budget for markdown-block chunking (indexer side); code is split on function/class/method boundaries instead. |

The load-bearing invariant: the indexer and the query path must use the **same**
`EMBEDDING_MODEL` / `EMBEDDING_DIM`, and that dimension must match the
`vector(N)` column in `sql/001_init.sql`. A mismatch returns silent garbage
rather than failing loudly, so the dimension is locked to bge-small's 384.

## `ragctl` (ops)

Day-to-day operation goes through the `ragctl` REPL
([`ragctl.py`](ragctl.py)) rather than raw `make`/`docker`:

| Command       | Does                                                 |
| ------------- | ---------------------------------------------------- |
| `status`      | Stack + model + health at a glance.                  |
| `up` / `down` | Bring the stack up / take it down.                   |
| `doctor`      | Diagnose a sick stack (GPU, DB, model, tunnel).      |
| `model`       | Show / switch the Ollama model (qwen2.5:7b default). |
| `english`     | Toggle the `FORCE_ENGLISH` behavior.                 |
| `usage`       | Token / request counts over the last N hours.        |
| `logs`        | Recent questions + answers from the request log.     |
| `prune`       | Reclaim docker disk (build cache, dead containers).  |
| `watchdog`    | Guard the public path, recover a stale funnel.       |

Shoutbox moderation (contact page). These live here rather than on the FastAPI
app because the Tailscale Funnel proxies the whole backend origin and no route
there is authenticated — an approve endpoint would be a publicly reachable way to
publish to the site. `ragctl` has no listener, so it is unreachable by
construction.

| Command             | Does                                                          |
| ------------------- | ------------------------------------------------------------- |
| `queue`             | List messages waiting for review, oldest first.                |
| `approve <id>`      | Publish one message, then rewrite the snapshot.                |
| `reject <id>`       | Delete one message. No category, no explanation, no undo.      |
| `reply <id> "text"` | Owner reply on an **approved** message, then rewrite.          |
| `publish`           | Rewrite `public/data/shoutbox.json` from the approved rows.    |

The snapshot is a **committed artifact**: the site serves it from the CDN and
never reads this machine. Approving writes the file into the working tree — it
goes live when you commit and push, not before.

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
The end-to-end **containment contract** is covered separately by the acceptance
harness against a running backend — see
[Eval + acceptance harness](#eval--acceptance-harness).

### Lint / type-check

```bash
ruff check .
mypy app evals ragctl.py
```

Exactly what CI runs, in the same order — the point of this block is that a green
local run means a green CI run.

**`ruff format` is deliberately not part of the gate.** Running it today would
rewrite 23 files and 463 lines, and several of those rewrites make the code
worse: it explodes a deliberately compact stop-word set into one word per line
and reflows Finnish user-facing strings mid-sentence. `ruff check` is this
repo's linter; `ruff format` has never been adopted as its style authority, and
adopting one is a decision to take on its own merits rather than a gap to close
quietly. If it is ever adopted, do it in a standalone formatting-only commit so
the reformat is reviewable separately from behaviour.
