---
title: Portfolio — architecture & design
project: portfolio
---

# Portfolio — Architecture & Design

mikkonumminen.dev is a fully static personal portfolio for a full-stack developer. It is built with Astro 6, Three.js, GSAP, and Tailwind CSS v4, and deployed on Vercel. The site ships no SSR, no edge functions, and no runtime secrets.

## Overview & High-Level Architecture

The portfolio is a multi-page application (MPA) where each of four routes is its own self-contained visual experience:

- **`/`** — WebGL particle field and 3D name (`homeScene`), GSAP scroll-trigger timelines, parallax nav cards.
- **`/projects`** — interactive solar system (`projectsScene`); each project is an orbiting planet with hover labels and a zoom-in view.
- **`/experience`** — parallax mountain landscape with a scrolling goat and timeline markers.
- **`/contact`** — CRT terminal with a real command parser, tab completion, history, and the `skills` / `download --catalog` commands that serve the skills-registry data.

Page-to-page navigation is a vanilla JS canvas particle-dissolve module (`src/lib/transitions/`) that intercepts link clicks, plays the animation, then issues a hard navigation — preserving true MPA semantics.

The site is available in three locales (English, Finnish, Swedish) via separate pre-rendered HTML trees at `/`, `/fi/`, and `/sv/`. Locale negotiation runs client-side: an inline script in `BaseLayout.astro` reads `navigator.languages` and redirects once per session (guarded by `sessionStorage`).

The source tree is a single-repo layout with no submodules:

```
src/
  layouts/        shared head, nav, transition overlay (BaseLayout)
  components/     per-page component folders
  page-content/   page-level composition (.astro per page)
  pages/          routed .astro files including /fi and /sv mirrors
  lib/
    three/        Three.js helpers + scene entry points
    gsap/         GSAP timelines
    terminal/     command parser, history, skills renderer
    transitions/  canvas particle-dissolve
    observability/ Sentry + Core Web Vitals init
    utils/        cross-cutting helpers (escapeHtml, etc.)
  data/           project metadata, timeline entries
  i18n/           locale dictionaries
scripts/          build-time tooling (OG rasterizer, PDF renderer, registry sync)
public/data/      committed static JSON artifacts served at runtime
```

## Tech Stack and Why

| Technology | Version | Decision driver |
|---|---|---|
| Astro | 6 | Island architecture; zero framework runtime on pages with no interactive islands; each page owns its own JS lifecycle (ADR 0003). |
| Three.js | 0.184 | WebGL scene authoring without a game engine; scenes dynamically imported per-page and disposed on `beforeunload`. |
| GSAP + ScrollTrigger | 3.15 | Scroll-driven animation timelines; dynamically imported only on pages that need them. |
| Tailwind CSS v4 | 4.2 | Utility CSS; no component library. |
| TypeScript (strict) | 6 | Strict mode + `noUncheckedIndexedAccess`; ESLint treats `any` as an error, not a warning. |

The README frames the choice explicitly: this stack is intentionally separate from the author's production stack (Next.js / React / MUI) — "the craft side of the brain." ADR 0003 documents why Next.js was rejected: the App Router's React runtime would add unnecessary overhead and complicate Three.js scene lifecycle management for a site where no pages share client state.

Node 22 is the runtime floor (ADR 0007), adopted in the Astro 5 → Astro 6 upgrade to stay on a current, supported toolchain.

## Data Model / Persistence / Schema

The site has no database and no server-side state. All content is resolved at build time.

- **Project metadata** — `src/data/projects.ts` + per-locale `projectsData` in `src/i18n/locales/`.
- **Timeline entries** — `src/data/` (experience page).
- **Skills registry** — `public/data/skills-registry.json`, a committed artifact with a published JSON Schema (`public/data/skills-registry.schema.json`). The schema is validated at build time (`prebuild` runs `validate:registry`) by a dependency-free validator (`scripts/lib/validate-json-schema.mjs`). A malformed registry fails the build rather than silently breaking the contact terminal.
- **Cross-page state** — audio playhead position, active deck, and locale-redirect guard are stored in `sessionStorage` only; nothing is persisted beyond the browser session.

The skills registry is an enriched artifact: the raw scan from the `/skill-registry` automation is layered with transcript-measured receipts locally and committed. It is not regenerated on Vercel builds, so the committed file is the canonical version (ADR 0006).

## Auth & Authorization / Security Posture

The site has no user accounts, no authentication, and no PII collected beyond anonymous client telemetry. The security surface is the visitor's browser.

**Content Security Policy** (enforced via `vercel.json` headers on every response):

- `default-src 'self'`; no third-party scripts.
- `connect-src` allowlists `*.ingest.sentry.io` (and regional variants) for telemetry, plus the Tailscale Funnel origin the RAG chat backend is published at.
- `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `upgrade-insecure-requests`.
- `'unsafe-inline'` is required on `script-src`/`style-src` because fully static output cannot emit per-request nonces (ADR 0002 explains the constraint). The classical inline-script injection path does not exist on a site that loads no third-party scripts and has no server-reflected HTML.

**XSS boundary** (Boundary 1 in the threat model): every string reaching an `innerHTML` sink (terminal output, Three.js hover labels) passes through `escapeHtml`, which is tested via `escapeHtml.test.ts`.

**Runtime JSON fetch boundary** (Boundary 2): the contact terminal fetches `skills-registry.json` from the same origin. A `parseRegistry` shape-guard validates the skeleton before use; malformed input produces a graceful empty state rather than a crash. Values are still escaped at the `innerHTML` sink even after passing the guard.

**HTTP hardening**: HSTS (`preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a locked `Permissions-Policy` are all set in `vercel.json`.

**Supply-chain**: Dependabot update PRs for dependency advisories. CodeQL static analysis (`security-and-quality` query suite) runs as a hard CI gate on every push and PR, plus a weekly cron.

## Key Design Decisions & Trade-offs

**ADR 0002 — Static output only.** `output: 'static'` is a hard constraint. Portability (the `dist/` folder can move to S3 + CloudFront, Cloudflare Pages, or any static host with a config swap), zero cold starts, and an eliminated server-side injection surface were the gains. The cost is a one-time client-side locale redirect per session and no `Accept-Language` edge middleware.

**ADR 0003 — Astro over Next.js.** Astro's island architecture means JavaScript reaches the browser only on pages that explicitly opt in. Each Three.js scene initialises once on `DOMContentLoaded` and disposes on `beforeunload` — no framework reconciliation layer. Cross-page state uses `sessionStorage` and custom DOM events rather than React context.

**ADR 0004 — Dual-deck audio crossfade.** HTML5 `loop` produces an audible gap at the loop join in Safari (50–200 ms). The site implements seamless looping with two `<audio>` "decks" sharing the same source. An equal-power crossfade (complementary cosine/sine curves) runs over the last 1.5 s of the active track, keeping combined power constant. Playhead position is saved to `sessionStorage` on `beforeunload` and restored on the next page load.

**ADR 0005/0006 — Skills registry as a terminal-accessible committed artifact.** The contact-page terminal exposes the portfolio-wide skills registry via `skills` (inline render) and `download --catalog` (PDF download). The PDF is generated from local Chrome via `--print-to-pdf` (zero Chromium npm dep, ~150 MB avoided). The committed `public/data/skills-registry.json` is an enriched artifact layered with transcript measurements; the `prebuild` hook no longer overwrites it with the raw scan, preventing silent data downgrade on production builds (ADR 0006).

**ADR 0007 — Astro 6 + Node 22.** The project moved to Astro 6 on Node 22 to stay on a current, supported toolchain; the static-output model (no SSR, no runtime secrets) keeps the runtime attack surface minimal regardless.

## RAG Chat Backend

The contact-page terminal optionally supports free-form questions answered from Mikko's own curated `content/` corpus via retrieval-augmented generation. The capability is built as a **separate, optional, fully local service** (FastAPI, Python 3.12) that the static site calls over `fetch` — ADR 0002 is preserved intact (see ADR 0009 for the full reconciliation).

### Architecture

```
Astro terminal (static) ──fetch──▶  FastAPI backend ──▶ Postgres + pgvector
                                                    └──▶ Ollama (gemma4:e4b)
Offline indexer ──embeds content──▶ Postgres + pgvector
Embeddings (bge-small-en-v1.5) run in-process inside the backend container.
```

The site itself remains `output: 'static'` with no server-side runtime. The backend lives under `chat-backend/` and has no overlap with the Node build, lint, or CI surfaces — it cannot break the site's pipeline.

**Corpus and embeddings.** The retrieval corpus is the same `content/` directory that backs the RAG doc store (one markdown file per project, `cv.md`, selected posts). Indexing is a one-time offline job (`make index`): `bge-small-en-v1.5` embeddings (384-dimensional) are produced in-process via fastembed and written to a local Postgres + pgvector container (`vector(384)`, cosine distance). The indexer is idempotent — chunks are keyed by content hash, so unchanged content is neither re-embedded nor re-written, and stale chunks are pruned.

**Retrieval and generation.** At query time the backend embeds the user message (same in-process model, keeping the vector space identical to the index) and runs a top-`TOP_K` cosine search against pgvector. The retrieved chunks are assembled into a grounded prompt and streamed to a local Gemma (`gemma4:e4b`) via Ollama's OpenAI-compatible endpoint. The entire stack — Postgres, Ollama, and the FastAPI backend — starts with `make up`; the model is pulled into a named Docker volume on first run and persists across restarts. There is no hosted model, no paid API, and no cloud database; nothing costs anything per query.

**Guardrail and refusal.** Generation is fronted by a deterministic weak-retrieval gate (`app/guardrails.py`): when retrieval is empty or every retrieved chunk exceeds `WEAK_RETRIEVAL_DISTANCE` in cosine distance, the API returns a clean canned refusal without calling the model. A clearly off-topic question can never be answered from hallucinated content. The grounded system prompt handles borderline cases. The API is also protected by a per-IP sliding-window rate limit and a request-body byte cap.

**Streaming.** `POST /chat` returns Server-Sent Events: a `sources` frame (the retrieved document references), repeated `token` frames, and a terminal `done` or `error` frame. The frontend (`src/lib/terminal/chat.ts`) consumes the stream with an incremental SSE parser and writes token text via `textContent` — never `innerHTML` — so streamed model output is not an XSS sink.

### Progressive enhancement

The static site is built with a `PUBLIC_CHAT_API_URL` build-time env var. When it is unset (the default in CI and local builds), every function in `chat.ts` is inert — no fetch, no DOM change, no chat affordance. When set, the page runs exactly one `/health` probe at load time; the probe is memoized for the session. The `/health` endpoint reports liveness of both the DB and the LLM (it sends a real 1-token completion to confirm the model actually generates, not merely that the process is up). Chat is enabled only when `checks.llm === true`. If the probe fails, or if a mid-session `/chat` call fails, the terminal degrades silently to scripted-only — the same byte-for-byte state the visitor would see if the backend were absent.

An optional Cloudflare tunnel (`make up-public`) can publish the backend over HTTPS when Mikko's machine is on. When the tunnel is down, the static site is indistinguishable from a build with no `PUBLIC_CHAT_API_URL` at all.

### Design rationale (ADR 0009 summary)

SSR and edge functions were rejected because they would contradict ADR 0002 and bind the whole site to a server runtime. A hosted LLM + managed vector DB was rejected because of per-token cost and third-party runtime dependency on a personal portfolio. Precomputed Q&A was rejected because it cannot answer free-form questions. Running embeddings in-process (rather than calling an external embedding API) keeps the vector space identical between indexing and querying and adds no cost or lock-in. The result: a clean, typed FastAPI + pgvector + local-LLM stack that is a deliberate portfolio artifact, available on demand, and zero-cost to operate.

## AI-Tooling Layer

The repository treats AI automation as a first-class architectural surface. Four custom Claude Code skills live under `.claude/skills/`, version-controlled and reviewed when added. They extend the developer's local Claude Code installation — they do not execute on Vercel or any CI runner.

### Skills shipped in this repo

| Skill | Purpose |
|---|---|
| `/sync-readmes` | Audits `src/data/projects.ts` and the three locale dictionaries against the canonical READMEs of all sibling repos in parallel. Opens a PR with drift corrections. |
| `/skill-registry` | Walks every sibling repo in the workspace, reads each `.claude/skills/*/SKILL.md`, and emits a consolidated `SKILL-REGISTRY-{YYYY-MM-DD}.json` under `.claude/agent-verdicts/`. One Sonnet sub-agent per repo, run in parallel. The dated JSON is committed so other Claude sessions can read the inventory without re-running the scan. |
| `/md-to-pdf` | Renders any HTML/Markdown source to a styled PDF using the developer's locally-installed Chrome via `--print-to-pdf`. Zero npm install — no puppeteer or Chromium download (~150 MB avoided). Page layout is controlled via `@page` CSS in the generated HTML. |
| `/skill-localUpdate` | One-command refresh of every local artifact the site renders about portfolio skills: (1) re-runs `/skill-registry`; (2) `npm run sync:skills-registry` copies the dated JSON into `public/data/`; (3) `scripts/apply-measurement-overlay.mjs` layers transcript-measured receipts with `prior_estimate` snapshotting; (4) `npm run build:skills-pdf` renders the PDF via local Chrome. Exists to prevent the chain from running out of order and producing a plausible-but-wrong artifact. |

### Orchestration pattern

Each skill dispatches N parallel Sonnet sub-agents (one per sibling repo, all in a single message so they run concurrently) and hands the structured blobs to a synthesizer that aggregates and writes the output. The orchestrator never commits without a human review gate — `gh pr create` opens a PR; the skill explicitly stops and waits for an explicit merge word tied to the PR number. Token spend is dominated by Sonnet sub-agent input (~110 K total for `/skill-registry`); the main-thread Opus context sees only the small aggregated blobs (~6 K), keeping it free for synthesis.

### Committed enriched registry as a runtime artifact

The contact terminal's `skills` and `download --catalog` commands are served from `public/data/skills-registry.json` — a committed artifact, not generated at Vercel build time. The `/skill-localUpdate` chain layers transcript-measured receipts on top of the raw `/skill-registry` scan via `scripts/apply-measurement-overlay.mjs`; auto-syncing on every build would overwrite that enrichment with the raw scan and silently downgrade ~1,850 lines of measured data (the same class of bug documented for the PDF in ADR 0006). The `prebuild` hook validates the committed file against its JSON Schema (`public/data/skills-registry.schema.json`) and fails the build if the skeleton is malformed — so a developer who forgets to run the refresh chain gets a loud build failure rather than a broken terminal.

**Rationale docs:** `/sync-readmes` → `.claude/agent-verdicts/README-SYNC-AGENT.md`; `/skill-registry` → `.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md`; `/md-to-pdf` and the PDF surface → `docs/decisions/0005-skill-registry-pdf-surface.md`; `/skill-localUpdate` chain spec → `.claude/skills/skill-localUpdate/SKILL.md`.

## Testing Strategy

The project uses a layered gate stack documented in ADR 0008:

1. **Static gates** — `astro check` (strict TS + `noUncheckedIndexedAccess`), ESLint with `@typescript-eslint/no-explicit-any` as an error, `prettier --check`, and `astro build`. All run in CI on every push and PR.
2. **Unit tests (Vitest + jsdom)** — pure logic extracted from Three.js scene files is tested in jsdom: `planetNoise`, `responsiveLayout`, `resolvePixelRatio`, `easing`, `entranceFlash`, `escapeHtml`, terminal dispatch, terminal skills parsing, history, and others. A coverage ratchet (`test:coverage`) runs in CI; WebGL/canvas files that cannot run in jsdom are excluded so the threshold is meaningful.
3. **Browser scene smoke (Playwright)** — a separate E2E CI job builds the site and loads all four pages in headless Chromium (WebGL via SwiftShader), asserting each page boots: the canvas mounts with non-zero size and nothing throws or logs an error. This is the verification layer that jsdom structurally cannot provide. Playwright reports are uploaded as CI artifacts (7-day retention).
4. **Data contract validation** — the skills-registry JSON Schema is enforced at `prebuild` and at runtime via `parseRegistry`.
5. **Security analysis** — CodeQL (`security-and-quality` query suite) as a hard CI gate.

The acknowledged ceiling (from ADR 0008): no test asserts a rendered pixel or per-frame scene state. A scene that mounts but renders incorrectly would pass. Visual-regression testing was rejected as too flaky given the animated and partly random nature of the scenes.

## Infrastructure / Deployment / CI-CD / Observability

**Deployment**: Vercel, automatic on every push to `master`. The `dist/` directory of static files is served directly; no server runtime. Cache headers via `vercel.json`: 1-year immutable for `/_astro/` hashed assets and `/fonts/`; 1-day for OG images and favicons.

**CI** (`ci.yml`): Ubuntu, Node version from `.nvmrc`, concurrent cancellation on the same ref. Steps: `typecheck → format:check → lint → test:coverage → build`. Least-privilege `permissions: contents: read`.

**E2E** (`e2e.yml`): separate job, installs Playwright + Chromium, builds, then runs scene smoke tests.

**CodeQL** (`codeql.yml`): runs on push/PR to `master` and on a weekly Monday cron.

**Observability**: Sentry (`@sentry/browser`) for client-side error tracking and Core Web Vitals (LCP, CLS, INP, FCP, TTFB) via `web-vitals`. Activation is gated on `PUBLIC_SENTRY_DSN`; without it the init is a no-op. Do Not Track is honored (`navigator.doNotTrack === '1'` bails before any beacon fires). No session replay, no PII beyond Sentry defaults (URL, browser, stack trace). `tracesSampleRate: 1.0` — personal-portfolio traffic is well under Sentry's free-tier 10 K performance-units/month cap, so full sampling provides meaningful real-user vitals (ADR 0001).

## Notable Engineering Challenges

**Seamless audio looping across hard navigations.** HTML5 `loop` is not gapless in Safari. The dual-deck crossfade solution (ADR 0004) required managing an equal-power crossfade loop, deck lifecycle (active/standby swap), `sessionStorage` playhead persistence across full-page navigations, and a safety-net `ended` listener for crossfade failures — approximately 250 lines of vanilla TypeScript.

**Three.js scene lifecycle in an MPA.** Without a client-side router, each navigation is a hard reload. Every scene must initialise all GPU resources once and dispose them completely on `beforeunload` to avoid leaks. The scene architecture in `src/lib/three/` reflects this: entry points (`homeScene.ts`, `projectsScene.ts`) are dynamically imported modules that run top-to-bottom on load and register a single `beforeunload` handler.

**Static locale routing without server middleware.** Three separate pre-rendered HTML trees are built at compile time. Client-side locale detection (inline script reading `navigator.languages`) redirects once per session, guarded by `sessionStorage` to prevent redirect loops. This keeps the build output host-agnostic while delivering the correct locale to most visitors without a perceptible delay.

**Registry enrichment vs. build-time sync.** ADR 0006 documents a bug introduced by ADR 0005: the `prebuild` sync was overwriting the enriched `public/data/skills-registry.json` with the raw scan on every Vercel build, silently downgrading ~1,850 lines of measured data. The fix was to remove the sync from `prebuild` entirely and treat the committed enriched file as canonical — the same posture already established for the committed PDF.

## Scale / Performance Considerations

Lighthouse scores (mobile preset, measured at audit 2026-05-17) across all 12 routes: Performance 96–99, Accessibility 95–100, Best Practices 100, SEO 100. CLS is 0.000 on all WebGL pages.

Initial JS bundle sizes (uncompressed): `homeScene` (52 kB) and `projectsScene` (39 kB) are dynamically imported only on the pages that need them. `BaseLayout.js` accounts for 153 kB raw / ~52 kB gzipped. Three.js scenes are skipped entirely on small viewports and when `prefers-reduced-motion: reduce` is set, with a static fallback — reducing both parse cost and GPU load for those visitors.

All Three.js resources (geometries, materials, textures, render passes) are explicitly disposed on `beforeunload`, preventing GPU memory leaks across sessions that revisit the same tab.
