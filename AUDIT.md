# mikkonumminen.dev — principal engineer audit

> Read-only audit pass. Five parallel agents covered Three.js, GSAP, terminal/transitions/data, components/a11y, and config/SEO/security. Findings grouped by severity, then by domain.
>
> 🔴 Critical — leaks, broken a11y, broken mobile, security gaps, type holes
> 🟡 Important — DRY violations, file > 200 LOC, dead code, missing reduced-motion fallbacks
> 🟢 Polish — naming, micro-optimizations, idiomatic improvements

---

## 🔴 Critical

### Three.js — memory & lifecycle leaks

🔴 **[src/lib/three/projectsScene.ts:213-225]** — Ring geometry/material leaked when `project.hasRing` is true
- Ring `BufferGeometry` and `MeshBasicMaterial` are created and added to `planetWrap` but `PlanetEntry` doesn't track them, so `dispose()` skips them. Leaks on every dispose.
- Fix: Add `ring?: THREE.Mesh` to `PlanetEntry`, store the ring, dispose it alongside `mesh`/`glow`/`orbitLine`.

🔴 **[src/lib/three/projectsScene.ts:147-150]** — `sunLight` and `AmbientLight` never disposed/removed
- Ambient light has no variable binding at all (`scene.add(new THREE.AmbientLight(...))`), can't be removed. `sunLight` is a `PointLight` and is also leaked.
- Fix: Bind both lights to variables, call `scene.remove(...)` plus `light.dispose()` in `dispose()`.

🔴 **[src/lib/three/projectsScene.ts:255 + tween calls]** — GSAP hover tweens not killed on dispose
- `dispose()` doesn't call `gsap.killTweensOf(...)` for the planet meshes whose `.scale` was tweened on hover. In-flight tweens keep writing to disposed `Vector3`s — GSAP keeps them alive past dispose.
- Fix: `planets.forEach((p) => gsap.killTweensOf(p.mesh.scale));` in `dispose()` before disposing geometries/materials.

🔴 **[src/lib/three/projectsScene.ts:428-442]** — `hoverLabel` DOM state not reset on dispose
- `hoverLabel.dataset.visible`, `style.transform`, `innerHTML` mutated by the scene but never cleaned up. Label can be left visible after teardown.
- Fix: Reset all three in `dispose()`.

🔴 **[src/lib/three/projectsScene.ts:377-380]** — Cursor style change on canvas never reverted
- When a planet is hovered, `canvas.style.cursor = 'pointer'`. If the user is hovering at teardown, the cursor stays as `'pointer'`.
- Fix: `canvas.style.cursor = '';` in `dispose()`.

🔴 **[src/lib/three/homeScene.ts:226-241]** — Lights, fog, scene not disposed; rejected `FontLoader.load` leaks everything
- Two distinct issues:
  1. `AmbientLight`, `DirectionalLight`, `PointLight`, `THREE.Fog`, and the scene itself are not disposed/cleared.
  2. `createHomeScene` is `async` and awaits `FontLoader.load`. Renderer, scene, lights, listeners, RAF are all created **before** the await. If the font load rejects, the caller never gets a handle and dispose can never be called — every allocation leaks permanently.
- Fix: Load the font first (before constructing renderer/scene), or wrap the post-await body in `try/catch` and dispose on failure. Also `scene.clear()` and null references in `dispose()`.

🔴 **[src/lib/three/homeScene.ts:209-210]** — Particle pipeline created even when reduced-motion makes `particleCount` 0
- A zero-length `Points` is still added to the scene with geometry, material, and texture allocated. Wasted resources for no visible effect.
- Fix: `const particles = particleCount > 0 ? buildParticles(particleCount) : null;` and dispose conditionally.

🔴 **[src/lib/three/projectsScene.ts:302-317]** — `onResize` references `disposed`/`raf` before they are declared (TDZ hazard)
- `onResize` is a `const` arrow at line 302 and registered at line 311, but `disposed`/`raf` are declared inside the "Animation loop" block. Currently safe by call-ordering, but a sync resize before line 317 would throw `ReferenceError`.
- Fix: Hoist `let disposed = false;` and `let raf = 0;` to the top of the function body.

### Three.js — RAF and visibility

🔴 **[src/lib/three/homeScene.ts:177-218]** — RAF runs at full rate in background tabs
- No `document.visibilitychange` guard. Burns battery on a 60fps "Apple-bar" page when the tab is hidden.
- Fix: Pause RAF on `visibilitychange` when `document.hidden`, resume on visible. Apply same fix to projectsScene.

### GSAP — reduced motion

🔴 **[src/lib/gsap/homeTimeline.ts:38-152]** — `prefers-reduced-motion` not honored when caller forgets to pass the flag
- `reducedMotion` defaults to `false` and the function never reads `window.matchMedia('(prefers-reduced-motion: reduce)')`. Even when set, the code still calls `gsap.set(..., { opacity: 0, y: 60 })` and only shortens duration to `0.001` — content stays hidden until ScrollTrigger fires, which may never happen for above-the-fold elements.
- Fix: Read the media query as the default; when reduced, call `gsap.set(targets, { clearProps: 'all' })` and skip creating tweens entirely.

🔴 **[src/lib/gsap/experienceTimeline.ts:189-252]** — No `prefers-reduced-motion` handling at all
- The scroll-driven sun, color phases, parallax, goat sway, and IntersectionObserver-driven `is-visible` toggle all run regardless of user preference. Timeline entries start with `opacity: 0; transform: translateY(50px)` and only become visible via the IO callback — reduced-motion users still see the slide-in.
- Fix: Add `ExperienceTimelineOptions { reducedMotion?: boolean }`, default to media-query value. When true: call `applyPhase(0.6, sceneRoot)` once, immediately add `is-visible` to all `[data-timeline-entry]`, skip the master ScrollTrigger + IntersectionObserver entirely. Add `@media (prefers-reduced-motion: reduce) { .timeline__entry { opacity: 1; transform: none; } }` in [src/components/experience/TimelineContent.astro](src/components/experience/TimelineContent.astro).

### Page transition — robustness

🔴 **[src/lib/transitions/pageTransition.ts:48-56]** — `isInternalLink` only excludes non-http(s) by accident
- `mailto:` / `tel:` / `javascript:` URLs are filtered only because `new URL('mailto:foo', ...)` resolves to a different `origin`. Fragile.
- Fix: Add explicit protocol allow-list: `if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;`. Also reject `rel="external"`.

🔴 **[src/lib/transitions/pageTransition.ts:78]** — Resize listener registered with inline arrow, never removable
- `window.addEventListener('resize', () => this.resize())` — even `cancel()` couldn't remove it. Stacks listeners if `initPageTransitions` is ever called twice.
- Fix: Store `this.onResize = () => this.resize()` as a bound field, attach with that reference, remove it in `cancel()` / new `dispose()`. Guard `initPageTransitions` against double-init.

🔴 **[src/lib/transitions/pageTransition.ts:76]** — `getContext('2d')!` non-null assertion with no fallback
- Throws on locked-down browsers / Canvas-blocking extensions, crashing the entire transition layer at init.
- Fix: `const ctx = canvas.getContext('2d'); if (!ctx) return null;`. `initPageTransitions` early-returns on null.

### Terminal — DOM coupling and a11y

🔴 **[src/lib/terminal/terminal.ts:122-123]** — `getElementById('terminal-output')!` defeats scoped lookup
- `handleCommand` already has `output` in closure but reaches into `document.getElementById(...)!` twice. Bypasses the `root: ParentNode` parameter and asserts non-null without justification.
- Fix: Pass `output` (or `elements`) into `handleCommand` and append directly. Drop `!` assertions.

🔴 **[src/components/contact/Terminal.astro:30-38]** — `aria-live="polite"` on a region typed character-by-character
- Screen readers may announce every character of the boot sequence, producing an unintelligible stream.
- Fix: Set `aria-live="off"` during boot, switch to `polite` after boot completes — or wrap typed lines in nodes appended all-at-once and only mark the *finished* line region as live.

### Components — a11y and semantic structure

🔴 **[src/page-content/ContactPage.astro + src/components/contact/Terminal.astro]** — Contact page has zero `<h1>`
- Terminal `<section>` only carries `aria-label`. Screen-reader users land on a heading-less page; violates "one h1 per page".
- Fix: Add a visually hidden `<h1 class="sr-only">{t.contactPage.h1}</h1>` inside Terminal.astro before the chrome. Add the i18n key.

🔴 **[src/page-content/ProjectsPage.astro:18-48]** — Two `<h1>` elements rendered with JS disabled
- The WebGL scene block (`projects-scene__title` h1) and the `<noscript>` ProjectGrid (also h1) both render. The scene container has no initial `hidden` attribute.
- Fix: Render `.projects-scene` with `hidden` initially; let the script un-hide it on capable clients. Only one h1 in the DOM at any time.

🔴 **[src/components/projects/ProjectDetail.astro + src/page-content/ProjectsPage.astro:155]** — Drawer panel has no focus management
- When the drawer opens, `aria-hidden` toggles but focus is never moved into the drawer; no focus trap. Closing with Escape works, but opening via keyboard isn't even possible from the canvas.
- Fix: When `openDetail` runs, focus the close button (or the drawer container with `tabindex="-1"`). On close, return focus. Add a basic Tab focus trap. Switch `<aside>` → `<section role="dialog" aria-modal="true" aria-labelledby="project-detail-name">`.

### Config / security

🔴 **[vercel.json:36-46]** — Missing HSTS header
- No `Strict-Transport-Security`. Users on a fresh connection vulnerable to downgrade/MITM on the first hop.
- Fix: Add `{ "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }`.

🔴 **[vercel.json:41-44]** — `Permissions-Policy` missing FLoC opt-out and other interests
- Locks down camera/mic/geolocation but not `interest-cohort`, `browsing-topics`, `payment`, `usb`.
- Fix: Expand to `"camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=(), payment=(), usb=()"`.

🔴 **[vercel.json:8-47]** — No `Content-Security-Policy`
- No CSP at all. Inline scripts (Astro hoists, JSON-LD, language detection) make a strict nonce-based CSP impractical, but a baseline policy is still possible.
- Fix: Add a permissive-but-not-empty CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests`.

🔴 **[tsconfig.json:1-12]** — `noUncheckedIndexedAccess` not enabled
- Only extends `astro/tsconfigs/strict`, which doesn't enable this. For Three.js / GSAP code full of typed-array indexing, `arr[i]` typed as `T` instead of `T | undefined` is exactly the class of bug that produces frame drops.
- Fix: Add `"noUncheckedIndexedAccess": true` to `compilerOptions`. Triggers a wave of `!` assertions to fix in the lib code.

---

## 🟡 Important

### File hygiene — over the 200-line cap

| File | Lines | Suggested split |
|---|---|---|
| [src/components/contact/Terminal.astro](src/components/contact/Terminal.astro) | 420 | Move CRT/scanline/terminal styles to `src/styles/terminal.css` or split into `Terminal.astro` + `CrtFrame.astro` |
| [src/page-content/ProjectsPage.astro](src/page-content/ProjectsPage.astro) | 348 | Extract `populateDetail`/`openDetail`/`closeDetail` into `src/lib/projects/detail.ts`. Move global styles to `src/styles/projects-scene.css` |
| [src/components/experience/TimelineContent.astro](src/components/experience/TimelineContent.astro) | 339 | Extract `.timeline*` styles to `src/styles/experience-timeline.css` |
| [src/components/home/NavCards.astro](src/components/home/NavCards.astro) | 300 | Extract three inline SVGs into `src/components/home/icons/{Planet,Mountain,Terminal}Icon.astro` |
| [src/components/projects/ProjectGrid.astro](src/components/projects/ProjectGrid.astro) | 265 | Extract styles to colocated CSS |
| [src/components/projects/ProjectDetail.astro](src/components/projects/ProjectDetail.astro) | 253 | Extract styles to colocated CSS |
| [src/components/experience/MountainScene.astro](src/components/experience/MountainScene.astro) | 237 | Extract SVG layers to a helper or move styles out |
| [src/lib/terminal/terminal.ts](src/lib/terminal/terminal.ts) | 321 | Split into `terminal/{dom,typing,history,dispatch,index}.ts` |
| [src/lib/terminal/commands.ts](src/lib/terminal/commands.ts) | 235 | Extract `navCommand(name, descKey, openingKey, path)` factory; reuse for projects/home/experience |
| [src/lib/three/homeScene.ts](src/lib/three/homeScene.ts) | 266 | Extract `buildParticleField()` and `buildTitle()` to sibling modules |
| [src/lib/three/projectsScene.ts](src/lib/three/projectsScene.ts) | 489 | Extract `buildStarfield()`, `buildSun()`, `buildPlanet(project)`, `createHoverLabel(hoverLabel)` to `src/lib/three/projects/` submodule |

### TypeScript — type safety gaps

🟡 **[src/lib/three/projectsScene.ts:455-463]** — Returned handle methods lack explicit param/return types
- `selectById: (id) => { ... }`, `dispose: () => { ... }`, `resize: onResize` — no explicit `: void` or param type. Same in homeScene.ts (lines 222, 225, 226).
- Fix: `selectById: (id: string | null): void => { ... }`. Apply to all handle methods in both scenes.

🟡 **[src/lib/three/projectsScene.ts:275]** — `as string` cast on `userData.projectId` uncommented
- `userData` is typed as `Record<string, any>` so the cast is necessary, but uncommented.
- Fix: Comment justifying it, or use `WeakMap<THREE.Object3D, string>` keyed by mesh to avoid `userData` typing entirely.

🟡 **[src/lib/three/projectsScene.ts:474-478]** — `(p.mesh.material as THREE.Material).dispose()` triple-cast
- Three.js types `material` as `Material | Material[]`. Cast repeated three times in dispose loop.
- Fix: Helper `disposeMaterial(m: THREE.Material | THREE.Material[]): void`. Use for `mesh`, `glow`, `orbitLine`, ring.

🟡 **[src/lib/three/homeScene.ts:206]** — `posAttr.array as Float32Array` cast without justification comment
- The cast is necessary (Three.js typed-array union), but standard requires a comment.
- Fix: Add a one-liner explaining the cast, or use `satisfies`.

🟡 **[src/lib/gsap/experienceTimeline.ts:143-187]** — `applyPhase`, `lerpRgba`, `lerpString`, `parseHex` missing return types and using `!` assertions on regex match results
- `match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]` then `[0]!`, `[1]!`, `[2]!`, `[3]` with non-null assertions.
- Fix: Add `: void` / explicit return types. Use destructuring with defaults: `const [r0 = 0, g0 = 0, b0 = 0, a0 = 1] = ra;`.

🟡 **[src/lib/terminal/terminal.ts:113-140]** — `(err as Error).message` cast
- `err` is `unknown`, could be a non-Error throw.
- Fix: `const message = err instanceof Error ? err.message : String(err);`.

🟡 **[src/lib/terminal/commands.ts:13 + src/lib/terminal/terminal.ts:24]** — `[c]!` non-null assertions in escape map lookup
- Necessary because `Record<string, string>` lookup is `string | undefined`, but the regex character class guarantees the key. No comment.
- Fix: Add inline comment or use `Record<'&'|'<'|'>'|'"'|"'", string>` and drop the assertion.

🟡 **[src/lib/transitions/pageTransition.ts:261]** — `(stored as Theme) ?? 'home'` without validation
- If storage is corrupted with a stale value from another deploy, `pickTheme` lookup downstream could be undefined.
- Fix: `const theme: Theme = stored && stored in PALETTES ? (stored as Theme) : 'home';` with a justifying comment.

🟡 **[src/i18n/index.ts:18]** — `dictionaries[locale as Locale]` cast after `locale in dictionaries` check
- TypeScript can't narrow `string` to `Locale` from `in` membership. Cast is necessary but uncommented.
- Fix: Comment, or use a `Set<Locale>` and a validated branch.

### DRY violations

🟡 **[src/lib/three/homeScene.ts:23-31 + projectsScene.ts:43-54]** — Renderer construction duplicated across scenes
- Both files do `new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })`, same DPR cap, same setSize, same clearColor. Resize handlers (homeScene 156-169, projectsScene 302-310) are also nearly identical.
- Fix: Extract `src/lib/three/createRenderer.ts` and `src/lib/three/createResizeHandler.ts`.

🟡 **[src/lib/three/homeScene.ts:60-88 + projectsScene.ts:69-104]** — Two near-identical particle/starfield setups
- Both build a `BufferGeometry` + `Float32Array` of positions, attach `position` attribute, build a `PointsMaterial` with `sizeAttenuation`, `transparent`, `depthWrite: false`.
- Fix: Extract `buildPointCloud({ count, positions, colors?, material })` returning `{ points, geometry, material }`.

🟡 **[src/lib/terminal/commands.ts:10-14 + src/lib/terminal/terminal.ts:21-25]** — `escape` / `escapeHTML` duplicated character-for-character
- Same five-character HTML escape function in both files.
- Fix: Move to `src/lib/terminal/dom.ts` (or shared util) and import.

🟡 **[src/lib/gsap/homeTimeline.ts + experienceTimeline.ts]** — ScrollTrigger import and plugin registration duplicated
- Both files repeat the import + `gsap.registerPlugin(ScrollTrigger)` and both maintain a manual `triggers: ScrollTrigger[]` cleanup pattern.
- Fix: Extract `src/lib/gsap/setup.ts` exporting `gsap` + `ScrollTrigger` and a `createScope()` helper that wraps `gsap.context`. Import from there.

### GSAP — context and cleanup

🟡 **[src/lib/gsap/homeTimeline.ts:38-152]** — Not using `gsap.context()` despite creating 6+ tweens
- Manual `triggers.push(...)` only kills ScrollTriggers. Tweens themselves are never killed; in-progress tweens (e.g. mid-stagger) are orphaned on dispose.
- Fix: Wrap body in `const ctx = gsap.context(() => { ... });`, return `dispose: () => ctx.revert()`. `revert()` kills tweens *and* their ScrollTriggers AND reverts inline styles set by `gsap.set`.

🟡 **[src/lib/gsap/experienceTimeline.ts:189-252]** — Same `gsap.context()` gap; inline `style.setProperty` not cleaned up
- `onUpdate` writes `--goat-bottom`, `--goat-x`, `--{layer}-y` directly via `style.setProperty`. On dispose these inline custom properties remain forever, leaking into HMR or back-navigation.
- Fix: Wrap in `gsap.context()` and explicitly `removeProperty()` for each var on dispose, or use `gsap.quickSetter` with the CSS var so GSAP tracks and reverts it.

🟡 **[src/lib/gsap/homeTimeline.ts:147]** — `ScrollTrigger.refresh()` refreshes globally
- Recalculates *every* ScrollTrigger on the document, including any from other modules.
- Fix: With `gsap.context`, scope: `triggers.forEach(t => t.refresh())`, or document why a global refresh is intentional.

🟡 **[src/lib/gsap/homeTimeline.ts:20-36]** — `splitChars` mutates DOM with no inverse
- Permanently rewrites `textContent` into `<span class="char">` children. No "unsplit" path on dispose; remount via SPA-style routing leaves DOM forked. Also missing return type.
- Fix: Add `: void` return type. On dispose either restore from `aria-label` and clear the `data-split-done` flag, or document the one-way mutation.

### Data layer — silent fallbacks

🟡 **[src/data/projects.ts:144-154 + src/data/timeline.ts:43-53]** — Silent empty-string fallback for missing translations
- `text?.tagline ?? ''` masks missing translation keys. If a translator forgets a key, production renders empty strings with no error.
- Fix: In dev (`import.meta.env.DEV`), `console.warn('[i18n] missing projectsData.${id}.tagline for locale ...')` when the lookup fails.

🟡 **[src/data/projects.ts:138]** — `projectMap` exported but unused
- Pure dead export (greppable; no consumers).
- Fix: Delete it. If it's needed for the project detail panel later, add when needed.

🟡 **[src/lib/terminal/types.ts:20]** — `CommandResult = void | { silent?: boolean }` declared but never read
- `handleCommand` doesn't inspect the return value. Dead surface area.
- Fix: Drop `CommandResult`, change handler signature to `void | Promise<void>`. Or implement silent semantics if there's a real use case.

🟡 **[src/lib/terminal/commands.ts:26-27]** — Dead `cp` binding kept alive with `void cp;`
- "not used here but kept for parity" — parity with what?
- Fix: Delete both lines.

### Components — semantic / a11y polish

🟡 **[src/page-content/ExperiencePage.astro:30-46]** — Reduced-motion not threaded into `initExperienceTimeline`
- (Captured in critical row above.) The page doesn't pass `reducedMotion` to the lib because the lib doesn't accept it. Both sides need to change.

🟡 **[src/components/contact/Terminal.astro:69-86]** — `<noscript>` block has no heading
- Combined with the missing page-level `<h1>`, no-JS users land on a heading-less page.
- Fix: Inside the `<noscript>`, wrap content in `<section><h1>{t.contactPage.h1}</h1>...</section>`.

🟡 **[src/components/contact/Terminal.astro:213-218 + 368]** — Color contrast borderline / failing
- `.terminal__title` color `rgba(181, 245, 200, 0.55)` on `rgba(3, 10, 6, 0.85)` ≈ 3.5–4:1 (below AA 4.5:1 for body text).
- `.terminal__hints` uses `--color-term-dim` (#4b6b54) on near-black ≈ 3.6:1, also below AA.
- Fix: Bump `--color-term-dim` to `#6e8e75` (≈4.7:1). Bump `terminal__title` alpha to ~0.75.

🟡 **[src/layouts/BaseLayout.astro:147-149]** — `<main id="main">` not focusable for skip link
- Some browsers scroll but don't move focus when clicking the skip link, defeating its purpose.
- Fix: `<main id="main" tabindex="-1" style="outline:none">`.

🟡 **[src/components/nav/SiteNav.astro:79]** — Language switcher uses `aria-current="true"` instead of `"page"`
- Primary nav uses `"page"`. Inconsistent.
- Fix: `aria-current={l.isCurrent ? 'page' : undefined}`.

🟡 **[src/components/experience/TimelineContent.astro:24-34 + others]** — Decorative `<svg>`s missing `aria-hidden` and `focusable="false"`
- Wrapper `<p aria-hidden="true">` covers it, but defensive: some screen readers re-enter aria-hidden subtrees.
- Fix: Add `aria-hidden="true" focusable="false"` to every inline decorative `<svg>`. Apply to: `Hero.astro:29`, `TimelineContent.astro:26`, `NavCards.astro:45,66,77`, `ProjectDetail.astro:20`, `MountainScene.astro` SVGs.

🟡 **[src/page-content/HomePage.astro:122-129]** — Duplicate `.hero__title-fallback` rule
- Same `display: block` rule exists in `Hero.astro:117-121` (scoped) and `HomePage.astro:122-129` (global with `!important`). The component-scoped media query already handles it.
- Fix: Delete the `<style is:global>` block in HomePage.astro.

### Config / build hygiene

🟡 **[package.json:21,28]** — `@astrojs/check` and `typescript` in `dependencies` instead of `devDependencies`
- Both are dev tooling. Astro's docs put them in dev.
- Fix: Move to `devDependencies`.

🟡 **[package.json:6-8]** — Open-ended Node engine
- `"node": ">=20.3.0"` allows odd-numbered non-LTS versions silently.
- Fix: `"node": "^20.3.0 || ^22.0.0"` to constrain to LTS lines.

🟡 **[public/manifest.webmanifest:1-16]** — Manifest is missing PNG icons, lang/dir/scope/id, and `short_name` is too long
- Only one SVG icon entry. Safari/iOS install prompts and Android home-screen icons need 192×192 and 512×512 PNGs plus a maskable variant. `short_name` is `"mikkonumminen.dev"` (17 chars; Android truncates around 12).
- Fix: Generate `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`. Add `lang: "en"`, `dir: "ltr"`, `scope: "/"`, `id: "/"`. Use `short_name: "Mikko N."` (or similar). Extend `build:og` script to also rasterize the favicon.

🟡 **[scripts/build-og.mjs:1-20]** — No top-level error handling, no per-file recovery, no path resolution from script location
- Single sharp throw kills the loop with stack trace, partial state in `public/`. Paths relative to CWD.
- Fix: Wrap each iteration in try/catch, log per-file, exit non-zero if any failed. Use `import.meta.url` + `fileURLToPath` to resolve paths from script location.

🟡 **[src/i18n/index.ts:38-45]** — `localizePath` doesn't handle query strings or hashes
- `localizePath('?foo=1', 'fi')` returns `/fi/?foo=1` (wrong). Regex `^\/(fi|sv)(\/|$)` doesn't consider `/fi?foo=1` (no slash before query).
- Fix: Parse with URL-aware split — separate `pathname`, `search`, `hash`, normalize the pathname, reassemble. Document the input contract.

🟡 **[src/i18n/index.ts:54-57]** — `stripLocale` not symmetric with `localizePath`
- `stripLocale('fi/projects')` (no leading slash) returns `'fi/projects'` unchanged.
- Fix: Normalize input the same way `localizePath` does, or document that `stripLocale` requires a leading slash.

---

## 🟢 Polish

### Naming and constants

🟢 **[src/lib/three/homeScene.ts:158-159 + projectsScene.ts:304-305]** — `w` / `h` single-letter variables in resize handlers
- Not loop counters.
- Fix: `const width = window.innerWidth; const height = window.innerHeight;`.

🟢 **[src/lib/three/homeScene.ts:182-184]** — `t` / `dt` (time / delta) single-letter
- Conventional in graphics code but technically violates the rule. Either rename to `elapsed`/`delta` or document the exception in CLAUDE.md.

🟢 **[src/lib/three/homeScene.ts:165-166]** — Magic numbers `1100`, `0.5` in resize scaling
- Fix: `const TITLE_DESIGN_WIDTH = 1100; const TITLE_MIN_SCALE = 0.5;` at module top.

🟢 **[src/lib/three/projectsScene.ts:319-320]** — `tmpVec` / `tmpVec2` non-descriptive scratch vectors
- Fix: Either consolidate or rename by purpose: `planetWorldPos`, `labelProjectionVec`.

🟢 **[src/lib/gsap/experienceTimeline.ts:216]** — `Math.sin(p * 6) * 30` magic numbers
- Fix: `const SWAY_FREQ = 6; const SWAY_AMPLITUDE_PX = 30;` at module top. Rename `p` to `progress`.

🟢 **[src/lib/three/homeScene.ts:34 + projectsScene.ts:57]** — Fog colors `0x05060c` / `0x020512` magic numbers
- Inconsistent: `FOG_COLOR` is hoisted in homeScene but inlined in projectsScene.
- Fix: Hoist as named const in projectsScene too.

### Three.js — micro-optimizations

🟢 **[src/lib/three/projectsScene.ts:351 + 272]** — `planets.map((p) => p.mesh)` recomputed every frame and every click
- 60×N allocations/sec. Cheap, but not Apple-bar.
- Fix: Compute `const planetMeshes = planets.map((p) => p.mesh);` once after the planets array is built.

🟢 **[src/lib/three/projectsScene.ts:445-451]** — `escapeHtml` recreated as closure on every `createProjectsScene` call
- Fix: Hoist to module scope above the factory, or extract to `src/lib/util/escapeHtml.ts`.

🟢 **[src/lib/three/projectsScene.ts:286]** — `lookAtCurrent = lookAtTarget.clone()` is a double clone
- `lookAtTarget = SOLAR_LOOK_AT.clone()` then `lookAtCurrent = lookAtTarget.clone()`. `lookAtTarget` is never mutated.
- Fix: Drop `lookAtTarget`. Use `SOLAR_LOOK_AT` directly.

🟢 **[src/lib/three/projectsScene.ts:106-150 + 171-197]** — Sun and planet glow shaders are duplicates
- Same Fresnel term, different constants. Two `ShaderMaterial`s, two shader compilations.
- Fix: `createGlowMaterial({ color, falloff, intensity })` helper. Saves one shader compile.

### GSAP — easing / triggers

🟢 **[src/lib/gsap/homeTimeline.ts:104]** — `data-reveal` ScrollTrigger has no `end`
- Inconsistent with the chars block above which sets `end: 'top 40%'`.
- Fix: Add `end: 'top 40%'` for parity, or remove from chars block.

🟢 **[src/lib/gsap/homeTimeline.ts:114-123]** — Parallax `yPercent: -speed * 100` is barely perceptible at default speed
- Fix: Bump default `speed` to ~0.4-0.5, or tighten trigger range to `start: 'top bottom', end: 'bottom 20%'`.

🟢 **[src/lib/gsap/experienceTimeline.ts:234-243]** — IntersectionObserver entries get no stagger
- Multiple entries entering the viewport simultaneously all start their CSS transition in the same frame.
- Fix: Set `rec.target.style.transitionDelay = ${index * 80}ms` based on intersection order, or move to a GSAP `stagger`.

### Terminal — UX polish

🟢 **[src/lib/terminal/terminal.ts:55-77]** — Typing effect uses fixed delay
- Each character lands at exactly 18ms. Real terminals/typists vary.
- Fix: `await sleep(charDelay * (0.7 + Math.random() * 0.6))` for ±30% jitter. Optional: occasional longer pause after `. ! ? ,`.

🟢 **[src/lib/terminal/terminal.ts:185-196]** — Tab completion is case-sensitive
- Every command name is lowercase, so `WHO<Tab>` does nothing.
- Fix: `c.name.startsWith(partial.toLowerCase())`. Tab returns the canonical lowercase, normalizing the user's input.

🟢 **[src/lib/terminal/terminal.ts:291]** — Ctrl+L also fires on Cmd+L (Mac)
- Cmd+L is the browser's "focus address bar" shortcut. Real macOS Terminal.app uses Cmd+K to clear, not Cmd+L.
- Fix: Drop `e.metaKey` from the Ctrl+L handler.

🟢 **[src/lib/terminal/terminal.ts:198-212]** — `updateCursor` allocates and removes a measurement span on every keystroke
- Layout-thrash on every `input`/`keyup`/`click`/`focus`.
- Fix: Cache one measurement span as a module-level variable, or use canvas `measureText`.

🟢 **[src/lib/terminal/commands.ts:147,155,163]** — Navigation commands use `setTimeout(..., 350)` with no cancel
- Type `projects` then `clear` within 350ms — navigation still fires.
- Fix: Track the pending timer on the command context and clear it on `clear()`, or use `await sleep(350)` so the await can be cancelled at teardown.

### Page transition

🟢 **[src/lib/transitions/pageTransition.ts:69]** — Particles reallocated every burst
- `this.particles = []` then 240 push calls per transition. Audit asks about pooling.
- Fix: Pre-allocate `this.particles = new Array(PARTICLE_COUNT)` once in the constructor, mutate fields in place during `spawnParticles`. Cuts GC churn at the most performance-critical moment.

🟢 **[src/lib/transitions/pageTransition.ts:90-141]** — `spawnParticles` has 50 lines of duplication between `out` and `in` branches
- Fix: Compute `(ox, oy)` based on mode, then push once.

### Components — polish

🟢 **[src/components/contact/Terminal.astro:42-45]** — Hard-coded `guest@mikkonumminen` prompt label duplicated in markup and `terminal.ts:12`
- Drift risk.
- Fix: Read it from `data-prompt` on the section element (already present), or export from constants.

🟢 **[src/components/home/NavCards.astro:116-119]** — Footer is buried in the home page's last section
- Other pages have no footer.
- Fix: Move to `BaseLayout.astro` (after `</main>`) so every page has consistent credit info.

🟢 **[src/components/home/Hero.astro:154-164]** — Local `.sr-only` definition duplicates Tailwind's built-in utility
- Fix: Remove the local `.sr-only` block, rely on Tailwind.

🟢 **[src/components/projects/ProjectDetail.astro:30-31]** — Empty `<h2>` and `<span>` SSR'd waiting for JS to fill
- Lighthouse and SEO tools flag empty headings.
- Fix: Render the heading only when the drawer opens (create it in JS), or add a default placeholder.

🟢 **[src/components/experience/Goat.astro:1-3 + MountainScene.astro:1-3]** — Empty frontmatter fences
- Fix: Delete the empty `---` blocks.

### Config / docs

🟢 **[README.md]** — Not updated for the i18n migration; missing `format`, `format:check`, `build:og` scripts; describes experience page as built (per CLAUDE.md it was a stub at the time)
- Fix: Add a Languages line ("Available in `/`, `/fi`, `/sv`"). Add the missing scripts to the dev block. Verify experience-page tense.

🟢 **[src/styles/global.css:36-45]** — Reduced-motion wildcard with `!important`
- Defeats any intentional motion under reduced-motion (e.g. a 200ms a11y-relevant fade).
- Fix: Acceptable for now. Long-term, use per-component `@media (prefers-reduced-motion: no-preference)` opt-ins.

🟢 **[src/styles/global.css:3-20]** — CSS custom properties not documented
- Fix: One-line comment per group: `/* Used by /contact terminal */`, `/* Used by /, /projects, /experience */`.

🟢 **[scripts/build-og.mjs:13]** — `density: 200` magic number
- Fix: `// 200dpi gives crisp text after the 1200x630 downscale`.

---

## Findings count

| Severity | Three.js | GSAP | Terminal/Data | Components/a11y | Config/SEO | Total |
|---|---|---|---|---|---|---|
| 🔴 Critical | 8 | 2 | 5 | 5 | 4 | 24 |
| 🟡 Important | 12 | 6 | 9 | 14 | 8 | 49 |
| 🟢 Polish | 9 | 4 | 6 | 5 | 4 | 28 |
| **Total** | **29** | **12** | **20** | **24** | **16** | **101** |

---

## Verified — no findings

These were checked and look good:

- All 12 page wrappers (`src/pages/{,fi,sv}/*.astro`) are 5-line consistent imports with no logic
- `History` class bounded at 100 entries
- `role="log" aria-live="polite" aria-atomic="false"` is on the right element (`#terminal-output`)
- Canvas DPR capped at 2 in pageTransition.ts
- `sessionStorage` access wrapped in `try/catch` in pageTransition.ts
- Both Three.js scenes correctly guard mobile and reduced-motion before importing
- All four OG PNG images exist in `public/`
- All required static assets present (favicon, manifest, robots, fonts)
- `.prettierrc.json` is sane
- `prefers-reduced-motion` early-return in `initPageTransitions` works correctly
