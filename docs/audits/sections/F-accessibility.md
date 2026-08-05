# Audit F: Accessibility (WCAG 2.2 AA)

**Date:** 2026-05-17  
**Branch:** audit/F (off audit/baseline @ b3de9f2)  
**Auditor:** Agent F  
**Scope:** WCAG 2.2 AA across all 12 routes (4 pages × 3 locales: EN, FI, SV)  
**axe-core version:** 4.11.4

---

## 1. axe-core Scan Summary

All 12 routes were scanned against the `wcag22aa` ruleset via `@axe-core/cli` running against the locally built and served site (`npm run build && npm run preview`).

| Route        | Locale | Violations |
|--------------|--------|------------|
| `/`          | EN     | 0          |
| `/projects`  | EN     | 0          |
| `/experience`| EN     | 0          |
| `/contact`   | EN     | 0          |
| `/fi/`       | FI     | 0          |
| `/fi/projects` | FI   | 0          |
| `/fi/experience` | FI  | 0          |
| `/fi/contact`  | FI   | 0          |
| `/sv/`       | SV     | 0          |
| `/sv/projects` | SV   | 0          |
| `/sv/experience` | SV  | 0          |
| `/sv/contact`  | SV   | 0          |

**Result: 0 axe-core violations across all 12 routes.** However, axe-core detects only 20–50% of real accessibility issues. The Lighthouse mobile audit records 95/100 on all three `/projects` locales (all others 100/100). The Lighthouse JSON was parsed to identify the two specific failures; additional manual-code findings are documented below.

---

## 2. The /projects 95/100 Gap: Root-cause Analysis

Parsing `lh-projects-en.json` from the baseline run revealed two Lighthouse A11y failures:

### 2a. `color-contrast`: `.project-card__label` (F-BL1)

**WCAG criterion:** 1.4.3 Contrast (Minimum), Level AA  
**File:** [`src/styles/project-grid.css:164`](src/styles/project-grid.css#L164)–171  
**Selector:** `ul.project-grid__list > li.project-card > div.project-card__externalApis-wrap > p.project-card__label`  
**Snippet:** `<p class="project-card__label">INTEGRATIONS</p>`

**Color values:**
- Foreground: `rgba(196, 212, 255, 0.45)` → computed by Lighthouse as `#5e6782`
- Background: card `rgba(10, 18, 38, 0.55)` over page background `#0a0a0f` → computed as `#0a0e1c`
- **Measured contrast ratio: 3.42:1**
- Required for normal text at 9.92 px: **4.5:1**

This label ("INTEGRATIONS", "TECH") is 0.62 rem ≈ 9.9 px at 16 px root: well below the 18 px / 14 px bold threshold for large text. The opacity-based approach (`rgba(196,212,255,0.45)`) is the cause. The label appears in the **mobile fallback grid** (`.projects-fallback`) which is the only visible surface Lighthouse sees in its mobile viewport run. It affects all 7 project cards that have an integrations section across all three locales.

**Fix:** Raise the label opacity to at least 0.65 (computed contrast ≈ 5.97:1), or use a solid colour such as `#8090b0` (contrast ≈ 4.6:1 against `#0a0e1c`).

---

### 2b. `label-content-name-mismatch`: Background Audio Toggle (F-BL2)

**WCAG criterion:** 2.5.3 Label in Name, Level A  
**File:** [`src/components/BackgroundAudio.astro:45`](src/components/BackgroundAudio.astro#L45)  
**Selector:** `body > div.bg-audio > button.bg-audio__toggle`  
**Snippet:** `<button aria-label="Toggle background sound" ...><span>SOUND ON</span></button>`

The button's `aria-label` is `"Toggle background sound"` but its visible text content reads `"SOUND ON"` or `"SOUND OFF"` (depending on state). Per WCAG 2.5.3 the accessible name must **contain** the visible text string. A screen-reader user who communicates via voice control (e.g. Dragon NaturallySpeaking) and says "click sound on" will fail to activate the button because its accessible name does not include those words.

**Fix:** Either (a) change `aria-label` to include the visible label text, e.g. `aria-label="Sound on/off (background music)"` with an `aria-pressed` toggling state, or (b) remove the `aria-label` entirely and let the button's text content be the accessible name (supplemented by `aria-pressed`), since the SVG icons already carry `aria-hidden="true"`.

The button also appears on every other page (it lives in `BaseLayout.astro`). It was only flagged on `/projects` because Lighthouse ran mobile-first and the screen is narrow enough for the button to be in the tested DOM area. **This issue is present on all 12 routes.**

---

## 3. Keyboard Navigation Review

### 3a. Drawer (focus trap, ESC, click-outside, focus return)
**File:** [`src/lib/projects/drawer.ts`](src/lib/projects/drawer.ts)

- **Focus trap:** Implemented via `trapTab` keydown listener (lines 159–181, [`src/lib/projects/drawer.ts:159`](src/lib/projects/drawer.ts#L159)). Correctly wraps forward and backward Tab through all focusable elements within the drawer. Handles the empty-focusable edge case by redirecting to the close button.
- **ESC closes:** `onEscape` listener on `document` ([`src/lib/projects/drawer.ts:224`](src/lib/projects/drawer.ts#L224)–228). Correctly checks `data-open === 'true'` before acting.
- **Click-outside:** `onDocumentClick` fires in capture phase ([`src/lib/projects/drawer.ts:247`](src/lib/projects/drawer.ts#L247)), ensuring it runs before planet/list click handlers. Correctly excludes clicks inside the drawer.
- **Focus return:** `lastFocused` is saved on `open()` from `document.activeElement` or from `pendingTrigger` (set via `prepareOpen()`). Restored on `close()`. Fallback to `document.body.focus()` if the element is removed from DOM.
- **Initial focus:** `requestAnimationFrame(() => closeBtn.focus())` on open moves focus to the close button. Screen readers will announce the dialog via `role="dialog"` + `aria-labelledby="project-detail-name"`.

**Finding:** One subtle gap, `aria-hidden="true"` is the default state on `.project-detail` in the HTML, and the drawer sets it to `"false"` on open and `"true"` on close (lines 192 and 206). However, the drawer is `role="dialog" aria-modal="true"` with `tabindex="-1"` in its default closed state. When closed, `aria-hidden="true"` correctly hides it from the AT tree. When open, `aria-modal="true"` is in place. This is correct behaviour.

**No keyboard blockers found in drawer code.**

### 3b. Terminal (/contact)
**File:** [`src/lib/terminal/terminal.ts`](src/lib/terminal/terminal.ts) and [`src/components/contact/Terminal.astro`](src/components/contact/Terminal.astro)

- `role="log" aria-live="polite" aria-atomic="false"` on the output div: correct for progressive terminal output.
- `<label for="terminal-input">` with a visible prompt label rendered as the terminal prompt. The input also has `aria-label` as a secondary accessible name. Redundant but harmless.
- Arrow Up/Down history navigation: `preventDefault()` called to stop cursor-jumping. Correct.
- Tab completion: `preventDefault()` called. Correct.
- Ctrl+L: clears screen. Ctrl+C: cancels input. Both standard terminal shortcuts.
- Boot sequence calls `input.focus()` after completion: lands focus in the input correctly.
- `inputmode="text"` present: correct for mobile soft keyboards.
- **IME note:** No explicit IME handling (`compositionstart`/`compositionend`). Tab-complete and Enter-submit could fire during IME composition on CJK keyboards, potentially submitting incomplete input. Not a WCAG failure but a UX issue for CJK users.

**No keyboard blockers found in terminal code.**

### 3c. Tab order and negative `tabindex`

Two uses of `tabindex="-1"` in the codebase:
1. `<main id="main" tabindex="-1">`: `BaseLayout.astro:149`. Correct: allows the skip link to programmatically focus `#main` without exposing it as a tab stop.
2. `<section class="project-detail" tabindex="-1">`: `ProjectDetail.astro:16`. Correct: the dialog itself is not in the tab order when closed; focus is managed programmatically by the drawer.

No positive `tabindex` values found anywhere (none would create unexpected tab-order jumps).

### 3d. Skip link
**File:** [`src/layouts/BaseLayout.astro:140`](src/layouts/BaseLayout.astro#L140)–145

The skip link renders as:
```html
<a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded">
  {t.nav.skipToContent}
```

The target `<main id="main" tabindex="-1">` exists on line 149. The skip link is visually hidden until focused (Tailwind `sr-only` / `focus:not-sr-only`). Localised to all three locales (en: "Skip to content", fi: "Siirry sisältöön", sv: "Hoppa till innehåll"). Skip-link mechanism is correct.

---

## 4. Screen Reader Narrative

### Home page canvas
**File:** [`src/components/home/Hero.astro:17`](src/components/home/Hero.astro#L17)–21

```html
<canvas id="home-canvas" class="hero__canvas" aria-hidden="true" ...></canvas>
```

The WebGL Three.js canvas is `aria-hidden="true"`. The section carries `aria-label={t.hero.sectionAria}`. The heading `<h1>` has `class="sr-only"` with the full text (`t.hero.titleSrOnly`). A visible fallback paragraph (`data-fallback`) renders the title text for no-JS / no-canvas scenarios; it is not hidden from AT, so screen readers see both the sr-only H1 and the fallback paragraph. This is redundant but not harmful: the fallback paragraph is CSS-hidden when JS runs by the Three.js scene script. The decorative chrome (`hero__corners`) is wrapped in `aria-hidden="true"`.

**The data-feed canvas** (`hero__data-feed-canvas`) is inside `div.hero__corners[aria-hidden="true"]`: correctly hidden from the AT tree.

### Projects page canvas
**File:** [`src/page-content/ProjectsPage.astro:39`](src/page-content/ProjectsPage.astro#L39)

```html
<canvas id="projects-canvas" class="projects-scene__canvas" aria-hidden="true"></canvas>
```

The planet-labels overlay, hover-label, and legend are all `aria-hidden="true"`. The **project list side panel** (`<nav aria-label="Project list">`) is the primary keyboard/AT path on desktop. It contains buttons for each project that open the drawer. The project detail drawer is a properly marked-up `role="dialog" aria-modal="true" aria-labelledby="project-detail-name"`.

The fallback grid (`ProjectGrid.astro`) renders `<section aria-label={t.projectsPage.gridAria}>` with full content. On reduced-motion or mobile the fallback is the only visible surface, and it is fully readable by AT.

**Gap:** The `<h1>` is absent from the projects WebGL scene view. The fallback grid has an `<h1>`, but on desktop (WebGL active) there is no `<h1>` in the DOM that is visible to AT: the `projects-fallback` div has `display: none` by default on desktop. A screen-reader user on desktop encounters no page-level heading. This is a **WCAG 1.3.1 / 2.4.6 gap**.

### noscript fallbacks
- `/contact`: `<noscript>` section inside `.crt` with heading, email, and GitHub links, correct.
- `/` (home): No `<noscript>` block, but the hero section content is fully in HTML (H1 sr-only, fallback paragraph). Three.js enhancement only.
- `/projects`: No `<noscript>` block; the fallback grid is CSS-toggled by `@media (max-width: 860px)` and `@media (prefers-reduced-motion: reduce)`, works for reduced-motion users but JS failure on a wide-screen non-reduced-motion browser shows nothing until `data-fallback-active` is set. A `<noscript>` redirect to the fallback would close this gap (minor, edge case).

---

## 5. `prefers-reduced-motion` Coverage

The codebase has extensive reduced-motion support. All animation surfaces were checked:

| Surface | RM Gated | Notes |
|---------|----------|-------|
| Home Three.js scene | Yes, `reducedMotion` flag stops orbit/galaxy tick | `src/lib/three/homeScene.ts:617,773,779,810,819,844,851` |
| Projects Three.js scene | Yes, orbit scale reduced to 0.25 | `src/lib/three/projectsScene.ts:444` |
| GSAP home timeline | Yes, `reducedMotion` path skips all tweens, calls `clearProps:'all'` | `src/lib/gsap/homeTimeline.ts:81–95` |
| GSAP experience timeline | Yes, skips reveals, shows content statically | `src/lib/gsap/experienceTimeline.ts:253–259` |
| Page transitions (particle dissolve) | Yes, full skip | `src/lib/transitions/pageTransition.ts:664–665` |
| Hero voiceover | Yes, `!reducedMotion` guard | `src/components/home/HeroVoiceover.astro:73–75` |
| Projects voiceover | Yes, `!reducedMotion` guard | `src/components/projects/ProjectsVoiceover.astro:45–47` |
| BackgroundAudio wave animation | Yes, CSS `animation: none` | `src/components/BackgroundAudio.astro:268–278` |
| Terminal cursor blink | Yes, CSS `animation: none` | `src/styles/terminal.css:367–374` |
| CRT flicker | Yes, CSS `animation: none` | `src/styles/terminal.css:367–368` |
| Global transitions | Yes, `transition-duration: 0s !important` on `*` | `src/styles/global.css:169–178` |
| Nav-card transforms | Yes, CSS `transform: none !important` | `src/styles/nav-cards.css:160–168` |
| Project detail drawer slide | Yes, `transform: none !important` | `src/styles/project-detail.css:246–260` |
| Experience timeline entries | Yes, CSS | `src/styles/experience-timeline.css:119,623,725` |
| Project grid card hover | Yes, CSS | `src/styles/project-grid.css:237–242` |
| DataFeed console | Yes, `if (reducedMotion) return NOOP_HANDLE` | `src/lib/home/dataFeedConsole.ts:214` |
| Three.js interactions (planet hover scale-up) | Yes, `!reducedMotion && hoverQuery.matches` | `src/lib/three/interactions.ts:156` |
| Projects scene fallback switch | Yes, `reducedMotion || isSmall` shows static grid | `src/page-content/ProjectsPage.astro:173,186` |
| Home scene skip | Yes, `skipScene = !canvas || reducedMotion || isSmall` | `src/page-content/HomePage.astro:118` |

**Finding:** Reduced-motion coverage is thorough and consistently applied. No animation surface was found that runs without honouring the preference.

**One nit:** The background audio itself (the music bed) plays regardless of `prefers-reduced-motion`, audio is not animation, so this is not a WCAG violation, but some users with vestibular disorders have comorbid auditory sensitivity. The existing sound toggle gives manual control. No fix required.

---

## 6. Color Contrast Analysis

All contrast ratios computed against blended actual rendered colours.

### Failing (< 4.5:1 for normal text, < 3:1 for large text / UI components)

| Element | Color (fg) | Background | Font size | Ratio | Threshold | File |
|---------|-----------|-----------|-----------|-------|-----------|------|
| `.project-card__label` ("INTEGRATIONS", "TECH") | `rgba(196,212,255,0.45)` → `#5e6782` | `#0a0e1c` | 0.62 rem / 9.9 px | **3.42:1** | 4.5:1 | [`src/styles/project-grid.css:169`](src/styles/project-grid.css#L169) |
| `.projects-scene__key-section` ("Connections", "Integrations") | `rgba(196,212,255,0.4)` | panel `rgba(8,14,32,0.55)` over scene | 0.58 rem / 9.3 px | **2.92:1** | 4.5:1 | [`src/styles/projects-scene.css:107`](src/styles/projects-scene.css#L107)–113 |
| `.projects-scene__credits` (footer text inside scene) | `rgba(196,212,255,0.4)` | scene bg `#02040c` | 0.65 rem / 10.4 px | **2.85–2.92:1** | 4.5:1 | [`src/styles/projects-scene.css:76`](src/styles/projects-scene.css#L76)–78 |
| `.projects-scene__legend` ("hover to inspect" etc.) | `rgba(196,212,255,0.45)` | scene bg `#010206` | 0.7 rem / 11.2 px | **3.36–3.39:1** | 4.5:1 | [`src/styles/projects-scene.css:47`](src/styles/projects-scene.css#L47) |

**Note on scene chrome (legend, credits, key-section):** These elements are `aria-hidden="true"` or visible only in the WebGL scene (which is itself decorative for AT purposes). The legend and credits are pure ambient chrome. They do not convey required information not available elsewhere (the same information is in the keyboard-accessible panel and the fallback grid). However, sighted low-vision users who view the scene at normal zoom may struggle to read this text. These are WCAG 1.4.3 failures for those elements that are **visually meaningful but optically low-contrast** for the 20% of users with low vision who are not fully blind.

### Borderline / context-dependent

| Element | Ratio | Notes |
|---------|-------|-------|
| `.project-grid__lede` `rgba(230,236,255,0.65)` on card bg | 7.21:1 | Pass |
| `.project-card__tagline` `rgba(196,212,255,0.65)` on card bg | 5.97:1 | Pass |
| `.eyebrow-marker` `rgba(255,255,255,0.55)` on page bg | 6.28:1 | Pass |
| Footer `rgba(255,255,255,0.5)` on `#0a0a0f` | 5.36:1 | Pass |
| `--color-term-dim` `#6e8e75` on `#050807` | 5.54:1 | Pass (was historically a known concern per `global.css` comment) |
| Projects nav text `#c4d4ff` on nav bg | 13.2:1 | Pass |
| bg-audio toggle text `rgba(196,212,255,0.85)` on `rgba(8,14,22,0.65)` | 9.76:1 | Pass |
| bg-audio loading state `rgba(196,212,255,0.55)` | 4.59:1 | Borderline pass (barely above 4.5:1) |
| `.projects-scene__key-heading` `rgba(196,212,255,0.6)` on panel | 5.23:1 | Pass |
| `.projects-scene__list-heading` `rgba(196,212,255,0.6)` on panel | 5.24:1 | Pass |
| `.projects-scene__list-tagline` `rgba(196,212,255,0.6)` on panel | 5.24:1 | Pass |
| `.projects-scene__key-text` `rgba(230,236,255,0.85)` on panel | 12.08:1 | Pass |

---

## 7. Focus Ring Audit

### Global mechanism
**File:** [`src/styles/global.css:181`](src/styles/global.css#L181)–208

```css
:focus { outline: none; }
:focus-visible {
  outline: 2px solid var(--color-projects-accent);
  outline-offset: 3px;
  border-radius: 4px;
}
body[data-theme='contact'] :focus-visible { outline-color: var(--color-term-green); }
body[data-theme='experience'] :focus-visible { outline-color: var(--color-experience-accent); }
body[data-theme='projects'] :focus-visible { outline-color: var(--color-projects-accent); }
body[data-theme='home'] :focus-visible { outline-color: #ffffff; }
```

The global `:focus-visible` provides a 2 px outline with theme-aware colours. `:focus` is silenced to prevent the double-ring on mouse click. This pattern is correct.

### Components that override outline: none on :focus-visible

| Component | Focus indicator provided | Adequate? |
|-----------|------------------------|-----------|
| [`src/components/BackgroundAudio.astro`](src/components/BackgroundAudio.astro), `bg-audio__toggle:focus-visible` | Border color change + `transform: translateY(-1px)` | **Marginal.** Border changes from ~0.3 opacity to ~0.55 opacity (subtle). No outline ring as backup. The global outline is suppressed by `outline: none` in the component rule. The border color change alone may not meet 3:1 non-text contrast requirement (WCAG 1.4.11) against the dark background. |
| [`src/styles/nav-cards.css`](src/styles/nav-cards.css), `.nav-card:focus-visible` | `transform: translateY(-6px)` + background gradient (`:before` opacity 1) | **Insufficient.** No border-color change on focus-visible (hover gets border-color; focus-visible does not). Transform is suppressed in reduced-motion. The background gradient glow is the only distinguisher, no visible outline ring. Violates WCAG 2.4.11 (Focus Appearance, AA in 2.2). |
| [`src/styles/experience-timeline.css`](src/styles/experience-timeline.css), `.timeline__cta:focus-visible` | `background`, `border-color`, `transform` change | Adequate if border-color change satisfies 3:1 non-text contrast. |
| [`src/styles/projects-scene.css`](src/styles/projects-scene.css), `.projects-scene__list-item:focus-visible` | `background` + `border-color` change (brand-colour border) | Adequate. |
| [`src/styles/terminal.css`](src/styles/terminal.css), `.terminal__output button.copy:focus-visible` | `background: rgba(74,222,128,0.15)` only | **Marginal.** Very low-opacity background, no ring. |
| [`src/styles/terminal.css`](src/styles/terminal.css), `.terminal__input` | `outline: none` (caret managed manually) | Acceptable: the terminal input uses a custom blinking-cursor as the focus indicator, which is the canonical pattern for terminal UIs. |
| [`src/styles/mobile-contact-card.css`](src/styles/mobile-contact-card.css), `.mcc__btn:focus-visible` | Has explicit focus-visible rule | Check passes. |

**Key finding:** `.nav-card:focus-visible` removes the global outline and provides **only** a background gradient glow as the focus indicator. This does not meet WCAG 2.4.11 Focus Appearance (AA): the indicator must have a minimum perimeter equal to the element's CSS perimeter and a minimum contrast of 3:1 against adjacent colours. A translateY movement alone is not a sufficient focus indicator. **Affects the home page NavCards section** (4 navigation cards: Projects, Experience, Contact, and presumably a 4th).

---

## 8. Forms / Terminal Announceable by AT

**File:** `src/components/contact/Terminal.astro`

- The `<form>` has a proper `<label for="terminal-input">` (the prompt label). The input has a supplemental `aria-label` for screen readers that miss the implied label relationship.
- `role="log" aria-live="polite" aria-atomic="false"` on `#terminal-output` ensures each command response is announced as it appears. `aria-atomic="false"` is correct so individual lines are announced separately rather than the entire output re-read.
- The terminal hints panel (`<div class="terminal__hints" aria-hidden="true">`) is decoratively hidden from AT. These are keyboard shortcut reminders that should ideally be discoverable by AT too. Low severity.
- `<noscript>` fallback provides email and GitHub links: compliant.
- **Copy buttons** inside output are `<button>` elements with dynamic `textContent` ("COPY" / "Done" / "Copy failed"). No `aria-label`: the text content is the accessible name. This is correct. The state change announcements rely on text content changes, which assistive technologies will pick up on focus/reread. No live region wraps the copy button, a small gap (screen reader won't auto-announce the state change).

---

## Findings by Severity

### Blockers (WCAG A/AA hard failure, likely user-impacting)

**F-BL1: color-contrast: `.project-card__label`** (WCAG 1.4.3)
- 3.42:1 contrast ratio on "INTEGRATIONS" / "TECH" labels in the mobile fallback grid.
- Affects all 12 routes (same component, same styles), most severely on mobile where the fallback grid is the only visible surface.
- File: [`src/styles/project-grid.css:169`](src/styles/project-grid.css#L169), `color: rgba(196, 212, 255, 0.45)`
- Fix: increase opacity to ≥ 0.65 or use solid `#8090b0`.

**F-BL2: label-content-name-mismatch: Background Audio Toggle** (WCAG 2.5.3)
- Visible text "SOUND ON" / "SOUND OFF" not contained in `aria-label="Toggle background sound"`.
- Breaks voice-control activation ("click sound on" command fails).
- Affects all 12 routes.
- File: [`src/components/BackgroundAudio.astro:45`](src/components/BackgroundAudio.astro#L45)
- Fix: Remove `aria-label` and rely on visible text + `aria-pressed`; or rewrite `aria-label` to include "sound on" / "sound off".

### Majors (WCAG violation or near-miss causing real AT friction)

**F-MA1: Missing page-level `<h1>` in WebGL scene view** (WCAG 1.3.1, 2.4.6)
- On desktop (≥ 861 px, no reduced-motion), `.projects-fallback` has `display: none`. The fallback grid's `<h1>` is hidden. No `<h1>` is present in the accessible DOM for the projects page.
- Screen reader users on desktop navigate by headings and will find no H1 on `/projects`, `/fi/projects`, `/sv/projects`.
- File: [`src/page-content/ProjectsPage.astro`](src/page-content/ProjectsPage.astro), the `<div class="projects-scene">` contains no heading.
- Fix: Add `<h1 class="sr-only">{t.projectsPage.title}</h1>` inside the `.projects-scene` div.

**F-MA2: `.nav-card:focus-visible` insufficient focus indicator** (WCAG 2.4.11 Focus Appearance)
- The home page navigation cards suppress `outline` on `:focus-visible` and provide only a background gradient glow + translate animation (suppressed in reduced-motion). No border-color change, no ring.
- A user navigating the home page by keyboard gets no reliable visual indication of which card is focused when `prefers-reduced-motion` is active.
- File: [`src/styles/nav-cards.css:76`](src/styles/nav-cards.css#L76)–85
- Fix: Add explicit `border-color` accent changes to `:focus-visible` selectors (mirror the `:hover` selectors on lines 90, 100, 110), and remove the `outline: none` so the global ring remains as a fallback.

### Minors (Sub-optimal but not blocking AT use)

**F-MI1: aria-hidden scene chrome: low-contrast text visible to sighted users** (WCAG 1.4.3 partial)
- `.projects-scene__legend` (3.36:1), `.projects-scene__credits` (2.85:1), `.projects-scene__key-section` labels (2.92:1) are below 4.5:1.
- These are `aria-hidden` so they do not fail for AT users, but low-vision sighted users cannot comfortably read the interaction hints.
- Files: [`src/styles/projects-scene.css:47`](src/styles/projects-scene.css#L47), [`src/styles/projects-scene.css:78`](src/styles/projects-scene.css#L78), [`src/styles/projects-scene.css:107`](src/styles/projects-scene.css#L107)–113
- Fix: Raise alpha from 0.4–0.45 to 0.65+ on these specific elements, or use a slightly lighter base colour.

**F-MI2: BackgroundAudio focus ring inadequate on projects/home themes** (WCAG 1.4.11)
- `.bg-audio__toggle:focus-visible` sets `outline: none` and uses only a subtle border-opacity change as the focus indicator. The border change from `rgba(128,168,255,0.4)` to `rgba(128,168,255,0.7)` on the projects page may not meet 3:1 non-text contrast against the dark backdrop.
- File: [`src/components/BackgroundAudio.astro:136`](src/components/BackgroundAudio.astro#L136)–142
- Fix: Remove `outline: none` from the `:focus-visible` rule or add a box-shadow ring as a visible supplement.

**F-MI3: Terminal copy-button state change not announced** (WCAG 4.1.3 Status Messages)
- Copy buttons change text content ("COPY" → "Done" / "Copy failed") but are not wrapped in a live region. Screen readers won't auto-announce the outcome.
- File: [`src/lib/terminal/terminal.ts:83`](src/lib/terminal/terminal.ts#L83)–90
- Fix: Add `aria-live="polite"` to a wrapper element around the copy button, or use `role="status"` on a sibling element that receives the outcome text.

**F-MI4: Terminal hint panel hidden from AT** (WCAG 1.3.1)
- `<div class="terminal__hints" aria-hidden="true">` contains keyboard shortcut documentation (`↑/↓ history`, `tab complete`). These hints are purely visual. A screen reader user has no way to discover these shortcuts via AT.
- File: [`src/components/contact/Terminal.astro:63`](src/components/contact/Terminal.astro#L63)–67
- Fix: Remove `aria-hidden="true"` from the hints panel, or expose the same information via `aria-describedby` on the input field, or add a screen-reader-only `<p>` listing the shortcuts.

**F-MI5: `aria-current="true"` on language switcher links** (WCAG best practice / ARIA 1.2)
- [`src/components/nav/SiteNav.astro:79`](src/components/nav/SiteNav.astro#L79) sets `aria-current="true"` for the active locale link. ARIA 1.2 valid values for `aria-current` on links are `"page"`, `"step"`, `"location"`, `"date"`, `"time"`, or a string. `"true"` is technically valid (generic boolean) but semantically imprecise: the current locale link represents the current location, so `aria-current="location"` or `aria-current="true"` (acceptable but uncommon). Jaws/NVDA handle both; VoiceOver handles `"true"` as "current". Not a hard failure.

### Nits

**F-NI1: `.projects-scene__list-item:focus-visible` suppresses global outline**
- The list items have `outline: none` in the `:focus-visible` rule but substitute an adequate border-color change. The border is visible and sufficient. Minor but noted.
- File: [`src/styles/projects-scene.css:253`](src/styles/projects-scene.css#L253)

**F-NI2: IME compatibility in terminal**
- `keydown` for Tab and Enter fires during IME composition sessions on CJK keyboards, potentially submitting mid-composition text. Not a WCAG failure but affects international users.
- File: [`src/lib/terminal/terminal.ts:101`](src/lib/terminal/terminal.ts#L101)–145
- Fix: Check `e.isComposing` before handling Tab/Enter in the keydown listener.

**F-NI3, No `<noscript>` on `/projects` for wide-screen non-RM browsers**
- If Three.js fails to init on a capable browser (WebGL disabled via flags), the CSS fallback is not shown until JS sets `data-fallback-active`. A `<noscript>` block redirecting to the grid view would close this gap for the no-JS edge case.

**F-NI4: Voiceover audio locale fallback**
- Finnish and Swedish voiceover files (`voice-landing-fi.mp3`, etc.) are absent from `dist/audio/`. The `HeroVoiceover` and `ProjectsVoiceover` components attempt to load locale-keyed files at runtime. FI/SV users get silence (or a 404) instead of audio narration. Not a WCAG violation but degrades the intended experience for those locales.

---

## 9. What This Audit Did Not Cover

- **Real screen-reader testing** (NVDA, JAWS, VoiceOver, TalkBack). All findings are code-analysis-based. AT behaviour can deviate from spec, especially around `aria-modal`, dynamic content, and custom widgets.
- **400% zoom manual verification.** CSS implies no hard breakpoints that would lose functionality, but zoom reflow was not tested end-to-end.
- **Cognitive disability heuristics** (WCAG 2.1 SC 1.3.5 Input Purpose, SC 3.3.* error prevention). The terminal is by nature a command-line interface with no conventional error hints.
- **Mobile AT testing.** The mobile fallback grid was checked in Lighthouse but not tested with TalkBack or VoiceOver on a real device.
- **Color vision deficiency simulation.** Contrast ratios were computed mathematically; no deuteranopia/protanopia palette simulation was run.
- **WCAG 2.2 new criteria 2.4.12 (Focus Not Obscured), 3.2.6 (Consistent Help), 3.3.7/3.3.8 (Accessible Authentication).** None of these appear to be relevant (no auth, no overlapping sticky elements that would block focus), but manual verification was not done.

---

*Audit complete. 0 axe-core violations detected. 2 Lighthouse-identified failures (both confirmed by code analysis), 2 additional majors found by code review, 4 minors, 4 nits.*
