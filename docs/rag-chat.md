# The portfolio RAG chat — what it is, what it uses, how it runs

A single, plain-language tour of the retrieval-augmented chat behind the
`/contact` terminal: the moving parts, how a question becomes an answer, and how
the thing is actually deployed and operated today.

It complements, rather than repeats, the three existing documents:

- **Why it's built this way** → [ADR 0009](decisions/0009-rag-chat-backend.md) (the decision + rejected alternatives).
- **Backend internals + the HTTP API** → [`chat-backend/README.md`](../chat-backend/README.md).
- **Host setup runbook** → [`LAUNCH.md`](../LAUNCH.md).

This page is the **as-built** reference — including the live public deployment,
which the docs above predate (they assume a Cloudflare tunnel; the live site
uses Tailscale Funnel — see [§5](#5-how-its-deployed-live-the-as-built-path)).

---

## 1. What it is, in one breath

The contact-page terminal can answer **free-form questions about Mikko's work**,
grounded in his own writing (project descriptions, CV, posts) via
**retrieval-augmented generation**. Every part runs **on Mikko's own PC** (an RTX
3080 Ti) — **no hosted model, no paid API, no cloud database, nothing per
query.**

It is **progressive enhancement, never a regression.** When the backend is
unreachable — PC off, stack stopped, model cold — the terminal is exactly the
scripted shell it has always been, with **no chat hint, affordance, or error
shown.** The chat only appears when a live model is verified to be answering.

---

## 2. The shape

```
 visitor's browser
   │
   │  loads the static site
   ▼
 Vercel  (Astro `output: 'static'`, mikkonumminen-dev.vercel.app)
   │
   │  fetch( ${PUBLIC_CHAT_API_URL}/health )  → reveal gate
   │  fetch( ${PUBLIC_CHAT_API_URL}/chat   )  → SSE stream
   ▼
 Tailscale Funnel   https://paskamyrsky.tail6ed53b.ts.net   (stable public HTTPS)
   │
   ▼
 127.0.0.1:8000   FastAPI backend          ┐
   ├──▶ Postgres + pgvector  (retrieval)    │  Docker Compose,
   └──▶ Ollama · gemma4:e4b  (generation)   │  on Mikko's PC (RTX 3080 Ti)
        embeddings (bge-small) in-process   ┘
```

The site is static and portable; the chat is an **external service it calls over
`fetch`** — never part of the site's own runtime. That keeps
[ADR 0002 (static output only)](decisions/0002-static-output-only.md) intact:
the only thing the frontend adds is a build-time URL and client-side `fetch`.

---

## 3. What it uses

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | Astro (static) — [`src/lib/terminal/chat.ts`](../src/lib/terminal/chat.ts) | Reveal gate + `fetch`/SSE client in the contact terminal. |
| Public edge | **Tailscale Funnel** | Publishes the local backend at a stable public HTTPS URL — no domain required. *(The repo also ships an optional `cloudflared` service; it is not used in the live deployment — see [§5](#why-tailscale-funnel-and-not-the-bundled-cloudflared).)* |
| API | **FastAPI** (Python 3.12) — [`chat-backend/`](../chat-backend/) | `POST /chat` (SSE) + `GET /health`, behind a per-IP rate limit and a body-size cap. |
| Retrieval DB | **Postgres + pgvector**, `vector(384)`, cosine | Stores embedded content chunks; top-k nearest-neighbour search. |
| Embeddings | **bge-small-en-v1.5** via `fastembed`, **in-process** | 384-dim vectors for both indexing and queries — one model, one vector space. |
| Generation | **gemma4:e4b** via **Ollama** (OpenAI-compatible endpoint) | Streams the grounded answer; runs on the GPU. |
| Orchestration | **Docker Compose** + `Makefile` | `db` + `ollama` (GPU) + one-shot `ollama-pull` + `backend` (+ optional, unused `tunnel`). |
| Corpus | [`content/`](../content/) markdown | One file per project, `cv.md`, selected posts — the only source of truth answers are drawn from. |

The load-bearing invariant: the indexer and the query path use the **same**
embedding model and dimension, and that dimension matches the `vector(N)` column.
A mismatch returns silent garbage, so the dimension is locked to bge-small's 384.

---

## 4. How a question becomes an answer

### Indexing — offline, one-time (not part of any deploy)

```
content/*.md  ─▶  markdown-aware chunking (stable content-hash per chunk)
              ─▶  bge-small embeddings (in-process)
              ─▶  upsert into Postgres + pgvector
```

Idempotent: each chunk is keyed by its content hash, so unchanged content is
neither re-embedded nor re-written, and chunks that changed or were removed are
pruned. Re-run only when `content/` changes.

### A live chat turn

```
message  ─▶  embed query
         ─▶  top-k cosine retrieval from pgvector
         ─▶  weak-retrieval guardrail:
               nothing relevant (empty, or all beyond WEAK_RETRIEVAL_DISTANCE)
               → deterministic canned refusal, model NEVER called
         ─▶  assemble grounded prompt (retrieved chunks + guardrail system prompt)
         ─▶  stream gemma4:e4b
         ─▶  Server-Sent Events back to the browser:
               event: sources  {the chunks used}
               event: token    {text}        (repeated per token)
               event: done     {}
               event: error    {message}     (on failure — stream ends cleanly)
```

The guardrail is why an off-topic question can't be answered from hallucinated
content: with no relevant retrieval, the API refuses **without calling the
model** at all.

### The reveal gate — why the chat is invisible until it's real

Before showing any chat affordance, the frontend probes
`${PUBLIC_CHAT_API_URL}/health`. That endpoint runs a **real one-token
completion**, so `checks.llm === true` means the model genuinely *generates* —
not merely that a process is up:

```json
{ "status": "ok", "checks": { "db": true, "llm": true }, "model": "gemma4:e4b" }
```

The terminal reveals free chat **only** when `checks.llm === true`. Anything else
— backend down, model cold, funnel returning 502 — leaves it scripted-only with
no visual difference. (`PUBLIC_CHAT_API_URL` unset at build time disables the
whole path; that's the state CI builds in, so the no-regression guarantee is
directly testable.)

The probe doesn't run only once. The terminal **re-checks `/health` every ~25s
and whenever the tab regains focus**, so the "ask about the projects" affordance
**appears within one interval of the backend coming up and disappears when it
goes away — with no page reload**. A visitor who loaded the page while the stack
was off sees the chat light up moments after the operator clicks Chat ON, and the
dispatcher only routes free-form input to the model while it's actually
reachable. The probes hit the backend (the home machine via the tunnel), never
Vercel.

---

## 5. How it's deployed live (the as-built path)

This is the part the older docs predate. The backend is **not hosted** — it's the
local stack, reached from the public site through a tunnel. It's live **only
while the PC is on and the stack is running**, which is the intended model: an
on-demand demo with zero standing cost, not a high-availability service.

**Backend.** The local Docker stack, with the API published to **`127.0.0.1:8000`
only** (loopback — deliberately not exposed to the LAN). See `LAUNCH.md` for host
setup.

**Public exposure — Tailscale Funnel.** Tailscale runs on the Windows host;
Funnel proxies a stable public HTTPS hostname straight to the loopback backend:

```
https://paskamyrsky.tail6ed53b.ts.net   ─▶   127.0.0.1:8000
```

One-time setup: install Tailscale → sign in → enable Funnel on the tailnet
(a consent link) → `tailscale funnel --bg 8000`. The config persists across
reboots, so the public URL is durable.

<a id="why-tailscale-funnel-and-not-the-bundled-cloudflared"></a>
**Why Tailscale Funnel and not the bundled `cloudflared`.** A Cloudflare *named*
tunnel (what the repo's optional `tunnel` service expects) needs a domain added
to Cloudflare. There is no such domain. Tailscale Funnel gives a **stable public
HTTPS URL with no domain, for free**, so it's the chosen path; the `cloudflared`
compose service is left in place but unused.

**Frontend wiring — Vercel build var.** The deployed site learns the backend URL
from a build-time variable on the Vercel project:

```
PUBLIC_CHAT_API_URL = https://paskamyrsky.tail6ed53b.ts.net    (Production + Preview)
```

Because it's baked at build time, **changing it requires a redeploy** to take
effect.

> **Gotcha that cost a redeploy cycle:** this variable must **not** be marked
> *Sensitive* in Vercel. A `PUBLIC_`-prefixed value is meant to be inlined into
> the browser bundle, but Vercel **withholds Sensitive variables from the static
> build**, so the URL silently never inlines and the chat stays hidden. Vercel
> even flags the `PUBLIC_` + Sensitive combination with a warning. Sensitive
> can't be toggled off after creation — delete and re-create the variable as
> non-sensitive. (The funnel URL is public by design, so there's nothing to
> hide.)

**CORS.** The backend's `CORS_ALLOW_ORIGINS` is set to the exact site origin so
the browser is allowed to call the funnel:

```
CORS_ALLOW_ORIGINS = https://mikkonumminen-dev.vercel.app
```

**Net behaviour.**

| State | What the visitor gets |
| --- | --- |
| PC on **and** Chat ON | Live grounded chat through the funnel. |
| PC off, or Chat OFF | Funnel 502s → reveal gate fails → scripted-only terminal, no visual change. |

---

## 6. How it's operated, day to day

The stack is a one-click on/off from Windows. (Docker Desktop must be running
first; the chat lives in Docker.)

| Control | Effect |
| --- | --- |
| **Chat ON** | Brings the stack up and warms gemma into VRAM; prints `/health`. The model stays resident (`OLLAMA_KEEP_ALIVE=-1`) so there's no cold-load lag mid-session. |
| **Chat OFF** | `docker compose down` — frees the GPU VRAM. The DB data and the pulled model persist in named volumes for next time. |
| **Chat Status / Doctor** | Container states + `/health`; Doctor adds a security pre-flight and Docker versions. |

The pre-flight exists because **security apps that intercept TLS** (IPVanish
Threat Protection, VPN clients, third-party AV web-shields) can silently break
the *download* of models/images — they don't affect the running localhost chat,
only fetches. The pre-flight surfaces that up front instead of leaving a cryptic
stall.

> The on/off control scripts, their Windows launchers, the keep-alive override,
> and the desktop shortcuts are **local to the one host and intentionally not
> committed** — they encode machine-specific paths. `LAUNCH.md` is the committed,
> portable host runbook.

**Re-indexing** (only when `content/` changes — it's idempotent):

```bash
docker compose run --rm backend python -m app.indexer --dry-run   # preview the chunk plan
docker compose run --rm backend python -m app.indexer             # embed new/changed, prune stale
```

**Eval** (the credibility metric — retrieval hit-rate over a fixed question set):

```bash
docker compose run --rm backend python -m evals.run_eval --min-hit-rate 0.8
```

---

## 7. Why it can't hallucinate its way into trouble, and won't melt the machine

- **Grounding + refusal.** Answers come only from retrieved corpus chunks; with
  no relevant retrieval the API returns a canned refusal **without calling the
  model**. The grounded system prompt covers the borderline cases.
- **Rate limit + body cap.** A per-IP sliding-window rate limit and a request
  body-size cap (`RATE_LIMIT_*`, `MAX_BODY_BYTES`) shield the home machine while
  the funnel is open to the internet.
- **Loopback + tunnel only.** The backend binds to `127.0.0.1`; the only public
  path is the authenticated Tailscale Funnel egress, not an open LAN port.

---

## 8. Where to look

| For… | See |
| --- | --- |
| The decision and the rejected alternatives | [ADR 0009](decisions/0009-rag-chat-backend.md) |
| Backend internals, the file map, the full API | [`chat-backend/README.md`](../chat-backend/README.md) |
| Host setup / first-run runbook | [`LAUNCH.md`](../LAUNCH.md) |
| The static-output guarantee this respects | [ADR 0002](decisions/0002-static-output-only.md) |
| The frontend reveal gate + SSE client | [`src/lib/terminal/chat.ts`](../src/lib/terminal/chat.ts) |
