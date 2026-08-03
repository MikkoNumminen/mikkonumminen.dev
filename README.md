# mikkonumminen.dev

Personal portfolio of Mikko Numminen — full-stack developer from Finland.

**Live:** https://mikkonumminen-dev.vercel.app

This is intentionally not a typical web app. It's a visual showcase, with each page built as its own concept and animation.

## The four pages

- **`/`** — Immersive scroll experience. A WebGL particle field forms the name, then scatters into a starfield behind the content on scroll. GSAP scroll triggers, parallax sections, animated nav cards.
- **`/projects`** — Interactive solar system. Each project orbits a central sun. Hover a planet for the elevator pitch, click to zoom in.
- **`/experience`** — Parallax mountain landscape. A goat climbs as you scroll. The sky shifts from pre-dawn to bright day across the climb. Timeline markers fade in along the way.
- **`/contact`** — Terminal / CRT aesthetic. Real command parser, command history, tab completion, scan lines, blinking cursor, copy-to-clipboard. Try `help` for the command list — `skills` and `download --catalog` surface the live cross-repo skill registry.

Page-to-page navigation is client-side (Astro `ClientRouter`), animated with the built-in view transition; the music bed survives the swap.

## Languages

Available in English and Finnish, served from `/` and `/fi`. English is the default locale and is served without a prefix. Translations live under `src/i18n/locales/`. Swedish was removed in 2026-08: it was machine-translated and never reviewed by anyone who reads it, and a third locale taxed every feature that ships copy.

## Audio

A looping music bed plays across every page, dual-decked and crossfaded so the loop join is inaudible. On `/`, on `/projects`, and on any blog post that has a recording, a locale-specific voice is layered on top of the music. A single floating **sound on/off** button in `BackgroundAudio.astro` controls both tracks via a custom `bg-audio:state` event; on/off preference and music playhead persist across navigation through `sessionStorage`. No voice autostarts — they kick in after the audio toggle resolves.

All three respect `prefers-reduced-motion: reduce` by staying silent; music plays in all cases. Beyond that, the home and projects clips are short spoken flourishes and recycle on a 50-second idle window so an active visitor isn't re-narrated at. Blog narration is a reading of the post, minutes rather than seconds long, so it never replays — a reader sitting still is listening rather than idle. It also remembers where you were: the position rides `sessionStorage`, keyed by post and locale, so leaving a sixteen-minute reading at minute seven and coming back resumes there instead of starting over. Toggling sound off and on partway through continues rather than restarting; once a reading has finished, cycling the toggle leaves it finished rather than replaying it.

Assets live in [`public/audio/`](public/audio/) and are keyed by locale: `voice-landing-{en|fi}.mp3` (home) and `voice-projects-{en|fi}.mp3` (galaxy view). Blog narration is keyed by entry as well as locale, at `public/audio/blog/<slug>-<locale>.mp3`; see [`public/audio/blog/README.md`](public/audio/blog/README.md) for the convention and the `hasAudio` frontmatter flag that registers it. A locale without a recording 404s the audio element silently on home and projects, and on a blog post renders no element at all, since the flag says whether the file is there.

## RAG chat (optional, fully local)

The `/contact` terminal accepts free-form questions in addition to its built-in
commands. When you type something the command parser doesn't recognise, the
input is routed to a retrieval-augmented-generation pipeline that answers from a
curated corpus of project descriptions, CV, and selected posts — Mikko's own
words, retrieved and grounded, not a general-purpose chat model.

```
static Astro terminal ──fetch──▶  FastAPI backend ──▶ Postgres + pgvector
                                                  └──▶ Ollama  (qwen2.5:7b)
Offline indexer ──embeds corpus──▶ Postgres + pgvector
Embeddings (bge-small-en-v1.5) run in-process inside the backend container.
```

The stack is a **separate, optional service** that runs on the repo owner's
own machine (see [ADR 0009](docs/decisions/0009-rag-chat-backend.md) — it
reconciles the static-output requirement from ADR 0002 with a dynamic backend).
Load-bearing properties:

- **The site stays 100% static.** ADR 0002 is preserved intact. The only
  addition on the frontend is the build-time `PUBLIC_CHAT_API_URL` env var and
  ordinary client-side `fetch` calls — no SSR, no edge functions, no runtime
  secrets.
- **Fully local, zero marginal cost.** Postgres + pgvector, in-process
  fastembed `bge-small-en-v1.5` embeddings, and a local Ollama instance
  (`qwen2.5:7b` by default, switchable via `ragctl`) all run in Docker on
  Mikko's own machine. No hosted model, no paid API,
  nothing per query.
- **Progressive enhancement, never a regression.** At page load the terminal
  fires one `GET /health` probe. The endpoint reports liveness of both the
  database and the LLM, but the terminal unlocks chat only when `checks.llm` is
  `true` — a real 1-token completion confirming the model actually generates.
  When the backend is
  absent — the default for every static build and every CI run — the terminal is
  byte-for-byte identical to its scripted-only mode: no chat affordance, no
  error, no visual difference.

### Staying in scope — contained architecturally, not by prompt

Because the terminal exposes a real LLM to the public internet, "what if someone
tries to break it out of scope" is answered with layered, architectural
defenses — not a hopeful system prompt. A user who can't be answered from the
corpus, or who tries to redirect the model, hits guardrails that sit outside the
prompt:

- **Grounded-only generation.** The system prompt answers strictly from the
  retrieved CONTEXT and declines when the answer isn't there.
- **Pre-LLM relevance gate.** If the best retrieval is too weak
  (`WEAK_RETRIEVAL_DISTANCE`, default 0.45), the request short-circuits to a
  fixed out-of-scope reply _before_ the model ever runs. The gate anchors on the
  closest _prose_ chunk, so off-topic queries that only graze a stray code chunk
  still get declined.
- **Deterministic task gates.** Two pre-retrieval gates decline on-corpus-sounding
  _task_ requests the small model would otherwise just perform: generative asks
  ("write me a poem/story/song/joke…") and translation asks
  ("translate <text> to <language>").
- **Hard output cap.** `LLM_NUM_PREDICT` (default 1024) bounds generation, so no
  single answer can dump a whole document regardless of the prompt.
- **Input cap.** `INPUT_MAX_CHARS` (default 800; over-length → HTTP 400) plus a Pydantic length
  backstop and a byte-size cap in middleware.
- **Prompt-injection hardening.** The whole user message is treated as a
  question, never as instructions; reveal/ignore-the-prompt and role-play
  requests are declined.
- **Concurrency shedding.** A bounded semaphore around generation sheds excess
  load with a short busy reply instead of queueing.
- **Acceptance harness.** `evals/acceptance.py` runs black-box contract cases
  (injection no-dump, prompt-reveal blocked, off-topic declines, the caps, and
  grounded technical answers) so the containment is regression-tested, not
  assumed.

The indexer covers more than prose: alongside `content/**/*.md` it now ingests
55 architecture-defining source files curated under `content/code/<project>/`
(Python, TypeScript/TSX, JS, C#, Astro, SQL, Prisma, + config). **Code-aware
chunking** splits those by function/class/method boundaries — decorators and
attributes stay with their definition, with a line-window fallback — while prose
stays markdown-block chunked; each chunk carries `language` + `chunk_type`
metadata. Retrieval is **hybrid**: dense pgvector cosine fused with lexical
BM25-style full-text search (`websearch_to_tsquery` + `ts_rank`) via reciprocal
rank fusion, with a hard per-project filter that fails open when a named project
has no hits. Hybrid lifted the measured retrieval hit-rate over pure dense, and
the acceptance harness still passes in full — containment held while deep-code
questions now answer from the actual source.

Full pipeline, every config knob (`HYBRID_ENABLED`, `RRF_K`, the dense/lexical
weights, `PROJECT_FILTER_STRICT`, …), and the threat model are in
[`docs/rag-chat.md`](docs/rag-chat.md); the design rationale is in
[ADR 0009](docs/decisions/0009-rag-chat-backend.md) and
[ADR 0010](docs/decisions/0010-rag-containment.md). Still on the roadmap, not yet
built: cross-encoder re-ranking, automatic per-project summary generation, and
query expansion.

The backend lives in [`chat-backend/`](chat-backend/) with its own README. The
Docker stack (`docker-compose.yml`) and `Makefile` bring everything up with
`make up && make index`, and it's controlled day-to-day via the `ragctl` REPL
(`status`/`up`/`down`/`doctor`/`model`/`english`). For turning it on end-to-end
— including publishing the backend via a Tailscale Funnel for live visitors —
see [`LAUNCH.md`](LAUNCH.md) and the as-built [`docs/rag-chat.md`](docs/rag-chat.md).

## Tech stack

- [Astro](https://astro.build/) — static site generator with island architecture
- [Three.js](https://threejs.org/) — 3D graphics for the home and projects pages
- [postprocessing](https://github.com/pmndrs/postprocessing) — bloom pass on the home particle field
- [GSAP](https://gsap.com/) + ScrollTrigger — scroll-driven animation timelines
- [Tailwind CSS v4](https://tailwindcss.com/) — utility CSS, no component library
- TypeScript (strict, with `noUncheckedIndexedAccess`)

The build output is fully static — no SSR, no edge functions — so it can move from Vercel to any static host (S3 + CloudFront, Cloudflare Pages, etc.) with a config swap.

This stack is intentionally separate from the production stack used in my other projects (Next.js / React / MUI). This repo is the craft side of the brain.

## Local development

Requires Node 22+ (Astro 7; see [`.nvmrc`](./.nvmrc)).

```bash
npm install
npm run dev           # http://localhost:4321
npm run build         # build to dist/
npm run preview       # preview the production build
npm run typecheck     # astro check
npm run verify        # the CI `check` job in one command (typecheck → format:check → lint → test:coverage → build)
npm run verify:backend # the CI `chat-backend` job (ruff → mypy → pytest); needs the Python dev deps installed
npm run verify:e2e    # the CI `Scene smoke (Playwright)` job (install chromium → build → test:e2e)
npm run check:env     # verify Node version + deps are ready on a fresh clone
npm run lint          # eslint
npm run format        # prettier --write across src/
npm run format:check  # prettier --check (CI-friendly)
npm run build:og      # rasterize the OG cards from the source SVGs
npm run sync:skills-registry  # copy latest dated SKILL-REGISTRY-*.json → public/data/
npm run validate:registry     # check public/data/skills-registry.json against its JSON schema
npm run validate:shoutbox     # check public/data/shoutbox.json against its JSON schema
npm run build:skills-pdf      # regenerate public/skills-registry.pdf via local Chrome
npm test              # run the Vitest suite (src + scripts unit tests)
npm run test:watch    # Vitest in watch mode for TDD
npm run blog:drafts   # scaffold blog drafts from git history into src/content/blog/en/
```

`npm run verify` exists so there is one command an agent can run to reproduce the
CI `check` job locally, in the same order. Running the five steps separately and
stopping at the first green one is the failure mode it removes.

`build:og` reads `public/og-*.svg` and writes the PNGs referenced by `<head>` meta. Run it whenever any of those source SVGs change.

`prebuild` runs `validate:registry && validate:shoutbox && render:audit-pdfs && build:skills-pdf` automatically on every `npm run build`. `validate:shoutbox` is the same idea for the contact page's shoutbox: it checks the committed `public/data/shoutbox.json` against [`public/data/shoutbox.schema.json`](public/data/shoutbox.schema.json) and skips silently when the file is absent, which is the normal state until the first message is approved. `validate:registry` checks the committed `public/data/skills-registry.json` against [`public/data/skills-registry.schema.json`](public/data/skills-registry.schema.json) (dependency-free schema validation, so a malformed registry fails the build instead of silently breaking the terminal). The two renderers use the local Chrome's `--print-to-pdf` flag and skip silently in CI environments, where the committed PDFs are the canonical artifacts for hosted builds. The skills-registry JSON the terminal fetches is likewise a canonical committed artifact: `apply-measurement-overlay` and `build-review-stats` layer transcript-measured receipts and A/B buckets onto it from local `~/.claude` data that can't be read on a build server, so `sync:skills-registry` is the first step of the manual `/skill-localUpdate` refresh chain rather than a prebuild step — auto-syncing the raw dated registry would overwrite that enrichment. Rationale in [`docs/decisions/0005-skill-registry-pdf-surface.md`](docs/decisions/0005-skill-registry-pdf-surface.md).

## Project structure

```
src/
  layouts/        BaseLayout — shared head, nav, client router
  components/     One folder per page (home, projects, experience, contact, nav)
  page-content/   Page-level composition (one .astro per page, wrapped by the routed file)
  pages/          One file per route (.astro), including the /fi mirror
  lib/
    three/        Core Three.js helpers + scene entry points (homeScene, projectsScene)
    home/         Home-page DOM layers (data-feed console, commit popups)
    projects/     Projects-scene building blocks (planets, hover labels)
    timeline/     Experience-page timeline scene helpers
    gsap/         GSAP timelines per page
    terminal/     Terminal command parser and runtime
    blog/         Blog content helpers (entry dates, slug parity)
    observability/ Sentry + Core Web Vitals init
    utils/        Cross-cutting helpers (e.g. escapeHtml)
    debug/        Dev-only diagnostics, stripped from production
  data/           Project metadata, timeline entries
  i18n/           Locale dictionaries and locale-aware path helpers
  styles/         global.css (Tailwind v4 + CSS vars) and per-component CSS
public/           Static assets — favicon, OG images, robots, audio
  data/           Build-synced registry JSON consumed by the terminal `skills` command
scripts/
  check-env.mjs                Fresh-clone sanity check: Node version + deps (npm run check:env)
  build-og.mjs                 OG image rasterizer
  sync-skill-registry.mjs      Copy latest dated SKILL-REGISTRY-*.json into public/data/
  apply-measurement-overlay.mjs  Layer transcript measurements onto the registry
  build-review-stats.mjs       Per-invocation /review token stats (reads ~/.claude)
  bucket-review-invocations.py   Bucket /review invocations by size (feeds build-review-stats)
  build-skills-pdf.mjs         Bespoke HTML-from-JSON renderer; calls scripts/lib/chrome-pdf.mjs
  validate-registry.mjs        Validate public/data/skills-registry.json against its schema (prebuild gate)
  build-pdf.mjs                Generic HTML → PDF CLI (used by the md-to-pdf skill)
  render-audit-pdfs.mjs        Render docs/audits/*.md → committed PDFs (skips in CI)
  render-audit-doc.mjs         Markdown → audit-styled HTML used by the renderer
  build-scoreboard.mjs         Build the review scoreboard artifact
  draw-tokens.mjs              Token-figure chart rasterizer
  lib/
    chrome-pdf.mjs             Local Chrome --print-to-pdf wrapper; size-asserts the output
    validate-json-schema.mjs   Dependency-free JSON-schema validator (tested); backs validate-registry
    escape.mjs                 Shared HTML escaper + http(s) URL allowlist
    cli-args.mjs               Tiny argv parser (tested)
    node-version.mjs           Semver-minimum check backing check-env (tested)
    scoreboard-stats.mjs       Scoreboard aggregation (tested)
    transcript-tokens.mjs      ~/.claude transcript token accounting (tested)
```

Several `scripts/` and `scripts/lib/` modules have co-located `*.test.mjs` suites run by `npm test`.

## Performance & accessibility

- Three.js is dynamically imported and only loaded on the pages that need it
- Three.js scenes are skipped entirely on small screens and when `prefers-reduced-motion: reduce` is set, with a static fallback
- All animations respect `prefers-reduced-motion`; all three voiceovers (home, projects, blog) also skip narration on RM (music still plays)
- Skip-link, semantic landmarks, ARIA labels, focus-visible rings per theme
- All Three.js resources are explicitly disposed on client-side navigation away from a scene's page

## AI tooling

Custom Claude Code skills live in [`.claude/skills/`](.claude/skills/) — version-controlled, reviewed when added, audited per run. The automation skills spawn N parallel Sonnet sub-agents that return structured reports; an Opus synthesizer applies the agreed-on rules and opens a PR, and the orchestrator never merges — human review is the gate. The RAG skills are knowledge-and-harness specs a session loads instead of re-deriving the architecture or test battery from scratch.

### Skills shipped in this repo

- **`/sync-readmes`** — audits this site's project data (`src/data/projects.ts` + en/fi `projectsData`) against the canonical READMEs of all 6 sibling repos in parallel. Opens a PR with drift corrections — factual fixes mirrored to both locales, tech-list additions in `projects.ts`.
  - **Token economics per run:** ~140K Sonnet input across 6 parallel sub-agents, ~10K kept on the orchestrator's main context (vs ~31K if read inline), ~45s parallel wall-clock, ~$0.80 in API spend.
  - **Results to date** (2 runs): 15 factually wrong copy fixes across three locales (test counts, engine counts, normalization-pass counts), 14 missing tech tags across 5 projects, 4 cross-project link gaps caught.
- **`/skill-registry`** — walks every sibling repo in the workspace (resolved as the parent of this repo), finds each `.claude/skills/*/SKILL.md`, and emits a consolidated JSON registry (name, description, redirect flag, token-savings receipt where one exists). One Sonnet sub-agent per repo, in parallel; main thread aggregates and writes [`.claude/agent-verdicts/SKILL-REGISTRY-{YYYY-MM-DD}.json`](.claude/agent-verdicts/). The JSON is the source of truth for "what skills the portfolio operates today" — other Claude sessions read it without re-running the scan. The `/skill-localUpdate` chain syncs the latest dated JSON into `public/data/` and layers measured receipts on top, so the contact-page terminal's `skills` and `download --catalog` commands serve the enriched committed registry. (It is not auto-synced at build time — that would overwrite the enrichment with the raw scan.)
  - **Token economics per run:** ~80K Sonnet input across 3 parallel sub-agents, ~5K main-thread aggregation, ~30s parallel wall-clock.
- **`/md-to-pdf`** — renders any HTML document to a styled PDF using the developer's locally-installed Chrome via `--print-to-pdf`. Zero npm install — no puppeteer or Chromium download (~150MB avoided). Page setup (orientation, size, margins) lives in the HTML's `@page` CSS, so the caller controls layout fully. The skill assembles the HTML in-context (markdown → HTML conversion + per-document CSS) and invokes [`scripts/build-pdf.mjs`](scripts/build-pdf.mjs); a content-aware wrapper at [`scripts/build-skills-pdf.mjs`](scripts/build-skills-pdf.mjs) powers the `download --catalog` registry PDF. Rationale in [`docs/decisions/0005-skill-registry-pdf-surface.md`](docs/decisions/0005-skill-registry-pdf-surface.md).
  - **Token economics per use:** ~10K Read of the source + ~10-15K HTML composition + ~1K Bash + ~1K verify ≈ ~25K end to end, ~15-20s wall-clock including Chrome render.
- **`/skill-localUpdate`** — one-command refresh of every local artifact the site renders about portfolio skills: the JSON the `/contact` terminal fetches at runtime, the measurement-overlaid annual totals, and the downloadable skills-registry PDF. Wraps a pre-flight check plus four sequenced steps: `/skill-registry` (re-walk the portfolio), `npm run sync:skills-registry` (copy into `public/data/` — what the terminal reads), `node scripts/apply-measurement-overlay.mjs` (layer transcript measurements with `prior_estimate` snapshotting and library-canonical dedupe), `npm run build:skills-pdf` (render via local Chrome). Exists because the chain used to be four manual commands that were easy to run out of order — producing a plausible-looking but wrong artifact (stale terminal table OR PDF that doesn't match what the terminal shows). Renamed from `/skill-pdf` on 2026-05-21 since the PDF is one of three site surfaces this chain updates, not the headline. Spec: [`.claude/skills/skill-localUpdate/SKILL.md`](.claude/skills/skill-localUpdate/SKILL.md).
  - **Token economics per use:** ~80K dominated by step 2's parallel `/skill-registry` sub-agents; steps 1, 3, 4 cost negligible model tokens. Wall-clock ~30–60s.
- **`/rag-backend`** — the architecture map for the RAG chat backend: the FastAPI + Ollama + pgvector stack, the exact `/chat` pipeline order, every config knob with its default, the containment layers, and the corpus re-index runbook. Exists so a session working on the backend loads the map instead of re-deriving it from source every time. Spec: [`.claude/skills/rag-backend/SKILL.md`](.claude/skills/rag-backend/SKILL.md).
- **`/rag-audit`** — the verify/audit battery for the RAG chat: the canonical containment and retrieval test cases (off-topic queries that must refuse, deep-code queries that must answer), the sync → rebuild → re-index → validate runbook, and adversarial review lenses. The acceptance cases live here once instead of being re-invented per hardening pass. Spec: [`.claude/skills/rag-audit/SKILL.md`](.claude/skills/rag-audit/SKILL.md).
- **`/rag-experiment`** — the eval-gated, single-variable experiment harness for pipeline swaps (model, embedder, chunking, reranker): a TOML config that declares exactly what varies, a runtime lock-assert that refuses apples-to-oranges comparisons, and AI-free measurement discipline — the only tokens a run spends are the generations under test. Spec: [`.claude/skills/rag-experiment/SKILL.md`](.claude/skills/rag-experiment/SKILL.md).

Of the seven, the first four ship with a written verdict or ADR. The three RAG skills are knowledge-and-harness skills — their SKILL bodies are the rationale, with [`docs/rag-chat.md`](docs/rag-chat.md) as the shared as-built reference, and no token receipts are claimed for them. Token figures vary in their grounding — see each linked doc for the specific "editorial vs measured" split:

- `/sync-readmes` → [`.claude/agent-verdicts/README-SYNC-AGENT.md`](.claude/agent-verdicts/README-SYNC-AGENT.md) — **measured**: per-sub-agent token figures from 2 real runs (Run 1 sum: 141,080), cumulative drift caught, design comparison vs inline-on-Opus.
- `/skill-registry` → [`.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md`](.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md) — **editorial-grade**: design rationale, schema gaps, validation notes; numbers are author-estimated until the in-progress `/skill-usage` measurement tool lands measured values. Backed by dated JSON snapshots committed alongside every refresh.
- `/md-to-pdf` → [`docs/decisions/0005-skill-registry-pdf-surface.md`](docs/decisions/0005-skill-registry-pdf-surface.md) — **design ADR** (covers the broader contact-terminal PDF surface, of which `/md-to-pdf` is one consumer): why local-Chrome over puppeteer, layout-via-`@page`, the content-aware wrapper for `download --catalog`.
- `/skill-localUpdate` → [`.claude/skills/skill-localUpdate/SKILL.md`](.claude/skills/skill-localUpdate/SKILL.md) — **author estimate** (no separate verdict doc — the SKILL body holds the chain spec, expected-token table, and failure-mode notes). The chain's measurement step (`scripts/apply-measurement-overlay.mjs`) is what populates every measured receipt elsewhere on the page.

The "tokens saved" framing throughout these docs is mostly **context-budget savings** — keeping Opus's orchestrator context free for synthesis work without triggering compaction — not direct dollar savings. Dollar savings vs an inline read are modest; the real win is the surface-area map across sibling repos that nobody hand-grep-audits.

The portfolio-wide registry that aggregates skills from every sibling repo lives in [`.claude/agent-verdicts/SKILL-REGISTRY-LATEST.json`](.claude/agent-verdicts/SKILL-REGISTRY-LATEST.json) and is downloadable from the contact terminal via `download --catalog`; it's not republished here because this section is about what ships in this repo.

## Observability

Client-side errors and Core Web Vitals (LCP, CLS, INP, FCP, TTFB) are reported to Sentry from real visitors. Activation is gated on the `PUBLIC_SENTRY_DSN` env var — forks without it run silent. Do Not Track is honored (init bails early). No session replay, no PII capture beyond Sentry defaults (URL, browser, stack trace). The init lives in `src/lib/observability/initObservability.ts` and is called once from `BaseLayout.astro`. Rationale + alternatives in [`docs/decisions/0001-observability-sentry.md`](docs/decisions/0001-observability-sentry.md).

## Deployment

Deployed on [Vercel](https://vercel.com/) with caching and security headers configured in [`vercel.json`](./vercel.json):

- Long cache (1 year, immutable) for `/_astro/` hashed assets and `/fonts/`
- Short cache (1 day) for OG images and favicons
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, and `Content-Security-Policy` on every response

Deploys are automatic on every push to `master`.

### Security headers

The CSP shipped in `vercel.json` is deliberately baseline rather than strict:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
media-src 'self';
connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://paskamyrsky.tail6ed53b.ts.net;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
worker-src 'none';
manifest-src 'none';
frame-src 'none';
upgrade-insecure-requests
```

`connect-src` allows the Sentry ingest hosts — `*.ingest.sentry.io` plus the regional `*.ingest.us.sentry.io` / `*.ingest.de.sentry.io` — for the observability beacon (see the Observability section above). Chat traffic itself now flows same-origin through the `/api/rag/*` Vercel rewrites ([ADR 0012](docs/decisions/0012-same-origin-chat-proxy.md)); the Tailscale Funnel origin is kept in `connect-src` during the transition and can be dropped once that's verified live. The init module no-ops when `PUBLIC_SENTRY_DSN` is unset, so the Sentry hosts only see traffic on deployments that have the DSN configured.

`'unsafe-inline'` remains on both `script-src` and `style-src` because the site relies on:

- Astro's inline hoists for small island bootstrap code
- A JSON-LD `<script type="application/ld+json">` block in the layout
- An inline language-detection script in `BaseLayout` that runs before hydration
- Scoped inline styles from Astro component frontmatter

Moving to a nonce-based CSP would require plumbing a per-request nonce through every inline tag, which breaks the "fully static output" constraint (nonces must change per response). HSTS, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `upgrade-insecure-requests` cover the rest of the hardening surface in the meantime.

## License

[MIT](./LICENSE)
