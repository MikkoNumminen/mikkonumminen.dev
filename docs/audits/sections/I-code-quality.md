# Agent I: Code Quality & Maintainability Audit

**Date:** 2026-05-17
**Branch:** audit/I (off audit/baseline → HEAD 7933574)
**Scope:** TypeScript strictness, Astro component coupling, Three.js scene duplication, dispose discipline, comment quality, dead code, naming consistency, test coverage reality, `!important` usage.

---

## Summary

The codebase is in markedly better shape than a typical portfolio project. TypeScript is very strict, the dispose lifecycle is thorough throughout the Three.js layer, comments lean heavily toward *why*, and the Astro page-content components are thin. The findings below are real but mostly low-severity: the most actionable ones are the two unsafe type-casts in Three.js internal-API access, the voiceover duplication that should be a shared helper, and the honest conversation about what "1828+ tests" means when the portfolio site itself has 28 tests.

---

## 1. TypeScript Strictness Sweep

### tsconfig.json flags

| Flag | Status |
|------|--------|
| `strict` | **On** (via `astro/tsconfigs/strict` → `astro/tsconfigs/base.json` → `"strict": true`) |
| `noUncheckedIndexedAccess` | **On** (explicit in project `tsconfig.json`) |
| `noImplicitOverride` | **On** |
| `noFallthroughCasesInSwitch` | **On** |
| `noPropertyAccessFromIndexSignature` | **Missing**, not in project `tsconfig.json` and not in `astro/tsconfigs/strict.json` |
| `noUnusedLocals` | **On** (added explicitly) |
| `noUnusedParameters` | **On** (added explicitly) |

**Finding (LOW):** `noPropertyAccessFromIndexSignature` is the only recommended strict-family flag that is absent. Without it, `obj[key]` on an index-signature type is allowed even when the key is a literal (where dot notation would be safer). The project largely avoids dynamic key access so this has no known practical impact, but adding the flag would make the config complete.

### Type-system escape hatches

`grep -rnE ': any|as any|@ts-ignore|@ts-expect-error|@ts-nocheck'` returned **zero results** across all of [`src/`](src/). Clean.

### Non-null assertions (`!.`)

Four occurrences, all justified:

| File | Line | Pattern | Verdict |
|------|------|---------|---------|
| [`src/lib/three/projectsScene.ts`](src/lib/three/projectsScene.ts) | 351 | `hits[0]!.object.userData.projectId as string \| undefined` | Load-bearing: `hits.length > 0` guard is on the preceding line; `noUncheckedIndexedAccess` forces the `!`. |
| [`src/lib/three/projectsScene.ts`](src/lib/three/projectsScene.ts) | [431](src/lib/three/projectsScene.ts#L431) | `sun.glowMaterial.uniforms.intensity!.value` | Sloppy, `!` suppresses a type-system warning about an index-signature lookup on `uniforms: Record<string, IUniform>`. The comment next to it (`// ShaderMaterial uniforms are typed as Record<string, IUniform>; the 'intensity' key is set in createGlowMaterial so the lookup is safe.`) is honest but the design is fragile: if the uniform is ever renamed in `createGlowMaterial` this silently breaks. |
| [`src/lib/three/projectsScene.ts`](src/lib/three/projectsScene.ts) | [485](src/lib/three/projectsScene.ts#L485) | Same pattern as line 351, `hits[0]!.object.userData...` inside `!selected` raycast block with `hits.length > 0` guard. | Justified. |
| [`src/page-content/HomePage.astro`](src/page-content/HomePage.astro) | [33](src/page-content/HomePage.astro#L33) | `s.split(':')[0]!.trim()` | Load-bearing: `split(':')` on a non-empty string always yields at least one element; `noUncheckedIndexedAccess` forces the `!`. |

**Finding (LOW):** `projectsScene.ts:431` (`uniforms.intensity!.value`) is the one assertion worth flagging as sloppy. The proper fix is to type `createGlowMaterial`'s return as a narrowed interface that includes `intensity: IUniform<number>` instead of relying on a runtime assumption.

### Unsafe type casts

Two `as unknown as` casts exist:

| File | Line | Pattern | Verdict |
|------|------|---------|---------|
| [`src/lib/three/buildTitle.ts`](src/lib/three/buildTitle.ts) | [98](src/lib/three/buildTitle.ts#L98) | `(font as unknown as { data: FontDataShape }).data` | Three.js's `Font` type doesn't expose `.data`, but the underlying JSON structure does. The cast is well-documented with an interface `FontDataShape`. Justified, but brittle against Three.js upgrades. |
| [`src/lib/three/projects/buildPlanetTexture.ts`](src/lib/three/projects/buildPlanetTexture.ts) | [207](src/lib/three/projects/buildPlanetTexture.ts#L207) | `stops.map(...) as unknown as readonly [Rgb, Rgb, Rgb, Rgb]` | Sloppy, the function generates exactly 4 stops but TypeScript can't infer the tuple width from `.map()`. A typed `const stops = [a, b, c, d] as const` literal with explicit indices would avoid the cast entirely. |

---

## 2. Astro Component Coupling

Four page-content files:

| File | Lines | Lines of logic | Verdict |
|------|-------|----------------|---------|
| `ContactPage.astro` | 31 | ~10 | Thin shell, good. |
| `ExperiencePage.astro` | 63 | ~15 | Thin shell, good. |
| `HomePage.astro` | 166 | ~65 | Moderate. The `execSync` / commit-message extraction block (lines 25–38) is build-time logic that could live in a dedicated `src/data/commitMessages.ts` helper; moving it out would make `HomePage.astro` purely a composition layer. |
| `ProjectsPage.astro` | 295 | ~140 | The inline `<script>` block (lines 158–294) is 136 lines of boot/wiring logic. It is isolated, well-commented, and handles the three-way coordination between the drawer, side-panel list, and scene handle. It does not need to be further split but sits at the upper edge of acceptable inline script size. |

**Finding (LOW, judgment call):** `HomePage.astro` lines 25–38: the `execSync` git-log extraction is build-time computation that belongs in `src/data/` rather than mixed into a page frontmatter. Not a blocker but slightly violates the "frontmatter is glue code" principle.

**Finding (INFO):** No page-content file exceeds 300 lines or contains presentational CSS. Data flow is uniformly clear: frontmatter resolves at build time → template renders → inline script boots runtime.

---

## 3. Three.js Scene Duplication

### Shared patterns that ARE extracted

Both `homeScene.ts` and `projectsScene.ts` use:
- `createRenderer`: extracted to `createRenderer.ts`
- `createResizeHandler`: extracted to `createResizeHandler.ts`
- `disposeMaterial`: extracted to `disposeMaterial.ts`
- `createOffscreenPauser`: extracted to `createOffscreenPauser.ts`
- `readPerfFlags` / `mountPerfOverlay`: shared debug utilities
- Identical `TARGET_FRAME_MS = 1000 / 60 - 1` constant (60fps cap): defined inline in both files

### Copy-pasted patterns NOT extracted

**The visibility / pause lifecycle** is structurally identical across both scenes (lines 870–896 in `homeScene.ts` vs lines 584–608 in `projectsScene.ts`):

```typescript
// homeScene.ts:870–895
const pauser = createOffscreenPauser({ ... });
const onVisibilityChange = () => { ... cancelAnimationFrame(raf) / tick() ... };
document.addEventListener('visibilitychange', onVisibilityChange);

// projectsScene.ts:584–608
const pauser = createOffscreenPauser({ ... });
const onVisibilityChange = () => { ... cancelAnimationFrame(raf) / tick() ... };
document.addEventListener('visibilitychange', onVisibilityChange);
```

The logic is byte-for-byte the same. It could be absorbed into `createOffscreenPauser` as a `visibilityAware` option, or extracted to a `createVisibilityPauser` helper that owns the `document.addEventListener('visibilitychange', ...)` subscription and returns a `dispose`.

**The 60fps cap constant:**

```typescript
// homeScene.ts:708
const TARGET_FRAME_MS = 1000 / 60 - 1;

// projectsScene.ts:412
const TARGET_FRAME_MS = 1000 / 60 - 1;
```

Should be a named export from a shared constants file (e.g. `src/lib/three/constants.ts`).

**Finding (LOW):** Two copy-pasted patterns: `visibilitychange` pause lifecycle and `TARGET_FRAME_MS`. Neither is hard to extract; the visibility one in particular would reduce the dispose surface that has to be maintained per-scene.

### Dispose lifecycle consistency

Both scenes follow the same pattern: local `disposed` flag → cancel rAF → dispose resize handler → remove event listeners → dispose pauser → dispose child modules. The ordering is consistent and correct.

---

## 4. Dispose Discipline

Walked all `new Mesh / Geometry / Material / Texture` allocations in `src/lib/three/**`.

### Clean

| Module | Notes |
|--------|-------|
| `buildMeteors.ts` | All 5 geometries and 5 materials disposed in `.dispose()`. |
| `buildLetterFlashes.ts` | `PointLight.dispose()` is a Three.js no-op without shadow maps; comment acknowledges this. Lights are detached from parents. Fine. |
| `buildCollisionSparks.ts` | 4 `SpriteMaterial`s + shared `CanvasTexture` disposed correctly. |
| `buildHorizonGlow.ts` | Geometry, material, texture all exposed on handle and disposed in `homeScene.ts:945–949`. |
| `buildGalaxyLayer.ts` | `starsGeometry` and `starsMaterial` exposed on handle, disposed in `homeScene.ts:950–951`. |
| `buildTitleColorMap.ts` | Returns bare `CanvasTexture`; caller (`homeScene.ts:926`) calls `titleColorMap.dispose()`. |
| `buildExperienceZoneDecor.ts` | Ridge, snow, goat, dust, meteor textures and materials all disposed. |
| `buildProjectsZoneDecor.ts` | Ring, planet, flare, sparkles all disposed. |
| `buildImpactText.ts` | Per-popup textures disposed in place as popups expire (line 190–191). |
| `buildConnections.ts` | `disposeConnections` walks all entries and disposes 4 resources each. |
| `buildExternalIndicator.ts` | Reference-counted shared pulse texture with correct cleanup on last indicator. |
| `buildPlanetTexture.ts` | Returns `CanvasTexture` objects; caller (`projectsScene.ts:662–666`) calls `p.surfaceMap.dispose()` and `p.bumpMap.dispose()`. |
| `buildSun.ts` | `coreGeometry`, `glowGeometry`, halo/flare materials and textures all disposed via exposed handle properties in `projectsScene.ts:676–683`. |
| `buildStarfield.ts` | `geometry` and `material` disposed in `projectsScene.ts:683–684`. |

**Finding (INFO, positive):** No allocation without a paired dispose was found. The dispose architecture is thorough. The only subtlety is that `Sprite` objects (halo, flare) have no caller-visible geometry to dispose (Three.js allocates `PlaneGeometry` internally and handles it), which is correct per Three.js docs.

**Finding (INFO):** `buildLetterFlashes.ts:159–165`, the dispose comment (`PointLight.dispose() is a no-op without a shadow map`) is accurate but the lights are only removed from their parents, not explicitly disposed. Three.js `Light.dispose()` does emit a `dispose` event which the renderer subscribes to for cleanup. Calling it explicitly would be belt-and-suspenders but is not required.

---

## 5. Comment Quality

Sampled 10 comments from `BackgroundAudio.astro`, `HeroVoiceover.astro`, `projectsScene.ts`, and `homeScene.ts`.

| Location | Comment | why vs what |
|----------|---------|-------------|
| `BackgroundAudio.astro:8` | "Seamless looping via two \<audio\> 'decks'... HTML5 `loop` would produce an audible gap at the join (especially in Safari) so we manage looping ourselves." | **why** |
| `BackgroundAudio.astro:14` | "On/off choice is remembered in sessionStorage so reloading any page in the same tab preserves the user's preference." | **why** |
| `HeroVoiceover.astro:14` | "(Pointermove is deliberately excluded, a drifting mouse on an uneven desk would pin the timer indefinitely.)" | **why** |
| `HeroVoiceover.astro:28` | "Driven entirely by the `bg-audio:state` event, no eager initial play. BackgroundAudio renders with `data-state='loading'` and only resolves to `on`/`off` once its async `tryPlay()` settles; jumping the gun produced two races..." | **why** (explains a specific historical bug) |
| `projectsScene.ts:427` | `// Sun spin` | **what**, no rationale |
| `projectsScene.ts:439` | "The selected planet's angle stays frozen, the camera lerp toward it (factor 0.06 below) takes ~1 s to settle..." | **why** |
| `projectsScene.ts:461` | `// Connections — recompute arc positions from current planet world positions, advance the dash flow, and dim while a planet is selected.` | mixed, the second clause ("dim while selected") is why; the first is what |
| `homeScene.ts:101` | "Load the font BEFORE allocating any GPU/DOM resources. If the font fails we never enter the try-block, so there is nothing to clean up." | **why** |
| `homeScene.ts:295` | "Decay rates (per second) for the rim and point-light energies. Lower values mean each flash lingers longer; tuned so the bright moment reads as a beat, not a strobe." | **why** |
| `homeScene.ts:780` | "Decay the collision-flash pulse each frame; bright on hit, fades smoothly to zero." | **what**, no rationale beyond mechanism |

**Score: 8 why / 2 what** out of the sampled 10. Well above average.

**Worst offenders (minor):**
- `projectsScene.ts:427`: `// Sun spin` is a section header, not a comment; fine in context but adds no value.
- `homeScene.ts:780`: describes the mechanism but doesn't explain why decay is per-frame instead of tween-based (the reason is that delta-driven decay doesn't require a GSAP dependency inside the rAF loop).

**Finding (INFO, positive):** Comment quality is high. The *why* convention is well-observed throughout the scene and audio code.

---

## 6. Dead Code

### Unused exports

All exports from `src/lib/` traced to at least one import site:

| Export | Import site |
|--------|------------|
| `prefersReducedMotion` (gsap/setup.ts) | `homeTimeline.ts`, `experienceTimeline.ts` |
| `createScope` (gsap/setup.ts) | `homeTimeline.ts`, `experienceTimeline.ts` |
| `GsapScope` (gsap/setup.ts) | Same files |
| `buildDataFeedConsole` | `Hero.astro:419` |
| `initPageTransitions` | `BaseLayout.astro:207` |
| `initObservability` | `BaseLayout.astro:214` |
| `buildPointCloud` | `projects/buildStarfield.ts:2` |
| `escapeHtml` | `terminal/dom.ts`, `terminal/commands.ts`, `projects/createHoverLabel.ts` |
| `linkifyBody` | `LinkifiedText.astro:2` |

No unreferenced exports found.

### Unused CSS classes (spot check)

Did not run a full unused-CSS sweep (requires cross-referencing dynamic class names generated at runtime by JS). Spot-checked 5 BEM blocks from `projects-scene.css` against component HTML: all referenced. No obvious dead CSS blocks found.

### Unused locale keys

`en.ts` has 386 lines. Spot-checked the `projectsPage` sub-object (15 keys) against `ProjectsPage.astro` and `ProjectsVoiceover.astro`: all keys consumed. Full key-by-key traversal not performed (requires a custom script; out of scope for grep-level audit).

**Finding (INFO):** No dead exports found. Locale key coverage spot-check clean.

---

## 7. Naming Consistency

### File naming

- **Astro components:** PascalCase (`BackgroundAudio.astro`, `Hero.astro`, `MobileContactCard.astro`). Consistent.
- **TypeScript libs:** camelCase (`homeScene.ts`, `createRenderer.ts`, `buildMeteors.ts`). Consistent.
- **Style files:** kebab-case (`projects-scene.css`, `nav-cards.css`). Consistent.
- **i18n locales:** lowercase (`en.ts`, `fi.ts`, `sv.ts`). Consistent.
- **Page-content files:** PascalCase + `Page` suffix (`HomePage.astro`, `ProjectsPage.astro`). Consistent.

### Function and builder naming

- Scene entry points: `createHomeScene` / `createProjectsScene` (factory verb).
- Sub-module builders: `buildXxx` (10 files). Consistent.
- Utilities: `createXxx` (4 files), `initXxx` (3 files). Consistent with a create-vs-init convention where `create` returns a disposable handle and `init` returns a simpler object.

**Finding (INFO, positive):** Naming is consistent. The only minor inconsistency is `src/lib/home/dataFeedConsole.ts`: the lone file in a `home/` sub-directory. All other page-specific logic lives in either `lib/gsap/`, `lib/projects/`, or `lib/three/`. The `home/` directory contains a single file (`dataFeedConsole.ts`); if more home-specific modules are added it makes sense; otherwise it is a slightly orphaned directory.

### Component prop naming

Props follow camelCase uniformly across all `.astro` frontmatter. No snake_case props found.

---

## 8. Test Coverage Reality vs. Portfolio Claim

**The claim** (`src/i18n/locales/en.ts:8`):
> "Full-stack developer in Finland. Seven production apps shipped solo this year: real users, **1828+ tests, AI-native by default.**"

**The reality of this repo:**
- 3 test files, 28 tests (baseline audit confirms).
- Coverage: i18n routing/translation + project data schema validation only.
- Zero coverage of: audio state machine (BackgroundAudio.astro + HeroVoiceover.astro logic), Three.js scene lifecycle (homeScene, projectsScene, all 15 builder modules), GSAP timelines, terminal command dispatch, page transitions, observability, the drawer, the boot scheduler.

**Is this a finding worth raising?** Yes: judgment call required.

The copy says "1828+ tests" to describe *other projects* (HRM, Platform, etc.) but the sentence reads as a claim about the developer's general practice. A visitor reading the portfolio home page who then clicks through to the GitHub repo and sees 28 tests covering only i18n/data would reasonably feel misled, not because the statement is technically false, but because the punctuation ("1828+ tests, AI-native by default") implies the portfolio itself reflects those values.

The Vitest suite was added in commit 7933574 (PR #90, today's HEAD). That's a start. But:

- The Three.js rendering pipeline is essentially untestable at unit-test granularity without a DOM+WebGL harness (Puppeteer/Playwright/vitest-browser). None exists.
- The audio state machine (idle replay timer, crossfade logic, deck switching) is fully testable in jsdom with Web Audio API mocks, and is currently untested.
- The terminal command dispatch is fully testable with simple string I/O, and is untested.

**Finding (MEDIUM, judgment):** The portfolio site has 0% coverage of its own business logic (audio, Three.js, terminal). The "1828+ tests" tagline is technically correct but contextually misleading when applied to this repo. Either add tests for the testable parts (audio state machine, terminal dispatch) or qualify the tagline to make clear it describes the referenced projects, not this portfolio site itself.

---

## 9. `!important` Overuse

Found 12 occurrences across 6 files. **Every single instance** is inside a `@media (prefers-reduced-motion: reduce)` block, where `!important` is the standard, correct pattern for reliably overriding inline GSAP-applied transforms and animations that would otherwise have higher specificity.

```
global.css:173–176        — 4× (animation-duration, iteration-count, transition-duration, scroll-behavior)
experience-timeline.css   — 2× (transform: none, animation: none)
mountain-scene.css:102    — 1× (transform: none)
nav-cards.css:167         — 1× (transform: none)
project-detail.css:249,253,258 — 3× (transform: none)
project-grid.css:240      — 1× (transform: none)
```

There is also a comment in `projects-scene.css:446` that mentions `!important` in prose (explaining why `hidden` is NOT used), but no actual `!important` declaration in that file.

**Finding (INFO, positive):** Zero `!important` outside `prefers-reduced-motion` blocks. This is the correct pattern; no remediation needed.

---

## What I Didn't Cover

- **Static analysis with proprietary tools** (SonarQube, CodeClimate, Snyk Code), not available in this environment.
- **Full unused-CSS sweep**: requires a tool that understands runtime-dynamic class names (e.g. PurgeCSS with safelist). Spot-checked only.
- **Full unused locale key traversal**: a grep-level check on 386-line `en.ts` was spot-checked, not exhaustively cross-referenced.
- **Architectural review** beyond source reading, no ADR consistency check, no coupling graph, no circular import detection.
- **Runtime memory profiling**: the dispose audit was static (reading allocation vs disposal calls); it does not confirm zero GPU leaks under actual navigation conditions.

---

## Findings Summary by Severity

### Medium (1)
- **I-MI1: Test coverage reality** ([`src/i18n/locales/en.ts:8`](src/i18n/locales/en.ts#L8)): "1828+ tests" tagline contextually misrepresents this repo. Audio state machine and terminal dispatch are testable today with mocks, add tests or qualify the claim.

### Low (5)
- **I-NI1: `noPropertyAccessFromIndexSignature` missing** ([`tsconfig.json`](tsconfig.json)): Only strict-family flag not enabled. Low practical risk given current code patterns; add it for completeness.
- **I-NI2 (Sloppy non-null assertion** ([`src/lib/three/projectsScene.ts:431`](src/lib/three/projectsScene.ts#L431)): `uniforms.intensity!.value`) type `createGlowMaterial`'s return with an explicit `intensity` uniform to remove this.
- **I-NI3: `as unknown as` cast in buildPlanetTexture** ([`src/lib/three/projects/buildPlanetTexture.ts:207`](src/lib/three/projects/buildPlanetTexture.ts#L207)): Use a typed literal tuple instead of casting `.map()` result.
- **I-NI4: Copy-pasted visibility pause lifecycle** ([`src/lib/three/homeScene.ts:870`](src/lib/three/homeScene.ts#L870)–895, [`src/lib/three/projectsScene.ts:584`](src/lib/three/projectsScene.ts#L584)–608): Identical `visibilitychange` subscription block; extract into `createOffscreenPauser` or a new helper.
- **I-NI5: `TARGET_FRAME_MS` constant duplicated** ([`src/lib/three/homeScene.ts:708`](src/lib/three/homeScene.ts#L708), [`src/lib/three/projectsScene.ts:412`](src/lib/three/projectsScene.ts#L412)): Move to a shared `src/lib/three/constants.ts`.

### Info / Positive (6)
- **I1**: Zero `as any`, `@ts-ignore`, `@ts-expect-error` escapes across all of `src/`.
- **I2**: Dispose discipline is thorough; no allocation without a paired dispose was found.
- **I3**: Comment quality is high (8/10 sampled comments explain *why*).
- **I4**: Page-content components are thin delegation shells; no business logic leaked into frontmatter (minor `execSync` exception in `HomePage.astro`).
- **I5**, No dead exports found in `src/lib/` or `src/i18n/`.
- **I6** (All `!important` usage is inside `prefers-reduced-motion` blocks) the correct pattern.
