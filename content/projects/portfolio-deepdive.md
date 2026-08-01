---
title: Portfolio — engineering deep-dive
project: portfolio
---

# Portfolio — Engineering Deep-Dive

This document covers the specific hard problems encountered building mikkonumminen.dev, how they were resolved, and why the alternatives were rejected. It complements the architecture overview and the project summary, neither of which are repeated here.

## The Three.js Scenes: Lifecycle, Teardown, and the GPU Leak Problem

Each of the four pages runs its own Three.js scene. Under client-side routing (Astro `ClientRouter`, ADR 0013) pages swap without a browser reload, so each scene must mount idempotently on `astro:page-load` and dispose completely on `astro:before-swap`. The `onRoute` helper in `src/lib/lifecycle.ts` owns both races: a mount guard collapses the double-fire on a first arrival, and a generation token disposes an async scene that resolves after its page was already swapped away.

The home scene (`src/lib/three/homeScene.ts`) is one particle field: a single `Points` draw call whose particles morph between a galaxy, the formed "MIKKO NUMMINEN" name, a `mikkonumminen.dev` wordmark, a sparse field, and a persistent starfield (ADR 0014, ADR 0016). Its `dispose()` frees the field's geometry, shader material, and sprite texture, the background glow plate (geometry, material, texture), the pmndrs `EffectComposer` (whose `dispose()` cascades through its passes and effects), and the `WebGLRenderer` itself. Missing one item leaves a GPU memory leak that accumulates each time a visitor navigates back to the page in the same tab.

Disposal also releases the WebGL context explicitly (`renderer.forceContextLoss()`): `dispose()` frees GPU objects but the browser only reclaims the context when the detached canvas is garbage-collected, and under client-side routing scenes are created and destroyed per navigation — without the explicit loss, contexts pile toward the browser's cap.

The `disposeMaterial` helper in `src/lib/three/disposeMaterial.ts` was extracted because Three.js types `Object3D.material` as `Material | Material[]`. Without normalizing this union, every call site had to repeat the array check. The helper makes the dispose loop readable and the type handling testable.

The DPR cap is another non-obvious resource decision. The default cap is 1.5 rather than the browser's native value (up to 3 on some mobile devices). At DPR 2 the internal buffer is 4x the CSS-pixel area; the bloom's mipmap blur chain scales linearly with pixel count, and on a 144 Hz display the render loop fires 2.4x as often as on 60 Hz. Without the cap, an uncapped loop on the earlier hero scene was burning roughly 40-60% of one CPU core on high-refresh monitors for no visible improvement. The cap lives in `src/lib/three/resolvePixelRatio.ts` and is called by both `createRenderer` (at init) and `createResizeHandler` (on each resize event). The reason to extract it: a past regression set the resize-handler cap to a hardcoded `2` while init used `1.5`, silently re-upgrading the DPR back to the native value on every resize on retina displays. Sharing one helper from both call sites makes that class of drift impossible.

### Reduced-Motion and the Two-Speed Architecture

`prefers-reduced-motion: reduce` is honored by completely skipping the Three.js scenes rather than just slowing them: the boot script never constructs a scene, the canvas is hidden by CSS, and a static DOM title takes the hero's place. The same gate covers small screens (≤640 px). Because the skip happens before construction, the home scene carries no internal reduced-motion branching at all — and the loading gate is bypassed the same way, so a fallback visitor never waits behind a WebGL warm-up they will not see. A separate performance tier (`?perf=low`, or automatic on 4K-class pixel budgets) keeps the scene but halves the particle count, clamps DPR to 1, and skips the bloom composer entirely — the post chain is the single most expensive part of the rendering path.

The home and projects voiceovers mirror the same gate: the `HeroVoiceover.astro` script reads `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at load time and branches entirely, so no audio is ever loaded or played for reduced-motion users from those two layers. Music continues because it is ambient rather than attention-demanding; the voiceover gate is deliberately separate from the music toggle.

The third voice layer, blog narration, deliberately does NOT take that gate, and the reason is written into its header. The other two add a recurring spoken layer on top of a page the visitor did not ask for: a twenty second clip that replays every fifty idle seconds is attention-demanding in exactly the way the preference is about. A blog narration recurs never, and it cannot begin unless the visitor has already turned sound on themselves. Suppressing it under a motion preference would remove a reading aid from the group most likely to want one, so the gate is absent by decision rather than by oversight.

### Responsive Layout Math and the Frustum-Fit Problem

The formed name must fit the viewport width on any aspect ratio, and the galaxy anchored in the left third must not clip its disk on narrow viewports. Both fits live in the scene's resize handler as pure frustum math — the camera never moves, so the `tan(fov/2)` terms are cached once at construction.

The name's world targets are sampled once at a fixed design width; a `uNameScale` uniform scales the whole block per resize — `min(1, (visibleHalfWidth − padding) / designHalfWidth)` — so the name shrinks to fit but never scales up, with no re-rasterisation on resize. The galaxy's anchor is clamped toward centre just enough to keep the whole disk (radius 8, one world-unit of padding) inside the visible frustum at its z-plane, and never further left than the design anchor. Because every state is expressed through the same uniforms, the scroll-scrubbed morph is unaffected by a resize mid-scroll.

### The 60 fps Cap on High-Refresh Displays

The render loop issues `requestAnimationFrame` without any explicit frame-rate control by default, which on a 240 Hz display fires the tick four times as often as on 60 Hz. The home scene solves this with a `TARGET_FRAME_MS = 1000/60 - 1` guard: each tick records `lastFrame = performance.now()` and exits early if less than `TARGET_FRAME_MS` ms has passed. Because all simulation reads `delta = (now - lastFrame) / 1000`, capping the render rate does not break motion timing.

### The userData Type Safety Problem

Three.js types `Object3D.userData` as `Record<string, any>`. The projects scene stores identifiers on its meshes' `userData` so the raycaster can resolve which project a hovered or clicked object refers to. Reading them back with a bare `as` cast is an unchecked assertion: if the key is ever absent or mistyped, the result feeds silently into the interaction logic and produces invisible bugs.

The validated accessors in `src/lib/three/userData.ts` (the projects scene reads through `userDataString`) check the runtime type and fall back to a provided default; they are unit-tested in `userData.test.ts`. The trade-off was a judgment call: a fully typed discriminated union per mesh type would have been cleaner but required restructuring the scene's object graph. The helper is the minimum change that converts the self-made boundary from unchecked to checked.

### The Offscreen Pauser

The `IntersectionObserver`-based `createOffscreenPauser` (`src/lib/utils/createOffscreenPauser.ts`) cancels `requestAnimationFrame` for renderers whose canvas has scrolled out of view and resumes them when it returns, resetting `lastFrame` to `performance.now()` before re-entering `tick()` so the first `delta` after a long pause is not hours large. One consumer uses it today: the projects scene. The home particle field deliberately does not — its canvas is fixed and full-viewport behind every section, so it is never off-screen; it pauses only on `visibilitychange` (tab hidden).

### The First-Scroll Compile Burst and the Measured-Ready Gate

The home page used to stutter on its first scroll input. Profiling with buffered Long Animation Frames against the production build attributed it to first-frame shader compilation: the earlier hero stack compiled roughly ten material programs under eight lights on its first render, blocking the main thread for a measured 306 ms (warm driver cache — cold visits worse), exactly in the window where a visitor's first scroll arrives. Asset loading and scene construction measured clean; the compile burst was the dominant cause, which mattered because a loading screen cures late loading and compilation but would not have cured main-thread contention.

The particle-field rewrite (ADR 0014) attacks it twice. The compile surface shrank to about three programs under no lights, putting the first frame below the 50 ms detection threshold on the same setup. And a loading gate holds the page — scroll locked, `scrollbar-gutter: stable` so the unlock doesn't reflow — while the chunk loads, the name glyphs rasterise, `compileAsync` runs, and real warm-up frames render. The reveal is measured, not assumed: the gate lifts when two consecutive frames complete under 20 ms, with a 2-second hard cap so the page is never held hostage. Fallback visitors bypass the gate entirely. Verified end state: reveal around 300 ms on warm hardware and zero frames over 20 ms through a full scroll-and-reverse pass.

A war story from the same rewrite: with the pmndrs post-processing composer active, every black on the page lifted to washed gray. Bloom was the obvious suspect and was innocent — forcing its intensity to zero left the wash intact. The cause was color-space handling around the composer: the fix pairs the composer with `renderer.outputColorSpace = LinearSRGBColorSpace` (the composer applies the single final sRGB encode; leaving the renderer's own conversion on encodes twice) and runs the canvas opaque (`alpha: false`, cleared in the page's ink color), which also removes the premultiplied-alpha compositing path entirely. The diagnostic discipline — isolate one variable per rebuild, compare against the composer-less low tier — is why the fix is three lines instead of a re-architecture.

### The Continuous Shape Cycle and Why the Name Is Not the Resting State

The field does not settle. It holds a shape for 5 seconds, morphs over 3 seconds, and moves on, cycling through four shapes — the formed name, a galaxy variant, a `mikkonumminen.dev` wordmark, and a sparse field (ADR 0016). The name is one shape of four rather than the state everything returns to, which is the whole design point: the formation animation had been better than its end state, so the end state was removed.

The galaxy variant is the load-in galaxy turned to face the viewer and centred (`z: -8`, `scale: 1.35`, a slow `spinRate` of 0.06). Reusing the same object seen differently is what makes it read as a variation rather than as a rewind of the page load.

Three properties of the implementation are load-bearing:

- **The cycle is a pure delta-driven reducer** (`src/lib/three/field/shapeCycle.ts`). It emits `from`/`to`/raw `cross` rather than pre-blended weights, because the per-particle stagger lives in the shader and can only be applied to unstaggered progress. It returns one mutable object, since the tick loop must not allocate.
- **Scroll always wins.** The shape morph is composed *before* the scroll dissolve in the vertex shader, so `pos = mix(pos, aStarPos, dissolve)` is the last operation. A visitor who scrolls mid-morph gets the starfield, not a fight between two timelines.
- **Every tuning number lives in one file** (`src/lib/three/field/tuning.ts`) and is injected into the GLSL as compile-time `const float` literals rather than uploaded as uniforms. The driver constant-folds them, so a knob costs nothing per frame.

Micro-life runs continuously on top (ADR 0015): a shimmer, a slow brightness wave travelling letter to letter, and a small fraction of stray particles, all seeded per-particle from an `aSeed` attribute. A click on the field scatters particles like struck billiard balls and eases them back with the same seed-driven stagger. Per-shape arrays in `tuning.ts` — indexed `[name, galaxy, wordmark, sparse]` — scale brightness, density, bloom, liveliness and sway independently, because a sparse field needs far more motion than a formed name to avoid reading as a still image.

The frame delta is clamped for simulation but not for presentation: `const delta = Math.min(rawDelta, MAX_FRAME_DELTA)`, with the overlay reading `rawDelta`. Without the clamp, a tab restored after minutes advances the cycle by that entire gap in one frame.

### The Field Log: Replacing Decorative Gibberish With a Truthful One

The bottom-right corner used to render a decorative fake console. It now carries a log of what the page is actually doing — shape transitions, scene readiness, real commit messages pulled at build time — with no timers and no fabricated lines. Events are emitted as a document-level `field:log` `CustomEvent`, matching the existing `bg-audio:state` precedent, and the emitter enforces a ~300 ms floor with a 200-line history cap.

Two constraints shaped it more than the visual design did. Under `prefers-reduced-motion` and at narrow widths the log renders its header only, and the fabricated-content path was deleted outright rather than kept as a fallback — an earlier version reported build-time sentinel commits as real ones, complete with a `@0000000` hash, in exactly the shallow-clone case that produces them. And the resting list is `aria-hidden` decorative preview while the expanded history is the accessible surface: a permanently auto-updating `aria-live` region with no pause, stop or hide control is a WCAG 2.2.2 failure at Level A.

### Fixed Chrome That Rides the Footer

The audio toggle and the field log are `position: fixed` in the bottom corners, so at the end of every page they sat on top of the footer — measured at 884 px, the toggle covered about 79% of the copyright line.

The fix publishes a `--footer-lift` custom property on `<html>` equal to how far the footer has pushed into the viewport, and the fixed chrome translates up by exactly that much (`src/lib/utils/trackFooterOverlap.ts`). Because each control keeps its own bottom offset, lifting by the intrusion leaves that offset as the gap above the footer.

The rejected alternative is the instructive part. Hiding the chrome while the footer is visible trades a legibility bug for a worse one: it removes the only audio control on the site at the bottom of every page, destroys focus if a keyboard user is inside it, and latches permanently on any page too short to scroll its footer away — `/404` shows its footer at scroll 0.

There is no layout read on the scroll path. The footer's document position is measured at mount, on resize, and via a `ResizeObserver` on `document.body`; per scroll the work is arithmetic on `scrollY`, coalesced onto a rAF. The observer is not redundant with resize: a late image or a swapped webfont moves the footer down the document without the viewport ever changing size, and a cached position would then aim the lift at where the footer used to be.

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

Playhead persistence across navigations used to be a `sessionStorage` save on `beforeunload` with a seek-and-resume on the next load. Since client-side routing (ADR 0013) the `.bg-audio` wrapper is `transition:persist`ed, so the decks — elements, playhead, crossfade state — simply survive the swap and the save/restore step no longer exists. This keeps the music genuinely continuous across all four pages, with no reload anywhere.

### The Voiceover Layer

`HeroVoiceover.astro` (home page), `ProjectsVoiceover.astro` (projects page) and `blog/BlogVoiceover.astro` (any blog post with a recording) each add a locale-keyed narration on top of the music bed. All three are intentionally duplicated rather than abstracted into a shared component, and all three carry `// PARALLEL TO` header comments naming the other two so bug fixes mirror correctly.

The third one is the point at which the rule of three would normally force an extraction, and it was deliberately not done. The differences between blog narration and the other two are absences rather than parameters: the shared part is roughly thirty lines of play, pause and resume, while each caller keeps its own idle timer, its own gates and its own volume rule. A helper plus three call sites each overriding half of it would trade duplication a reader can see for indirection they cannot.

The voiceover coordinates with the music through a single `bg-audio:state` custom event dispatched by `BackgroundAudio` on every toggle. The voiceover never eagerly auto-plays; it waits for the `bg-audio:state` event with `detail.on === true`. This avoids two races the doc-block describes explicitly:

1. On first visit with autoplay permitted, the voiceover would start, then `bg-audio:state` would fire again when `tryPlay()` settled, restarting the clip mid-sentence.
2. On a click that both unlocks autoplay and toggles the toggle, `BackgroundAudio`'s `tryPlay()` and its toggle handler both emit the event on one click; without the `if (!voice.paused) return` guard, the second dispatch would restart the voice from zero.

The idle-replay timer, which exists on the home and projects clips only, rearms the voiceover after the user has been still for 50 seconds (pointerdown / touchstart / keydown / scroll reset the clock; `pointermove` is deliberately excluded because a drifting mouse would prevent the timer from ever firing). An actively scrolling or clicking visitor never gets re-narrated; a tab-parked visitor eventually hears the clip again.

A Safari edge case in the voiceover: if the audio source file 404s (a locale without a recorded narration), Safari's `<audio>` element is in `HAVE_NOTHING` state and throws `InvalidStateError` on any `currentTime` write. The `playFresh` and `playResume` helpers wrap `currentTime`, `volume`, and `play()` inside a `try/catch` so a missing locale file degrades silently.

### The Blog, and Posts That Read Themselves

The blog is an Astro content collection at `src/content/blog/<locale>/<slug>.md`. Locale and slug are both explicit frontmatter fields even though the path already implies them, because every locale of an entry deliberately shares one slug: the language switcher and the hreflang alternates pair translations by querying the collection for that slug. The loader's `generateId` is overridden for the same reason. The default returns frontmatter `slug` verbatim when present, which would collapse every locale of an entry onto one id and keep only whichever loaded last, and that failure is near-silent: one WARN line, a build that still exits 0, and half the entries simply absent from the site.

Four frontmatter fields exist to make an omission loud rather than convenient.

`aiGenerated` is a required boolean with no default. An entry has to say out loud whether a machine wrote it, and a flag that silently defaults to false is exactly the failure the field exists to prevent. When true the post renders a badge and a standing disclosure notice.

`hasAudio` is required for the same reason pointed at a different gap: an entry is not finished when its English prose is. It is per locale rather than per entry, because a post can be narrated in English months before anyone records the Finnish. Nothing derives it from the filesystem, so it can drift in both directions, and both failures are invisible until someone loads the page. A `true` with no recording renders a player whose source 404s; a `false` beside a real file hides work already paid for. `src/content/blogAudio.test.ts` reconciles the two and fails the suite either way, and also rejects a filename outside the convention so a typo in a slug surfaces as a failed test rather than a silent 404.

`project` names which project an entry is about, validated against the ids in `src/data/projects.ts` rather than being a free string in `tags`. The distinction is deliberate: a tag can be misspelled, capitalised two ways or pluralised and nothing notices, whereas an unknown project id fails the build with the twelve valid ones printed. The evidence for needing that was already in the repository. Two posts about the same RAG subsystem had ended up tagged `rag` and `ragctl` with no tag in common, so the grouping the tags existed for never happened and nothing reported it.

`tags` draws from a closed list in `src/data/blogTags.ts` for the same reason. The bar for adding one is written into that file: a subject rather than a place, groups at least two entries, lowercase kebab, and not implied by the collection, since everything there is a blog post and `blog` therefore says nothing.

Narration itself is one recording per post per locale at `public/audio/blog/<slug>-<locale>.mp3`. Slug is shared across locales and locale is not, so the pair is unique per entry. Sixteen recordings ship today, eight English and eight Finnish, about seventy minutes and 66 MB, all 24 kHz mono at 128 kbps to match the two older voice clips. Those are both locales the site has; Swedish was removed in 2026-08.

There is no separate player and no second control. The site's existing sound toggle turns narration on and off together with the music bed, exactly as the home and projects voices already work, so a visitor who wants a post read aloud presses the same button they would press for music. The voice belongs to the view: it is created on arrival at a post and destroyed on leaving, while the music element is `transition:persist`ed and simply keeps playing. Moving between views therefore cuts the speaker without interrupting the music, and only one voice element exists in the document at any moment, so a post's narration can never bleed into the next page. Toggling sound off at minute seven of a thirteen minute reading and back on resumes rather than restarting, because the state handler distinguishes a paused mid-clip element from an ended one. Leaving the post entirely does lose the position.

---

## The CSP and the Static-Output Constraint

The Content Security Policy lives in `vercel.json` and applies to every response. The key tension is `'unsafe-inline'` on `script-src` and `style-src`. Removing it would require per-request nonces embedded in every inline script and style tag — which is architecturally incompatible with a fully static build. Static files cannot vary per response; there is no server to inject a nonce. ADR 0002 documents this constraint: the static-output posture is the governing decision, and the CSP reflects it rather than the other way around.

The practical XSS risk from `'unsafe-inline'` on a static site with no third-party scripts is low: inline-script injection requires either server-side reflected HTML (impossible here) or compromising the build output itself. The mitigation is kept at the other end of the chain — every string that reaches an `innerHTML` sink is escaped through `escapeHtml` (tested in `escapeHtml.test.ts`), and streamed LLM output is set via `textContent`, never `innerHTML`.

When the RAG chat backend was added, the `connect-src` directive gained the Tailscale Funnel origin (visible in `vercel.json` as `https://paskamyrsky.tail6ed53b.ts.net`). The Sentry regional ingest endpoints (`*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.ingest.de.sentry.io`) are also explicit in `connect-src`. Everything else is `'self'`.

---

## The RAG Chat: Reconciling a Dynamic Service with a Static Site

### The Core Tension

The contact terminal wanted free-form Q&A grounded in Mikko's own content. RAG needs a vector database and an LLM at request time. Adding either SSR routes or managed cloud services would contradict ADR 0002 and introduce per-token billing on a personal portfolio. ADR 0009 resolves this by building the chat as a separate backend service — a single FastAPI + uvicorn process the static site calls over `fetch`, never as part of the site's own runtime. Generation is a local model served by Ollama through its OpenAI-compatible endpoint (`qwen2.5:7b` by default, switchable via `ragctl`); embeddings are `bge-small-en-v1.5` (384-dim, asymmetric query/passage prefixes) run in-process; the vector store is Postgres + pgvector over asyncpg. The full as-built reference — exact pipeline ordering and every config knob — lives in [`docs/rag-chat.md`](../../docs/rag-chat.md); this deep-dive covers only the hard problems.

The frontend side of this contract is `PUBLIC_CHAT_API_URL`: a build-time environment variable. When unset (the default in CI and local builds), every function in `src/lib/terminal/chat.ts` is inert — no fetch, no DOM change, no affordance. The terminal is byte-for-byte identical to the no-backend state. When set, the page runs one `/health` probe at load time; the probe is memoized for the session. In production the value is the site's own `/api/rag/*` prefix: Vercel external rewrites proxy those calls to the backend (ADR 0012), so chat rides the site's origin and content blockers that eat cross-origin hosts never see it.

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

### Hybrid, Project-Aware Retrieval

Retrieval is hybrid (ADR 0011): the top dense cosine neighbours from pgvector are fused with a lexical BM25-style full-text ranking (`websearch_to_tsquery` + `ts_rank` in `app/db.py`) via reciprocal rank fusion (`_rrf_fuse` in `app/retrieval.py`), so exact identifiers — a function name, a config key — resolve as reliably as prose. When the query names a project, a hard per-project filter (`PROJECT_FILTER_STRICT`, default on) restricts both searches to that project and fails open when the project has no hits — replacing the earlier soft boost that merely floated a named project's chunks to the front.

The index behind it covers curated source and config files alongside the markdown corpus: code is chunked by function/class boundaries (decorators and attributes stay with their definition, with a line-window fallback) and each chunk carries `language` and `chunk_type` (`prose` | `code`) metadata. Still open on the roadmap: cross-encoder re-ranking, automatic per-project summary generation, and query expansion.

### The Stable-Hostname Requirement

`PUBLIC_CHAT_API_URL` is baked into the Vercel static build at deploy time, so whatever the frontend `fetch`es has to be permanent — an ephemeral tunnel that gets a fresh random hostname on every restart would force a new Vercel build and redeploy each time Mikko's machine comes back up. The as-built deployment satisfies this twice over: a Tailscale Funnel gives the backend a stable public HTTPS hostname (`paskamyrsky.tail6ed53b.ts.net`) that survives restarts, and since ADR 0012 the frontend bakes only the site's own `/api/rag/*` prefix while the Funnel hostname lives in `vercel.json`'s rewrite rules — a hostname change is a config edit, not a frontend rebuild. The chat toggles on and off simply by starting or stopping the Docker Compose stack. (The earlier design notes in `LAUNCH.md` assume a Cloudflare _named_ tunnel for the same reason — a stable name — which the live Funnel path supersedes; see [`docs/rag-chat.md`](../../docs/rag-chat.md) for the current as-built deployment.)

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

The response was a layered approach. Pure math extracted from scene code — the particle-field target generators (`galaxyTargets`, `starfieldTargets`, `nameDistribution`), `resolvePixelRatio`, `easing`, `planetNoise`, the `userData` accessors, `escapeHtml`, terminal dispatch, terminal history, SSE parsing — is tested with Vitest + jsdom. A coverage ratchet fails CI if the covered surface shrinks. WebGL and canvas files are excluded from coverage so the threshold is meaningful rather than showing coverage on paths that cannot run.

The second layer is Playwright: a separate CI job builds the site and loads all four pages in headless Chromium with WebGL via SwiftShader, asserting that each page boots (canvas mounts with non-zero size, no thrown errors, no console errors). This is the verification layer that jsdom structurally cannot provide.

Full visual regression testing (screenshot snapshots per frame) was rejected: the scenes are animated and partly random (particle placement and drift, per-particle twinkle phases, time-based motion), and SwiftShader rendering varies across runs. Pixel snapshots would be flaky and high-maintenance for low marginal signal. The acknowledged ceiling is explicit in the ADR: no test asserts a rendered pixel or per-frame scene state. A scene that mounts but renders incorrectly would pass the smoke suite.

The dependency on `npm audit` as a security gate was rejected for a different reason: an unfixable dev-only transitive advisory in `esbuild` (a known open issue, documented in ADR 0007) would keep the gate permanently red. CodeQL with the `security-and-quality` query suite analyzes the actual source code on every push and on a weekly cron instead.
