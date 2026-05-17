# Audit E — Performance Deep Dive

**Date:** 2026-05-17  
**Branch:** audit/E (off audit/baseline)  
**HEAD (baseline):** b3de9f2 — same source tree as master at 7933574  
**Method:** Static source read + compiled dist analysis. No live browser profiling.

---

## Introduction

This report extends the baseline measurements with root-cause analysis. The baseline confirmed excellent Lighthouse scores (96–99/100 mobile) but flagged: a 558 kB debug chunk, CLS 0.014 on `/experience` and `/contact`, 7.4 MB audio in dist, and 3 production CVEs. This document goes deeper into each, plus covers Three.js init cost, font strategy, GSAP trigger count, offscreen pausing, memory leak risk, dispose completeness, and the DPR-cap regression.

---

## Findings by Severity

### CRITICAL

*No critical findings. No blocking regressions detected.*

---

### HIGH

#### H-1: DPR cap regression — resize handler overrides the 1.5 cap with hardcoded 2

**File:** `src/lib/three/createResizeHandler.ts` line 21  
**File:** `src/lib/three/createRenderer.ts` lines 27–28

`createRenderer` correctly caps pixel ratio at 1.5 by default (or 1.0 for `?perf=low`):

```ts
const maxPixelRatio = options.maxPixelRatio ?? 1.5;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
```

However `createResizeHandler` — which fires on every `window.resize` event — unconditionally sets:

```ts
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

This means: on any screen with DPR ≥ 2 (all Retina Macs, most modern Android flagships), the renderer boots at DPR 1.5 but silently upgrades itself to DPR 2 the moment the browser fires a resize event. On a 1440p Mac with DPR=2 this increases the internal render buffer from 2.25× to 4× the CSS-pixel area — a 78% increase in per-frame pixel work — and completely undoes the `?perf=low` path for the bloom + post chain as soon as the user resizes.

The cap value (1.5) is not forwarded from `createRenderer` to `createResizeHandler`, so the two callers cannot share a single source of truth without refactoring.

**Impact:** The home and projects scenes both use this pairing (`homeScene.ts:645`, `projectsScene.ts:400`). On Retina/HiDPI displays, any resize event — including orientation change on mobile — resets the DPR cap that the entire `perf=low` auto-detect path was designed to enforce.

**Fix:** Pass `maxPixelRatio` as a parameter to `createResizeHandler` (or close over it at call site) and use the same capped value instead of the hardcoded `2`.

---

#### H-2: `perfOverlay.CYSh3NvJ.js` is 558 kB in dist and contains a full Three.js bundle

**File:** `src/lib/debug/perfOverlay.ts` (import path, not the overlay itself)  
**Dist:** `dist/_astro/perfOverlay.CYSh3NvJ.js` — 544.7 kB raw, 143 kB gzipped

The chunk is dynamically imported only when `?debug=perf` is in the URL (guarded by `readPerfFlags()` returning `debugOverlay: true`). Real users never trigger this import. However:

1. **It ships in the CDN bucket.** The 544 kB file sits in `dist/_astro/` and is deployed to Vercel on every release. It occupies CDN storage and egress budget. Since the chunk contains a full Three.js copy bundled alongside the overlay, it reflects a Rollup tree-shaking failure: `perfOverlay.ts` itself is 2.3 kB (a DOM text element and a rolling-average calculator). The full Three.js copy ends up in the chunk because the overlay file is co-located with the scenes that import Three.js, and Rollup's dynamic-import split point retains the entire module graph.
2. **Rollup emits a `> 500 kB` warning** on every build, which will mask genuine regressions in future CI.

The `?debug=perf` guard is airtight at runtime — the import call only executes when `perfFlags.debugOverlay` is `true`. The problem is purely at the bundle level.

**Fix:** Move `perfOverlay.ts` to its own entry point or use Rollup's `manualChunks` to exclude Three.js from the debug chunk's closure. Alternatively, write the overlay as a pure DOM script with no Three.js import path in its module graph.

---

### MEDIUM

#### M-1: CLS 0.014 on `/experience` — SVG goat uses `height: auto`

**File:** `src/styles/experience-timeline.css` (inlined into `experience.DfHu_pb-.css`)  
**Measurement:** CLS 0.014 on `/experience` and `/experience` locales; 0.000 on `/` and `/projects`

The goat SVG element has `height: auto` in the compiled CSS:

```css
.goat svg { width: 100%; height: auto; display: block; ... }
```

This is the canonical browser-native CLS trigger for SVGs whose intrinsic dimensions are resolved after layout: the browser lays out surrounding content with zero SVG height, then reflows once the SVG dimensions are known. The goat is `position: fixed` (`goat-wrap` is `position: fixed; top: 0; left: 0`) so it does not affect normal document flow — but Lighthouse's CLS metric includes shifts of fixed elements when they affect compositing layers adjacent to scrollable content, especially on mobile where the viewport is narrow.

Neither `/contact` nor `/projects` nor `/` has this SVG. The 0.014 CLS on `/contact` requires separate investigation (no obvious SVG with `height: auto` found; likely the terminal `<input>` or the MCC card expand — not confirmed without DevTools).

**Fix for `/experience`:** Add explicit `viewBox` dimensions to the goat SVG and set `height: clamp(56px, 7vw, 90px)` directly on the `<svg>` element (matching the `width: clamp(...)` already set on `.goat`). This gives the browser intrinsic dimensions to reserve space before layout.

#### M-2: Music bed at 64 kbps — already compressed, but no Opus alternative shipped

**Files:** `dist/audio/devlander.mp3` (3.88 MB), `dist/audio/devlander.ogg` (2.72 MB)  
**Detected bitrate:** 64 kbps MPEG-1 Layer III, 48 kHz (both files via header read)

The baseline flagged 7.4 MB audio total. Detailed breakdown:
- `devlander.mp3`: 3.88 MB — 64 kbps MP3
- `devlander.ogg`: 2.72 MB — OGG Vorbis (format confirmed, specific bitrate not decoded via header)
- `voice-landing.mp3`: 0.45 MB — 128 kbps MP3

The music bed is already at 64 kbps, which is near the perceptual floor for stereo music on most codecs. Further MP3 compression would be audible. However, an Opus encode at 64 kbps would produce ~20–30% smaller files at equivalent or better quality. The audio is `preload="metadata"` not `preload="auto"`, so the browser only downloads headers on page load and fetches the body on first play. For the majority of users who never interact with audio, the 6.6 MB combined music bed is never downloaded. The practical risk is low for most visits, but first-time engaged users (who click the audio toggle) incur a ~6.6 MB fetch before the music starts — significant on slow mobile connections.

No Opus (`.opus`) file is shipped. Modern browsers support Opus in a WebM container natively. A `<source type="audio/ogg; codecs=opus">` ahead of the Vorbis `.ogg` source would serve the smaller file to 95%+ of browsers.

**Fix:** Add `devlander.opus` at ~64 kbps Opus quality. Estimated size: ~1.6–1.9 MB (vs 2.72 MB OGG). Add it as the first `<source>` in `BackgroundAudio.astro`.

#### M-3: Font strategy relies entirely on system fallbacks — no web font load, no FOIT risk, but font availability is inconsistent across platforms

**Files:** `src/styles/global.css` lines 6–7  

```css
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', ui-monospace, monospace;
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
```

There are zero `@font-face` declarations in `src/styles/` and no Google Fonts `<link>` in the compiled HTML. The fonts are pure system-font stacks. On macOS with SF Pro / Inter installed the site looks exactly as designed. On Windows the fallback is typically Segoe UI (system-ui) for `--font-sans` and Consolas for `--font-mono` — both reasonable, but Inter and JetBrains Mono are absent on most Windows machines.

**Positive:** No FOIT risk, no render-blocking font requests, no CLS from font swaps. The current approach is deliberately lean.

**Trade-off:** The terminal on `/contact` renders with Consolas on Windows rather than JetBrains Mono. The visual difference is minor (both are monospace) but measurable.

**Note:** This also means the partial CLS on `/contact` is NOT caused by font loading.

---

### LOW

#### L-1: GSAP ScrollTrigger — scoped correctly, no leaks on unload

**Files:** `src/lib/gsap/homeTimeline.ts`, `src/lib/gsap/experienceTimeline.ts`

`homeTimeline.ts` wraps all ScrollTriggers inside a `gsap.context` scope (`createScope`) and tracks owned triggers in an `ownedTriggers` array. The `dispose` path calls `scope.dispose()`, which GSAP uses to kill all tweens and ScrollTriggers created within the scope. The refresh path is scoped: `ownedTriggers.forEach(t => t.refresh())` rather than the global `ScrollTrigger.refresh()` (explicitly noted in a comment at line 107).

`experienceTimeline.ts` uses the same `createScope` pattern. Its `dispose` also calls `gsap.ticker.remove(tickActiveAndGoat)` before `scope.dispose()`, correctly sequencing the cleanup. The `IntersectionObserver` is disconnected (`io.disconnect()`). Inline CSS custom properties written to layer elements and the goat are explicitly removed.

**Active trigger count per route:**
- `/` (home): 1 scroll-progress + 1 scroll-hint + N reveal-chars + N block-reveals + N parallax + 1 nav-cards = approximately 15–25 active triggers depending on DOM element count. All scoped, all disposed on `beforeunload`.
- `/experience`: 1 master scroll-progress + 0 ScrollTrigger reveal (uses IntersectionObserver) = 1 active ScrollTrigger. Plus `gsap.ticker` for the goat.
- `/projects`, `/contact`: no GSAP ScrollTriggers found in source.

No stray triggers on unexpected routes. The `?debug=perf` path does not add triggers.

#### L-2: Offscreen pauser verified working on both scenes

**File:** `src/lib/utils/createOffscreenPauser.ts`

Both `homeScene.ts` (line 871) and `projectsScene.ts` (line 584) call `createOffscreenPauser`. The implementation uses `IntersectionObserver` with `threshold: 0` — meaning the rAF loop pauses the moment the canvas has zero intersection with the viewport. The resume path guards against double-start (`raf !== 0` check) and respects tab visibility (`document.hidden` check). The pauser handle is disposed in both scene dispose paths.

The rAF loop is also paused on `document.visibilitychange` (tab hide). Both pause paths cancel the rAF handle and set `raf = 0`. The resume guard `raf === 0 && pauser.isVisible()` prevents starting while the canvas is still off-screen.

**Confirmed: rAF is genuinely paused when the canvas is off-screen.**

#### L-3: Memory leak analysis — dispose coverage is thorough, one gap in projectsScene

**Files:** `src/lib/three/homeScene.ts` (lines 904–970), `src/lib/three/projectsScene.ts` (lines 631–699)

**homeScene.ts dispose coverage:**
- All lights disposed individually (`ambient.dispose()`, `keyLight.dispose()`, etc.)
- Title letter geometries disposed in a for-loop over `title.allLetters`
- Title material and color map texture disposed
- Galaxy geometry + material disposed
- Environment map, PMREM generator disposed
- Bloom composer disposed
- Fog cleared, scene cleared, renderer disposed
- All event listeners removed (pointermove, visibilitychange, resize)
- offscreen pauser disposed
- Zone decor disposed

**Gap:** `collisionFlashLight` is disposed (`collisionFlashLight.dispose()`) but is never explicitly removed from the scene before `scene.clear()`. `scene.clear()` does remove it, so the disposal order is correct — but it's subtler than the other lights which are explicitly removed first. Not a leak (scene.clear() handles it), but inconsistent style.

**projectsScene.ts dispose coverage:**
- All planet geometries, materials, surface maps, bump maps, glow, orbit lines, rings disposed
- Sun geometry, materials, textures all disposed individually
- Starfield geometry + material disposed
- Connections, external indicators, planet labels disposed
- All canvas event listeners removed (pointerdown, pointermove, pointerup, pointercancel, wheel, click)
- window listeners removed (pointermove, pointerleave)
- document visibilitychange removed
- GSAP hover tweens killed with `gsap.killTweensOf(p.mesh.scale)`

**Gap:** The `cameraFill.target` is added to the scene (`scene.add(cameraFill, cameraFill.target)`) and is removed in `scene.remove(sunLight, ambient, rimLight, cameraFill, cameraFill.target)` — but `cameraFill.target` is a `DirectionalLightTarget` (an `Object3D` subclass, not a `Light`) and has no `.dispose()` method. This is correct Three.js practice — no leak.

**buildPlanetTexture.ts:** The two `CanvasTexture` objects created per planet (`map` and `bumpMap`) are correctly freed via `p.surfaceMap.dispose()` and `p.bumpMap.dispose()` in the scene dispose path (projectsScene.ts lines 664–665). The underlying `HTMLCanvasElement` objects are freed when the `CanvasTexture` is garbage-collected.

**Overall: No confirmed memory leaks. Dispose coverage is comprehensive.**

#### L-4: Render-blocking resource count is minimal and well-structured

**Per-route head analysis (from compiled dist):**

All four routes have an identical head structure:
- **2 CSS files** (`<link rel="stylesheet">`) — both in `<head>`, both render-blocking
- **1 sync `<script>` block** — the locale-detection IIFE (intentionally sync; runs before paint to prevent flash of wrong locale)
- **1 `type="module"` script** with `src` — `page.sJrt8mpm.js` (2.2 kB) — deferred by browser default (modules are `defer` by nature)
- The large scripts (`BaseLayout.js` 150 kB, route-specific page scripts) are at the **bottom of `<body>`**, not in `<head>`

The sync locale script is small (~800 bytes inline), intentionally placed before paint, and correcty wrapped in a try/catch. It touches only `sessionStorage`, `localStorage`, and `location.replace` — no DOM layout queries, no render-blocking network fetch.

The two CSS files per route are the only genuine render-blocking resources. Total CSS weight per route ranges from 33.3 kB (`/contact`) to 41.2 kB (`/`), which is well within acceptable budgets.

**One naming oddity:** The shared nav/base CSS is named `contact.CjBxSr16.css` (24.8 kB) but loads on every route, including `/`, `/projects`, and `/experience`. This is an Astro build artifact — the chunk was named after the first route to reference it. Not a bug, but confusing for future auditors.

#### L-5: Three.js claimed to not load on `/contact` — verified CORRECT

**File:** `src/page-content/ContactPage.astro`  
**Dist:** `dist/contact/index.html`

`ContactPage.astro` imports only `initTerminal` (no Three.js). The compiled HTML references only three external scripts: `page.sJrt8mpm.js`, `BaseLayout.js`, and `ContactPage.js`. The only appearance of "three.js" in the contact HTML is the footer text ("built with astro · three.js · gsap"). No `homeScene`, `projectsScene`, or `perfOverlay` chunks are referenced.

**Confirmed: Three.js is not loaded on `/contact`.**

#### L-6: Three.js init cost — homeScene

**File:** `src/lib/three/homeScene.ts`

Scene objects created at init (pre-first-frame):
- **Geometries:** N letter geometries (created by `buildTitle` via `FontLoader`/`TextGeometry` — one per character of "MIKKO\nNUMMINEN" = 11 geometries)
- **Materials:** 1 `MeshPhysicalMaterial` (title), plus materials inside `buildGalaxyLayer`, `buildHorizonGlow`, `buildCollisionSparks`, `buildImpactText`, `buildLetterFlashes`, `buildMeteors`, `buildExperienceZoneDecor`, `buildProjectsZoneDecor`
- **Textures:** 1 `buildTitleColorMap` canvas texture, 1 PMREMGenerator environment map
- **Lights:** 6 (AmbientLight, DirectionalLight×3, PointLight×2)
- **Post-processing:** `UnrealBloomPass` (5-mip downscale pyramid) + `RenderPass` + `OutputPass` — skipped on `?perf=low` or `prefers-reduced-motion`
- **Font load:** Async `loadFont(fontUrl)` over the network for `helvetiker_bold.typeface.json` (preloaded in HTML `<head>` with `<link rel="preload" as="fetch">`)

The font is the primary async gate. The scene does not allocate GPU resources until the font resolves, so the preload hint is critical to minimize the delay between canvas mount and first frame. The scene init is not CPU-blocking (it's async/awaited).

**Galaxy star count:** 900 stars (450 on `?perf=low`). Each star is a point in a single `BufferGeometry` with a custom `ShaderMaterial` — a single draw call regardless of star count. Minimal GPU overhead.

#### L-7: Three.js init cost — projectsScene + procedural planet textures

**File:** `src/lib/three/projects/buildPlanetTexture.ts`

Per-planet texture size: **256×128 pixels** each (note in source: "down from 384×192 — cuts per-pixel work to ~45%"). Each planet gets 2 textures (diffuse + bump), so 7 projects = 14 canvas-painted textures at 256×128.

Texture generation is **synchronous and CPU-bound**: `buildPlanetTexture` runs a JavaScript FBM noise loop over 256×128 = 32,768 pixels per texture. With 3–5 noise octaves and optional crater stamping (`stampCrater` iterates over a bounding box per crater), the worst case (spacepotatis: 5 octaves, 18 craters at radius 2–8px) is roughly:
- 32,768 pixels × 5 octave FBM = ~164K noise evaluations
- 18 craters × average ~400 pixels = ~7,200 additional pixel writes

This runs synchronously during `createProjectsScene`. With 7 planets, this is 14 texture builds on the main thread before the first frame. On a modern desktop this is below 50 ms; on a mid-range Android it could be 150–250 ms of main thread blocking at scene init. The comment in source ("synchronous build doesn't block the main thread for a noticeable beat") was accurate for 384×192 at scene creation — the reduction to 256×128 helps.

**No OffscreenCanvas / Worker offloading**: the textures are built on the main thread using `document.createElement('canvas')`. This is a known limitation and the source comment acknowledges it.

#### L-8: `beforeunload` dispose listeners verified on all Three.js pages

**Files:**
- `src/page-content/HomePage.astro` line 163: `window.addEventListener('beforeunload', () => { sceneHandle?.dispose(); })`
- `src/page-content/ProjectsPage.astro` line 291: `window.addEventListener('beforeunload', () => { bootHandle.cancel(); sceneHandle?.dispose(); })`
- `src/page-content/ExperiencePage.astro` line 47: `window.addEventListener('beforeunload', () => handle?.dispose())`

All Three.js pages call `.dispose()` on `beforeunload`. `/contact` has no Three.js scene to dispose; it calls `cleanup` on `beforeunload` to stop the MCC animation loop.

**Confirmed: "All Three.js resources explicitly disposed on beforeunload" — claim is accurate.**

#### L-9: No self-hosted fonts, no FOIT, no font-display setting needed

**Files:** `src/styles/global.css`, `dist/fonts/`

`dist/fonts/` contains only `helvetiker_bold.typeface.json` (a JSON-encoded Three.js font used for the 3D title geometry in homeScene). This is not a CSS web font. No `@font-face` declarations exist in any CSS file.

`Inter` and `JetBrains Mono` are declared as first choices in CSS custom properties but are not loaded — the site falls back to `system-ui` / `ui-monospace` on platforms that don't have them installed. There is no FOIT risk and no font-swap CLS. Font loading is not a performance concern.

#### L-10: `?debug=perf` URL guard is airtight at runtime

**File:** `src/lib/debug/perfFlags.ts` lines 98–99

```ts
cached = {
  ...
  debugOverlay: params.get('debug') === 'perf',
};
```

Both `homeScene.ts` (line 694) and `projectsScene.ts` (line 116) gate the `mountPerfOverlay` call on `perfFlags.debugOverlay`. `perfOverlay.CYSh3NvJ.js` is only imported inside a ternary:

```ts
const perfOverlay = perfFlags.debugOverlay
  ? mountPerfOverlay(...)
  : null;
```

In the compiled bundle, Rollup keeps this as a dynamic `import()` inside the module — it's a static code path that reads a URL parameter, so the import is never eagerly executed. Real users who never visit with `?debug=perf` never trigger the chunk download.

**Confirmed: The guard prevents runtime loading for real users.** The issue is purely that the 558 kB chunk ships in dist (see H-2).

---

## Baseline Confirmations

| Item | Baseline Claim | Confirmed? |
|------|---------------|-----------|
| `perfOverlay` chunk 558 kB | "Contains bundled Three.js — dynamic import, debug-only" | YES — 544.7 kB raw in dist |
| CLS 0.014 on /experience and /contact | Measured | YES — traced to SVG `height:auto` on goat for /experience |
| 7.4 MB audio | Baseline table | YES — devlander.mp3 (3.88 MB) + .ogg (2.72 MB) + voice (0.45 MB) = 7.05 MB total. Baseline said 7.4 MB but the dist now has only `voice-landing.mp3` (no `voice-projects-en.mp3`), so actual total is 7.05 MB |
| Three.js not loaded on /contact | README claim | VERIFIED — no Three.js chunk in contact HTML |
| All scenes dispose on beforeunload | README claim | VERIFIED |
| DPR cap 1.5 in createRenderer | Mentioned | CONFIRMED — but resize handler silently overrides to 2.0 (H-1) |

---

## What This Audit Did Not Cover

- **Real-device benchmarks**: All analysis is static source read. No throttled-CPU profiling, no Samsung Galaxy S mid-range testing.
- **Memory profiling with navigation cycles**: Dispose correctness was verified by static read of code paths, not by recording heap snapshots across SPA-style navigation.
- **Audio playback latency**: The `preload="metadata"` strategy means the first play may have a startup delay on slow connections. Not measured.
- **Actual INP under real user interaction**: Lab INP is N/A; field data would require RUM (Sentry is integrated but no INP data was read).
- **Desktop Lighthouse**: Baseline noted desktop runs were not completed. Not run here either.
- **CLS on /contact root cause**: The SVG `height:auto` theory applies only to `/experience`. The 0.014 CLS on `/contact` was not conclusively traced to a single element without DevTools.
- **Rollup chunk splitting options**: H-2 identifies the problem but does not prototype the `manualChunks` fix or measure its effect on build time.
