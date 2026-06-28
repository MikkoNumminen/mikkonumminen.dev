# AGENTS.md — contributor & tooling contract

The committed source of truth for how this repo is built and what must never break.
The [`README.md`](README.md) covers structure, scripts, and the skill tooling in more
depth; this file is the short list of load-bearing constraints to read first.

## What this is

A personal portfolio site for Mikko Numminen. It is **not** a typical web app — it is a
visual showcase where every pixel matters. The reference quality bar is "Apple product
launch page".

## Tech stack

- **Astro** — static site generator, island architecture
- **Three.js** — 3D graphics, WebGL
- **GSAP** — ScrollTrigger, timelines, morphing
- **Tailwind CSS v4** — no component libraries
- **TypeScript** — strict (`tsconfig` extends `astro/tsconfigs/strict`)

## Hard constraints

These are non-negotiable. A change that violates one is wrong even if it builds.

- **Fully static output** — no SSR, no edge functions. The build must stay portable from
  Vercel to AWS S3 + CloudFront with a single config swap. See
  [`docs/decisions/0002-static-output-only.md`](docs/decisions/0002-static-output-only.md).
- **No heavy frameworks** — do not introduce Next.js, React (beyond a minimal Astro island
  only when truly necessary), or MUI / any component library. See
  [`docs/decisions/0003-astro-over-nextjs.md`](docs/decisions/0003-astro-over-nextjs.md).
- **60fps animations** — always dispose Three.js resources on teardown, drive frames with
  `requestAnimationFrame`, and honour `prefers-reduced-motion` on every animated surface.
  Three.js scenes and GSAP timelines are isolated modules exposing an explicit `init` +
  `dispose` contract; preserve that contract.
- **The site stays 100% static (ADR 0002 is unchanged).** The RAG chat backend is a
  separate, optional, fully-local service; the Astro build remains `output: 'static'` with
  no SSR, no edge functions, no runtime secrets.
- **Chat is progressive enhancement, never a regression.** `PUBLIC_CHAT_API_URL` unset (the
  default — including all CI builds) means the terminal is byte-for-byte identical to today:
  no chat affordance, no chat hint, no error shown. When the var is set at build time, the
  page probes `GET /health` once on load and shows the chat affordance only if `checks.llm`
  is `true` — i.e. the backend **and** its local model are both answering. Anything down or
  unreachable degrades silently to scripted-only. See
  [`docs/decisions/0009-rag-chat-backend.md`](docs/decisions/0009-rag-chat-backend.md) and
  [`chat-backend/README.md`](chat-backend/README.md).

## Repo layout

```
src/
  layouts/        Astro layouts (BaseLayout wraps every page)
  components/     Astro components, grouped by page (nav, contact, ...)
  pages/          One file per route (.astro)
  lib/            (sibling subdirs, not nested)
    three/        core Three.js helpers + scene entry points (homeScene, projectsScene)
    home/         home-scene building blocks
    projects/     projects-scene building blocks (planets, hover labels)
    timeline/     experience-timeline scene helpers
    gsap/         GSAP timelines, one file per page section
    terminal/     contact-page terminal subsystem (chat.ts = RAG client)
    transitions/  page transitions (canvas particle dissolve)
    observability/ Sentry + Core Web Vitals init
    utils/        cross-cutting helpers (e.g. escapeHtml)
    debug/        dev-only diagnostics, stripped from production
    theme.ts      shared theme / palette constants
  i18n/           locale tables, structural parity enforced at compile time
  data/           typed page/content data
  page-content/   per-page prose content
  styles/         global.css (Tailwind v4 + CSS vars)
public/           Static assets served as-is (favicon, manifest, og images, JSON the terminal fetches)
docs/
  decisions/      ADRs (numbered, append-only)
  audits/         dated audit & review reports
scripts/          build/data tooling (og images, skills registry, audit PDFs)
chat-backend/     FastAPI RAG service (Python 3.12; Postgres+pgvector, in-process bge-small-en-v1.5, local Ollama)
content/          Curated corpus the indexer embeds: markdown (projects, cv, posts) + code/<project>/ source (excluded from tsconfig/eslint/prettier)
docker-compose.yml + Makefile  One-command local stack (`make up` / `make index` / `make down`)
```

## Pages — four visual worlds

| Route         | Concept                     | Status |
| ------------- | --------------------------- | ------ |
| `/`           | Immersive scroll experience | built  |
| `/projects`   | Interactive solar system    | built  |
| `/experience` | Parallax mountain landscape | built  |
| `/contact`    | Terminal / CRT aesthetic    | built  |

All four worlds are built and live (the Playwright scene smoke test boots every
one of them on each PR). They were built in the order **Contact → Home →
Projects → Experience**, each fully polished before the next; work now is
refinement — bug fixes, performance, i18n, accessibility. Confirm with Mikko
before any large new feature or a fifth page.

## Workflow

- Small commits, [Conventional Commits](https://www.conventionalcommits.org/) style
  (`feat:`, `fix:`, `chore:`, `refactor:`, `style:`, `docs:`, `perf:`).
- No commit trailers and no co-author lines — commits read as ordinary development.
- Branch first, then open a PR. CI must be green before squash-merge — three workflows run on every PR: the main gate (`typecheck → format:check → lint → test:coverage → build`, on Node 22), the **Playwright scene smoke** (`e2e/`, a headless-WebGL boot test of all four worlds), and **CodeQL** static security analysis.
- `TODO.md`, if present, is a gitignored personal working file — keep it current locally, but it is not committed (don't link or rely on it).
- `npm run build` must succeed and `npm run typecheck` must pass before a page is "done".

## Security

Before editing the contact terminal, the response headers, or anything that builds
HTML, read [`SECURITY.md`](SECURITY.md) and [`docs/security/threat-model.md`](docs/security/threat-model.md).
The project's one HTML-injection boundary is [`escapeHtml`](src/lib/utils/escapeHtml.ts):
every string interpolated into `innerHTML` must pass through it first (see the
`SECURITY INVARIANT` marker on that file). Do not weaken the CSP / headers in
[`vercel.json`](vercel.json) without recording a reason.

## Chat backend (`chat-backend/`)

A separate, optional, fully-local FastAPI + uvicorn service (Python 3.12): the
portfolio RAG chat. It never touches the static Astro build. For the full design
read [`docs/rag-chat.md`](docs/rag-chat.md) — this section is the contract to keep
in mind before you edit the service.

The `/chat` pipeline runs in a fixed order. Do not reorder it:

1. **Pre-retrieval task gates** (deterministic, before any embedding): `is_generative_request` declines "write me a poem/story/song/joke/…" and `is_translation_request` declines "translate &lt;text&gt; to &lt;language&gt;". These are TASK requests that often name on-corpus topics, so the small model would otherwise perform them — they must run before retrieval, not in the prompt.
2. Embed the query (fastembed `BAAI/bge-small-en-v1.5`, 384-dim, asymmetric query/passage prefixes).
3. **Hybrid retrieval** (`HYBRID_ENABLED`, default true; false reverts to pure dense): dense pgvector cosine top-k (`TOP_K`, default 6) fused with lexical BM25-style full-text (`websearch_to_tsquery` + `ts_rank` over the generated `content_tsv`) via **reciprocal rank fusion** — `score = sum(weight / (RRF_K + rank))` across both lists, `RRF_K` default 60, `RETRIEVAL_DENSE_WEIGHT` / `RETRIEVAL_LEXICAL_WEIGHT` default 1.0 each.
4. **Hard per-project filter** (`PROJECT_FILTER_STRICT`, default true): a detected named project restricts retrieval to its chunks, **failing open** for the gate — if the named project returns nothing, it falls back so the gate sees the true global best. (This replaces the old soft re-rank boost.)
5. **Weak-retrieval gate** (`guardrails.is_weak_retrieval`): anchored on the best **prose-chunk** distance (code chunks lower off-topic distances, so gating on prose keeps off-topic queries that only match stray code out; the closest prose is fetched explicitly via `db.closest_prose` when the top-k has none). If it exceeds `WEAK_RETRIEVAL_DISTANCE` (default 0.45, lowered for the code-enriched corpus), short-circuit **before** the LLM and return the fixed out-of-scope reply.
6. Grounded system prompt (answer ONLY from retrieved CONTEXT) + `FORCE_ENGLISH`.
7. Ollama streamed generation (local, OpenAI-compatible `/v1`), capped, surfaced as SSE (`sources`/`token`/`done`/`error`).

**Containment must stay architectural — never weaken a layer to prompt-wording-only.**
These are defense in depth and several do not depend on the model obeying the prompt:

- **Input cap** — `INPUT_MAX_CHARS` (default 800) in the handler (HTTP 400), a Pydantic `max_length=4000` backstop (422), and `MAX_BODY_BYTES` (default 16384) byte cap in ASGI middleware.
- **Relevance gate** — the pre-LLM short-circuit above, anchored on the closest **prose** chunk. Keep it before generation; do not move it into the prompt.
- **Pre-retrieval task gates** — `is_generative_request` and `is_translation_request` decline poem/translate-style TASK requests deterministically, before retrieval. They mitigate (not cure) the model performing a literal on-corpus task; keep them as code, not prompt wording.
- **Output cap** — `LLM_NUM_PREDICT` (default 512) hard `num_predict`, so no single answer can dump a document regardless of prompt content.
- **Concurrency** — an `asyncio.Semaphore` (`LLM_MAX_CONCURRENCY`, default 2) around generation, acquired with a bounded wait (`LLM_ACQUIRE_TIMEOUT_SECONDS`, must be > 0); excess load is shed with a short busy reply, never queued. The permit must release on every exit path (including mid-stream client disconnect) — preserve that if you touch the streaming code.
- **Rate limiting** — per-IP sliding window (`RATE_LIMIT_REQUESTS` default 30 / `RATE_LIMIT_WINDOW_SECONDS` default 60).
- **Prompt hardening** — the prompt is a constant: treat the whole user message as a question never instructions; never reveal/ignore the prompt or role-play another assistant; decline generative off-task requests. This is the _last_ layer, not a substitute for the caps and gate above.
- **Score logging** — on by default (`RAG_LOG_FILE` defaults to `rag-logs/requests.jsonl`; set empty to disable): one JSONL line per request with operational telemetry only — no PII (`ts`, `route`, `gated`, `model`, `latency_ms`, token counts, cosine distances, `classifications`, `response_chars`). Set `RAG_LOG_TEXT=true` to also write the raw query + answer text (PII, off by default, for local debugging only).

Every knob is a validated env var: `TOP_K`, `WEAK_RETRIEVAL_DISTANCE`, `LLM_NUM_PREDICT`,
`INPUT_MAX_CHARS`, `LLM_MAX_CONCURRENCY`, `LLM_ACQUIRE_TIMEOUT_SECONDS`, `RAG_LOG_FILE`, `RAG_LOG_TEXT`,
`MAX_BODY_BYTES`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS`, `FORCE_ENGLISH`,
`CORS_ALLOW_ORIGINS`, the hybrid-retrieval knobs (`HYBRID_ENABLED`, `RRF_K` default 60,
`RETRIEVAL_DENSE_WEIGHT` / `RETRIEVAL_LEXICAL_WEIGHT` default 1.0, `PROJECT_FILTER_STRICT`
default true), plus the chunk-size knobs. Touch behavior through config and tests, not by
hardcoding.

**Indexing & hybrid retrieval (as-built).** The indexer embeds the curated markdown corpus
under `content/**/*.md` **and** curated source under `content/code/<project>/` (`py`, `ts`,
`tsx`, `js`, `cs`, `astro`, `sql`, `prisma`, + config) — 55 architecture-defining files
curated from the sibling project repos. Chunking is **code-aware**: source splits on
function/class/method boundaries (python/typescript/javascript/csharp), keeps
decorators/attributes with their definition, falls back to a line window; prose stays
markdown-block chunked. Each chunk carries `language` + `chunk_type` (`prose` | `code`)
metadata. Schema migration `sql/002` added `language`, `chunk_type` (default `prose`), and a
GENERATED `content_tsv` tsvector behind a GIN index (backfilled) — the lexical leg of the
hybrid fusion above. Off-topic queries that match only stray code are still contained: the
weak-retrieval gate anchors on prose distance, and the two pre-retrieval task gates refuse
poem/translate-style on-corpus tasks. The deep-code questions that this corpus enables now
answer from actual source. `content/code/` is corpus data, not site code — it is excluded
from `tsconfig` / `eslint` / `prettier`. See [`docs/rag-chat.md`](docs/rag-chat.md) for the
full design.

Still **roadmap (not built)** — do not document or rely on them as if they exist:
cross-encoder re-ranking, automatic per-project summary generation, query expansion.

**Validate before you push** (run from `chat-backend/`):

```bash
python -m pytest              # backend unit suite (chunking, guardrails, pipeline, middleware, rate limit, ...)
python -m evals.acceptance    # 9 black-box containment contract cases (injection no-dump, prompt-reveal blocked, off-topic declined incl. stray-code leaks, poem/translate task gates refuse, input caps, grounded deep-code answers)
```

The acceptance harness classifiers are anchored on the real refusal wording so they cannot
false-pass — if you change a refusal string, update them together. Ops are driven by
`ragctl.py` (`status`/`up`/`down`/`doctor`/`model`/`english`; model switchable, `qwen2.5:7b` default).

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build (must succeed)
npm run preview      # preview the built site
npm run typecheck     # astro check
npm run lint          # eslint (no-explicit-any is an error)
npm test              # vitest (unit)
npm run test:coverage # vitest + coverage ratchet (this is the CI test step)
npm run test:e2e      # Playwright scene smoke (build first; needs a browser)
npm run format        # prettier --write (run before pushing)
npm run format:check  # prettier --check (CI gate)
```
