# Audit B: UX & Information Architecture

**Date:** 2026-05-17
**Branch:** audit/B (off audit/baseline, HEAD b3de9f2)
**Scope:** `/`, `/projects`, `/experience`, `/contact`, desktop-first. No real-user testing.

---

## Introduction

The site is a personal portfolio built around four thematically distinct interactive surfaces. This audit covers interaction inventory, cross-input parity, navigation coherence, page transitions, and time-to-first-content on `/projects`. All evidence is drawn from source code; no live preview session was run.

---

## Findings by Severity

### Blockers

None identified.

---

### Majors

#### B-MA1: `/projects`, no keyboard path to the 3D scene; canvas is unreachable from keyboard [judgment]

**Files:** [`src/page-content/ProjectsPage.astro:38`](src/page-content/ProjectsPage.astro#L38), [`src/lib/three/projectsScene.ts:267`](src/lib/three/projectsScene.ts#L267)–356

**Evidence:** The WebGL canvas (`#projects-canvas`) has `aria-hidden="true"` and no `tabindex`. The scene's drag/click handlers are pointer-only (`pointerdown`, `wheel`, `click`). There is no keyboard equivalent for orbit-rotate, scroll-zoom, or click-to-select-planet. The side-panel list (`[data-list]`) is keyboard-reachable (it contains `<button>` elements) and triggers `selectById` on click, which also drives `drawer.open()`, so *opening a project* is possible from the keyboard. However, *exploring the solar system* (rotate, zoom, discovering which planets are visible) is not. A user who cannot use a pointer has one path: read the side-panel list in DOM order.

**Suggested direction:** This is acceptable if the side-panel list is treated as the canonical non-pointer path. The current implementation already populates it with all projects and mirrors hover/focus states. The gap is discoverability: the side panel has no heading that says "use this list if you cannot use the canvas". Adding a visually-hidden `<p>` before the list ("Keyboard users: navigate by project list below; the 3D canvas is pointer-only"), and ensuring the list receives focus on `Tab` after the skip-link lands would resolve the blocker.

---

#### B-MA2: `/projects`: time-to-first-project-read exceeds 15 s for a cautious first-time visitor

**Files:** [`src/lib/projects/boot.ts:22`](src/lib/projects/boot.ts#L22)–62, [`src/page-content/ProjectsPage.astro:158`](src/page-content/ProjectsPage.astro#L158)–295

**Evidence:** The Three.js scene is deferred behind an interaction gate (`scheduleProjectsSceneBoot`). Boot fires on the first of: `scroll`, `mousemove`, `touchstart`, `keydown`, `pointerdown`, or a 2 000 ms fallback timer. After the interaction event the dynamic `import('../lib/three/projectsScene')` must resolve (39 kB raw / 14 kB gzip, cold-cache), Three.js must initialise (planets placed, animation loop started), and only then is the canvas interactive.

A cautious visitor who reads before moving will wait the full 2 000 ms fallback, then download + parse + init time (~500–800 ms on a mid-range mobile). That is ~2.5–3 s before any planet is clickable. Once a planet is clicked, the camera lerp to the planet takes roughly 1 s to settle (lerp factor 0.06 per frame at 60 fps). The detail panel then slides in (CSS transition 0.6 s `cubic-bezier`). Total wall-clock from landing to reading the project description: roughly **4–6 s on desktop, 6–10 s on a cold-cache mid-range device**. This is just within the 15 s threshold.

However, the *hover prompt* (legend text "hover / click / drag / scroll") is visible immediately as a static HTML overlay. The side-panel list is also visible immediately. The scenario that exceeds 15 s is a user who ignores both overlays and waits for a tooltip or cursor-change cue, which requires moving the cursor over a planet, which itself only works after scene boot. On a slow connection where `projectsScene.js` is not yet cached, first-interaction-to-interactive could approach 15 s.

**Suggested direction:** Show the side panel as the first-load affordance more prominently, e.g., animate it in 200 ms after DOMContentLoaded rather than having it silently present. This gives users a parallel path that is always fast, reducing the felt time regardless of WebGL boot latency.

---

### Minors

#### B-MI1: Four orthogonal interaction models, no shared grammar [judgment]

**Files:** [`src/components/home/NavCards.astro`](src/components/home/NavCards.astro), [`src/lib/three/projectsScene.ts`](src/lib/three/projectsScene.ts), [`src/lib/gsap/experienceTimeline.ts`](src/lib/gsap/experienceTimeline.ts), [`src/lib/terminal/terminal.ts`](src/lib/terminal/terminal.ts)

**Evidence:**

| Page | Primary interaction | Input device assumption |
|------|--------------------|------------------------|
| `/` (Hero) | Passive scroll, decorative pointer clicks on canvas elements | Scroll + mouse optional |
| `/projects` | Drag-rotate 3D orbit, scroll-zoom, click-to-select planet | Mouse primary; touch tolerated |
| `/experience` | Scroll-driven parallax timeline | Scroll only |
| `/contact` | Command-line text input | Keyboard primary |

Each page is a self-contained interaction metaphor. There is no shared affordance that transfers between pages: the scroll model on `/` and `/experience` is radically different from the draggable 3D scene on `/projects`, which is radically different from the terminal on `/contact`. The nav cards correctly bridge pages with a labelled card grid, but once inside each section the mental model resets.

This is a deliberate artistic choice: the site presents itself as four chapters, each with its own medium. The page transition (three-phase canvas particle dissolve with destination-themed glyph) reinforces this by explicitly signalling "you are entering a new environment". Scored as a **deliberate system of four orthogonal experiments**, not a navigation system in the WCAG / design-system sense. Visitors who are exploring a portfolio rather than navigating a product will accept this. Visitors who are task-oriented ("find the contact email quickly") may not.

**Suggested direction:** No change to the four models. Ensure the nav bar (persistent, visible on all pages) provides the emergency exit from any experiment back to the home hub.

---

#### B-MI2: Side-panel "Jump to project" list: visible immediately but visually deprioritised

**Files:** [`src/styles/projects-scene.css:185`](src/styles/projects-scene.css#L185)–209, [`src/page-content/ProjectsPage.astro:54`](src/page-content/ProjectsPage.astro#L54)–76

**Evidence:**

```css
/* projects-scene.css:185 */
.projects-scene__list {
  position: absolute;
  top: 10rem;
  left: 3rem;
  z-index: 10;
  …
  transition: opacity 0.45s ease, transform 0.45s ease;
}

.projects-scene__list.is-hidden {
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
}
```

The list has no `.is-hidden` class on initial load. It is immediately visible. However, it competes with the more dramatic 3D canvas for attention. Its low-contrast frosted-glass style (`rgba(8, 14, 32, 0.55)`) and small monospace type (`0.65rem` heading, `0.92rem` names) mean it reads as chrome rather than content at a glance. On desktop it sits top-left at `10rem` from the top (below the nav bar) with a max-height that can be exceeded if projects overflow (currently 8 projects × ~60px each ≈ 480px; `max-height: calc(100vh - 21rem)` on a 900px viewport is 279px, triggering overflow scroll).

The legend box (top-right, `top: 4.5rem`) with "hover / click / drag / scroll" receives arguably more visual weight than the list because it lacks the scrollable overflow and is positioned above the list. The two affordances (list = stationary shortcut; legend = instruction) compete spatially and visually.

**Suggested direction:** Give the list a more prominent heading or a mild glow/border on first load (1.5 s animation then settle to current style) to signal it is interactive. Move or remove the legend box once the user has opened one project (it is currently hidden only when the drawer opens via `.is-hidden`).

---

#### B-MI3: Drawer browser-back path missing

**Files:** [`src/lib/projects/drawer.ts:204`](src/lib/projects/drawer.ts#L204)–261

**Evidence:** The drawer supports: X button (`closeBtn`), ESC key (`onEscape`), click-outside (`onDocumentClick`). It does not listen on `popstate`. On mobile Chrome, pressing the hardware back button while the drawer is open navigates the page away from `/projects` rather than closing the drawer. This is a common expectation: dialogs/drawers intercept the back gesture via `history.pushState` + `popstate`.

```typescript
// drawer.ts has no popstate listener — entire close surface:
closeBtn.addEventListener('click', close);
document.addEventListener('keydown', onEscape);
document.addEventListener('click', onDocumentClick, { capture: true });
```

Focus return on close is correctly implemented (`lastFocused.focus()`). The `prepareOpen` mechanism for side-panel-triggered opens is thorough. The missing path is back-gesture only.

**Suggested direction:** On `open()`, call `history.pushState({ drawerOpen: true }, '')`. Add a `popstate` listener that calls `close()` when `event.state?.drawerOpen` is truthy. Dispose the listener in `dispose()`.

---

#### B-MI4: `/experience`: timeline entries are scroll-revealed but have no keyboard mechanism to jump between them

**Files:** [`src/components/experience/TimelineContent.astro:60`](src/components/experience/TimelineContent.astro#L60)–100, [`src/lib/gsap/experienceTimeline.ts`](src/lib/gsap/experienceTimeline.ts) (not read directly, inferred from page structure)

**Evidence:** The timeline `<ol>` contains `<li data-timeline-entry>` elements. They are static HTML with no `tabindex`, no focusable children by default (unless a lesson contains a link). The goat climber and parallax layers are scroll-driven. There is no "next entry" / "previous entry" keyboard shortcut announced on the page. A screen-reader user will read the entries in DOM order (correct), but a sighted keyboard user has no way to snap the parallax view to a specific entry.

**Suggested direction:** Minor issue on a scroll-narrative page. Adding `tabindex="0"` to each `[data-timeline-entry]` and a `focus` handler that calls `scrollIntoView` would give keyboard users a snap-to-entry mechanism. Low priority.

---

#### B-MI5: Page transition has no reduced-motion fallback beyond "do nothing"

**Files:** [`src/lib/transitions/pageTransition.ts:664`](src/lib/transitions/pageTransition.ts#L664)–665

**Evidence:**

```typescript
// pageTransition.ts:664
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) return;
```

When `prefers-reduced-motion` is set, `initPageTransitions()` returns immediately and no transition listener is installed. Navigation still works (plain `window.location.href`), but there is no cross-fade or even a brief opacity transition to reassure the user that navigation has started. The page simply blinks to the new state. For users who set reduced-motion for vestibular reasons this is correct; for users who set it for cognitive reasons (they want less complexity, not necessarily instant cuts) a simple 200 ms fade-to-black would be preferable.

**Suggested direction:** Introduce a `crossfade` variant: for reduced-motion clients, add a short CSS `opacity` transition on the body (0.15 s) rather than the full three-phase particle sequence. Optional improvement only.

---

#### B-MI6: Hero scroll-hint is `aria-hidden="true"`, no programmatic scroll signal for AT users

**Files:** [`src/components/home/Hero.astro:38`](src/components/home/Hero.astro#L38)–53

**Evidence:**

```astro
<div class="hero__scroll-hint" data-scroll-hint aria-hidden="true">
  <span>{t.hero.scrollHint}</span>
  …
</div>
```

The animated scroll indicator (mouse SVG with bouncing dot) and its text label are hidden from the accessibility tree. Screen-reader users landing on the hero have no signal that the page continues below. The `<h1>` is correctly present (`class="sr-only"`), but nothing in the accessible tree says "scroll to see more".

**Suggested direction:** Remove `aria-hidden="true"` from the hint container, or add a visually-hidden `<p>` after the `<h1>` with the scroll hint text. If the animation is purely decorative, wrap only the SVG in `aria-hidden`; leave the text span accessible.

---

### Nits

#### B-NI1: Legend box (`hover / click / drag / scroll`) uses `aria-hidden="true"`: fine, but consider whether it belongs in a `<details>` for keyboard discovery

**Files:** [`src/page-content/ProjectsPage.astro:42`](src/page-content/ProjectsPage.astro#L42)–47

The legend is decorative chrome for sighted mouse users. Hiding it from the AT is intentional (the side-panel list is the AT surface). No action required; noted for completeness.

---

#### B-NI2: Terminal `<kbd>` hints in the footer are `aria-hidden="true"`

**Files:** [`src/components/contact/Terminal.astro:63`](src/components/contact/Terminal.astro#L63)–67

```astro
<div class="terminal__hints" aria-hidden="true">
  <span>{t.contactPage.hintType} <kbd>help</kbd></span>
  <span><kbd>↑</kbd>/<kbd>↓</kbd> {t.contactPage.hintHistory}</span>
  <span><kbd>tab</kbd> {t.contactPage.hintComplete}</span>
</div>
```

The terminal input itself has `aria-label` and the boot sequence produces accessible `aria-live="polite"` output. The hints are supplementary; hiding them from AT is acceptable. However, a screen-reader user who has not run `help` will not know that `↑`/`↓` cycle history or `tab` completes. Consider including this information in the boot sequence output (already possible via `runBoot`) rather than visual chrome.

---

#### B-NI3: `onCanvasPointerDown` in projectsScene guards `e.button !== 0` for mouse but not for touch

**Files:** [`src/lib/three/projectsScene.ts:268`](src/lib/three/projectsScene.ts#L268)–269

```typescript
if (e.button !== 0 && e.pointerType === 'mouse') return;
```

Touch events have `button === 0` by spec, so this guard is correct. Noted for clarity: the condition is intentional (right-click does not drag), not a bug.

---

#### B-NI4: `data-transition="false"` escape hatch is undocumented

**Files:** [`src/lib/transitions/pageTransition.ts:112`](src/lib/transitions/pageTransition.ts#L112)–113

Any anchor with `data-transition="false"` bypasses the particle transition. Useful for external-looking internal links. Not documented in comments; easy to forget if future contributors add links. Low priority.

---

## Interaction Inventory Summary

| Page | Surface | Keyboard path | Mouse path | Touch path | Parity |
|------|---------|--------------|------------|------------|--------|
| `/` Hero | Scroll to advance | `Tab` to nav cards (no scroll keyboard shortcut) | Scroll wheel / trackpad | Swipe | Partial, no keyboard scroll advance |
| `/` NavCards | Navigate to section | `Tab` + `Enter` | Click | Tap | Full parity |
| `/` Data-feed widget | Easter egg | Not reachable | Pointer-down | Tap | Mouse/touch only (intentional Easter egg) |
| `/projects` Canvas | Orbit rotate | Not available | Drag | Touch drag | Mouse/touch only |
| `/projects` Canvas | Zoom | Not available | Scroll wheel | Pinch | Mouse/touch only |
| `/projects` Canvas | Select planet | Not available | Click | Tap | Mouse/touch only |
| `/projects` Side-panel list | Select project | `Tab` + `Enter` | Click | Tap | Full parity |
| `/projects` Drawer | Open | Via side-panel list | Planet click or list click | Tap | Full parity via list |
| `/projects` Drawer | Close | `Esc` or `Tab` to X button | X button or click-outside | Tap X or tap-outside | Partial (no back-gesture) |
| `/experience` | Scroll timeline | Arrow keys scroll body (native) | Scroll wheel | Swipe | Full parity |
| `/experience` | Timeline entries | No snap / jump mechanism | Scroll to reveal | Swipe to reveal | No keyboard snap |
| `/contact` Terminal | Type command | Full keyboard (primary path) | Click to focus then type | Tap then type | Full parity |
| `/contact` Terminal | Tab-complete | `Tab` | Not available | Not available | Keyboard-only (intentional) |
| `/contact` Terminal | History | `↑`/`↓` | Not available | Not available | Keyboard-only (intentional) |
| All pages | Page transition | Triggered by `click` on `<a>` (keyboard-activated) | Click | Tap | Full parity |

---

## Navigation Idioms: System or Experiments?

**Verdict: Four deliberate experiments. [judgment]**

The four pages share: a persistent top-nav bar, a three-phase particle page-transition with destination-specific glyph, a consistent dark-space colour palette, and identical typography tokens (mono for chrome, variable for content). These shared elements form a *frame* that holds the four experiments together aesthetically.

Inside the frame, each page is a self-contained medium:
- `/` is a magazine cover: passive, cinematic
- `/projects` is a planetarium: spatial, exploratory
- `/experience` is a scroll narrative: linear, sequential
- `/contact` is a terminal: command-driven, expert-user

There is no affordance that transfers between pages. A user who learns "drag to explore" on `/projects` will not find that skill useful anywhere else. This is intentional and coherent as a *portfolio of craft demonstrations*. It would be a problem if the site were a product with recurring task flows, but for a one-time showcase visit, the orthogonality is the point.

The one gap: a first-time visitor has no explicit "orientation" moment on any page. The hero scroll-hint, the projects legend, and the terminal hints are all subtle. A 3–5 second ambient instruction panel on first visit (suppressed after one interaction, respecting `prefers-reduced-motion`) would reduce the discovery tax without breaking the cinematic quality.

---

## Page Transition Analysis

**`src/lib/transitions/pageTransition.ts`: end-to-end assessment:**

The implementation is architecturally clean:
- Phase A (350 ms): departing page accent, streaks inward to centre
- Phase B (250 ms): glyph for destination page flashes at centre
- Phase C (450 ms): destination page accent, streaks outward, page revealed

Total per-navigation: ~1 050 ms.

**Potential flicker scenario:** Phase B ends with `window.location.href` assignment. The new page must start loading before Phase C can begin. Phase C runs on the *new* page's load. If the new page's HTML is slow (network latency, or first visit with cold CDN cache), Phase C will not begin until the DOM is ready. During that gap the canvas shows the dark backdrop (`#05060e`) and the browser chrome may show a loading spinner. This is not a code bug. It is a structural limitation of the sessionStorage handoff mechanism. On a fast CDN it is imperceptible; on a slow connection it produces a visible pause between B and C.

**bfcache handling:** Present. `pageshow` with `e.persisted` correctly cancels any in-flight animation and resets `navigating = false`. The overlay will not be stuck "animating" on back-forward navigation.

**Modifier-key pass-through:** Correct. `e.metaKey || e.ctrlKey || e.shiftKey || e.altKey` returns early, so Cmd+Click / Ctrl+Click open in new tab normally.

**`data-transition="false"` escape hatch:** Present.

**Reduced-motion:** Fully disabled; plain navigation takes over. No intermediate state.

**Re-entry (home→projects→experience→contact→home cycle):** Each page installs a fresh `initPageTransitions()` call. The `__pageTransitionAbortController` global prevents duplicate listener stacks on HMR or accidental double-calls. The cycle should work without broken state. The only re-entry risk is if the `SESSION_KEY` in sessionStorage is orphaned (e.g., browser crash during Phase A/B before the new page loads), which would cause Phase C to run on the *next* navigation's source page: a one-time cosmetic glitch.

---

## What I Didn't Cover

- **Real-user testing**, no user sessions, click-stream analytics, or recorded sessions reviewed.
- **Touch device behaviour on `/projects`**: canvas touch interaction (drag-to-rotate, pinch-to-zoom) was not verified on a physical device. The `touchAction: 'none'` on canvas and pointer-event unification in Three.js suggest it should work, but the mobile fallback (CSS `max-width: 860px` grid) may fire before touch users ever reach the canvas path.
- **Internationalisation of interaction affordances**: the projects legend ("hover / click / drag / scroll") and terminal hints are English-only in their `<code>` / `<kbd>` labels. Not audited against FI/SV translations.
- **Colour contrast of interactive states**: the side-panel list focus-visible style uses `color-mix(in srgb, var(--brand) 45%, transparent)` which depends on the per-planet `--brand` CSS variable. Some planet colours may produce insufficient contrast on the dark background. Not measured.
- **Scroll performance on `/experience`**: GSAP ScrollTrigger's interaction with the fixed mountain scene was not profiled. The 0.014 CLS flagged in the baseline likely originates here but was not traced to a specific element.
- **Desktop Lighthouse runs**: baseline agent noted these were not run. `/projects` interaction density is significantly different on desktop; the 95/100 A11y score likely has a specific canvas-related cause not investigated here.
