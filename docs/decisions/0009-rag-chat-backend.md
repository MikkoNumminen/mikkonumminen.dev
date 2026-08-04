# ADR 0009 · Local RAG chat backend as a separate, optional service

**Status:** accepted
**Date:** 2026-06-18
**Decided by:** repo owner

> **Update (2026-06-27):** the default generation model is now **`qwen2.5:7b`** (switchable via `ragctl model`), changed for more reliable English-only answers, see PR #310. The decision below is unchanged: generation is still a **local** model served by Ollama over its OpenAI-compatible endpoint, nothing hosted and nothing per query. The original choice (Gemma 4 E4B) is kept verbatim in the Decision section as the historical record.
>
> **Update (2026-07-03):** the **deployed** model is now **Poro 2 8B Instruct** (`hf.co/mradermacher/Llama-Poro-2-8B-Instruct-GGUF:Q4_K_M`), served at an 8192-token context with `FORCE_ENGLISH=0` so Finnish questions are answered in Finnish. Rejected alternatives were `qwen3:8b` and `llama3.1:8b`. This one is worth reading the evidence for rather than taking on trust: the choice came from a blind study (three 8B models, 30 Finnish questions, 540 generations, graded without knowing which model wrote what) in which Poro placed first on 26 of 30 and beat qwen3 20-to-3 (p = 0.0005). Poro had been dismissed twice by earlier non-blind evaluations that were measuring task-checklist completion rather than the quality of the Finnish, which is the failure mode the study was built to expose. Write-up: [`content/posts/rag-finnish-blind-test.md`](../../content/posts/rag-finnish-blind-test.md); PRs #341-#344.
>
> Two caveats that belong with the decision, not buried in the study: Poro's quality win **presumes its language drift is managed**. It depends on the router and prompt anchor that shipped alongside it, and is not a property of the model alone. And it runs at **temperature 0.4**, so a single generation is never evidence about a regression or a fix.
>
> `qwen2.5:7b` remains the value in `.env.example` and the `docker-compose.yml` default, because that is the model a fresh clone can pull without the Finnish stack; the deployed default is set in the live `.env`. If you are reading config to find out what is answering questions in production, read the live `.env` or `ragctl status`, not the checked-in default.

## Context

The contact page hosts an interactive fake-shell terminal
([`src/components/contact/Terminal.astro`](../../src/components/contact/Terminal.astro),
[`src/lib/terminal/`](../../src/lib/terminal/)). We want a visitor to be able to
ask free-form questions about the projects and get answers grounded in Mikko's
own content (project descriptions, CV, posts) via retrieval-augmented generation,
without weakening the guarantees the site already makes.

Two of those guarantees are load-bearing and recorded:

- [ADR 0002](0002-static-output-only.md): **static output only.** No SSR, no
  edge functions, no runtime secrets, no server-side state. The `dist/` artifact
  must remain portable across any static host.
- [ADR 0001](0001-observability-sentry.md): third-party runtime calls are
  gated and privacy-respecting.

RAG needs a vector database and an LLM at request time, both inherently dynamic.
Naively, that pulls the site toward SSR or a managed backend, which would
contradict 0002 and add a per-request billing surface (a hosted model, a cloud
vector DB). We do not want either.

## Decision

Build the chat as a **separate backend service** the static site calls over
`fetch`, never as part of the site's own runtime. Concretely:

- The Astro site stays exactly as ADR 0002 requires: `output: 'static'`, no SSR,
  no runtime secrets baked into the page. The only addition on the frontend is a
  build-time `PUBLIC_CHAT_API_URL` and client-side `fetch` calls: the same
  shape as the existing runtime `fetch` for `skills-registry.json`.
- The backend lives in [`chat-backend/`](../../chat-backend/): Python 3.12 +
  FastAPI, a local **Postgres + pgvector** container for retrieval, embeddings
  (`bge-small-en-v1.5`) run **in-process**, and generation always via a **local
  Gemma 4 E4B served by Ollama** over its OpenAI-compatible endpoint. The whole
  stack starts and stops with `make up` / `make down`. When Mikko wants the chat
  public, an optional `cloudflared` tunnel publishes the backend over HTTPS;
  otherwise it simply isn't reachable.
- The chat is **progressive enhancement, never a regression.** The frontend
  probes the backend's `/health` (which confirms the LLM actually responds); if
  the backend or model is unreachable, the terminal stays in its current
  scripted-only mode with **no visual difference**, no chat hint, affordance,
  or error shown. The RAG layer sits purely on top of the working terminal.
- **No hosted model, no paid API, no cloud database, nothing per query.** Both
  the embedding model and the generation model are local; the database is a
  local container with a named volume.

## Considered alternatives

### A. SSR / edge function on the existing site

Render the chat endpoint from an Astro server route or a Vercel edge function.
**Rejected**. It directly contradicts ADR 0002, binds the deployment to a
runtime, and re-opens the server-side surfaces 0002 deliberately closed. The
chat's dynamism does not justify making the *whole site* dynamic.

### B. Hosted LLM + managed vector DB (e.g. an LLM API + Neon/pgvector cloud)

Simplest to operate and always-on. **Rejected**. It introduces a per-token cost
and a per-request billing surface for a personal portfolio, plus a runtime
dependency on a third-party API and a bring-your-own-key story. The locked
decision is that nothing costs anything per query, ever; a model that runs on
Mikko's own RTX 3080 Ti meets that and doubles as resume signal.

### C. Bake answers in at build time (precomputed Q&A, no live model)

Generate canned answers during the build and ship them statically, no backend
at all. **Rejected**. It cannot answer *free-form* questions, which is the
entire point. Retrieval over a static corpus is fine to precompute (we do: the
indexer is offline); generation is not.

### D. Embeddings via an external embedding API

Call a hosted embedding endpoint at index and query time. **Rejected**: same
cost/lock-in objection as B, and it adds a second invariant to keep in sync
(dev vs prod embedding spaces). Running one small open model in-process for both
indexing and querying keeps the vector space identical and free.

## Consequences

### Gained

- **ADR 0002 is preserved intact.** The site stays fully static and portable;
  the chat is an external dependency that is allowed to be dynamic because it is
  not the site.
- **Zero marginal cost and no lock-in.** Local model, local DB, local
  embeddings. The only optional external piece is a free Cloudflare tunnel.
- **No regression risk to the existing terminal.** The default state (backend
  absent) is the current state, and is the state CI builds in, so the
  no-regression guarantee is directly testable.
- **Resume value.** A clean, typed FastAPI + pgvector + local-LLM stack is a
  deliberate portfolio artifact.

### Costs

- **The chat is only live when Mikko runs the stack.** By design: see
  constraint 5 in the build brief. Visitors get scripted-only the rest of the
  time, with no indication anything is missing.
- **A second toolchain to maintain.** The repo now carries a Python service
  alongside the Astro site. It is isolated under `chat-backend/` and outside the
  Node build, lint, and test surfaces, so it cannot break the site's CI.
- **One-machine availability + GPU prerequisite.** Running the live chat needs
  Mikko's machine up with `nvidia-container-toolkit` installed. Acceptable for an
  on-demand demo; not a high-availability service.

### Follow-ups

- The frontend integration must assert the no-regression path in tests (the
  terminal with `PUBLIC_CHAT_API_URL` unset behaves identically to today).
- An eval harness (retrieval hit-rate over a fixed question set) is a first-class
  deliverable. It is the credibility piece for the RAG quality claim.
