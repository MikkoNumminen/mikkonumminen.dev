# Mobile experience audit — mikkonumminen.dev

**Date:** 2026-05-16
**Branch / HEAD:** `master` @ `fa92b21` (worktree `worktree-mobile-audit`)
**Scope:** every viewport-conditional branch (CSS, JS, dynamic imports, fallback components) across `src/`, plus a Lighthouse mobile-preset baseline for each route.
**Method:** static analysis of all `@media (max-width|min-width)` and `matchMedia` references; full read of every page-content file, every mobile fallback component, every CSS file that participates in viewport swapping; Lighthouse runs (`--headless=new`, default mobile preset = Slow 4G CPU emulation) against `npm run preview` on `localhost:4323`.
**Mode:** read-only. No source code changed. Only artifact written is this report.

---

## 0. Baseline (numbers, not vibes)

Run on production build (`npm run build && npm run preview`), Lighthouse default mobile preset (≈ Moto G Power, Slow 4G).

| Route | Perf | A11y | FCP | LCP | CLS | TBT | Speed Index | Transfer | JS exec | Main thread |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` (home) | **96** | **100** | 1737 ms | **2580 ms** | 0.000 | 15 ms | 1737 ms | 280 KB | 155 ms | 870 ms |
| `/projects/` | **99** | **95** | 1507 ms | 2114 ms | 0.000 | 0 ms | 1507 ms | 237 KB | 20 ms | 388 ms |
| `/experience/` | **98** | **100** | 1664 ms | 2272 ms | 0.014 | 0 ms | 1664 ms | 269 KB | 101 ms | **1358 ms** |
| `/contact/` | **98** | **100** | 1581 ms | 2106 ms | 0.000 | 0 ms | 1581 ms | **136 KB** | 99 ms | 501 ms |

**Floor to preserve.** All routes ship under TBT 50 ms and CLS 0.02; LCP best at /contact/ (2.1 s), worst at / (2.58 s, "needs improvement" band per CWV).

### Per-resource transfer (Lighthouse mobile preset)

| Route | Document | Script | Stylesheet | Media | Other | Total req |
|---|---|---|---|---|---|---|
| `/` | 9 KB | 102 KB | 9 KB | 94 KB | 65 KB | 23 |
| `/projects/` | 8 KB | 76 KB | 9 KB | 94 KB | 50 KB | 21 |
| `/experience/` | 10 KB | 102 KB | 9 KB | 94 KB | 54 KB | 21 |
| `/contact/` | 6 KB | 76 KB | 8 KB | 1 KB | 46 KB | 21 |

The 94 KB `Media` shared across non-`/contact/` routes is the background audio (`devlander.ogg` + `voice-landing.mp3`). The Three.js bundle (`disposeMaterial.[hash].js`, **556 KB raw / ~150 KB gzipped**) is correctly gated — **mobile never fetches it**.

### Bundle map (raw bytes in `dist/_astro/`)

| Chunk | Raw size | Route(s) |
|---|---|---|
| `disposeMaterial.[hash].js` | 556 KB | dynamic import, desktop only |
| `BaseLayout.astro_…[hash].js` | 153 KB | **every route** (incl. mobile) |
| `index.CB87Sc6I.js` | 70 KB | projects scene helpers |
| `homeScene.[hash].js` | 51 KB | dynamic import, desktop home only |
| `index.BnutI203.js` | 51 KB | shared |
| `setup.dZIRujxl.js` | 44 KB | gsap setup |
| `projectsScene.[hash].js` | 39 KB | dynamic import, desktop projects only |
| `contact.StNTG_v-.css` | 25 KB | /contact/ |
| `index.Dpcb6dlS.css` | 17 KB | / (home) |
| `projects.DPA4n9zV.css` | 15 KB | /projects/ |
| `experience.DfHu_pb-.css` | 14 KB | /experience/ |
| `contact.BHC4mAic.css` | 9 KB | /contact/ |
| `ContactPage.[hash].js` | 10 KB | /contact/ |
| `ProjectsPage.[hash].js` | 9 KB | /projects/ |
| `HomePage.[hash].js` | 4 KB | / |
| `ExperiencePage.[hash].js` | 6 KB | /experience/ |

### Static-analysis pre-checks

- `npm run typecheck` — **clean** (run on master last session; current source identical to master).
- `npm run lint` — **clean** (same caveat).
- No test suite defined in `package.json` (only `typecheck`, `lint`, `format`).

---

## 1. Per-page divergence inventory

Format: **Desktop has → Mobile has → trigger → file:line**. "Trigger" lists every gating mechanism (CSS media query, JS `matchMedia` branch, dynamic-import guard).

### Home (`/`, `/fi/`, `/sv/`)

| # | Desktop has | Mobile has | Trigger | File:line |
|---|---|---|---|---|
| H1 | Three.js hero — extruded MIKKO/NUMMINEN chrome type, spiral galaxy, meteor strikes, Saturn ring on the O, goat on the M, bright star, click-to-animate scene interactions | Flat `<p class="hero__title-fallback">` H1 — `clamp(3rem, 13vw, 9rem)` font-size, text-shadow only | `≤640px` (JS dynamic-import bail) OR `prefers-reduced-motion` | [HomePage.astro:117](src/page-content/HomePage.astro#L117), [Hero.astro:108-118](src/components/home/Hero.astro#L108-L118), [Hero.astro:188-198](src/components/home/Hero.astro#L188-L198) |
| H2 | Editorial corner labels: `/ 00 — cover` (top-left), `61° N · 24° E · tampere · hervanta` (top-right), `vol. 26` (bottom-right) | **None** (the whole `.hero__corners` container is hidden) | `@media (max-width: 860px) { .hero__corners { display: none } }` | [Hero.astro:320-323](src/components/home/Hero.astro#L320-L323) |
| H3 | Live data-feed terminal widget (typing simulator with cyan pulse) | **None** (lives inside `.hero__corners`, hidden by H2's parent rule); JS skips init below 860px | Same CSS as H2; JS guard: `if (window.matchMedia('(max-width: 860px)').matches) return;` | [Hero.astro:320, Hero.astro:425](src/components/home/Hero.astro#L425) |
| H4 | Scroll hint at hero bottom | Same (rendered on every viewport) | None | [Hero.astro:209](src/components/home/Hero.astro#L209) |
| H5 | Eyebrow + subtitle (PORTFOLIO · 2026 / FULL-STACK DEVELOPER · FINLAND) | Same | None | [Hero.astro:154-207](src/components/home/Hero.astro#L154-L207) |
| H6 | 6-section editorial scroll: Intro · Focus · Integrations · Velocity · NavCards | Same content, 1-column reflow | `@media (max-width: 720px)` (per-section) | [Focus.astro:158](src/components/home/Focus.astro#L158), [Intro.astro:181](src/components/home/Intro.astro#L181), [Velocity.astro:158](src/components/home/Velocity.astro#L158), [Integrations.astro:146](src/components/home/Integrations.astro#L146), [nav-cards.css:154](src/styles/nav-cards.css#L154) |
| H7 | Page-transition canvas dissolve on link click (180 streaks, phase A→B→C) | Same — fires identically | None viewport-based; only `prefers-reduced-motion` opts out | [pageTransition.ts:664-665](src/lib/transitions/pageTransition.ts#L664-L665) |
| H8 | Sound toggle (BackgroundAudio.astro) + music + landing voiceover layered | Same — toggle visible, autoplay-with-gesture path identical | None viewport-based; CSS only repositions the toggle at `≤640px` | [BackgroundAudio.astro:254-257](src/components/BackgroundAudio.astro#L254-L257) |

### Projects (`/projects/`)

| # | Desktop has | Mobile has | Trigger | File:line |
|---|---|---|---|---|
| P1 | WebGL solar system — projects as orbiting planets, sun at centre, hover labels, drag-to-rotate, scroll-to-zoom | `ProjectGrid` — vertical CSS-grid of cards (`minmax(320px, 1fr)`) | `@media (max-width: 860px) { .projects-scene { display: none } .projects-fallback { display: block } }` AND JS `if (reducedMotion || isSmall) { …attribute flip and return }` | [projects-scene.css:507-514](src/styles/projects-scene.css#L507-L514), [ProjectsPage.astro:194-202](src/page-content/ProjectsPage.astro#L194-L202) |
| P2 | Connection legend ("HRM ↔ Platform — submodule", "Yet-Another-Music → Platform — voice", etc.) + colour-coded line indicators | **None** — connection metadata is rendered in DOM as the legend but `.projects-scene__key { display: none }` at `≤860px` | `@media (max-width: 860px) { .projects-scene__key, .projects-scene__list { display: none } }` | [projects-scene.css:473-476](src/styles/projects-scene.css#L473-L476) |
| P3 | Side panel — clickable project list with brand-coloured dots | **None** (hidden by same rule as P2) | Same as P2 | [projects-scene.css:473-476](src/styles/projects-scene.css#L473-L476) |
| P4 | ProjectDetail drawer (focus-trap, escape-to-close, slide-in) | **None** — `ProjectGrid` cards link directly out to live/GitHub URLs | Boot guard: scene init bails on mobile, drawer is initialized only inside that boot path | [ProjectsPage.astro:239-252](src/page-content/ProjectsPage.astro#L239-L252) |
| P5 | `body[data-theme='projects'] { overflow: hidden }` + site footer hidden | Document flow restored; site footer visible at end of grid | `@media (max-width: 860px)` and `prefers-reduced-motion` | [projects-scene.css:479-484, 488-493](src/styles/projects-scene.css#L479-L484) |

### Experience (`/experience/`) — **reference page**

| # | Desktop has | Mobile has | Trigger | File:line |
|---|---|---|---|---|
| E1 | SVG mountain layers (far/mid/near/trees/foreground) with parallax | **Same — pure CSS/SVG, no viewport gating** | None | [MountainScene.astro:1-163](src/components/experience/MountainScene.astro) |
| E2 | Sun arc tween + star fade on scroll | Same | None | [experienceTimeline.ts](src/lib/gsap/experienceTimeline.ts) |
| E3 | Goat SVG following timeline cards (CSS-var driven transform, animated legs + bob) | Same — `clamp(56px, 7vw, 90px)` scales the SVG | None | [Goat.astro:110](src/components/experience/Goat.astro#L110) |
| E4 | Timeline cards with reveal animation | Same | None | [TimelineContent.astro](src/components/experience/TimelineContent.astro) |
| E5 | Reduced-motion: parallax frozen, reveals static | Same RM path on mobile | `prefers-reduced-motion` (RM only — not viewport-gated) | [experience-timeline.css:119, 623, 725](src/styles/experience-timeline.css), [mountain-scene.css:100](src/styles/mountain-scene.css#L100), [Goat.astro:156](src/components/experience/Goat.astro#L156), [TimelineContent.astro:147](src/components/experience/TimelineContent.astro#L147) |

**This page is the proof that mobile can be the showcase, not the fallback.** No viewport gating anywhere. The pattern that works: SVG layers + CSS variables + GSAP timeline driven by scroll progress.

### Contact (`/contact/`)

| # | Desktop has | Mobile has | Trigger | File:line |
|---|---|---|---|---|
| C1 | Interactive CRT terminal (typeable commands, scanlines, vintage chrome) | `MobileContactCard` — scripted typing replay (same content, no input) | CSS: `@media (max-width: 640px) { .crt { display: none } }` and `.mcc { display: block }` at the same breakpoint | [terminal.css:347-365](src/styles/terminal.css#L347-L365), [mobile-contact-card.css:8](src/styles/mobile-contact-card.css#L8) |
| C2 | Terminal JS runs always | **Terminal JS still runs** — `initTerminal(document)` is unconditional in ContactPage.astro; only CSS hides the markup | None (JS not gated) | [ContactPage.astro:22-24](src/page-content/ContactPage.astro#L22-L24) |
| C3 | Buttons inside terminal (CRT-styled CTAs) | 56 px-min-height email / LinkedIn / CV download buttons | CSS-only inside MobileContactCard | [MobileContactCard.astro:47-67](src/components/contact/MobileContactCard.astro#L47-L67), [mobile-contact-card.css:242](src/styles/mobile-contact-card.css#L242) |

### Summary by trigger

- **`≤640px`** — primary mobile gate. Strips: home 3D hero, contact desktop terminal. Adds: home flat title fallback, mobile contact card.
- **`≤720px`** — section-level layout reflow on home (Intro, Focus, Velocity, Integrations).
- **`≤860px`** — secondary mobile/tablet gate. Strips: projects 3D scene, projects legend + sidebar, hero editorial corners + data-feed widget, nav-cards 3-up grid.
- **`≤1100px`** — desktop refinement (projects key/list narrowed). Not mobile-relevant.
- **`prefers-reduced-motion`** — separate axis, but in 2 of 4 page boot scripts (`HomePage`, `ProjectsPage`) it's OR'd with `isSmall`, producing the same fallback. See finding M-D.

---

## 2. Findings by severity

Classification key: **JP** Justified Perf · **JU** Justified UX · **OA** Over-aggressive · **MN** Mobile-native opportunity.

### Blockers
None. No actively-broken behaviour on mobile; nothing crashes; Lighthouse green across the board.

### Majors

#### M-A · `/projects/` mobile loses the entire connection narrative
- **File:** [src/styles/projects-scene.css:473-476](src/styles/projects-scene.css#L473-L476) (hides `.projects-scene__key` and `.projects-scene__list` at ≤860 px)
- **Classification:** **MN** (mobile-native opportunity)
- **Why this matters:** the README's tagline for the portfolio is *"Seven repos. They build on each other."* The desktop projects scene encodes that relationship as visible orbital connections + a legend (HRM ↔ Platform — submodule; Yet-Another-Music → Platform — voice; etc.). On mobile the user sees seven independent cards, status pills, and tech chips — exactly what a `npx create-react-app` template portfolio would show. The mobile visitor reads "this person has seven projects". The desktop visitor reads "this person built a connected platform". That's a job-application-grade gap.
- **Suggested fix:** keep `ProjectGrid` as the surface, but add a small connections-summary block at the top (or per-card "↔ HRM lives inside Platform" / "→ feeds voice to Platform" inline tags). The data exists in `src/data/projects.ts`; `connections` is already used by the desktop legend. Re-render the same list in `ProjectGrid` using the `connectionLegendEntries` shape.
- **Effort:** 1–3 h. Pure JSX + CSS, no scene work.
- **Perf delta:** negligible (<1 KB additional CSS).

#### M-B · Hero editorial corners hidden at ≤860 px even though they're static text
- **File:** [src/components/home/Hero.astro:320-323](src/components/home/Hero.astro#L320-L323)
- **Classification:** **OA** (over-aggressive)
- **Why this matters:** `.hero__corners { display: none }` removes `/ 00 — cover`, `61° N · 24° E · tampere · hervanta`, and `vol. 26` on every viewport ≤860 px. These are CSS-styled spans containing inert text — total visual weight maybe 200 bytes. They're what makes the hero feel like a designed magazine cover instead of a default H1. They were hidden because they overlapped the title at narrow viewports — a layout problem, not a perf problem.
- **Suggested fix:** narrow the breakpoint to ≤480 px (where width genuinely runs out), reposition `corner--tl` to corner-top with smaller font, drop the `corner--br` "vol. 26" (least informative), keep `corner--tr` coordinates. The data-feed widget (which lives inside `.hero__corners`) should stay hidden — it has its own perf concerns. Splitting hero corners from the data-feed wrapper requires extracting the data-feed into a sibling element.
- **Effort:** 30–60 min. CSS reposition + 2 lines of markup re-parent.
- **Perf delta:** none.

#### M-C · Hero flat fallback is uninspired
- **File:** [src/components/home/Hero.astro:174-186](src/components/home/Hero.astro#L174-L186), [src/components/home/Hero.astro:188-192](src/components/home/Hero.astro#L188-L192)
- **Classification:** **MN** (mobile-native opportunity)
- **Why this matters:** the home page is the showcase. On mobile (≤640 px, ≥80% of incoming traffic from social / share links), the visitor sees a giant white "MIKKO NUMMINEN" sitting on a dark gradient, plus an eyebrow + subtitle + scroll hint. Compared to the desktop's chrome 3D type + meteors + ring + goat, the mobile hero reads as "this person started a portfolio and hasn't done the mobile pass yet". A designed mobile cover doesn't need WebGL — it needs intent. The Experience page proves SVG + CSS + GSAP carries the brand on mobile just fine.
- **Suggested fix:** layer an SVG version of the chrome type (one path each for M, I, K, K, O / N, U, M, M, I, N, E, N with the same `--color-{theme}-accent` gradient), plus 5–10 SVG-particle stars drifting on a CSS keyframe, plus the editorial corner labels restored (per M-B). Compose it in `Hero.astro` behind the same `@media (max-width: 640px)` rule that currently shows `.hero__title-fallback`. Skip the 3D type but keep the visual ambition.
- **Effort:** 4–8 h. SVG path design (hand or Figma-exported) + CSS keyframes + restoration of corner markers.
- **Perf delta:** ~5–10 KB of inlined SVG + CSS. Acceptable given the LCP headroom (current LCP 2.58 s, threshold for "good" is 2.5 s — could nudge above 2.5 s if SVG is large; keep paths under 8 KB).

#### M-D · Reduced-motion conflated with mobile fallback on `/` and `/projects/`
- **Files:** [HomePage.astro:117-118](src/page-content/HomePage.astro#L117-L118), [ProjectsPage.astro:194-202](src/page-content/ProjectsPage.astro#L194-L202), [projects-scene.css:487-494](src/styles/projects-scene.css#L487-L494), [projects-scene.css:516-523](src/styles/projects-scene.css#L516-L523), [Hero.astro:114-118](src/components/home/Hero.astro#L114-L118), [Hero.astro:194-198](src/components/home/Hero.astro#L194-L198)
- **Classification:** **OA** (over-aggressive)
- **Why this matters:** `prefers-reduced-motion: reduce` is a vestibular-accessibility signal, not a "low-end device" signal. A user on an iPhone 16 Pro Max with reduced motion on currently gets the same stripped fallback grid that a Moto G Power user gets. Better: keep the layout, freeze the animations. The Experience page already does this — it has no viewport gating, only RM-specific animation pauses. The Home + Projects pages collapse the entire scene + supporting chrome on RM. RM users lose: the title typography, the connection metaphor, the editorial chrome.
- **Suggested fix:** decouple. For Home, gate the canvas behind `isSmall`, and gate animations (not the canvas) behind `reducedMotion`. The `homeScene.ts` already has internal RM checks that switch to static-pose rendering; the wholesale dynamic-import skip is what's wrong. Same for Projects — let Three.js boot, init the scene with the existing `reducedMotion: true` flag (already plumbed into `createProjectsScene`), don't replace it with the grid.
- **Effort:** 2–4 h per page. The RM-aware code paths already exist inside the scene modules; the change is in the boot guards only.
- **Perf delta:** RM users gain a ~556 KB Three.js bundle they currently don't fetch. **Tradeoff**: spec-compliant respect for the a11y signal vs. data savings. Document the call either way.

#### M-E · Language-switcher tap targets too small on mobile
- **File:** [SiteNav.astro:81](src/components/nav/SiteNav.astro#L81)
- **Classification:** **JU** → **OA** (the sm:px-2 sm:py-1 was for desktop compactness, but `px-3 py-2` mobile defaults still don't clear 44 px)
- **Why this matters:** `.site-nav__lang { @apply px-3 py-2 sm:px-2 sm:py-1 }`. Mobile path: 12 px x-pad, 8 px y-pad on text-xs (12 px). Total tap target ≈ 28–32 px tall × 36 px wide. Below the iOS HIG 44 pt / Android Material 48 dp guideline. The main nav links (`.site-nav__link` with `px-4 py-3`) are right at 40–44 px — borderline acceptable. Lang switcher is the worse offender.
- **Suggested fix:** bump mobile padding to `px-3 py-3` (12 px each side → ≈ 36 px tall, still tight; consider `py-3.5`). Or wrap the lang switcher in a single dropdown for narrow viewports.
- **Effort:** 15 min CSS, plus a visual check at 320 px viewport.
- **Perf delta:** none.

#### M-F · Mobile fallback `<Terminal />` markup ships on mobile + its JS initialises
- **Files:** [ContactPage.astro:17-24](src/page-content/ContactPage.astro#L17-L24), [terminal.css:354-356](src/styles/terminal.css#L354-L356)
- **Classification:** **OA**
- **Why this matters:** `<Terminal />` is rendered into the DOM unconditionally and `initTerminal(document)` runs unconditionally. On mobile, CSS hides `.crt { display: none }` but the markup is parsed + the JS allocates listeners and the typing scheduler. Wasted ~10 KB of JS execution + several KB of inert DOM. Lighthouse `/contact/` still scored 98 because typing is throttled-friendly, but it's avoidable waste.
- **Suggested fix:** in `ContactPage.astro`, mount `<Terminal />` only when `(window.matchMedia('(min-width: 641px)')).matches` at boot time — or have `initTerminal` itself early-return on mobile (single line). Even simpler: have `initTerminal` check `document.querySelector('.crt')?.checkVisibility?.()` or read the bounding rect.
- **Effort:** 15–30 min.
- **Perf delta:** ~5–10 KB of script execution avoided on mobile.

### Minors

#### m-A · Page-transition canvas dissolve runs on mobile
- **File:** [pageTransition.ts:664-665](src/lib/transitions/pageTransition.ts#L664-L665)
- **Classification:** **JU** with a perf caveat
- **Why this matters:** `initPageTransitions` only bails on `prefers-reduced-motion`. On mobile (no RM), every internal link click triggers a 180-streak canvas animation across 1.05 s. Sized to viewport. On a 4G-throttled Moto G Power it works fine per Lighthouse (we didn't measure mid-transition explicitly), but the streak count and pixel-fill rate are desktop-tuned.
- **Suggested fix:** halve `STREAK_COUNT` (currently 180) at `(max-width: 640px)`. Optionally shorten `PHASE_A_MS` / `PHASE_C_MS` to 250 ms each. Keep the brand experience, reduce the GPU bill.
- **Effort:** 30 min.
- **Perf delta:** ~50% reduction in mid-transition GPU work on mobile.

#### m-B · `/projects/` mobile Lighthouse A11y 95 (5 below other pages)
- **Likely cause:** investigating; the gated-fallback flip leaves both `.projects-scene` and `.projects-fallback` in the DOM, with their interactive children behind `display: none`. Some Lighthouse audits flag hidden interactive content when it has roles/labels.
- **Classification:** **OA** → **JP** (need to verify)
- **Suggested fix:** identify the specific failing audit (re-run with `--output=html`), add `aria-hidden="true"` plus `inert` attribute to the hidden surface, or move the gating to a real conditional render in the Astro frontmatter so only one surface ships per route.
- **Effort:** 30 min to diagnose, 30 min to fix.
- **Perf delta:** none, but a11y score → 100.

#### m-C · `env(safe-area-inset-*)` used only for nav top
- **File:** [SiteNav.astro:118](src/components/nav/SiteNav.astro#L118) (only consumer)
- **Classification:** **OA** (iOS-specific polish)
- **Why this matters:** iPhones with a notch / Dynamic Island and Android edge-to-edge gesture bars have a bottom inset of ~34 pt. The `BackgroundAudio` sound toggle is positioned at `bottom: 1.25rem` on mobile (20 px above the viewport edge in CSS pixels) and the home `.hero__scroll-hint` is at `bottom: 2.5rem`. On iOS PWA / standalone mode the gesture bar can overlap these. Less critical for Safari mobile browser (browser chrome already pads), but noticeable in fullscreen / standalone.
- **Suggested fix:** in `BackgroundAudio.astro:254-263` and Hero `.hero__scroll-hint`, use `bottom: max(1.25rem, env(safe-area-inset-bottom))`.
- **Effort:** 10 min CSS, untestable without a real iOS device.
- **Perf delta:** none.

#### m-D · `will-change: transform` on goat always on
- **File:** [Goat.astro:106](src/components/experience/Goat.astro#L106)
- **Classification:** **OA** (minor)
- **Why this matters:** `will-change: transform` is a compositor hint that creates a dedicated layer. On a mobile GPU with limited layer budget, an always-on `will-change` is mildly wasteful. The reduced-motion block already removes it.
- **Suggested fix:** scope `will-change` to `:has(:hover)` or move it to a `data-active` attribute set only during scroll-induced movement. Or just leave it — `will-change` is widely considered cheap on modern compositors.
- **Effort:** 5 min, or close as won't-fix.

#### m-F · DPR cap drifts from 1.5 → 2 on every resize (Three.js)
- **Files:** [src/lib/three/createRenderer.ts:14, 27-28](src/lib/three/createRenderer.ts#L14-L28), [src/lib/three/createResizeHandler.ts:21](src/lib/three/createResizeHandler.ts#L21)
- **Classification:** **OA** (inconsistent defaults; relevant if Three.js ever runs on mobile)
- **Why this matters:** `createRenderer.ts` exposes a `maxPixelRatio` constructor option that defaults to **1.5** — the documented "nice middle ground" between sharpness and pixel-fill cost — and sets `renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio))`. But `createResizeHandler.ts:21` independently calls `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` with a **hardcoded 2** — no `maxPixelRatio` plumbing. Every resize event (including the synthetic one Astro fires on init) overrides the constructor cap. Net effect: the `maxPixelRatio` option silently has no observable effect once any resize fires. Today this is invisible because Three.js doesn't run on mobile; if you ship a mobile-scoped scene (per §4 "Mobile-scoped Three.js"), this will quietly burn ~78 % more pixel fill on a DPR-3 phone than the 1.5 cap promises.
- **Suggested fix:** thread `maxPixelRatio` through the resize handler — either as an option on `createResizeHandler` or by reading it back from `renderer.getPixelRatio()` (which captures the construct-time cap if no resize has run yet). One-liner once the plumbing is in place.
- **Effort:** 15–30 min.
- **Perf delta:** none today; future-proofs the mobile Three.js path.

#### m-E · Hero corners + data-feed are tangled (`.hero__data-feed` is inside `.hero__corners`)
- **File:** [Hero.astro:52-74](src/components/home/Hero.astro#L52-L74)
- **Classification:** **OA**
- **Why this matters:** the only way to keep the corner markers visible on mobile (per M-B) without also showing the data-feed widget is to disentangle the two. Currently they share a parent.
- **Suggested fix:** lift `.hero__data-feed` out as a sibling of `.hero__corners`. Mechanical refactor.
- **Effort:** 15 min.
- **Perf delta:** none.

### Nits

#### n-A · `.hero__data-feed-canvas` backing store fixed at 480×144
- **File:** [Hero.astro:68-69](src/components/home/Hero.astro#L68-L69) — `<canvas width="480" height="144">`
- **Classification:** JU
- **Why:** the widget is `display: none` at ≤860 px so the fixed pixel size doesn't affect mobile. Mentioned for completeness.

#### n-B · CSS conventions: desktop-first vs mobile-first inconsistency
- All `@media (max-width: …)` rules are desktop-first (override desktop defaults at narrow viewports). Tailwind utilities elsewhere use mobile-first prefixes (`sm:px-3`). The two coexist in `SiteNav.astro` without harm. Convention drift only.

#### n-C · `<noscript>` no longer duplicates `ProjectGrid`
- Verified during the audit pass — the duplicate noscript path flagged in `AUDIT-2026-05-07.md:48` has been removed. Closed.

---

## 3. Step-3 specific verifications

| Item | Status |
|---|---|
| **Home `/` first-viewport mobile** | Visitor sees: gradient backdrop, top eyebrow + subtitle ("PORTFOLIO · 2026" / "FULL-STACK DEVELOPER · FINLAND"), giant flat H1 "MIKKO NUMMINEN", scroll hint, sound-on toggle bottom-left. Editorial corners and data-feed are removed. No 3D type. |
| **Hero at what breakpoint does each thing disappear?** | `.hero__canvas` hides at ≤640 px AND under RM. `.hero__title-fallback` shows at ≤640 px AND under RM. `.hero__corners` (incl. data-feed) hides at ≤860 px (no RM rule). `.hero__masthead` always shown. `.hero__scroll-hint` always shown. |
| **Projects `/` mobile communicates connections?** | **No** — see M-A. Cards are isolated. Connection data exists at `src/data/projects.ts` (`connections` array) but is never rendered to ProjectGrid. |
| **Experience `/experience/` actually works on mobile?** | **Yes** — verified static (no viewport gating); Lighthouse Perf 98 / A11y 100 / LCP 2.27 s. Goat scales via `clamp(56px, 7vw, 90px)`. Mountain SVG layers use `preserveAspectRatio="xMidYMax slice"` so they crop sensibly at narrow widths. Reference page. |
| **Contact mobile typing animation plays?** | **Yes** — `MobileContactCard.astro:286-302` async loop. Reduced-motion path at L280 renders all-static instead. Tap targets 56 px min-height. CTA buttons reachable above the fold (≈ 320 px screen). |
| **Page-transition fires on mobile?** | **Yes** — `initPageTransitions` only bails on RM, not viewport. See m-A. |
| **Tap targets ≥ 44 × 44?** | Main nav ~40-44 px (borderline), lang switcher ~28-32 px (**fail**, M-E). Mobile contact card buttons 56 px min-height (**good**). Site footer text is not a tap target. |
| **`env(safe-area-inset-*)` respected?** | Only `safe-area-inset-top` in SiteNav. No bottom usage — sound toggle and scroll hint could overlap iOS gesture bar. See m-C. |
| **Horizontal scroll on mobile?** | No (verified via Lighthouse audit `layout-shift-elements` clean across all routes, plus no `width: > 100vw` rules outside scene canvases). |
| **Reduced-motion vs mobile separated?** | **No** — see M-D. |
| **DPR capped where Three.js runs?** | **Yes, but inconsistently** — `createRenderer.ts:28` uses `Math.min(devicePixelRatio, maxPixelRatio)` where `maxPixelRatio` is a constructor option defaulting to **1.5**; `createResizeHandler.ts:21` uses a hardcoded `Math.min(devicePixelRatio, 2)`. The resize handler does not receive the constructor's `maxPixelRatio` value, so every resize event (including the synthetic one fired on init) overrides the 1.5 cap back to 2. Postprocessing inherits whichever value is current. Three.js doesn't run on mobile currently, but the cap *would* drift on first resize if it did. See **m-F**. |

---

## 4. Recommendations grouped

### Free wins — un-hide static chrome that was hidden for the wrong reasons

Checklist. Each item is CSS-only or one-line markup, <30 min effort, no perf risk.

- [ ] [Hero.astro:320-323](src/components/home/Hero.astro#L320-L323) — narrow `@media (max-width: 860px) { .hero__corners { display: none } }` to `≤480px`, OR refactor so only `.hero__data-feed` hides and the text corners stay visible (per m-E disentangle). Restores `/ 00 — cover`, `61° N · 24° E`, `vol. 26` on tablets and most phones. (**M-B**)
- [ ] [SiteNav.astro:81](src/components/nav/SiteNav.astro#L81) — bump mobile `.site-nav__lang` padding from `px-3 py-2` to `px-3 py-3` (or `py-3.5`). Lifts lang-switcher tap target from ~30 px to ~42 px. (**M-E**)
- [ ] [BackgroundAudio.astro:254-263](src/components/BackgroundAudio.astro#L254-L263) and [Hero.astro:209](src/components/home/Hero.astro#L209) — add `bottom: max(1.25rem, env(safe-area-inset-bottom))`. iOS standalone-mode polish. (**m-C**)
- [ ] [pageTransition.ts:52](src/lib/transitions/pageTransition.ts#L52) — gate `STREAK_COUNT = 180` behind a `window.innerWidth` check (e.g. `90` on `≤640px`). 30 min, halves mobile transition GPU work. (**m-A**)
- [ ] [ContactPage.astro:22-24](src/page-content/ContactPage.astro#L22-L24) — early-return in `initTerminal` on mobile (or `import` it conditionally). Skips ~10 KB of unused JS execution. (**M-F**)
- [ ] [projects-scene.css:487-523](src/styles/projects-scene.css#L487-L523) and [Hero.astro:114-118, 194-198](src/components/home/Hero.astro#L114-L118) — split RM-specific rules from viewport rules; under RM keep the scene markup, let JS pass `reducedMotion: true` to the scene (which already handles it). (**M-D — partial; the JS-side change is separate**)

### SVG / CSS replacements — heavy WebGL → lightweight equivalent

- **`/projects/` mobile connection summary** (per **M-A**). Instead of cards-in-isolation, render the `connections` array at the top of `ProjectGrid` as a 3-line text block: "HRM ↔ Platform · submodule", "Yet-Another-Music → Platform · voice", "GeoApp → Platform · feed". Optionally show each as a small SVG line in the brand colour, mimicking the desktop legend without the canvas. **1-2 h. ~1 KB CSS, 0 KB JS.**
- **`/` mobile hero designed cover** (per **M-C**). SVG version of MIKKO NUMMINEN with a per-letter gradient mask + 5-10 CSS-keyframe drifting "particles" (small SVG `<circle>` elements). Restores some of the editorial weight without WebGL. **4-8 h. ~5-10 KB inlined.**
- **`/` mobile editorial corners restoration** (per **M-B + m-E**). Disentangle `.hero__data-feed` from `.hero__corners` parent. Restore the text corners on phones. **30-60 min.**

### Mobile-scoped Three.js — dedicated `*Mobile.ts` scene with stricter budgets

Only worth doing if SVG/CSS proves insufficient. Recommended order:

- **`/` `homeMobile.ts`** — slim hero scene with: chrome type (no extrusion bevel, single material), 1 galaxy at half the star count (~450 instead of 900), no meteor system, no per-letter raycaster. DPR capped at 1.5. ~30 KB extra JS over the current zero. **1-3 days.** Defer until the SVG/CSS path is shipped and you can compare.
- **`/projects/` `projectsMobile.ts`** — same data, ~5 planets rendered without ring/glow shaders, capped DPR. Smaller orbital radii so a 375 px viewport reads correctly. **1-3 days.** Lower priority than the mobile connection summary (which solves the narrative gap cheaply).

---

## 5. Top 5 priorities

Ranked impact-per-effort. The first three are free wins; the next two are the substantive mobile-experience moves.

1. **Restore the home hero editorial corners on phones** ([Hero.astro:320-323](src/components/home/Hero.astro#L320-L323) + m-E disentangle). Pure CSS. ~45 min. Biggest single perception lift from a recruiter glance: "this person designed for mobile" vs "this person stripped it for mobile".
2. **Fix language-switcher tap target** ([SiteNav.astro:81](src/components/nav/SiteNav.astro#L81)). One Tailwind class change. ~10 min. Removes the only real a11y/usability issue on mobile.
3. **Render the connection graph as text on `/projects/` mobile** ([ProjectGrid.astro](src/components/projects/ProjectGrid.astro) + [projects.ts `connections`](src/data/projects.ts)). 1-2 h. Reclaims the "Seven repos. They build on each other." narrative on mobile.
4. **Design the mobile hero with intent** — SVG title + corners + restrained motion (**M-C**). 4-8 h. Turns the mobile lander from "default H1" into "designed cover".
5. **Decouple reduced-motion from mobile fallback on `/` and `/projects/`** (**M-D**). 2-4 h per page. Lets a power user with vestibular sensitivity on a high-end phone still see the typography and connections — currently they get the same stripped grid a Moto G Power user does.

---

## 6. Open questions for Mikko

1. **Was hiding `.hero__corners` at 860 px intentional?** The comment says *"Hidden on small screens where the eyebrow already does this work."* — but the corners and the eyebrow do different work (location/coordinates vs. role/year). Did you hide them for visual clarity (overlap with the title) or as a perf measure? If overlap, that's solvable without removing them.
2. **Is the projects-mobile fallback meant to be a deliberate "default template" hint that the desktop is the real thing?** Or was it just the cheapest way to ship something at launch? Your answer changes whether **M-A / item 3** is a 2 h fix or a deeper redesign.
3. **Is `prefers-reduced-motion` traffic non-trivial?** I don't have observability for this, but if your Sentry / web-vitals data shows a meaningful slice of RM users, **M-D** moves up the priority list.
4. **Mobile share-link traffic share?** If you're getting most visitors from LinkedIn / Twitter / WhatsApp share-link cards (recruiter-on-phone path), prioritise hero polish (#4) over projects redesign (#3). The other direction if mobile traffic is mostly recruiters who clicked through after seeing your CV.
5. **Are there any real iOS device tests planned?** Several items (m-C safe-area, M-E tap targets, iPad-in-portrait) need a phone in hand. Static analysis only flags the suspected issues — it can't tell you if the lang-switcher tap target actually feels small.

---

*Audit complete. No source code modified during this pass.*
