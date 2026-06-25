---
title: Portfolio — engineering deep-dive
project: portfolio
---

# Portfolio — Engineering Deep-Dive

This document covers the specific hard problems encountered building mikkonumminen.dev, how they were resolved, and why the alternatives were rejected. It complements the architecture overview and the project summary, neither of which are repeated here.

## The Three.js Scenes: Lifecycle, Teardown, and the GPU Leak Problem

Each of the four pages runs its own Three.js scene. Because the site is a fully static multi-page application with hard navigations between pages, each scene must initialize once and dispose completely on `beforeunload`. There is no client-side router to manage component unmounting; the browser handles that, and `beforeunload` is the only hook.

The home scene (`src/lib/three/homeScene.ts`) is the most elaborate. At the end of its `dispose()` method, every allocation is manually freed: geometries, all six lights, the environment map and its PMREM generator, the `EffectComposer` with its passes, the bloom pass's internal `UnrealBloomPass` resources, the title `MeshPhysicalMaterial`, the four-world gradient `titleColorMap` texture, meteor instances, impact-text instances, collision-spark instances, per-letter flash lights, and the `WebGLRenderer` itself. Missing one item leaves a GPU memory leak that accumulates each time a visitor navigates back to the page in the same tab.

The `disposeMaterial` helper in `src/lib/three/disposeMaterial.ts` was extracted because Three.js types `Object3D.material` as `Material | Material[]`. Without normalizing this union, every call site had to repeat the array check. The helper makes the dispose loop readable and the type handling testable.

A subtler problem was the `EffectComposer`'s passes. Three.js's `composer.dispose()` does not release the `ShaderMaterial` or fullscreen-quad geometry owned by `RenderPass` and `OutputPass`. The `disposePasses` helper in `src/lib/three/disposePasses.ts` iterates `composer.passes` and calls `pass.dispose()` on each before calling `composer.dispose()`, covering the gap.

The DPR cap is another non-obvious resource decision. The default cap is 1.5 rather than the browser's native value (up to 3 on some mobile devices). At DPR 2 the internal buffer is 4x the CSS-pixel area; the `UnrealBloomPass` 5-mip downscale and composite scale linearly with pixel count, and on a 144 Hz display the render loop fires 2.4x as often as on 60 Hz. Without the cap, the home scene's bloom + `MeshPhysicalMaterial` + 900-star galaxy was burning roughly 40-60% of one CPU core on high-refresh monitors for no visible improvement. The cap lives in `src/lib/three/resolvePixelRatio.ts` and is called by both `createRenderer` (at init) and `createResizeHandler` (on each resize event). The reason to extract it: a past regression set the resize-handler cap to a hardcoded `2` while init used `1.5`, silently re-upgrading the DPR back to the native value on every resize on retina displays. Sharing one helper from both call sites makes that class of drift impossible.

### Reduced-Motion and the Two-Speed Architecture

`prefers-reduced-motion: reduce` is honored by completely skipping the Three.js scenes rather than just slowing them. A static fallback image is rendered instead. The `reducedMotion` flag threads through the scene's entire tick loop: when true, the entrance animation is skipped (the title renders at its final pose immediately), the per-frame camera orbit is zeroed, the rAF-driven pointer-lean is disabled, the meteor system does not run, impact popups are suppressed, and the bloom composer is not created at all. For the bloom pass specifically, the gain from skipping it is the full cost of the RenderPass + UnrealBloomPass + OutputPass chain, which is the single most expensive part of the rendering path.

Voiceover layers (home and projects pages) mirror the same gate: the `HeroVoiceover.astro` script reads `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at load time and branches entirely, so no audio is ever loaded or played for reduced-motion users from the voice layer. Music continues because it is ambient rather than attention-demanding; the voiceover gate is deliberately separate from the music toggle.

### Responsive Layout Math and the Frustum-Fit Problem

The home scene's title occupies the right third of the frame; the galaxy sits in the left third. On narrow-aspect viewports (portrait tablets, phones in landscape) the design positions clip both objects outside the visible frustum. The title clips on its right edge and the galaxy clips on its left edge.

The fix for the title is in `responsiveTitleScale` (`src/lib/three/responsiveLayout.ts`). Two constraints combine: a `widthScale` that shrinks the title proportionally below a design-width breakpoint (1100 px), and a `fitScale` derived from the frustum's visible half-width at the title's z-plane. The frustum-fit cap is hard: clipping is worse than small text. The readability floor (`TITLE_MIN_SCALE = 0.3`) is soft and yields to the fit cap. The ordering matters — `Math.min(fitScale, Math.max(minScale, idealScale))` — because `Math.max(minScale, idealScale)` could produce a value larger than `fitScale`, re-introducing clipping; the outer `Math.min(fitScale, ...)` prevents that.

The galaxy has a symmetrical problem. Its design x-position (`-13` world units) sits outside the visible frustum at its z-plane (`-13` world units deep) on narrow viewports. `responsiveGalaxyX` computes the most-negative x that keeps the entire disk (radius 8) inside the frustum with 1 world-unit of breathing room, and clamps between `designX` and `0`. Mutating `galaxyCenter` at resize time propagates to the meteor spawn and target logic because `buildMeteors` reads `galaxyCenter` by reference; this avoided wiring a resize callback into the meteor system at the cost of coupling the two through a shared mutable `Vector3`.

### The 60 fps Cap on High-Refresh Displays

The render loop issues `requestAnimationFrame` without any explicit frame-rate control by default, which on a 240 Hz display fires the tick four times as often as on 60 Hz. The home scene solves this with a `TARGET_FRAME_MS = 1000/60 - 1` guard: each tick records `lastFrame = performance.now()` and exits early if less than `TARGET_FRAME_MS` ms has passed. Because all simulation reads `delta = (now - lastFrame) / 1000`, capping the render rate does not break motion timing.

### The userData Type Safety Problem

Three.js types `Object3D.userData` as `Record<string, any>`. The home scene stores `charIndex` and `line` integers on each letter mesh's `userData` to identify which letter was clicked by the raycaster. Reading them back as `mesh.userData.charIndex as number` is an unchecked assertion: if the key is ever absent or mistyped, the result is `NaN` or `undefined`, which feeds silently into the ripple math and produces invisible bugs.

The `userDataNumber` helper (`src/lib/three/userData.ts`) validates `typeof v === 'number' && Number.isFinite(v)` and falls back to a provided default. It is unit-tested in `userData.test.ts`. The trade-off was a judgment call: a fully typed discriminated union per mesh type would have been cleaner but required restructuring the scene's object graph. The helper is the minimum change that converts the self-made boundary from unchecked to checked.

### The Offscreen Pauser

The home scene's canvas is `height: 100vh`. Once the user scrolls past the hero, the canvas is fully out of view, and there is no point continuing to render. An `IntersectionObserver`-based `createOffscreenPauser` (`src/lib/utils/createOffscreenPauser.ts`) watches the canvas and cancels `requestAnimationFrame` when the canvas is not visible. The pauser also gates on `document.hidden` (tab backgrounded): when both the canvas is off-screen and the tab is hidden, no rAF runs. On resume (canvas scrolls back into view, or tab foregrounded) `lastFrame` is reset to `performance.now()` before re-entering `tick()` so the first `delta` after a long pause is not hours large.

---

## Audio Orchestration: the Dual-Deck Crossfade State Machine

### Why HTML5 `loop` Is Not Gapless

HTML5 `loop` instructs the browser to seek to the start when the audio ends. In practice, browsers re-buffer the start of the file before resuming, introducing a 50-200 ms silent gap at the join. On Safari (iOS and macOS) this gap is consistently audible on a looping music bed. ADR 0004 documents three alternatives that were evaluated and rejected:

- **Web Audio API `AudioBufferSourceNode`**: sample-accurate, genuinely gapless. Rejected because it requires decoding the full audio file into a float32 buffer in memory (a 3-5 minute track is significant memory), complicates the autoplay-unlock flow by adding `AudioContext` resume to the state machine, and offers marginal quality improvement over the dual-deck approach given the 1.5-second crossfade window.
- **`ended` + `currentTime = 0` + `play()`**: identical in effect to `loop` — the gap is the same re-buffering delay.
- **Linear crossfade**: `outgoing.volume = 1 - t` / `incoming.volume = t` causes a perceived loudness dip at the midpoint because both decks at 50% is quieter than one at 100%.

### The Implementation

`BackgroundAudio.astro` renders two `<audio>` elements (`bg-audio-a`, `bg-audio-b`) sharing the same source file. A `timeupdate` listener on the active deck triggers the crossfade when `duration - currentTime < CROSSFADE_SEC` (1.5 seconds). The crossfade uses equal-power curves:

```
fadeOut = Math.cos((Math.PI / 2) * t)
fadeIn  = Math.sin((Math.PI / 2) * t)
```

Because cos²θ + sin²θ = 1, combined power stays constant throughout the overlap. At `t=1` the outgoing deck is paused and reset to `currentTime = 0`; `activeKey` flips from `'a'` to `'b'`. A `requestAnimationFrame` loop drives the crossfade for exactly `CROSSFADE_SEC` and then terminates.

The standby deck is not loaded until the crossfade window opens (`prefetchStandby` calls `standby.load()`), keeping it out of the network until needed.

An `ended` listener on both decks is the safety net: if the crossfade rAF loop never fires (duration unavailable, standby refused to play, browser timing hiccup), the active deck hits `ended` and restarts from `currentTime = 0`. The worst case is a sub-frame gap, not permanent silence.

Playhead persistence across hard navigations uses `sessionStorage`: on `beforeunload`, `activeKey` and `currentTime` are written. On the next page's `DOMContentLoaded`, the values are read, the correct deck is seeked, and play resumes. This keeps the music continuous across all four pages even though each navigation is a full browser reload.

### The Voiceover Layer

`HeroVoiceover.astro` (home page) and `ProjectsVoiceover.astro` (projects page) each add a locale-keyed narration on top of the music bed. The two files are intentionally duplicated (not abstracted into a shared component) and carry `// PARALLEL TO` header comments so bug fixes mirror correctly.

The voiceover coordinates with the music through a single `bg-audio:state` custom event dispatched by `BackgroundAudio` on every toggle. The voiceover never eagerly auto-plays; it waits for the `bg-audio:state` event with `detail.on === true`. This avoids two races the doc-block describes explicitly:

1. On first visit with autoplay permitted, the voiceover would start, then `bg-audio:state` would fire again when `tryPlay()` settled, restarting the clip mid-sentence.
2. On a click that both unlocks autoplay and toggles the toggle, `BackgroundAudio`'s `tryPlay()` and its toggle handler both emit the event on one click; without the `if (!voice.paused) return` guard, the second dispatch would restart the voice from zero.

The idle-replay timer rearms the voiceover after the user has been still for 50 seconds (pointerdown / touchstart / keydown / scroll reset the clock; `pointermove` is deliberately excluded because a drifting mouse would prevent the timer from ever firing). An actively scrolling or clicking visitor never gets re-narrated; a tab-parked visitor eventually hears the clip again.

A Safari edge case in the voiceover: if the audio source file 404s (a locale without a recorded narration), Safari's `<audio>` element is in `HAVE_NOTHING` state and throws `InvalidStateError` on any `currentTime` write. The `playFresh` and `playResume` helpers wrap `currentTime`, `volume`, and `play()` inside a `try/catch` so a missing locale file degrades silently.

---

## The CSP and the Static-Output Constraint

The Content Security Policy lives in `vercel.json` and applies to every response. The key tension is `'unsafe-inline'` on `script-src` and `style-src`. Removing it would require per-request nonces embedded in every inline script and style tag — which is architecturally incompatible with a fully static build. Static files cannot vary per response; there is no server to inject a nonce. ADR 0002 documents this constraint: the static-output posture is the governing decision, and the CSP reflects it rather than the other way around.

The practical XSS risk from `'unsafe-inline'` on a static site with no third-party scripts is low: inline-script injection requires either server-side reflected HTML (impossible here) or compromising the build output itself. The mitigation is kept at the other end of the chain — every string that reaches an `innerHTML` sink is escaped through `escapeHtml` (tested in `escapeHtml.test.ts`), and streamed LLM output is set via `textContent`, never `innerHTML`.

When the RAG chat backend was added, the `connect-src` directive gained the Tailscale Funnel origin (visible in `vercel.json` as `https://paskamyrsky.tail6ed53b.ts.net`). The Sentry regional ingest endpoints (`*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.ingest.de.sentry.io`) are also explicit in `connect-src`. Everything else is `'self'`.

---

## The RAG Chat: Reconciling a Dynamic Service with a Static Site

### The Core Tension

The contact terminal wanted free-form Q&A grounded in Mikko's own content. RAG needs a vector database and an LLM at request time. Adding either SSR routes or managed cloud services would contradict ADR 0002 and introduce per-token billing on a personal portfolio. ADR 0009 resolves this by building the chat as a separate backend service — a single FastAPI + uvicorn process the static site calls over `fetch`, never as part of the site's own runtime. Generation is a local model served by Ollama through its OpenAI-compatible endpoint (`qwen2.5:7b` by default, switchable via `ragctl`); embeddings are `bge-small-en-v1.5` (384-dim, asymmetric query/passage prefixes) run in-process; the vector store is Postgres + pgvector over asyncpg. The full as-built reference — exact pipeline ordering and every config knob — lives in [`docs/rag-chat.md`](../../docs/rag-chat.md); this deep-dive covers only the hard problems.

The frontend side of this contract is `PUBLIC_CHAT_API_URL`: a build-time environment variable. When unset (the default in CI and local builds), every function in `src/lib/terminal/chat.ts` is inert — no fetch, no DOM change, no affordance. The terminal is byte-for-byte identical to the no-backend state. When set, the page runs one `/health` probe at load time; the probe is memoized for the session.

### The Health Probe and Live Availability Polling

The `/health` probe is not a simple liveness check. The endpoint (`chat-backend/app/health.py`) sends a real 1-token completion to the local LLM and reports `checks.llm === true` only when generation is confirmed working. A cold model (VRAM warm-up after Docker start) can take several seconds to respond, so the probe timeout is set to 5000 ms — generous enough that an up-but-cold backend is not judged unavailable on first visit, but a truly-off backend (which refuses the connection immediately) never reaches the timeout.

Beyond the initial probe, `startChatAvailabilityPolling` re-probes every 25 seconds and on each `visibilitychange` event. It calls `onChange(available)` only on transitions, so the chat affordance appears or disappears as the backend is toggled on and off without a page reload. When `PUBLIC_CHAT_API_URL` is not set, the function returns immediately and no probe ever fires.

If a mid-session `/chat` call fails after a successful probe, `disableChatForSession()` latches `sessionDisabled = true` and `lastKnownAvailable = false`. All subsequent availability checks short-circuit to `false` immediately, and the terminal stays in scripted-only mode for the rest of the session.

### The Weak-Retrieval Guardrail

`app/guardrails.py` implements a deterministic gate in front of LLM generation: when retrieval returns no chunks, or when every chunk's cosine distance exceeds `WEAK_RETRIEVAL_DISTANCE`, the pipeline returns a canned refusal (`WEAK_RETRIEVAL_REPLY`) without ever calling the model. This means a clearly off-topic question cannot be answered from hallucinated content regardless of how the system prompt is worded. The canned reply matches the system prompt's own refusal phrasing so both paths read identically to a visitor.

The threshold is conservative — it errs toward answering — because the system prompt (`app/prompts.py`) handles borderline cases. The guardrail exists to catch the clearly-irrelevant tail, not to second-guess the model on marginal matches.

### Containment: a Public LLM, Defended in Depth

The weak-retrieval gate is one layer of several. Because the Funnel exposes the model to the public internet, a single prompt-level instruction ("ignore your instructions and …") cannot be the only thing standing between a hostile message and a runaway generation. The hardening is therefore architectural, with each layer holding independently of the ones around it.

The cheapest checks run first. Input length is capped in the `/chat` handler at `INPUT_MAX_CHARS` (default 800, returning HTTP 400), with a Pydantic `max_length=4000` backstop (422) and a `MAX_BODY_BYTES` (default 16384) byte cap enforced in ASGI middleware before the body is even parsed — so an oversized request is rejected without touching retrieval or the model. The weak-retrieval gate then short-circuits before any LLM call. Only past both does generation run.

The system prompt is a constant — it is never assembled from user text — and it is written to treat the entire user message as a question, never as instructions; to answer only from the retrieved context; to refuse to reveal or override itself or role-play another assistant; and to decline generative off-task requests (poems, stories, code). Even if all of that were talked around, `LLM_NUM_PREDICT` (default 512) is a hard `num_predict` cap, so no single answer can dump a large document regardless of what the prompt is coaxed into.

Two more layers protect the host rather than the content. Concurrency into Ollama is bounded by an `asyncio.Semaphore` (`LLM_MAX_CONCURRENCY`, default 2) acquired with a bounded wait (`LLM_ACQUIRE_TIMEOUT_SECONDS`); when no permit is free, excess load is shed with a short busy reply instead of queueing, and the permit is released on every exit path — including a client that disconnects mid-stream, which is the leak that's easy to miss. A per-IP sliding-window rate limit (`RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW_SECONDS`, defaults 30 / 60) caps sustained abuse.

For tuning, opt-in score logging (`RAG_LOG_FILE`, empty disables it) writes one JSON line per request — the truncated query, the top cosine distances, the gate decision, and the response length — so threshold changes are driven by real numbers rather than guesses. And the whole contract is pinned by a black-box acceptance harness (`evals/acceptance.py`, run with `python -m evals.acceptance`): nine cases covering injection-no-dump, prompt-reveal-blocked, off-topic poem and trivia declined, the input cap at 400 and the oversized-body 422, and three grounded technical answers. The classifiers are anchored on the real refusal wording, so a regression that quietly changes behaviour cannot false-pass the suite.

### The Markdown-Strip in the Pipeline

`_strip_markup` in `app/pipeline.py` strips `*` and backtick characters from each streamed token before it reaches the frontend. The reason: the terminal renders raw text, so any markdown the model emits (`**bold**`, backtick-code) would display as literal characters. The strip is applied per-token safely because these characters have no cross-token state — a `**` split across two tokens loses each `*` independently. The `#` character is deliberately not stripped because it appears in real content (for example, "C#" as a programming language name).

### The SSE Protocol and the Incremental Parser

`POST /chat` returns Server-Sent Events: a `sources` frame first (so the terminal can render the retrieved document references while tokens are still streaming), then repeated `token` frames, then `done` or `error`. The wire format is defined in `app/sse.py`: each frame is `event: <name>\ndata: <json>\n\n`. `json.dumps` with `ensure_ascii=False` keeps non-ASCII corpus content intact and its newline escaping prevents a token containing a literal newline from breaking the single-line `data:` framing.

The frontend parser (`createSSEParser` in `src/lib/terminal/chat.ts`) is incremental: it accumulates raw chunks, holds back a trailing lone `\r` that might be the head of a `\r\n` pair whose `\n` arrives in the next chunk, then normalizes and splits on `\n\n` to extract complete frames. A `\r` held back and immediately joined into `\r\n` on the next chunk produces one `\n`, not a spurious `\n\n` frame separator. Token text is written to a span via `textContent`, never `innerHTML`, so streamed model output is not an XSS sink regardless of what the model generates.

### The Idempotent Indexer

The offline indexer (`app/indexer.py`) runs `make index` once and is idempotent across re-runs. Each chunk is keyed by `(source, chunk_index)` in pgvector and carries a `content_hash` (SHA-256 of the exact stored text). On re-index, `select_chunks_to_embed` compares the planned hash against the stored hash per index position; unchanged chunks are skipped and neither re-embedded nor re-written. Chunks for a deleted file are pruned by `delete_sources_absent_from`. Chunks for a shorter version of an edited file (fewer chunks than before) are pruned by `delete_stale_chunks`.

The chunker (`app/chunking.py`) uses a word-based token estimate (words \* 1.4) rather than a real BPE tokenizer. `bge-small-en-v1.5` truncates silently at 512 tokens; the over-counting estimate (English BPE runs roughly 1.3 tokens/word; 1.4 gives headroom) ensures a chunk capped at the ~480-token budget (with a 100-token floor and 60-token overlap) holds comfortably under 512 real tokens. The chunker also handles code fences as atomic units (a ` ``` ` pair is never split across chunk boundaries) and carries a sliding overlap tail between chunks so a fact that spans a boundary stays retrievable from either side. Each chunk carries its `project`, source path, title, and `kind` (`project` | `cv` | `post`) as metadata.

### Project-Aware Retrieval, and Where It's Headed

Retrieval is dense-only today: the top-`TOP_K` cosine neighbours from pgvector, followed by a soft re-rank that detects a named project in the query and floats that project's chunks to the front. It's a boost, not a filter — a question that names "Spacepotatis" surfaces Spacepotatis chunks first but doesn't hard-exclude the rest, which keeps cross-project answers possible at the cost of occasional bleed.

The planned next pass tightens this. The direction (not yet built) is code-aware chunking by function/class boundaries and indexing source and config files rather than only markdown; `language` and `chunk_type` (`prose` | `code`) metadata on each chunk; hybrid retrieval that fuses a BM25/full-text signal with the dense scores via reciprocal rank fusion, so exact identifiers (a function name, a config key) resolve as reliably as prose; and a hard per-project retrieval filter to replace today's soft boost. None of that ships yet — it's the roadmap, and the current behaviour is the soft-boost dense path described above.

### The Stable-Hostname Requirement

`PUBLIC_CHAT_API_URL` is baked into the Vercel static build at deploy time, so the public hostname the frontend `fetch`es has to be permanent — an ephemeral tunnel that gets a fresh random hostname on every restart would force a new Vercel build and redeploy each time Mikko's machine comes back up. The as-built deployment satisfies this with a Tailscale Funnel, which gives a stable public HTTPS hostname (`paskamyrsky.tail6ed53b.ts.net`) that survives restarts: the build is done once and the chat toggles on and off simply by starting or stopping the Docker Compose stack. (The earlier design notes in `LAUNCH.md` assume a Cloudflare _named_ tunnel for the same reason — a stable name — which the live Funnel path supersedes; see [`docs/rag-chat.md`](../../docs/rag-chat.md) for the current as-built deployment.)

---

## The Skills Registry: a Build-Time Enrichment vs. Auto-Sync Bug

### The Bug

ADR 0005 wired a `prebuild` hook (`sync:skills-registry`) that copied the latest dated `.claude/agent-verdicts/SKILL-REGISTRY-{date}.json` into `public/data/skills-registry.json` on every build. This worked initially. Later, `apply-measurement-overlay.mjs` was added to layer transcript-measured receipts (A/B calibration buckets, token-count measurements from actual usage transcripts) onto the raw scan output. These overlay scripts read local `~/.claude` data that does not exist on a build server.

The result: the `prebuild` hook was copying the raw dated file over the enriched committed file on every production Vercel build, silently downgrading approximately 1,850 lines of measured data. The enriched artifact was being destroyed on each deploy.

### The Fix (ADR 0006)

Remove `sync:skills-registry` from `prebuild` entirely. The committed `public/data/skills-registry.json` is now the canonical artifact for hosted builds — the same posture already established for the committed PDF. `sync` is the first step of the manual `/skill-localUpdate` refresh chain; the enriched result is committed and reviewed in a PR. The `prebuild` hook now runs `render:audit-pdfs && build:skills-pdf` only, both of which skip in CI. A `prebuild` JSON Schema validation (`validate:registry`) still runs and fails the build if the committed file is malformed, so a developer who commits a broken registry gets a loud build error rather than a broken terminal.

---

## Testing: Verifying What Can Be Verified

The testing strategy (ADR 0008) was shaped by one structural constraint: Three.js scenes cannot run in jsdom. No WebGL context, no 2D canvas context. Unit tests can exercise pure scene math; they cannot exercise the rendering pipeline or scene initialization itself.

The response was a layered approach. Pure math extracted from scene code — `responsiveTitleScale`, `responsiveGalaxyX`, `resolvePixelRatio`, `easing`, `entranceFlash`, `planetNoise`, `userDataNumber`, `escapeHtml`, terminal dispatch, terminal history, SSE parsing — is tested with Vitest + jsdom. A coverage ratchet fails CI if the covered surface shrinks. WebGL and canvas files are excluded from coverage so the threshold is meaningful rather than showing coverage on paths that cannot run.

The second layer is Playwright: a separate CI job builds the site and loads all four pages in headless Chromium with WebGL via SwiftShader, asserting that each page boots (canvas mounts with non-zero size, no thrown errors, no console errors). This is the verification layer that jsdom structurally cannot provide.

Full visual regression testing (screenshot snapshots per frame) was rejected: the scenes are animated and partly random (starfield placement, meteor spawn timing, time-based camera orbit), and SwiftShader rendering varies across runs. Pixel snapshots would be flaky and high-maintenance for low marginal signal. The acknowledged ceiling is explicit in the ADR: no test asserts a rendered pixel or per-frame scene state. A scene that mounts but renders incorrectly would pass the smoke suite.

The dependency on `npm audit` as a security gate was rejected for a different reason: an unfixable dev-only transitive advisory in `esbuild` (a known open issue, documented in ADR 0007) would keep the gate permanently red. CodeQL with the `security-and-quality` query suite analyzes the actual source code on every push and on a weekly cron instead.
