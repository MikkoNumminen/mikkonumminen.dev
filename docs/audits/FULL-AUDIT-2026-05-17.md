# Comprehensive audit — mikkonumminen.dev

**Date:** 2026-05-17  
**HEAD commit at audit time:** `7933574` feat(test): add a minimal Vitest suite over i18n + project data (#90)  
**Methodology:** parallel agents (baseline + A–K specialized + synthesis), read-only, no code changes.

---

## Executive Summary

**Biggest risk.** The JSON-LD `jobTitle` field on all three home pages is populated from the narrative slogan `t.intro.heading`, producing `"Seven repos. They build on each other"` as the machine-readable job title that Google, LinkedIn, and structured-data tools consume (`src/page-content/HomePage.astro:44`). This is not a broken experience — the site looks and performs well — but it is the one place where recruiter tooling parses the page and draws the wrong conclusion. Every recruiter who pastes the URL into an ATS, a LinkedIn integration, or the Rich Results Test will see a marketing tagline where a job title should be. It also collapses the schema's `url` field to the site root regardless of locale, weakening the per-locale entity signal.

**Biggest win.** Lighthouse scores are 96–99 performance / 95–100 accessibility / 100 best-practices / 100 SEO across all 12 routes on mobile — an unusually strong baseline for a WebGL-heavy portfolio. The three-scene architecture (home galaxy, projects solar system, experience mountain) deploys without a single production CVE that is reachable at runtime, all Three.js resources are explicitly disposed on unload, and `prefers-reduced-motion` is honoured across every animated surface including voiceovers. The security posture (HSTS preload, strict CSP, no secrets in history, no third-party scripts) and the i18n completeness (zero missing keys, structural parity enforced at compile time) are both stronger than most production sites of any size. The codebase also scores unusually high for comment quality: 8 of 10 sampled comments explain *why*, not just *what*.

**The one thing to ship first.** Fix the `jobTitle` bug: add `meta.jobTitle: "Full-Stack Developer"` to each locale file and replace the `t.intro.heading.replace(...)` expression in `HomePage.astro:44` with `t.meta.jobTitle`. This is a 15-minute change that fixes the most visible machine-readable defect, feeds into the `/projects` missing-`<h1>` fix (which can be done in the same pass), and costs nothing to the visitor experience. Estimated effort: under 30 minutes including all three locales.

---

## Baseline

### Lighthouse — Mobile preset (all 12 routes)

| Route | Locale | FCP (ms) | LCP (ms) | CLS | TBT (ms) | Perf | A11y | BP | SEO |
|-------|--------|----------|----------|-----|----------|------|------|----|-----|
| `/` | EN | 1739 | 2584 | 0.000 | 20 | 96 | 100 | 100 | 100 |
| `/projects` | EN | 1508 | 2119 | 0.000 | 0 | 99 | **95** | 100 | 100 |
| `/experience` | EN | 1734 | 2264 | 0.014 | 0 | 98 | 100 | 100 | 100 |
| `/contact` | EN | 1581 | 2563 | 0.014 | 0 | 96 | 100 | 100 | 100 |
| `/fi/` | FI | 1433 | 2567 | 0.000 | 15 | 97 | 100 | 100 | 100 |
| `/fi/projects` | FI | 1357 | 2261 | 0.000 | 0 | 98 | **95** | 100 | 100 |
| `/fi/experience` | FI | 1508 | 2413 | 0.014 | 0 | 97 | 100 | 100 | 100 |
| `/fi/contact` | FI | 1358 | 1819 | 0.014 | 0 | 99 | 100 | 100 | 100 |
| `/sv/` | SV | 1434 | 2569 | 0.000 | 13 | 97 | 100 | 100 | 100 |
| `/sv/projects` | SV | 1358 | 2263 | 0.000 | 0 | 98 | **95** | 100 | 100 |
| `/sv/experience` | SV | 1507 | 1816 | 0.014 | 0 | 99 | 100 | 100 | 100 |
| `/sv/contact` | SV | 1357 | 2412 | 0.014 | 0 | 98 | 100 | 100 | 100 |

### JS / CSS bundle sizes (initial load, uncompressed)

| Route | JS | CSS | Notes |
|-------|----|-----|-------|
| `/` | 159.6 kB | 41.2 kB | homeScene (52 kB) dynamically imported |
| `/projects` | 161.2 kB | 38.7 kB | projectsScene (39 kB) dynamically imported |
| `/experience` | 157.7 kB | 38.1 kB | — |
| `/contact` | 161.7 kB | 33.3 kB | Three.js not loaded; confirmed |

BaseLayout.js dominates at 153 kB raw / 52 kB gzipped. The `perfOverlay` chunk at 558 kB never loads for real users (URL-parameter guard). Total audio in dist: 7.4 MB (music bed + EN voiceovers only; FI/SV absent by design but feature ships silently broken for those locales).

### Static check status (HEAD 7933574)

| Check | Status |
|-------|--------|
| `npm run typecheck` | PASS — 0 errors, 106 files |
| `npm run lint` | PASS — 0 errors |
| `npm test` | PASS — 28 tests, 3 files |
| `npm run format:check` | FAIL — 118 files (likely Windows line-ending mismatch, not a CI failure) |

### Vulnerabilities (production, `--omit=dev`)

| Package | Severity | Reachability |
|---------|----------|--------------|
| `devalue` 5.6.4 — DoS via sparse array | High | Not reachable — no SSR, `devalue.unflatten()` never called |
| `astro` 5.18.1 — XSS in `define:vars` | Moderate | Not reachable — zero `define:vars` usages |
| `astro` 5.18.1 — server island replay | Moderate | Not reachable — no server islands, static output |
| `postcss` 8.5.8 — XSS in CSS stringify | Moderate | Not reachable — no user-controlled CSS at build time |

All four advisories are currently unexploitable. The patch for postcss is a 5-minute `package.json` override; the rest require an Astro 5 → 6 major upgrade.

---

## Cross-Domain Findings

These are root causes flagged independently by two or more agents.

### XD-1: Audio toggle hardcoded English + mismatched `aria-label`

**Domains:** F-A11y + J-i18n  
**File:** `src/components/BackgroundAudio.astro:45,87–88`  
**Root issue:** `aria-label="Toggle background sound"` does not contain the button's visible text `"SOUND ON"` / `"SOUND OFF"` (WCAG 2.5.3 failure). Simultaneously, those visible strings are hardcoded English and are not pulled from the locale system, so Finnish and Swedish users see English UI text on every page.  
**Why it cuts across domains:** The same three hardcoded strings are both a WCAG violation (F) and a missing i18n coverage (J). Fixing i18n automatically creates the correct `aria-label` values — one fix resolves both audits. The button lives in `BaseLayout.astro` so the problem appears on all 12 routes.

### XD-2: Missing `<h1>` on the `/projects` desktop scene

**Domains:** F-A11y + G-SEO  
**File:** `src/page-content/ProjectsPage.astro` — PR #86 removed the heading from the WebGL scene layer; the only `<h1>` is now inside `.projects-fallback` which is `display:none` on desktop.  
**Root issue:** Screen-reader users on desktop navigate by headings and encounter no H1 on `/projects`. Google sees the `<title>` tag but no `<h1>` in visible DOM, weakening on-page SEO for the "Projects" keyword.  
**Why it cuts across domains:** The same missing element is a WCAG 1.3.1 / 2.4.6 violation (F) and an SEO anti-pattern (G). A single `<h1 class="sr-only">` inside `.projects-scene` resolves both in one line.

### XD-3: `jobTitle` is a narrative slogan, not a job title

**Domains:** A-Positioning + G-SEO  
**File:** `src/page-content/HomePage.astro:44`  
**Root issue:** `jobTitle: t.intro.heading.replace(/\.$/, '')` produces `"Seven repos. They build on each other"` in the JSON-LD Person schema on all three locale home pages.  
**Why it cuts across domains:** Agent A found it as a recruiter-facing machine-readable credibility problem (positioning); Agent G found it as a Rich Results Test failure and knowledge-panel blocker (SEO). Same one-line bug, two different impact paths.

### XD-4: FI/SV voiceover files absent

**Domains:** J-i18n + F-A11y (nit n4)  
**Files:** `public/audio/` — `voice-landing-fi.mp3`, `voice-landing-sv.mp3`, `voice-projects-fi.mp3`, `voice-projects-sv.mp3` are absent  
**Root issue:** The locale-keyed voiceover feature (commits #82/#83) silently delivers nothing to Finnish and Swedish visitors because the audio files were never recorded or committed. The components fail silently (`/* autoplay blocked, source missing, or play interrupted */`).  
**Why it cuts across domains:** This is both an i18n completeness failure (J) and a degraded experience for FI/SV users that F noted as a nit. The fix requires a human decision (record the voiceovers or explicitly fall back to EN).

### XD-5: DPR cap regression on resize

**Domains:** E-Performance + I-Code Quality  
**Files:** `src/lib/three/createResizeHandler.ts:21` vs `src/lib/three/createRenderer.ts:27–28`  
**Root issue:** `createRenderer` correctly caps pixel ratio at 1.5, but `createResizeHandler` hardcodes 2. Any `window.resize` event — including iOS orientation change — silently upgrades DPR from 1.5 to 2, undoing the `?perf=low` path entirely on Retina/HiDPI displays.  
**Why it cuts across domains:** E flagged it as a 78% GPU render increase; I flagged that the cap value is not shared between the two modules. The code-quality pattern (no shared constant) is what enables the performance regression.

### XD-6: Language switcher tap targets critically undersized (28 px)

**Domains:** D-Responsive + F-A11y  
**File:** `src/components/nav/SiteNav.astro:81` — Tailwind `py-2` = 8 px padding each side + 12 px line-height = ~28 px  
**Root issue:** The EN/FI/SV locale-switch links are a core interaction on every page. At 28 px they are 36% below the iOS HIG 44 px minimum.  
**Why it cuts across domains:** D flagged it as a touch target failure; F flagged the same element as a WCAG tap-target concern. Increasing to `py-3` or adding `min-height: 44px` resolves both.

---

## Findings by Severity

All findings are listed. `[judgment]` marks calls where the right answer depends on intent, not a clear rule.

### BLOCKERS

**[A] B-1 — JSON-LD `jobTitle` is a marketing slogan** — `src/page-content/HomePage.astro:44` — `t.intro.heading` produces `"Seven repos. They build on each other"` in Person schema — confirmed in `dist/index.html` — add `meta.jobTitle` locale key and use it instead.

**[F] B1 — `.project-card__label` contrast 3.42:1 (need 4.5:1)** — `src/styles/project-grid.css:169` — `rgba(196,212,255,0.45)` on `#0a0e1c` background; affects all 7 project cards on the mobile fallback grid (all 12 routes via Lighthouse mobile scan) — raise opacity to ≥ 0.65 or use solid `#8090b0`.

**[F] B2 — Background audio toggle `aria-label` / visible text mismatch (WCAG 2.5.3)** — `src/components/BackgroundAudio.astro:45` — `aria-label="Toggle background sound"` does not contain visible text "SOUND ON" / "SOUND OFF"; voice-control users cannot activate — remove `aria-label` and rely on visible text + `aria-pressed`, or rewrite label to include the state words.

### MAJORS

**[A] M-1 — Time-to-understanding deferred; hero subtitle at 55% opacity and 0.78–0.95rem mono** — `src/components/home/Hero.astro` — role and location are present but visually peripheral; no proof signal in the hero — increase subtitle weight/opacity or add a one-line tease before the scroll hint.

**[A] M-2 — Quantified claims (1828+ tests, 91.9% coverage, 387 commits) are unlinked** — `src/components/home/Intro.astro:29–45`, `src/i18n/locales/en.ts:62–63` — each figure is stated but has no direct link to the supporting artifact — link each claim to the GitHub Actions CI badge or specific coverage URL.

**[A] M-3 — VUOHITIIMI narrative is README-only; site framing relies on "seven repos" copy alone** [judgment] — `src/i18n/locales/en.ts:47` — the strategic ecosystem claim is present in copy but the brand/name is invisible to visitors — decide: either name it on the site or confirm the current copy does all the framing work.

**[A] M-4 — `/projects` has no CTA after project exploration** — `src/page-content/ProjectsPage.astro` — after finishing the solar system, only the nav bar gives a path forward — add a minimal CTA block at page bottom (reuse NavCards terminal-card design).

**[B] M-1 — `/projects` canvas has no keyboard path to 3D exploration** — `src/lib/three/projectsScene.ts:267–356` — drag/click handlers are pointer-only; the side-panel list is the keyboard path but is not labeled as such — add a visually-hidden `<p>` before the list: "Keyboard users: navigate by project list below; the 3D canvas is pointer-only."

**[B] M-3 — Drawer `popstate` / back-gesture not handled** — `src/lib/projects/drawer.ts:204–261` — pressing hardware back while drawer is open navigates away from `/projects` instead of closing the drawer — push state on open, add `popstate` listener.

**[D] C1 — Audio button obscured by iOS home indicator** — `src/components/BackgroundAudio.astro:257–265` — `bottom: 1.25rem` = 20 px; iPhone X+ home indicator zone is ~34 px; `viewport-fit=cover` is set — add `env(safe-area-inset-bottom)` to the `bottom` value.

**[D] C2 — Language switcher tap targets 28 px (need 44 px)** — `src/components/nav/SiteNav.astro:81` — `py-2` = 8 px padding, 12 px text = ~28 px total — increase to `py-3` or add `min-height: 44px; display: inline-flex; align-items: center`.

**[D] H2 — Nav-cards grid stays 3-column down to 320 px** — `src/styles/nav-cards.css:38–42` — `repeat(3,1fr)` only collapses at 860 px; at 320 px each card is ~90 px wide — add a 640 px breakpoint or relax to 2-col.

**[E] H-1 — DPR cap regression: resize handler overrides 1.5 cap with hardcoded 2** — `src/lib/three/createResizeHandler.ts:21` — any `window.resize` event (including orientation change) silently upgrades DPR, undoing the `?perf=low` path on Retina displays — pass `maxPixelRatio` as a parameter to `createResizeHandler`.

**[F] M1 — Missing `<h1>` in desktop `/projects` WebGL scene** — `src/page-content/ProjectsPage.astro` — `.projects-fallback` is `display:none` on desktop; no H1 in accessible DOM — add `<h1 class="sr-only">{t.projectsPage.title}</h1>` inside `.projects-scene`.

**[F] M2 — `.nav-card:focus-visible` insufficient focus indicator (WCAG 2.4.11)** — `src/styles/nav-cards.css:76–85` — background gradient glow only; no outline ring; transform suppressed in reduced-motion — add explicit `border-color` accent to `:focus-visible`, remove `outline: none` so global ring acts as fallback.

**[G] MEDIUM — Desktop projects page has no `<h1>` (SEO + structure)** — same root cause as F-M1 above — see cross-domain XD-2.

**[G] MEDIUM — JSON-LD `jobTitle` is a marketing slogan** — same root cause as A-B1 / XD-3.

**[J] J-01 — FI/SV voiceover files absent** — `public/audio/` — `voice-landing-fi.mp3`, `voice-landing-sv.mp3`, `voice-projects-fi.mp3`, `voice-projects-sv.mp3` missing — feature silently non-functional for 2 of 3 locales — record and commit FI/SV audio or add an explicit EN fallback.

**[J] J-02 — Audio toggle labels hardcoded English** — `src/components/BackgroundAudio.astro:45,87–88` — "sound on" / "sound off" visible on all locales in English — add `bgAudio` key group to translations interface, thread locale into component.

**[J] J-03 — LinkedIn `aria-label` hardcoded English** — `src/components/contact/MobileContactCard.astro:56` — `aria-label="LinkedIn (opens in a new tab)"` on all locales — add to `mobileContact` translations.

### MINORS

**[A] m-1 — "Two weeks" vs "12 days" inconsistency** — `src/i18n/locales/en.ts:102,104` — body says "two weeks", stat says "12 days" — change body copy to "12 days".

**[A] m-2 — Stryker / mutation testing absent from HRM project detail** — `src/i18n/locales/en.ts:160` — mentioned in experience timeline only, not in `/projects` where a recruiter looks — add to HRM highlights or description.

**[A] m-3 — AudiobookMaker has no link to GitHub Releases** — `src/data/projects.ts:169–194` — Windows installer with auto-updates but no `liveUrl` pointing to releases page — add `liveUrl: 'https://github.com/MikkoNumminen/AudiobookMaker/releases'`.

**[B] N-2 — Side-panel list visually deprioritised vs legend box** — `src/styles/projects-scene.css:185–209` — list is present but reads as chrome at 0.65rem / frosted-glass; legend box gets more visual weight — give list a mild glow on first load (1.5 s animation then settle).

**[B] N-4 — Experience timeline has no keyboard snap to entry** — `src/components/experience/TimelineContent.astro:60–100` — no `tabindex` or `focus` handler on timeline entries — add `tabindex="0"` + `focus` → `scrollIntoView`.

**[C] H1 — Projects accent has five distinct hex/rgb representations** — `project-detail.css`, `project-grid.css`, `projects-scene.css` (29 instances of `rgba(120,170,255)` alone) — introduce `--color-projects-text` and `--color-projects-api` tokens; replace raw literals.

**[C] H2 — `#f3eed9` experience accent undeclared as a token** — `src/styles/experience-timeline.css` (8 occurrences) — add `--color-experience-text: #f3eed9` to `global.css`.

**[C] M4 — Border-radius seven distinct values, no token system** — across all style files — consolidate to a small/medium/large three-step system.

**[D] H1 — Hero and MCC use `100vh` instead of `min-height: 100dvh`** — `src/components/home/Hero.astro:83`, `src/styles/mobile-contact-card.css:12` — mobile Safari URL-bar collapse leaves brief visual gaps — switch to `min-height: 100dvh`.

**[D] H3 — Three.js home scene loads on landscape iPhone (>640 px wide, 375 px tall)** — `src/page-content/HomePage.astro:117` — `isSmall = matchMedia('max-width: 640px')` misses landscape orientation — add `min-height: 500px` gate or a landscape-specific guard.

**[D] M1 — Experience timeline body text 0.96rem (15.4 px) — no mobile override** — `src/styles/experience-timeline.css:350` — below 16 px recommendation for body copy — bump to `1rem` at ≤640 px.

**[D] M2 — MCC screen text 0.85rem (13.6 px)** — `src/styles/mobile-contact-card.css:153` — mobile contact experience body text below 16 px — increase or document as intentional terminal aesthetic.

**[E] M-1 — CLS 0.014 on `/experience` traced to SVG `height: auto`** — `src/styles/experience-timeline.css` — `.goat svg { height: auto }` — add explicit `height: clamp(56px, 7vw, 90px)` on the `<svg>` element.

**[F] m1 — Scene chrome contrast failures (sighted low-vision users)** — `src/styles/projects-scene.css:47,78,107–113` — legend 3.36:1, credits 2.85:1, key-section 2.92:1 (all need 4.5:1) — raise alpha from 0.4–0.45 to 0.65+ on these elements.

**[F] m2 — BackgroundAudio focus ring inadequate on dark themes** — `src/components/BackgroundAudio.astro:136–142` — `outline: none` + subtle border-opacity change only — remove `outline: none` or add `box-shadow` ring.

**[F] m3 — Terminal copy-button state change not announced** — `src/lib/terminal/terminal.ts:83–90` — "COPY" → "Done" text change has no live region — add `aria-live="polite"` wrapper.

**[F] m4 — Terminal hint panel hidden from AT** — `src/components/contact/Terminal.astro:63–67` — `↑/↓ history` and `tab complete` shortcuts invisible to screen readers — remove `aria-hidden="true"` or expose via `aria-describedby` on the input.

**[G] LOW — Two `<h1>` elements on `/contact`** — `src/components/contact/Terminal.astro:12,73` — one sr-only + one visible both say "Contact" — demote visible heading to `<h2>`.

**[G] LOW — No machine-readable dates** — no `<time datetime="...">` on any timeline entry, no `dateModified` in JSON-LD — add `"dateModified"` to Person schema; wrap timeline years in `<time>`.

**[G] LOW — Sitemap missing `x-default` hreflang and `<lastmod>`** — `dist/sitemap-0.xml` — HTML `<head>` has `x-default` correctly; sitemap does not — add `serialize` hook in `astro.config.mjs`.

**[I] M1 — Portfolio site has 0% test coverage of its own business logic** — `src/i18n/locales/en.ts:8` — "1828+ tests" tagline is technically true (other repos) but contextually misleading for this repo's 28 tests covering only i18n/data — add tests for audio state machine and terminal dispatch, or qualify the tagline.

**[J] J-04 — "Now" timeline year not localized** — `src/data/timeline.ts:46` — `year: 'Now'` is English text displayed to FI/SV users — add `yearNow` key to `experiencePage` translations (FI: "Nyt", SV: "Nu").

**[K] MEDIUM — CI does not hard-gate Vercel deploys** — `.github/workflows/ci.yml` — Vercel webhook fires concurrently with CI, not after it; a failing test still deploys — enable branch protection rule on `master` requiring `check` job to pass.

### NITS

**[A] n-1 — `strudel-patterns` has no live demo link** — `src/data/projects.ts:200–235` — add a Strudel REPL share URL as `liveUrl`.

**[A] n-3 — "Strudel Patterns" tagline leaves "pastry" reading briefly** [judgment] — acceptable as-is; moving engine clarification to tagline would eliminate confusion.

**[B] N-5 — Reduced-motion page transition does a hard cut with no reassurance fade** — `src/lib/transitions/pageTransition.ts:664` — plain `window.location.href` assignment with no 200 ms opacity — optional: add a CSS `opacity 0.15s` body transition for RM clients.

**[B] Nit-2 — Terminal `<kbd>` hints hidden from AT** — `src/components/contact/Terminal.astro:63–67` — `↑/↓` and `tab` shortcuts invisible to screen readers — include in boot sequence output.

**[C] L6 — `terminal.css` and `mobile-contact-card.css` are near-identical CRT duplicates** — consider extracting a shared `crt-base.css`.

**[C] M1 — Type scale has 22+ distinct font-size values below 2rem** — across 9 style files — consolidate to a 6–8-step modular scale.

**[D] L1 — Audio button height ~36 px on mobile (below 44 px)** — `src/components/BackgroundAudio.astro:257` — secondary control, but the only way to silence music — increase padding.

**[E] H-2 — `perfOverlay.js` 558 kB ships in dist, causing Rollup warning** — `dist/_astro/perfOverlay.CYSh3NvJ.js` — guard is airtight at runtime but the chunk inflates CDN storage and masks future bundle regressions — exclude Three.js from the debug chunk's module graph via `manualChunks`.

**[F] m5 — `aria-current="true"` on language switcher (prefer `"location"`)** — `src/components/nav/SiteNav.astro:79` — functional but semantically imprecise — change to `aria-current="location"`.

**[F] n2 — IME composition in terminal: Tab/Enter fire during CJK composition** — `src/lib/terminal/terminal.ts:101–145` — add `e.isComposing` guard before handling Tab/Enter.

**[G] LOW — OG images English-only for all locales** — FI/SV pages share EN OG images with hardcoded English copy — low impact for tech audience; create locale-keyed variants if social sharing becomes a priority.

**[G] LOW — JSON-LD `url` field doesn't match locale page** — `src/page-content/HomePage.astro` — FI/SV home pages declare root `/` as schema URL — use locale-specific canonical URL.

**[H] LOW — CSP missing `worker-src 'none'; manifest-src 'self'; frame-src 'none'`** — `vercel.json:60` — defensive-depth directives absent; fall back safely but explicit is better — add in a housekeeping commit.

**[H] LOW — Stale `*.sentry.io` comment in `initObservability.ts:25`** — `src/lib/observability/initObservability.ts:25` — comment says CSP needs `*.sentry.io` but actual header (correctly) only has `*.ingest.sentry.io` — update comment.

**[I] L1 — `noPropertyAccessFromIndexSignature` missing from tsconfig** — `tsconfig.json` — only strict-family flag absent; low practical risk — add for completeness.

**[I] L2 — Sloppy `!` assertion on uniform lookup** — `src/lib/three/projectsScene.ts:431` — `uniforms.intensity!.value` — type `createGlowMaterial` return with explicit `intensity: IUniform<number>` field.

**[I] L4 / L5 — `visibilitychange` lifecycle and `TARGET_FRAME_MS` duplicated across both scenes** — `homeScene.ts:870–895` / `projectsScene.ts:584–608` and `homeScene.ts:708` / `projectsScene.ts:412` — extract to `createOffscreenPauser` and `src/lib/three/constants.ts`.

**[K] LOW — Sentry is fire-and-forget; no alert rules** — ADR 0001 aspirational — configure one Sentry "new issue" email alert; 2 minutes in Sentry dashboard.

**[K] LOW — IP address sent to Sentry without suppression** — `src/lib/observability/initObservability.ts` — no `sendDefaultPii: false`; IP forwarded to US sub-processor — add `sendDefaultPii: false` to `Sentry.init`; zero functional impact on error tracking.

**[K] LOW — No source maps uploaded to Sentry** — stack traces in Sentry are unsymbolicated — noted in ADR 0001 open follow-ups; add `SENTRY_AUTH_TOKEN` + source-map upload step when ready.

---

## Top 10 Priorities Ranked by Impact-per-Effort

| Rank | Title | Why it matters | Effort | Section |
|------|-------|----------------|--------|---------|
| 1 | Fix `jobTitle` in JSON-LD + add `<h1 class="sr-only">` to `/projects` | Fixes the most visible machine-readable defect (structured data, Rich Results Test, recruiter tooling) and the WCAG + SEO `<h1>` gap simultaneously | <1h | A-Positioning, G-SEO, F-A11y |
| 2 | Localize audio toggle labels + fix `aria-label` mismatch | One change resolves the WCAG 2.5.3 blocker (present on all 12 routes) and the i18n gap for all FI/SV users | <1h | F-A11y, J-i18n |
| 3 | Fix language switcher tap targets (28 px → 44 px) + audio button safe-area | Two critical mobile usability failures; combined CSS-only fix | <1h | D-Responsive, F-A11y |
| 4 | Fix DPR cap regression in `createResizeHandler` | Every resize event silently overrides the perf optimization for all Retina/HiDPI users (all modern Macs, most flagship phones) | <1h | E-Performance, I-Code Quality |
| 5 | Raise `.project-card__label` contrast to 4.5:1 | Clears the only Lighthouse A11y failure that drops `/projects` to 95/100 across all three locales | <1h | F-A11y |
| 6 | Add `sendDefaultPii: false` to Sentry.init + fix CSP nits + postcss override | Three security/privacy fixes in one housekeeping commit; combined effort <30 min | <1h | H-Security, K-Ops |
| 7 | Add `popstate` handler to drawer (back-gesture closes drawer) | Fixes a broken native mobile navigation pattern that every Android user will hit when exploring a project | <1h | B-UX |
| 8 | Link quantified claims to supporting artifacts (GitHub CI badge, coverage report) | Converts the site's strongest proof points from assertions to verifiable facts; directly addresses recruiter trust | 1d | A-Positioning |
| 9 | Fix CLS on `/experience` (goat SVG `height: auto`) + add machine-readable dates | CLS 0.014 → 0.000; adds structured freshness signal to JSON-LD and experience timeline | <1h | E-Performance, G-SEO |
| 10 | Gate Vercel deploys on CI green (branch protection on `master`) | Prevents broken builds from shipping; CI currently advisory, not a hard gate | <1h | K-Ops |

---

## Quick Wins

Tasks that can be done in under an hour each, purely in config, copy, or CSS.

- [ ] `src/page-content/HomePage.astro:44` — replace `t.intro.heading.replace(...)` with `t.meta.jobTitle`; add `meta.jobTitle` to all three locale files
- [ ] `src/page-content/ProjectsPage.astro` — add `<h1 class="sr-only">{t.projectsPage.title}</h1>` inside `.projects-scene`
- [ ] `src/components/BackgroundAudio.astro:45` — remove `aria-label="Toggle background sound"`, rely on visible text + `aria-pressed`
- [ ] `src/components/BackgroundAudio.astro:87–88` — add `bgAudio.on` / `bgAudio.off` keys to all three locale files; thread locale from `BaseLayout`
- [ ] `src/components/contact/MobileContactCard.astro:56` — add `mobileContact.ariaLinkedIn` key to all three locales; replace hardcoded string
- [ ] `src/styles/project-grid.css:169` — raise `rgba(196,212,255,0.45)` to `rgba(196,212,255,0.65)` or replace with `#8090b0`
- [ ] `src/components/nav/SiteNav.astro:81` — change `py-2` to `py-3` (or add `min-height: 44px; display: inline-flex; align-items: center`) on language links
- [ ] `src/components/BackgroundAudio.astro:257–265` — change `bottom: 1.25rem` to `max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))`
- [ ] `src/lib/three/createResizeHandler.ts:21` — change hardcoded `2` to a `maxPixelRatio` parameter; pass through from `createRenderer` call sites
- [ ] `src/lib/observability/initObservability.ts` — add `sendDefaultPii: false` to `Sentry.init` options
- [ ] `package.json` — add `"overrides": { "postcss": ">=8.5.10" }` to resolve GHSA-qx2v-qp2m-jg93
- [ ] `vercel.json:60` — append `worker-src 'none'; manifest-src 'self'; frame-src 'none'` to CSP
- [ ] `vercel.json:56` — add `midi=(), bluetooth=(), display-capture=(), gamepad=()` to Permissions-Policy
- [ ] `src/data/timeline.ts:46` — replace `year: 'Now'` with a locale-keyed value (FI: "Nyt", SV: "Nu")
- [ ] `src/i18n/locales/en.ts:102` — change "two weeks" to "12 days" to match the stat number on line 104
- [ ] `src/data/projects.ts:169–194` — add `liveUrl: 'https://github.com/MikkoNumminen/AudiobookMaker/releases'` to AudiobookMaker
- [ ] `src/components/contact/Terminal.astro:63–67` — remove `aria-hidden="true"` from `terminal__hints` div
- [ ] `src/lib/observability/initObservability.ts:25` — remove stale `https://*.sentry.io` from comment; `*.ingest.sentry.io` is the only endpoint needed
- [ ] Sentry dashboard — configure one "new issue" email alert rule (2 min; not a code change)

---

## Open Questions for Mikko

1. **FI/SV voiceovers** — Record `voice-landing-fi.mp3`, `voice-landing-sv.mp3`, `voice-projects-fi.mp3`, `voice-projects-sv.mp3` and commit to `public/audio/`? Or add an explicit EN fallback in `HeroVoiceover.astro` and `ProjectsVoiceover.astro` until recordings are ready?

2. **VUOHITIIMI as a brand name** — The site never says "VUOHITIIMI". Is this intentional (developer-facing codename only), or should it be surfaced for visitors who would recognize the Finnish pun and appreciate the ecosystem framing?

3. **"1828+ tests" tagline scope** — The claim is technically accurate (the other seven projects) but could mislead a developer who visits GitHub and sees 28 tests in this repo. Options: (a) qualify the copy to say "across the seven projects" / "in HRM alone", (b) add test suites for the audio state machine and terminal dispatch to bring this repo's coverage up, or (c) leave as-is and accept the occasional confused GitHub reader.

4. **FI/SV translation review** — The i18n audit found high translation quality (no word-for-word machine translations, correct idioms, correct decimal separators), but recommends a native-speaker review before the site is marketed as fully localized in Finnish or Swedish. Is there a Finnish or Swedish native speaker who can do a final pass?

5. **GDPR risk appetite** — Sentry is currently forwarding visitor IP addresses to a US sub-processor (Sentry, Inc.) without explicit consent. The `sendDefaultPii: false` fix (15 minutes) removes the IP with zero functional cost. The remaining data (user agent, URL, vitals) is still processed by Sentry. Is a cookie/consent banner on the roadmap, or is the DNT-gate-only approach the stated policy?

6. **Custom domain timing** — All SEO authority is currently accumulating on `mikkonumminen-dev.vercel.app`. Once `mikkonumminen.dev` DNS is live, updating `astro.config.mjs` `siteUrl` triggers a canonical URL re-index lag. When is the custom domain going live, so the audit findings on canonicals/OG URLs can all be resolved in one pass?

7. **Locale-specific OG images** — FI/SV pages show English copy in link-preview cards. Is this acceptable for the target audience (Finnish/Swedish tech recruiters who are comfortable with English), or worth the effort of generating locale-keyed OG images?

8. **Astro 5 → 6 upgrade timing** — Astro 6 resolves all three production advisory CVEs plus brings other improvements. Is this planned for the short term, or is staying on 5.x preferred until 6.x has more production mileage?

---

## What This Audit Did Not Cover

- **No real-device testing** — all responsive and mobile analysis is static CSS inference. No physical Android (especially < 2023 mid-range), no real iPhone notch/Dynamic Island overlap testing.
- **No live screen-reader testing** — NVDA, JAWS, VoiceOver (macOS), VoiceOver (iOS), TalkBack. All accessibility findings are from code analysis and axe-core automated scan. AT behaviour can deviate from spec, especially around `aria-modal`, custom widgets, and live regions.
- **No penetration testing** — no XSS payload testing, no clickjacking attempts, no active probing of CSP headers.
- **No professional design review** — "does the type hierarchy feel right", "do the four themes feel like one brand" — aesthetic judgment calls not made.
- **No recruiter user-testing** — time-to-understanding estimates in Agent A are cold-read inferences, not measured from real recruiter sessions. No eye-tracking or heatmap data.
- **No live Sentry dashboard analysis** — cannot confirm DSN is set in Vercel env vars, cannot see actual error rate or Web Vitals field data.
- **No Google Search Console data** — no live ranking, impression, or coverage reports. SEO findings are based on static output analysis only.
- **No desktop Lighthouse runs** — baseline notes these were not completed. The `/projects` page in particular behaves very differently at desktop viewport sizes.
- **No `@media (prefers-color-scheme: light)` analysis** — the site appears dark-only; no light mode was tested.
- **No pluralization edge cases** — all counts are hardcoded strings; if counts become dynamic in future, Finnish's 15 grammatical cases require a proper `Intl.PluralRules` implementation.
- **No CI/CD pipeline security audit** — GitHub Actions workflow files were not audited for secret exposure or injection.
- **No Vercel environment variable inventory** — cannot confirm production env vars from repo files.
- **No live SERP inspection, backlink analysis, or social preview rendering** — SEO assessment is limited to static structured data and metadata.

---

## Section Pointers

| File | Domain | One-line description |
|------|--------|----------------------|
| `docs/audits/sections/baseline.md` | Baseline | Lighthouse scores (all 12 routes), bundle sizes, static check results, CVE inventory |
| `docs/audits/sections/A-positioning-narrative.md` | Positioning & Narrative | Time-to-understanding, unlinked proof claims, CTA gaps, funnel coherence |
| `docs/audits/sections/B-ux-ia.md` | UX & Information Architecture | Interaction inventory, keyboard parity table, page transition analysis, drawer back-gesture |
| `docs/audits/sections/C-visual-design.md` | Visual Design | CSS token story, font-size proliferation, spacing grid, border-radius system, OG card palette check |
| `docs/audits/sections/D-responsive.md` | Responsive & Cross-Device | Breakpoint inventory, tap target sizes, iOS safe-area gaps, `100vh` / `dvh` usage, landscape phone scenarios |
| `docs/audits/sections/E-performance.md` | Performance | DPR cap regression, CLS root causes, Three.js init cost, GSAP lifecycle, dispose verification, offscreen pauser |
| `docs/audits/sections/F-accessibility.md` | Accessibility (WCAG 2.2 AA) | axe-core 0-violation scan, Lighthouse 95/100 gap root cause, contrast matrix, focus ring audit, reduced-motion coverage |
| `docs/audits/sections/G-seo.md` | SEO & Structured Data | Head metadata table, hreflang verification, JSON-LD validity, heading structure, sitemap/robots.txt, date discoverability |
| `docs/audits/sections/H-security.md` | Security & Deploy | CVE triage with reachability, CSP analysis, secret scan, deploy hygiene, Sentry DSN exposure, CORS assessment |
| `docs/audits/sections/I-code-quality.md` | Code Quality & Maintainability | TypeScript strictness, component coupling, Three.js scene duplication, dispose discipline, comment quality, test coverage reality |
| `docs/audits/sections/J-i18n.md` | Internationalisation | Per-locale completeness table, translation quality assessment, deep-link switcher, voice asset gaps, date formatting |
| `docs/audits/sections/K-observability-ops.md` | Observability & Ops | Sentry/web-vitals inventory, GDPR / PII assessment, CI gate analysis, Vercel cache headers, PWA install path |
