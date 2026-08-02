---
name: rag-backend
description: Architecture map for the local RAG chat backend (chat-backend/) — the FastAPI + Ollama + pgvector stack, the exact /chat pipeline order, the app/ file map, every config knob with defaults, the containment layers, the corpus + re-index runbook, and the operational gotchas. Read this before working on the RAG backend instead of re-deriving the architecture from scratch.
---

# RAG backend reference

The `/contact` terminal's chat is a **fully local retrieval-augmented-generation** service in [`chat-backend/`](chat-backend/). This skill is the pre-gathered map — read it instead of re-mapping the backend (which costs ~300k tokens of parallel reading). Deep references when you need them: [`docs/rag-chat.md`](docs/rag-chat.md) (as-built tour + config table), ADRs [0009](docs/decisions/0009-rag-chat-backend.md)/[0010](docs/decisions/0010-rag-containment.md)/[0011](docs/decisions/0011-hybrid-retrieval-and-code-corpus.md), [`chat-backend/README.md`](chat-backend/README.md) (dev/ops), [`AGENTS.md`](AGENTS.md) (agent guide).

## WHERE THINGS ACTUALLY ARE (read this first)

**The running system is not in this repository.** This checkout is the source. The live stack, its `.env`, its containers and its logs all live inside WSL, in a separate clone. Every path in this section is a WSL path.

| What | Where | Notes |
| --- | --- | --- |
| Live clone | `~/mikkonumminen.dev` (`/home/vandroy/mikkonumminen.dev`) | NOT the Windows `D:` checkout, which can lag |
| Live config | `~/mikkonumminen.dev/.env` | Overrides `.env.example`. See the drift warning below. |
| **Request log** | `~/mikkonumminen.dev/rag-logs/requests.jsonl` | **Repo root, NOT `chat-backend/rag-logs/`** |
| `RAG_LOG_FILE` value | `/srv/rag-logs/requests.jsonl` | That is the path **inside the container**. There is no `/srv` on the host; it is bind-mounted from the row above. Reading the env var and going looking for that path is the trap. |
| Corpus | `~/mikkonumminen.dev/content/` | Bind-mounted read-only into the container |

### Reaching it from Windows

Claude Code runs on the Windows side. WSL interop works, so there is no need to ask a human to run commands by hand:

```bash
wsl.exe -e bash -lc 'cd ~/mikkonumminen.dev && wc -l rag-logs/requests.jsonl'
wsl.exe -e bash -lc 'cd ~/mikkonumminen.dev && grep -E "^LLM_MODEL|^FORCE_ENGLISH" .env'
wsl.exe -e bash -lc 'cd ~/mikkonumminen.dev && docker ps --format "{{.Names}} {{.Status}}"'
```

Gotchas that will otherwise cost a round of guessing:

- UNC paths of the `wsl.localhost` or `wsl$` form do **not** resolve from Git Bash. Use `wsl.exe`.
- WSL interop eats `$VAR` and `$$` when the command crosses from Windows. Prefer single-quoted `bash -lc` bodies, and pipe Python in through a quoted heredoc (`<<PYEOF`).
- Windows drives are visible from WSL under `/mnt/`, so a script written to `D:\tmp\x.py` runs as `python3 /mnt/d/tmp/x.py`. That is the easiest way to run a non-trivial analysis against the log.

### The live config drifts from this repo's defaults

Read the real `.env` before reasoning about behaviour. As of 2026-07-31 the live values differ from both `.env.example` and the config table further down this file:

| Knob | Repo default | Live |
| --- | --- | --- |
| `LLM_MODEL` | `qwen2.5:7b` | `hf.co/mradermacher/Llama-Poro-2-8B-Instruct-GGUF:Q4_K_M` (Poro, Finnish) |
| `FORCE_ENGLISH` | `true` | `0` |
| `RAG_LOG_TEXT` | `false` | `1` (query and answer text logged, truncated; still no IP and no identity) |

### The log's own shape

One JSON object per line. Operational fields are always present; `query` and `response` only when `RAG_LOG_TEXT` is on.

`ts` · `route` (`answered`, `weak_retrieval`, `greeting`, `generative`, `busy`, …) · `gated` · `model` · `latency_ms` · `prompt_eval_count` · `eval_count` · `best_distance` · `distances` · `role` · `classifications` · `answer_lang` · `query` · `response`

`eval_count` is the tokens generated, so `eval_count == LLM_NUM_PREDICT` is a deterministic truncation detector: the model was cut off rather than choosing to stop.

## Stack (confirmed from code — do not assume)

- **FastAPI + uvicorn**, single process. Endpoints: `POST /chat` (SSE), `GET /health`, `GET /usage`.
- **Ollama** local model (`qwen2.5:7b` default, switchable via `ragctl model`) over its OpenAI-compatible `/v1/chat/completions` (httpx). **Not** Anthropic — there is no Claude/API path here.
- **fastembed** `bge-small-en-v1.5`, 384-dim, asymmetric query/passage prefixes.
- **Postgres + pgvector** (cosine), asyncpg, raw parameterized SQL. The `documents` table holds prose + code chunks.
- Runs locally (WSL2 + Docker, RTX 3080 Ti); public via **Tailscale Funnel** (`paskamyrsky.tail6ed53b.ts.net`); the Vercel frontend reveals chat only when `/health` `checks.llm === true`.

## The /chat pipeline — exact order (`app/pipeline.py:chat_event_stream`)

1. **Task gates** (pre-retrieval, deterministic, no GPU): `guardrails.is_generative_request` (write a poem/story/song/…) and `is_translation_request` (translate X → a named language) → decline with `GENERATIVE_REPLY`.
2. **Hybrid retrieve** (`retrieval.retrieve`): dense pgvector cosine **+** lexical BM25 (`db.search_lexical`, `websearch_to_tsquery`/`ts_rank`) fused with **reciprocal rank fusion** (`RRF_K=60`, dense/lexical weights 1.0) — **with the hard per-project filter applied _inside_ `retrieve()`** (`PROJECT_FILTER_STRICT`, default on, **fails open**) restricting to the named project when `query_projects.detect_projects` matches. `HYBRID_ENABLED=false` → pure dense.
3. **Prose-anchored weak-retrieval gate** (`guardrails.is_weak_retrieval`): gates on the best **prose**-chunk cosine distance (code chunks can lower off-topic distances, so gating on prose is the honest signal); `db.closest_prose` is fetched explicitly when the top-k is all code. Threshold `WEAK_RETRIEVAL_DISTANCE=0.45`. Off-corpus → fixed `WEAK_RETRIEVAL_REPLY`, no LLM call.
4. **Concurrency semaphore** (`LLM_MAX_CONCURRENCY=2`) around generation only — shed with a busy reply, never queue.
5. **Grounded prompt** (`prompts.build_messages`) + FORCE_ENGLISH → Ollama stream (capped at `LLM_NUM_PREDICT=1024`, markdown stripped) → SSE `sources` / `token` / `done`.

## app/ file map

| File | Role |
| --- | --- |
| `config.py` | All env settings (`Settings.from_env`, typed getters, `validate()`). |
| `content.py` | Loads the corpus: `content/**/*.md` prose **and** `content/code/<project>/` source. |
| `chunking.py` | `chunk_markdown` (prose, block-aware) + `chunk_code` (function/class/method boundaries, decorators kept with their def). |
| `embeddings.py` | In-process `bge-small-en-v1.5` via fastembed. |
| `db.py` | pgvector access: dense `search`, lexical `search_lexical`, `closest_prose`, the `project=ANY` filter, upsert. |
| `indexer.py` | Offline indexer — `python -m app.indexer` (idempotent via sha256). |
| `retrieval.py` | Hybrid dense+lexical RRF, hard project filter, the dense + prose gate anchors. |
| `query_projects.py` | `detect_projects` — tech-alias substring matching (microsoft/.net → readlog-dotnet, tts/piper → audiobookmaker, …). |
| `prompts.py` | Grounded, injection-hardened system prompt (a constant). |
| `llm.py` | Ollama streaming client — the concurrency semaphore + `num_predict` cap live here. |
| `guardrails.py` | `is_weak_retrieval` (prose-anchored), `is_generative_request`, `is_translation_request`. |
| `pipeline.py` | `chat_event_stream` — the orchestration above. |
| `main.py` | FastAPI app, `POST /chat`/`GET /health`/`GET /usage`, the input cap + rate-limit/body guards. |
| `middleware.py` / `ratelimit.py` | Body-size byte cap; per-IP sliding-window limiter. |
| `sse.py` / `request_log.py` / `usage.py` / `health.py` | SSE framing; opt-in score log; usage telemetry; `/health` payload. |

## Config knobs (validated env — `app/config.py`, `chat-backend/.env.example`)

`TOP_K=6` · `WEAK_RETRIEVAL_DISTANCE=0.45` · `LLM_NUM_PREDICT=1024` · `INPUT_MAX_CHARS=800` · `LLM_MAX_CONCURRENCY=2` · `LLM_ACQUIRE_TIMEOUT_SECONDS=0.5` · `HYBRID_ENABLED=true` · `RRF_K=60` · `RETRIEVAL_DENSE_WEIGHT=1.0` · `RETRIEVAL_LEXICAL_WEIGHT=1.0` · `PROJECT_FILTER_STRICT=true` · `RAG_LOG_FILE` (empty=off) · `MAX_BODY_BYTES=16384` · `RATE_LIMIT_REQUESTS=30` · `RATE_LIMIT_WINDOW_SECONDS=60` · `FORCE_ENGLISH=true` · `CORS_ALLOW_ORIGINS` · chunk-size knobs. **The compose only passes `LLM_MODEL`; everything else uses these defaults.**

## Containment (architectural, defense-in-depth — ADR 0010)

Input cap (`INPUT_MAX_CHARS` handler-400 + Pydantic 4000 backstop + `MAX_BODY_BYTES`) · prose-anchored relevance gate · two pre-retrieval task gates (generative + translation) · grounded prompt (injection/reveal hardened, a constant) · output cap (`num_predict`) · concurrency semaphore · per-IP rate limit · opt-in score log. **Never weaken a gate/cap to prompt-wording-only.** Verified by `python -m evals.acceptance` (9 cases) — see the `rag-audit` skill.

## Corpus + re-index runbook

- Prose: `content/**/*.md` (per-project `NAME.md` + `-architecture.md` + `-deepdive.md`, `cv.md`, posts).
- Code: `content/code/<project>/` — 55 curated source files (py/ts/tsx/js/cs/astro/sql/prisma). **Excluded from tsconfig/eslint/prettier AND CodeQL** (`paths-ignore`) — it's other repos' code, not the site's.
- **Re-index after corpus/chunking changes:** `docker compose run --rm backend python -m app.indexer`. **NOT `make index`** — there is no `make` in the WSL. `content/` is bind-mounted (`./content:/content:ro`) so content-only edits need no rebuild; `app/` is baked → rebuild (`docker compose build backend`) for code changes.

## Operational gotchas

- The **working stack is the WSL clone `~/mikkonumminen.dev`**, not the Windows `D:` checkout (which can lag). `cp -a <worktree>/chat-backend/app/. chat-backend/app/` to test a change live.
- `ragctl` (`chat-backend/ragctl.py`) is the ops CLI, an argparse command set with a TTY REPL wrapper. Stack: `status`/`watch`/`doctor`/`up`/`down`/`test`/`model`/`english`/`usage`/`logs`/`prune`/`watchdog`. Shoutbox moderation: `queue`/`approve <id>`/`reject <id>`/`reply <id> "text"`/`publish`. The moderation verbs are here and NOT on the FastAPI app on purpose — the funnel proxies the whole backend origin unauthenticated, so an admin route would be publicly reachable; ragctl has no listener at all.
- Rebuilds pile up docker build cache → `ragctl prune` (disk only, leaves the stack + warm model).
- The model stays warm (`OLLAMA_KEEP_ALIVE=-1`, ~8.6 GiB RAM) for instant replies; `ragctl down` frees it.
- **Model:** `qwen2.5:7b` with `OLLAMA_CONTEXT_LENGTH=16384` (set in the WSL clone `.env`). A 2026-06 A/B against `qwen2.5:14b` was REVERTED — once retrieval/grounding were fixed (per-project filter, ADR exclusion, diversity, grounded prompt), 7b answers as well, and it frees ~5 GB so the bigger context fits 100% on the 12 GB GPU (the context-bar donut sits ~25-31%, not 100%). Don't pair 16k with a 14b model — it OOMs the card.
