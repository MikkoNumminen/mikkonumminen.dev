# Mobile audit: mikkonumminen.dev

**Date:** 2026-05-15
**Audited against:** `master` @ `fa92b21`
**Scope:** read-only audit. No code was changed.
**Method:** static source analysis + production-build Lighthouse runs (mobile preset,
simulated Moto G Power, Slow 4G) + verified bundle composition from `dist/_astro/`.

The site is excellent on a phone *technically*: every Lighthouse metric is green and
the network payload per route sits well under 300 KB. The opportunity is qualitative,
not quantitative: on mobile the brand promise ("every page is its own concept", the
project-relationship metaphor, the editorial chrome) is largely silent. This audit
maps where, classifies why, and points at the cheapest wins.

---

## Step 0: Baseline

### Lighthouse (mobile form-factor, default throttling = Slow 4G, 4× CPU)

| Route | Perf | A11y | FCP (ms) | LCP (ms) | TBT (ms) | CLS | SI (ms) | TTI (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 99 | 100 | 1509 | 1659 | 7 | 0.000 | 1509 | 1893 |
| `/projects/` | 99 | 95 | 1508 | 2113 | 0 | 0.000 | 1508 | 2113 |
| `/experience/` | 99 | 100 | 1662 | 1965 | 0 | 0.014 | 1662 | 1965 |
| `/contact/` | 97 | 100 | 1507 | 2564 | 0 | 0.014 | 1507 | 2564 |

All four routes pass Core Web Vitals comfortably. The contact route's higher LCP is
the only number worth re-checking on a real device: the simulated throttling may be
optimistic for the gradient-heavy mobile card. The `/projects/` A11y dip to 95 is
driven by a `color-contrast` failure and a `label-content-name-mismatch` flag (see
Findings P-5 and P-6 below).

### Network payload (initial load, Lighthouse resource-summary)

| Route | Total req | Total KB | Scripts KB | CSS KB | Document KB |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 23 | 280 | 102 | 9 | 9 |
| `/projects/` | 21 | 238 | 76 | 9 | 8 |
| `/experience/` | 21 | 269 | 102 | 9 | 10 |
| `/contact/` | 21 | 230 | 76 | 8 | 6 |

Verified: **the 556 KB Three.js chunk (`disposeMaterial.DI24QSCc.js`) is NOT loaded
on any of these mobile runs.** The dynamic-import gating in `HomePage.astro:117` and
`ProjectsPage.astro:182,194` correctly excludes it. Mobile users never pay for the
3D bundle. This is the floor that must not regress.

### Built chunks of interest (raw, pre-gzip)

| Chunk | Size | Routes |
| --- | ---: | --- |
| `disposeMaterial.*.js` (Three.js core, lazy) | 556 KB | desktop home + projects only |
| `BaseLayout.*` (Sentry, GSAP setup, transitions) | 153 KB | every page |
| `index.CB87Sc6I.js` | 70 KB | shared |
| `homeScene.*.js` (lazy) | 51 KB | desktop home only |
| `index.BnutI203.js` | 51 KB | shared |
| `setup.dZIRujxl.js` | 44 KB | per-page |
| `projectsScene.*.js` (lazy) | 39 KB | desktop projects only |
| `contact.*.css` | 25 KB | contact route |

### typecheck / lint

`npm run typecheck` clean (0 errors). `npm run build` clean. Pre-change state preserved.

---

## Step 1: Mobile-vs-desktop divergence map

### `/` (home)

| Element | Desktop | Mobile | Trigger | Reference |
| --- | --- | --- | --- | --- |
| Hero 3D canvas (Three.js MIKKO+NUMMINEN, galaxy, ring, goat, star) | render | `display: none` + skip dynamic-import of `homeScene.ts` | `(max-width: 640px)` OR `prefers-reduced-motion` | `Hero.astro:108-118`, `HomePage.astro:117-118` |
| Hero title (3D chrome TextGeometry) | render | flat `<h1>` with `clamp(3rem, 13vw, 9rem)` white text on radial-gradient bg | same | `Hero.astro:174-198` |
| `.hero__corners` block (`/ 00 cover`, `61° N · 24° E · tampere · hervanta`, `vol. 26`) | render (static spans, absolutely positioned) | `display: none` | `(max-width: 860px)` | `Hero.astro:320-324` |
| `.hero__data-feed` (cyan pulse + typed shell-style canvas) | render | `display: none` AND `buildDataFeedConsole` early-returns | `(max-width: 860px)` CSS hide + JS skip | `Hero.astro:320-324` + `Hero.astro:425` |
| `.hero__masthead` (`PORTFOLIO · 2026` + `FULL-STACK DEVELOPER · FINLAND`) | render | render (unchanged) |, | `Hero.astro:154-163` |
| `.hero__scroll-hint` (`SCROLL ↓`) | render | render |, | `Hero.astro:209-` |
| Short-landscape (`<600px` height, landscape) chrome pull-up | applies | applies | `(max-height: 600px) and (orientation: landscape)` | `Hero.astro:334-340` |

### `/projects/` (projects)

| Element | Desktop | Mobile | Trigger | Reference |
| --- | --- | --- | --- | --- |
| WebGL solar system (`projectsScene.ts`) | render via dynamic import | `display: none` + skip dynamic import | `(max-width: 860px)` OR `prefers-reduced-motion` | `projects-scene.css:507`, `ProjectsPage.astro:182,194-202` |
| `.projects-fallback` (ProjectGrid component) | hidden | render | inverse of above | `projects-scene.css:503-514` |
| `.projects-scene__list` (left-side project nav) | render | `display: none` | `(max-width: 860px)` | `projects-scene.css:473-476` |
| `.projects-scene__key` (right-side legend explaining connection lines + external APIs) | render | `display: none` | same | `projects-scene.css:473-476` |
| `.projects-scene__intro` (title) | render | render (repositioned, edges 1.5rem) | `(max-width: 860px)` | `projects-scene.css:455-460` |
| `.projects-scene__credits` | render | render (smaller, edges 1rem) | `(max-width: 860px)` | `projects-scene.css:467-472` |
| Project-to-project connections (`HRM ↔ Platform`, `Memberly → Voice → Listened`) | rendered as 3D lines + in `.projects-scene__key` legend | **no visualization, no legend**, connections are simply not surfaced |, | gap |

### `/experience/` (experience)

| Element | Desktop | Mobile | Trigger | Reference |
| --- | --- | --- | --- | --- |
| MountainScene (SVG sky + 6 parallax layers + stars + sun) | render | render |, | `MountainScene.astro` |
| Goat overlay (SVG sprite parallax) | render | render |, | `Goat.astro` |
| TimelineContent (cards) | render | render |, | `TimelineContent.astro` |
| GSAP parallax | runs | runs (gated only by RM) | `prefers-reduced-motion` | `ExperiencePage.astro:37` |

**Experience is the reference for what mobile can be on this site.** Pure SVG + GSAP,
no canvas, no Three.js, full motion + parallax. The Goat, sun rise, sky tween, and
timeline cards all behave the same on phone as on desktop. This is the working pattern
to imitate elsewhere.

### `/contact/` (contact)

| Element | Desktop | Mobile | Trigger | Reference |
| --- | --- | --- | --- | --- |
| `Terminal.astro` (interactive CRT terminal, `whoami`, `contact --list`, etc.) | render | `.crt { display: none }` | `(max-width: 640px)` | `terminal.css:347-365` |
| `MobileContactCard.astro` (scripted typing card + CTA buttons) | `display: none` | render | `(max-width: 640px)` | `mobile-contact-card.css:8` |
| Mobile typing animation | runs (on a hidden element, wasted) | runs |, | `MobileContactCard.astro:285+` |

The MobileContactCard is itself well-built: CRT scanlines, flicker, 56px minimum
tap targets on the three CTA buttons (`Email`, `LinkedIn`, `Download CV`), scripted
typing that respects `prefers-reduced-motion`. Closes the contact loop nicely.

### Cross-page chrome

| Element | Desktop | Mobile | Trigger | Reference |
| --- | --- | --- | --- | --- |
| `BackgroundAudio` toggle (music + voice on home) | bottom-left, `bottom: 2rem; left: 2rem` | bottom-left, `bottom: 1.25rem; left: 1.25rem`, smaller padding | `(max-width: 640px)` | `BackgroundAudio.astro:254-262` |
| Page-transition canvas dissolve | runs | runs (mobile included) | gated only by `prefers-reduced-motion` | `pageTransition.ts:664-665` |
| `SiteNav` (Home / Projects / Experience / Contact + EN/FI/SV) | `px-3 py-1.5` (`sm:` from 640px up) | `px-4 py-3` (mobile defaults) |, | `SiteNav.astro:58,81` |
| `SiteNav` safe-area inset | `top: calc(env(safe-area-inset-top, 0) + 1rem)` | same |, | `SiteNav.astro:118` |
| Footer | row, 1100px wide | column, centred | `(max-width: 860px)` | `BaseLayout.astro:197-203` |

---

## Step 2: Classification

The big takeaway: **divergence on this site is consistently in one direction, desktop
has identity, mobile has text.** The fallbacks are correct, functional, and fast; they
just don't carry brand. Below, each entry from Step 1 is classified.

### Justified perf cost (keep)

- **Hero 3D canvas hidden / skipped on `≤640px`.** The Three.js chunk is 556 KB; loading
  it on a Moto G Power would tank LCP and burn battery for an effect a small viewport
  can't really hold (the title fills the frame; the editorial chrome and galaxy don't
  fit). Hiding the canvas + skipping `import('../lib/three/homeScene')` is the right
  call. `HomePage.astro:117`, `Hero.astro:108`.
- **Projects WebGL scene hidden / skipped on `≤860px`.** Same logic. The 3D solar
  system was conceived as a desktop-mouse experience; touch gestures on a tiny canvas
  would feel wrong even before the perf hit. `ProjectsPage.astro:182,194`,
  `projects-scene.css:507`.
- **`projectsScene.ts` dynamic-import gated on `isSmall || reducedMotion`.** Correct.
  `ProjectsPage.astro:194`.

### Justified UX cost (keep, but consider a mobile-native replacement)

- **`Terminal.astro` (interactive CRT terminal) hidden at `≤640px`.** A keyboard-driven
  prompt with `cd`, `ls`, `cat` etc. doesn't translate to touch without a soft keyboard
  intrusion. The `MobileContactCard.astro` replacement is the right shape: scripted
  typing tells the same story, three big CTA buttons surface the actions. Good. The
  only thing the desktop terminal does that the mobile card doesn't is "feels like
  Mikko's computer". The card gets close with CRT scanlines + flicker.
- **`projects-scene__list` and `projects-scene__key` hidden at `≤860px`.** They're
  floating side panels positioned for a wide viewport. Hiding is correct *as panels*,
  but their *content* is information the mobile user is currently denied entirely
  (see "Over-aggressive" below).

### Over-aggressive (the wins)

- **`.hero__corners { display: none }` at `≤860px`** (`Hero.astro:320-324`). The block
  contains static text: `/ 00 cover`, `61° N · 24° E · tampere · hervanta`, `vol. 26`,
  plus the canvas-based data-feed widget. Hiding the whole block punishes the cheap
  static-text children for the expensive canvas widget. The corner markers are the
  hero's "magazine cover" identity; on a 360 px viewport they can shrink (smaller font,
  tighter padding, edges to `1rem`) and still ground the design.
  **Classification: over-aggressive (free win).**

- **Projects connections legend not surfaced on mobile.** `ProjectsPage.astro:21-29`
  builds a fully-localised `connectionLegendEntries` array (`HRM ↔ Platform — submodule`,
  `Memberly → Voice — voice flow`, etc.). It is only rendered into `.projects-scene__key`,
  which is `display: none` at `≤860px`. The `ProjectGrid` fallback has no Connections
  section at all. The README calls this metaphor out as the central reason the projects
  page exists (`HRM ships as a git submodule inside Platform...`): mobile visitors
  currently get six independent cards with no relational story.
  **Classification: over-aggressive (free-ish win, data is already computed, just needs to render in the fallback).**

- **Mobile hero is silent.** First viewport on a phone is the masthead text + flat H1
  + scroll hint, on a dark radial-gradient, no motion, no editorial chrome (corners
  hidden), no character. Compare to `/experience/` where the same constraint window
  (no Three.js) is served *with* a six-layer SVG parallax + a goat + a sun-rise tween.
  The hero could do something analogous, even a single SVG gradient sweep + a few
  drifting dots would change "default-template phone landing" into "this is a real
  site". **Classification: over-aggressive lack of a mobile-native replacement.**

### Mobile-native opportunity (lighter equivalent of a stripped heavy element)

- **Mobile projects "constellation map"** as a single SVG: planets as dots, connections
  as coloured arcs, labels stacked beside each dot. Static SVG (no animation needed,
  no canvas, no Three.js). Carries the spatial/relational metaphor that the 3D scene
  carries on desktop. Could sit *above* the ProjectGrid as a single-screen overview.

- **Mobile hero motion**: replace the flat fallback with an SVG starfield + slow CSS
  gradient sweep across the H1 (cf. `MountainScene.astro`'s SVG-layer approach). Or,
  more ambitiously, a stripped Three.js entry point: title only, no galaxy/ring/goat,
  no envMap, DPR capped at 1.5, ~10 KB of additional JS instead of 556 KB. The
  experience page already proves you can carry brand without a canvas.

---

## Step 3: Specific verifications

### Home (`/`)

- **Three.js is correctly skipped on `≤640px`.** Verified in Lighthouse run: the
  `disposeMaterial.*.js` chunk (556 KB) is not in the network panel.
- **What does the mobile visitor actually see in the first viewport?**
  Masthead (`PORTFOLIO · 2026` / `FULL-STACK DEVELOPER · FINLAND`) at the top, the
  flat H1 (`MIKKO` / `NUMMINEN`, white, `clamp(3rem, 13vw, 9rem)`) centred on a
  near-black radial gradient, and `SCROLL ↓` with a CSS-bobbed circle indicator at the
  bottom. **No editorial chrome, no motion.** The `text-shadow` (`0 0 40px rgba(80, 130, 255, 0.18)`)
  is the only thing carrying any 3D / chrome flavour into the fallback. It's not
  *ugly*, it's just *quiet*, which on a portfolio first impression is the same problem.
- **Breakpoints where each piece disappears:**
  - 3D canvas: ≤640px (`Hero.astro:108`)
  - Title fallback shown: ≤640px (`Hero.astro:188`)
  - All corner widgets (`/00 cover`, coords, place, `vol. 26`, data-feed): ≤860px (`Hero.astro:320`)
  - data-feed JS: ≤860px guarded in script (`Hero.astro:425`)
  - Short-landscape chrome lift: `max-height: 600px AND orientation: landscape` (`Hero.astro:334`)

### Projects (`/projects/`)

- **Does the grid communicate connections?** No. The `ProjectGrid.astro` template
  iterates `localizeProjects(t)` and renders each project as an independent card:
  status pill, tagline, description, highlights, externalApis, tech tags, primary/secondary
  links. The `connections` array (and the matching `connectionLegendEntries` built in
  `ProjectsPage.astro:21-29`) is computed in the page frontmatter for the *desktop*
  key panel and never reaches the mobile fallback. **The relational story: the page's
  USP per the README: is invisible to mobile.**
- **Does the grid preserve any of the spatial / orbital metaphor?** No. It's
  three columns at desktop width, one column on phone: standard card grid.
- **Status pill is well-styled and informative.** Live/wip distinguish nicely.
- **The grid's `.project-card__link` (Live demo / GitHub) is `padding: 0.85rem 1rem`
  with `font-size: 0.72rem`: vertical ~30px including padding. Below 44px.**
  Two links sit `gap: 0.5rem` apart in `.project-card__links`: meets WCAG ≥8px
  spacing. **Severity: minor, fails WCAG 2.5.5 tap-target minimum.**

### Experience (`/experience/`)

- **Mountain SVG + goat + parallax all work on mobile.** Verified by source, no
  viewport-gated branches in `ExperiencePage.astro`, `MountainScene.astro`, `Goat.astro`,
  or `experience-timeline.css`. The only gate is `prefers-reduced-motion`
  (`ExperiencePage.astro:37` → `initExperienceTimeline({ reducedMotion })`).
- **Sky color tween, sun rise, stars fade-out drive off the same parallax progress.**
- **Timeline cards** scroll into view and are individually animatable: the cards in
  `experience-timeline.css` have their own reduced-motion stripping at lines 119, 623, 725.
- **This page is the reference.** Use its approach as the template for "what
  mobile-on-this-site looks like at its best."

### Contact (`/contact/`)

- **MobileContactCard scripted typing plays on mobile.** Verified in
  `MobileContactCard.astro:285-303`: IIFE walks `steps[]`, typing each `cmd` /
  `out` / `pair` with `setTimeout`. Respects `prefers-reduced-motion` via
  `MobileContactCard.astro:90-92` (renders all lines statically).
- **CTA buttons are above the fold and well-sized.** `min-height: 56px` per
  `mobile-contact-card.css:242`. Three buttons stacked: `Email`, `LinkedIn`,
  `Download CV`. Each fires the appropriate native action (`mailto:`, external link,
  `download` attribute).
- **Caveat (minor):** The `MobileContactCard.astro` script's `start()` runs on every
  `/contact/` page-load: desktop included, where the card itself is `display: none`.
  It walks the entire `steps[]` array, typing into a hidden element. Wasted ~5 s of
  setInterval/setTimeout work + the equivalent DOM appends. Not a perf killer but
  inelegant; should early-return when the card isn't displayed.

### Page transitions

- **Canvas particle dissolve runs on mobile.** `pageTransition.ts:664-665` only gates
  on `prefers-reduced-motion`. So a mobile user without RM gets the same phase A→B→C
  particle effect on every internal nav. **"Every page is its own concept" narrative
  is preserved on mobile.**
- **DPR is capped at 2** (`pageTransition.ts:306`, `Math.min(window.devicePixelRatio, 2)`).
- Reduced-motion path: `return` early, no transition, instant nav. Correct.

### Tap targets, safe areas, scroll behaviour

- **`SiteNav` primary link tap targets are below 44 × 44.** The link class is
  `px-4 py-3 sm:px-3 sm:py-1.5` (`SiteNav.astro:58`); at mobile defaults that's
  16 px horizontal + 12 px vertical padding around `text-xs` (12 px) text →
  approximate hit area ~44 × 36 px (Tailwind `py-3` is 0.75 rem = 12 px each side,
  + ~12 px text height = 36 px total height). The horizontal dimension just clears
  44 px; the vertical does not. **Lang links (`px-3 py-2` mobile) are tighter still
  (~28 × 28 px). Adjacent items have `gap-1` = 4 px spacing → below the WCAG 2.5.5
  recommended 8 px.** This is the single biggest a11y finding in the audit.
- **Safe-area insets**: only `SiteNav` uses `env(safe-area-inset-top)`
  (`SiteNav.astro:118`). The `BackgroundAudio` toggle at `bottom: 1.25rem` left,
  on a maximally-notched iOS device (home indicator height ~34 px = ~2.1 rem) could
  sit under the home indicator in standalone / PWA mode. In normal browser viewport
  it should be fine.
- **No horizontal scroll on any route.** Confirmed by reading the CSS: `.project-card`
  uses `minmax(320px, 1fr)` which can overflow a 360 px viewport by 1.5 rem padding;
  but `.project-grid__list` is itself max-width 1100px with `padding: 7rem 1.5rem 4rem`
  on its parent, so the actual content area is ~330 px on a 360 px phone: within tolerance.
- **URL-bar collapse / `100vh` traps**: none of the audited pages use `height: 100vh`
  on the *body* (Experience sets it on the mountain layer but absolutely-positioned, so
  the layout doesn't shift). Hero is `height: 100vh` (`Hero.astro:81`) but that's the
  *section*, not the body. Likely fine; verify on real device.

### Reduced-motion vs mobile-viewport: conflation check

- **Not conflated.** Every site where both are evaluated uses an explicit OR:
  - `HomePage.astro:118`: `skipScene = !canvas || reducedMotion || isSmall;`
  - `ProjectsPage.astro:194`: `if (reducedMotion || isSmall || !sceneRoot) {`
  - `Hero.astro:108-118`: separate `@media (max-width: 640px)` and `@media (prefers-reduced-motion: reduce)` rules apply identical effects.
- They produce the same outcome (skip Three.js + show fallback) for legitimate reasons:
  a user with reduced-motion explicitly opted out of motion, so we shouldn't render the
  3D scene for them either. **This is a design choice, not an accidental coupling.**
- The user-prompt concern: "a high-end iPhone with RM off should not be served the
  same stripped experience as a Moto G Power", is technically not happening here:
  the iPhone with RM off and CSS viewport ≥ 641 px would get the full 3D hero. The
  user prompt specifically called out `≤640px` as the breakpoint though, so an iPhone
  in portrait (375–430 px wide) DOES get the stripped fallback regardless of RM state.
  That's a *device-class* choice tied to viewport width, separate from RM, and arguably
  correct (touch + small viewport + battery considerations).

### DPR handling

- **All canvas paths cap DPR at 2:**
  - `createRenderer.ts:18`: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
  - `createResizeHandler.ts:21`: same on resize
  - `pageTransition.ts:306`: same
- The Three.js scenes only run on desktop (gated above), so the DPR cap mostly protects
  the page-transition canvas, which DOES run on mobile. Good.

---

## Step 4: Findings

Numbered by route prefix (H = home, P = projects, E = experience, C = contact, X =
cross-cutting). Each: classification, file:line, suggested fix, expected impact.

### H: home

#### H-1 · Hero corner widgets hidden too aggressively at ≤860 px · **major**
*Classification:* over-aggressive (free win).
*Location:* `src/components/home/Hero.astro:320-324`.
*Current:* `@media (max-width: 860px) { .hero__corners { display: none; } }` removes
the entire editorial-cover identity: `/ 00 cover`, `61° N · 24° E`, `tampere · hervanta`,
`vol. 26`, **and** the data-feed canvas widget. The data-feed has a real perf cost
(canvas paint loop + animation frame); the static text spans have none.
*Suggested fix:* split the rule. Keep `.hero__data-feed { display: none }` at ≤860px
(its JS already early-returns at the same breakpoint in `Hero.astro:425`), but
restore the static-text corners with tighter sizing: e.g. `font-size: 0.55rem`,
`letter-spacing: 0.18em`, edges to `1rem`. The TR corner already stacks coords +
place vertically and would fit on a 360 px viewport.
*Perf impact:* none (static spans + CSS).
*Visual impact:* mobile hero regains the "magazine cover" identity that desktop carries.

#### H-2 · Mobile hero has no motion or editorial flavour · **major**
*Classification:* mobile-native opportunity.
*Location:* `src/components/home/Hero.astro` (the `.hero__title-fallback` path).
*Current:* on `≤640px`, the visitor sees masthead text + a flat H1 + scroll hint on a
dark radial gradient. No movement anywhere. Compare to `/experience/`, where the same
constraint (no Three.js, mobile-capable) renders a six-layer parallax SVG scene with
a goat and a sun rise.
*Suggested fix (cheapest):* an SVG starfield layer (similar pattern to
`MountainScene.astro:11-26`'s star generation), plus a slow CSS background-position
sweep on the title. Estimate 2–4 h.
*Suggested fix (more ambitious):* a stripped Three.js entry point, title geometry only
(no galaxy, no ring, no goat, no envMap), DPR 1.5 cap, ~10–15 KB additional JS instead
of 556 KB. Estimate 1–3 days; requires its own dispose / test path.
*Perf impact:* SVG variant is essentially free (~1–2 KB markup); Three.js variant adds
~10–15 KB lazy chunk + ~30 ms TBT on Moto G Power.
*Visual impact:* "this is a real site" instead of "this is a placeholder".

#### H-3 · Hero data-feed widget has no mobile equivalent · **minor**
*Classification:* mobile-native opportunity.
*Location:* `src/lib/home/dataFeedConsole.ts` + the `.hero__data-feed-canvas` element.
*Current:* canvas widget that types fake shell output (`$ probe geo`, `> rtt 14ms`, etc.)
in the bottom-right corner on desktop. Hidden on mobile.
*Suggested fix:* a tiny SVG/CSS variant, three short monospace lines, blinking
cursor, no animation loop. Or just static-render the last three lines. Adds atmosphere
without the canvas cost.
*Perf impact:* negligible.
*Visual impact:* the "this terminal is alive" beat is retained on phone.

### P: projects

#### P-1 · Connection metaphor is invisible to mobile · **major**
*Classification:* over-aggressive.
*Location:* `src/page-content/ProjectsPage.astro:21-29` (data is built) +
`src/components/projects/ProjectGrid.astro` (mobile surface, receives nothing).
*Current:* the localized `connectionLegendEntries` array is rendered into
`.projects-scene__key`, which is `display: none` at ≤860px (`projects-scene.css:473-476`).
The mobile `ProjectGrid` template never receives or renders this data. Mobile users
see six independent cards with no awareness that "HRM is a submodule inside Platform"
or that "Memberly → Voice → Listened" describes a voice flow.
*Suggested fix:* add a `<Connections>` block to `ProjectGrid.astro` after the header,
before the list (render `connectionLegendEntries` as text rows ("HRM ↔ Platform) submodule",
"Memberly → Voice: voice flow", etc.). Pass the array as a prop from
`ProjectsPage.astro`, where it's already computed. Pure text + a coloured dot/line per
entry. Estimate 30–60 min.
*Perf impact:* none.
*Visual impact:* the page's USP is restored on mobile.

#### P-2 · Project grid is just a grid · **major**
*Classification:* mobile-native opportunity.
*Location:* `src/components/projects/ProjectGrid.astro`.
*Current:* six cards, no spatial metaphor.
*Suggested fix:* render a single SVG "constellation map" above the cards: each project
a labelled dot at a layout-tuned position, connections as coloured arcs (`stroke`,
opacity 0.3–0.5), no animation. Tapping a node could anchor-scroll to the matching
card. ~3–4 h.
*Perf impact:* one inline SVG ~5 KB; negligible.
*Visual impact:* phone users see the same spatial story the desktop scene tells.

#### P-3 · Tap target on `.project-card__link` is below 44 × 44 · **minor**
*Classification:* a11y blocker (mobile).
*Location:* `src/styles/project-grid.css:208-227`.
*Current:* `padding: 0.85rem 1rem; font-size: 0.72rem` → ~30 px tall. WCAG 2.5.5
minimum is 44 px.
*Suggested fix:* bump to `padding: 1rem 1.25rem; font-size: 0.78rem; min-height: 44px`.
*Perf impact:* none.
*Visual impact:* slightly larger CTAs; arguably nicer.

#### P-4 · `.projects-scene__intro` ("Projects" h1) sits alone on the canvas page above the fallback grid · **nit**
*Classification:* over-aggressive.
*Location:* `src/styles/projects-scene.css:455-460`.
*Current:* on `≤860px`, the canvas is hidden but the `.projects-scene__intro` block is
*not* hidden. It floats at `top: 6.5rem`. Meanwhile `.project-grid` (inside
`.projects-fallback`) renders below the (hidden) canvas with its own `padding: 7rem 1.5rem 4rem`.
Net result: on mobile there's an absolutely-positioned `<h1>` ("Projects") and *also*
the grid's `<h1>` ("Projects" again, in `project-grid__title`). Two h1s, same text.
*Suggested fix:* either hide `.projects-scene__intro` at ≤860px, or remove the h1 from
`ProjectGrid.astro`. (Need to verify which is rendered visibly on mobile, may already
be only one due to z-index, but two h1s in the DOM is bad for a11y / SEO regardless.)
*Perf impact:* none.
*Visual impact:* nil; cleans up the DOM.

#### P-5 · Lighthouse A11y `color-contrast` failure · **minor**
*Classification:* a11y.
*Location:* (un-verified, Lighthouse JSON flags `audits['color-contrast'].score === 0`
on `/projects/`).
*Suggested fix:* run Lighthouse manually on the route, click the failed audit, identify
the offending element, bump contrast.

#### P-6 · Lighthouse A11y `label-content-name-mismatch` · **minor**
*Classification:* a11y.
*Location:* (un-verified, Lighthouse audit flagged on `/projects/`).
*Suggested fix:* check elements where `aria-label` text doesn't include the visible
text content: likely the planet-label SVGs or the connection-key arrows.

### E: experience

#### E-1 · No mobile findings · **none**
The experience page is the working pattern. Keep it.

### C: contact

#### C-1 · MobileContactCard typing script runs on desktop · **minor**
*Classification:* over-aggressive.
*Location:* `src/components/contact/MobileContactCard.astro:285-303`.
*Current:* the typing IIFE runs on every `/contact/` page-load, including desktop
where `.mcc { display: none }`. Five seconds of `setTimeout`s, ~50 DOM appends into a
hidden element.
*Suggested fix:* early-return when `.mcc` is not visible, e.g. check
`window.matchMedia('(max-width: 640px)').matches` at the top of `start()`, or check
`output.offsetParent === null`.
*Perf impact:* trivial CPU savings on desktop; cleaner.
*Visual impact:* none.

### X: cross-cutting

#### X-1 · `SiteNav` tap targets fail 44 × 44 minimum · **major (a11y)**
*Classification:* a11y blocker.
*Location:* `src/components/nav/SiteNav.astro:58, 81`.
*Current:* mobile defaults are `px-4 py-3` for primary links and `px-3 py-2` for lang
links. Math: `py-3` = 12 px each side + `text-xs` 12 px = ~36 px tall (links). Lang
links ~28 × 28. Adjacent items have `gap-1` = 4 px between them (WCAG recommends ≥8 px).
*Suggested fix:* increase mobile padding to `px-4 py-3.5` on primary links and at
least `px-3 py-2.5` on lang links; bump `gap-1` to `gap-2` on mobile. Or simpler:
add `min-height: 44px` via custom CSS.
*Perf impact:* none.
*Visual impact:* slightly chubbier nav pill on mobile; aligns with HIG.

#### X-2 · `BackgroundAudio` toggle has no `safe-area-inset-bottom` · **minor**
*Classification:* a11y (touch + iOS standalone).
*Location:* `src/components/BackgroundAudio.astro:254-262`.
*Current:* `@media (max-width: 640px) { .bg-audio { bottom: 1.25rem; left: 1.25rem; } }`.
On an iPhone 14/15/16 Pro in PWA / standalone mode, the home-indicator inset can be
~34 px = ~2.1 rem. `bottom: 1.25rem` is below that.
*Suggested fix:* `bottom: calc(env(safe-area-inset-bottom, 0px) + 1.25rem);`.
Same for `left` if anything ever lands under the side notch (currently nothing does).
*Perf impact:* none.
*Visual impact:* toggle lifts off the home indicator on notched iOS.

#### X-3 · Page-transition canvas runs on mobile (good, but worth a real-device check) · **nit**
*Classification:* justified perf, but unverified at mobile-throttling levels.
*Location:* `src/lib/transitions/pageTransition.ts:664-665, 306`.
*Current:* gated only by `prefers-reduced-motion`; mobile users get the full particle
dissolve. DPR capped at 2.
*Suggested fix:* none for now, verify on a mid-range Android (e.g. Pixel 7 with
"Slower Devtools throttling") that the dissolve completes in < 600 ms (the design
target). If it stalls, fall back to a CSS opacity crossfade on `coarse pointer`
clients.
*Perf impact:* contingent.
*Visual impact:* contingent.

---

## Step 5: Top 5 priorities

Ranked by *impact on the mobile portfolio impression per hour of work*:

1. **P-1 · Add Connections section to the mobile ProjectGrid**: *(30–60 min, free win)*
   The data already exists in `ProjectsPage.astro:21-29`. Render
   `connectionLegendEntries` as text rows inside `ProjectGrid.astro`. Restores the
   page's USP on mobile for almost no cost. *No perf risk.*
2. **H-1 · Restore hero corner widgets at ≤860 px (data-feed stays hidden)**: *(20 min, free win)*
   Split the `.hero__corners { display: none }` rule into a `.hero__data-feed { display: none }`
   override + smaller-font corner-text overrides. Recovers the magazine-cover identity
   on phones. *No perf risk.*
3. **X-1 · Bump SiteNav tap targets to ≥44 px**: *(15 min, a11y win)*
   `px-4 py-3` → ensure min-height 44 px on mobile; widen the gap to 8 px. Single CSS
   change. Fails WCAG 2.5.5 currently. *No perf risk.*
4. **H-2 · Mobile hero motion (SVG variant)**: *(2–4 h, identity win)*
   Add an SVG starfield + slow CSS gradient sweep on the title in the
   `.hero__title-fallback` path. Mirror the SVG-layer approach `MountainScene.astro`
   uses. Closes the "looks like a default template" gap. *No perf risk; ~1 KB markup.*
5. **P-2 · Mobile projects constellation map (SVG)**: *(3–4 h, identity win)*
   Replace the bare grid with an SVG constellation above the cards: project dots,
   coloured connection arcs, labels. Carries the relational metaphor natively for
   mobile. *No perf risk; ~5 KB inline SVG.*

Together these are roughly **one focused day of work** and move every mobile route from
"functionally good" to "carries brand". Every item is reversible via a single small PR.

---

## Free wins (un-hide / restyle only, no new components)

A focused checklist for the "just go" pass. Each entry is one selector / file:line.

- [ ] **`Hero.astro:320-324`**: split rule. Keep `.hero__data-feed { display: none }`
      at `≤860px`, but un-hide `.hero__corners`'s static text. Add mobile-tightened
      font/padding overrides.
- [ ] **`SiteNav.astro:58`**: bump primary link padding so hit area is ≥44 × 44 on
      mobile. Add `min-height: 44px` if Tailwind classes won't reach it.
- [ ] **`SiteNav.astro:81`**: same for lang links + widen `gap-1` to `gap-2` on
      mobile.
- [ ] **`project-grid.css:208-227`**: bump `.project-card__link` padding +
      `min-height: 44px`.
- [ ] **`BackgroundAudio.astro:254-262`**: `bottom: calc(env(safe-area-inset-bottom, 0px) + 1.25rem);`.
- [ ] **`projects-scene.css:455-460`**: hide `.projects-scene__intro` at `≤860px`
      to eliminate the duplicate `<h1>`.
- [ ] **`MobileContactCard.astro:285`**: early-return when the card isn't visible
      (cheap `offsetParent === null` check) so the typing script doesn't run on
      desktop.

---

## Open questions for Mikko

1. Was hiding `.hero__corners` at 860 px intentional, or just the easiest way to
   suppress the data-feed widget on small viewports? The static-text corners look like
   accidental collateral.
2. Do you want the mobile `/projects/` page to communicate the connection metaphor?
   Two routes available: (a) text-row legend below the header (free), (b) inline SVG
   constellation map (3–4 h).
3. Is mobile-hero motion important enough to invest in? Two options:
   (a) SVG starfield + CSS gradient sweep (cheap, 2–4 h, no canvas), or
   (b) stripped Three.js mobile entry (~1–3 days, ~10–15 KB extra lazy JS).
4. The `MobileContactCard` typing script runs on desktop where the card is
   `display: none`. Intentional, or fix?
5. Have you run this site on a real mid-range Android (e.g. Pixel 6/7) recently to
   verify the page-transition canvas dissolve completes within the design's 600 ms
   target? Lighthouse's simulated throttling can be optimistic for real-device GPU.
6. Any reason the SiteNav uses `text-xs` (12 px) on mobile: was that an aesthetic
   choice, or just the Tailwind default that came along with `text-xs sm:text-sm`?
   At 12 px it's at the WCAG-readable floor and contributes to the tap-target shortfall.
7. iOS Safari has known issues with `<audio>` autoplay even after a user gesture if
   the page navigates immediately. Has the `BackgroundAudio` cross-page persistence
   been tested on iOS specifically, or just desktop Chrome?
8. The `MobileContactCard`'s CTA buttons render in DOM order: Email → LinkedIn →
   Download CV. Is that the intended priority order, or should LinkedIn come first
   for recruiter visits (the most common audience on a phone)?

---

*End of audit. No code was changed. Recommendations are unimplemented until you decide
which to action.*
