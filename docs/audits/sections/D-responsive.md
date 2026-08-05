# Audit D: Responsive & Cross-Device

**Date:** 2026-05-17
**Branch:** audit/D (off audit/baseline)
**Auditor:** Agent D (static CSS analysis, no real-device rendering)

---

## 1. Breakpoint Inventory

All `@media` width/height queries found across `src/styles/**` and `src/components/**`:

| Breakpoint value | Files / locations | Count | Orphan? |
|---|---|---|---|
| `max-width: 640px` | `mobile-contact-card.css:8`, `terminal.css:347`, `Hero.astro:108`, `Hero.astro:188`, `BackgroundAudio.astro:257` | 5 | No, used in multiple files |
| `max-width: 720px` | `project-detail.css:239`, `Focus.astro:158`, `Intro.astro:181`, `Velocity.astro:158`, `Integrations.astro:146` | 5 | No |
| `max-width: 860px` | `nav-cards.css:154`, `projects-scene.css:405`, `projects-scene.css:452`, `BaseLayout.astro:197`, `Hero.astro:320` | 5 | No |
| `max-width: 1100px` | `projects-scene.css:385` | 1 | **YES, orphan** |
| `max-height: 600px` + `orientation: landscape` | `Hero.astro:334` | 1 | **YES, orphan** (landscape-specific) |
| `prefers-reduced-motion: reduce` | numerous files | ~12 | n/a, not a width breakpoint |

### Breakpoint summary

Three width tiers are used consistently: **640 px**, **720 px**, **860 px**.

- **640 px**: phone/mobile gate: contact card swap, hero canvas/fallback swap, audio button repositioning.
- **720 px**: intermediate "tablet portrait" layout adjustments for home-page sections (stats grids stack, project-detail drawer goes full-width).
- **860 px**: "mid" breakpoint: nav-cards 3-col → 1-col, site-footer stacks, hero corners hidden, projects scene → fallback grid.
- **1100 px**: used **once** in `projects-scene.css` to shrink the keyboard overlay panel. This breakpoint is not shared with any other rule.
- **`max-height: 600px + landscape`**: used **once** in `Hero.astro` to lift the masthead on landscape phones. No height breakpoints elsewhere.

**Inconsistency noted:** 720 px is used in five component files for mid-layout adjustments but never for the major scene/canvas gates (those use 640 and 860). The three effective tiers (640/720/860) are coherent but undocumented as a design system. A developer reading only one file cannot infer all three.

---

## 2. Coverage at Target Viewports

Legend: [OK] = no concern identified | [WARN] = potential issue | [CRIT] = likely broken

### Home (`/`)

| Width | Active rules | Assessment |
|---|---|---|
| 320–414 px | `max-width: 640px` active: hero canvas hidden, fallback title shown (`clamp(3rem, 13vw, 9rem)`); hero corners hidden; audio button repositioned; Three.js scene skipped (JS gate). NavCards grid is still 3-col (860 threshold not yet hit). | [WARN] NavCards grid is `repeat(3,1fr)` at 320 px, cards are ~90 px wide each. Content likely overflows or wraps poorly. See §3. |
| 480 px | Same as above | [WARN] NavCards still 3 columns at 480 px |
| 640–767 px | `max-width: 640px` still active at exactly 640 (max-width is inclusive). Home sections (Intro, Velocity, Focus, Integrations) collapse at 720. NavCards at 680 px still 3 columns. | [WARN] 640–860 px gap: NavCards grid never collapses, `@media (max-width: 860px)` is where it goes to 1-col. At 640–859 px (typical tablet portrait) the three wide cards in a 640-wide viewport are ~190 px each, workable but tight. |
| 768–859 px | `max-width: 640px` inactive; three-col NavCards layout active. Home section grids already collapsed (720 threshold). | [OK] |
| 860–1023 px | `max-width: 860px` active: NavCards 1-col, footer stacks, hero corners hidden, projects fallback shown. | [OK] for home. |
| 1024–1920 px | Full desktop layout. | [OK] |

### Projects (`/projects`)

| Width | Active rules | Assessment |
|---|---|---|
| ≤860 px | `max-width: 860px`: scene hidden, fallback grid shown, key/list panels hidden, body overflow restored. JS gate (`isSmall = matchMedia('max-width: 860px')`) matches CSS gate. | [OK], CSS and JS are in sync. Fallback grid (`project-grid`) uses `repeat(auto-fill, minmax(320px, 1fr))`, at 375 px this produces a single column (375 < 320+padding). |
| 320–374 px | Fallback grid: single card column, but `project-grid` has `padding: 7rem 1.5rem 4rem`, at 320 px the content area is 320 - 48 = 272 px. Cards have `padding: 1.75rem` both sides (56 px), leaving ~216 px of text. Tight but likely not clipped. | [WARN] 320 px is right at the edge; long project names or tech tag rows may overflow. |
| 861–1100 px | Scene active; key/list panels at reduced size (1100 threshold). | [OK] |
| >1100 px | Scene active; full-size panels. | [OK] |

### Experience (`/experience`)

| Width | Active rules | Assessment |
|---|---|---|
| ≤640 px | No explicit breakpoints in `experience-timeline.css`, the timeline has no mobile-specific layout changes. `timeline` uses `max-width: 760px; padding: 0 1.5rem`, at 375 px the content area is 342 px. Grid is `grid-template-columns: 32px 1fr`, the 32 px marker column is fixed; body text gets 342 - 32 - 24 (gap) = ~286 px. Workable. | [OK] but see legibility §4. |
| 860–1023 px | Single-column timeline, no grid. | [OK] |

### Contact (`/contact`)

| Width | Active rules | Assessment |
|---|---|---|
| ≤640 px | CRT terminal (`display: none`), MobileContactCard (`display: block`). MCC card is `width: 96vw; max-width: 560px`. At 320 px: card is 307 px wide. | [OK] |
| 641–1024 px | Desktop CRT terminal shown; `width: min(960px, 92vw)`. At 641 px: 92vw = 590 px. Terminal is appropriately sized. | [OK] |

---

## 3. Tap-Target Sizes

iOS HIG minimum: 44 × 44 pt (roughly 44 CSS px on standard density).

### `.bg-audio__toggle` ([`src/components/BackgroundAudio.astro:114`](src/components/BackgroundAudio.astro#L114)–134)

Default (desktop): `padding: 0.55rem 1rem 0.55rem 0.7rem`. Vertical padding = 1.1rem ≈ 17.6 px. Combined with an inline-flex with a 20 px icon, total height ≈ 20 + 17.6 = ~38 px. **Below 44 px.**

At `max-width: 640px` ([`src/components/BackgroundAudio.astro:257`](src/components/BackgroundAudio.astro#L257)–265): `padding: 0.5rem 0.85rem 0.5rem 0.65rem`. Vertical = 1rem ≈ 16 px. Height ≈ 20 + 16 = **~36 px: below 44 px minimum on mobile where it matters most.**

### Nav links: [`src/components/nav/SiteNav.astro:58`](src/components/nav/SiteNav.astro#L58)

Tailwind classes: `px-4 py-3 sm:px-3 sm:py-1.5`. On mobile (`< sm` / below Tailwind's 640 px breakpoint): `py-3` = 0.75rem = 12 px vertical padding each side → total height ≈ 12 + 12 + line-height. Font is `text-xs` (0.75rem / 12 px) with `line-height: ~1.5` = 18 px. Total ≈ 42 px. **Just under the 44 px threshold.**

On `sm:` (≥640 px): `py-1.5` = 0.375rem = 6 px each side → height ≈ 12 + 30 px? Wait: at sm the intent is the desktop version so this is less of a concern; sm breakpoint aligns with the phone boundary.

### Language switcher links: [`src/components/nav/SiteNav.astro:81`](src/components/nav/SiteNav.astro#L81)

Classes: `px-3 py-2 sm:px-2 sm:py-1`. On mobile: `py-2` = 0.5rem = 8 px each side. Height ≈ 8 + 8 + 12 = **28 px: significantly below 44 px.** These are tappable locale-switch links inside the nav pill. [CRIT] for touch accessibility.

### `.project-detail__close` ([`src/styles/project-detail.css:36`](src/styles/project-detail.css#L36)–53)

`width: 2.5rem; height: 2.5rem` = **40 × 40 px**. Below 44 × 44 px. However this element only appears when the projects 3D scene is active (>860 px), so it is not reachable on phones.

### `.mcc__btn` ([`src/styles/mobile-contact-card.css:237`](src/styles/mobile-contact-card.css#L237)–260)

`min-height: 56px`: well above the 44 px minimum. [OK]

### `timeline__cta` ([`src/styles/experience-timeline.css:658`](src/styles/experience-timeline.css#L658)–675)

`padding: 0.85rem 1.5rem` = 13.6 px vertical each side, total ≈ ~44 px at 1rem = 16 px base. Borderline but likely OK. Not a concern.

---

## 4. Text Legibility on Mobile

Checking `font-size` values inside or applying to body/paragraph text at `≤640 px`:

### Global `.eyebrow-marker` (global.css:62–66)

`font-size: 0.72rem` = 11.5 px. This is a labeling element (uppercase eyebrow), not body text. Acceptable for chrome.

### `terminal__screen` font-size (terminal.css:151)

`font-size: clamp(0.85rem, 1.6vw, 0.95rem)`. At 375 px: `1.6vw` = 6 px, so `clamp` floor = **0.85rem = 13.6 px**. This is the main content area of the CRT terminal. **Below 16 px for body text.** However the CRT terminal is hidden at ≤640 px (`.crt { display: none }`) and replaced by MobileContactCard where `.mcc__screen { font-size: 0.85rem }` = also **13.6 px**.

The MCC font is the same size and is shown to mobile users as the primary contact experience. This is 13.6 px for the terminal output text: below the 16 px threshold. [WARN], it's intentional for terminal aesthetics, but real email addresses and links shown in this "screen" may be hard to read on small phones.

### `projects-scene__list-tagline` (projects-scene.css:289–293)

`font-size: 0.7rem` = 11.2 px. Inside the `.projects-scene__list` which is hidden at ≤860 px. No mobile impact.

### `timeline__body` (experience-timeline.css:350–355)

`font-size: 0.96rem` = 15.4 px. Body text of the main timeline content. **Marginally below 16 px** for body copy at all viewport sizes, no `@media` override to increase this on mobile. [WARN]

### `project-card__description` (project-grid.css:114–119)

`font-size: 0.92rem` = 14.7 px. This is the mobile fallback grid card's body text (shown at ≤860 px). **Below 16 px.** [WARN]

### `nav-card__desc` (nav-cards.css:133–137)

`font-size: 0.9rem` = 14.4 px. Shown on home page. At ≤860 px cards stack to 1-col, text size unchanged. [WARN]

---

## 5. Existing Mobile Fallback Paths

### 5a. `HomePage.astro:117`: `skipScene` gate

```
const isSmall = window.matchMedia('(max-width: 640px)').matches;
const skipScene = !canvas || reducedMotion || isSmall;
```

When `skipScene` is true: the Three.js home canvas is not imported; the hero shows the flat CSS `hero__title-fallback` (`display: block` via `@media (max-width: 640px)`). The rest of the home page (Intro, Focus, Velocity, Integrations, NavCards sections) renders identically. They are pure HTML/CSS with no canvas dependency. The GSAP scroll animations still run.

**Assessment:** The fallback replaces only the 3D hero type. All content sections below the hero remain; the experience is degraded in terms of visual richness (no 3D wordmark, no galaxy) but functionally complete. The scroll-triggered section animations (GSAP SplitText reveals) still execute since they are not gated on the scene flag. No dead ends for the user.

### 5b. `ProjectsPage.astro:182`: `isSmall` matchMedia

```
const isSmall = window.matchMedia('(max-width: 860px)').matches;
if (reducedMotion || isSmall || !sceneRoot) {
  // CSS @media rules already hide the scene and show the fallback grid
  sceneRoot?.setAttribute('data-fallback-active', 'true');
  fallback?.setAttribute('data-active', 'true');
  return;
}
```

The JS gate matches the CSS gate (both use 860 px). On small screens: the Three.js scene never initialises; the fallback grid (`ProjectGrid`) is revealed. The `[data-fallback-active]` attribute on the scene root and `[data-active]` on the fallback duplicate what CSS already does. They are a belt-and-suspenders for JS observers and future code. The project drawer detail (`ProjectDetail` component) also becomes inaccessible. Its JS code is never wired since `sceneHandle` is null. The fallback grid shows cards with static links (`project-card__link`) that link to live/repo URLs directly.

**Assessment:** The fallback is a complete static grid. There is no way to open the drawer/detail panel in the fallback path. It is simply absent. This is intentional (drawer was designed for the 3D scene). Users on mobile get project names, taglines, descriptions, highlights, and external links: the same information minus the immersive scene. Functionally complete.

### 5c. `projects-scene.css:405–430` + `452–459`: `.projects-scene__key`, `.projects-scene__list { display: none }`

```css
@media (max-width: 860px) {
  .projects-scene__key,
  .projects-scene__list {
    display: none;
  }
  /* … body overflow + site-footer restoration … */
}

@media (max-width: 860px) {
  .projects-scene { display: none; }
  .projects-fallback { display: block; }
}
```

The fallback grid becomes the only visible surface. The 3D scene canvas, the keyboard overlay, and the project list panel are all hidden. The site-footer (hidden on desktop projects by `body[data-theme='projects'] .site-footer { display: none }`) is restored.

**Assessment:** The CSS fully replaces the desktop experience at ≤860 px. Nothing is merely hidden while leaving a degraded version: the entire scene element is `display: none`, not just transparent. The footer restoration is explicit. No orphaned interactive elements remain visible. **This is a well-executed dual-surface pattern.**

---

## 6. iOS Safe-Area (`env(safe-area-inset-*)`)

**`viewport-fit=cover` IS declared** in `BaseLayout.astro:44`:
```
content="width=device-width, initial-scale=1, viewport-fit=cover"
```

This means content can extend under the iPhone notch/Dynamic Island and the home indicator bar. Safe-area insets are therefore necessary for any fixed-position chrome.

### Usage found

- **`SiteNav.astro:118`** (`top: calc(env(safe-area-inset-top, 0px) + 1rem)`) the navigation correctly respects the notch. [OK]

### Missing safe-area insets

- **`.bg-audio` (BackgroundAudio.astro:97–102)**: `position: fixed; bottom: 2rem; left: 2rem`. At mobile (`≤640 px`): repositioned to `bottom: 1.25rem; left: 1.25rem`. **No `env(safe-area-inset-bottom)` or `env(safe-area-inset-left)`.** On iPhone with a home indicator, the bottom safe area is ~34 px. At `bottom: 1.25rem` = 20 px, the audio button will be **partially obscured by the iOS home indicator swipe bar**. [CRIT]

- **`.projects-scene__legend` (projects-scene.css:37–49)**: `position: absolute; bottom: 5.5rem; left: 3rem`. Absolute within the scene container (which is `position: relative; height: 100vh`). No safe-area compensation. However this element is only shown on desktop (hidden at ≤860 px), so this is a non-issue for phones.

- **`.projects-scene__credits` (projects-scene.css:65–80)**: `position: absolute; bottom: 1.75rem; right: 2rem`. Desktop only; same conclusion.

- **`.bg-audio` bottom-left**: main concern above.

- **`SiteNav` bottom edge**: nav is at the top, so bottom safe-area is irrelevant.

**Summary:** Only the audio toggle button lacks safe-area compensation at the bottom on mobile. The nav correctly compensates at the top.

---

## 7. URL-Bar Collapse / Viewport Height

### `100vh` usages

| File | Line | Selector | Impact |
|---|---|---|---|
| `terminal.css:5` | `.crt { min-height: 100vh }` | CRT background fills at least the screen. URL-bar collapse would briefly show a gap at the bottom, minor aesthetic issue since `min-height` will grow, not jump. On mobile the CRT is `display: none` anyway (≤640 px). [LOW] |
| `mobile-contact-card.css:12` | `.mcc { min-height: 100vh }` | MCC background, same as above. On first paint the background may not reach the bottom when the URL bar is visible; as user scrolls (URL bar collapses) the background "catches up" due to `min-height`. Could reveal `body` background briefly. [WARN] |
| `project-detail.css:8` | `.project-detail { height: 100vh }` | The project drawer is `position: fixed; height: 100vh`. On mobile Safari the drawer height would be pegged to the initial viewport (URL bar visible), if the URL bar collapses after open, the drawer has empty space at the bottom, or if already collapsed it is clipped at the top. However, the drawer only appears at >860 px (desktop scene), where URL-bar collapse is not a concern. [LOW] |
| `projects-scene.css:7` | `.projects-scene { height: 100vh }` | Three.js canvas container. Desktop only (≤860 px hides it). [LOW] |
| `projects-scene.css:192` | `max-height: calc(100vh - 21rem)` | `.projects-scene__list`, desktop only. [LOW] |
| `experience-timeline.css:17` | `.timeline__header { min-height: 100vh }` | The experience hero section, this IS shown on mobile. On iPhone, the first "screen" of the timeline is sized to the CSS viewport (with URL bar visible). The section will not quite fill the visible viewport when the URL bar is present. This could make the "scroll down" hint appear prematurely visible just below the fold. [WARN] |
| `Hero.astro:83` | `hero { height: 100vh }` | Main home hero. On mobile Safari the hero is exactly 100vh (including URL bar height). When the URL bar collapses after the user starts scrolling, the next section is revealed, this is the desired behavior. However, on first load the hero may appear shorter than "full screen" because `100vh` is measured with the URL bar visible on some browsers. [WARN, JUDGMENT CALL] |

### `dvh` usages (good)

| File | Line | Selector | Notes |
|---|---|---|---|
| `terminal.css:85` | `.terminal { height: calc(100dvh - ...) }` | Uses `dvh`, accounts for URL-bar collapse correctly. **Best practice implemented.** |
| `terminal.css:88` | `.terminal { margin: clamp(5rem, 12dvh, 9rem) ... }` | Also uses `dvh`. |

**Summary:** The terminal (desktop only) correctly uses `dvh`. The hero and MCC use `100vh` which can cause subtle sizing issues on mobile Safari, but the hero's `100vh` behavior is standard and the visual impact is minimal (it's a landing screen, not a fixed dialog). The MCC `min-height: 100vh` gap is a cosmetic issue.

---

## 8. Landscape Phone + iPad

### Hero landscape override

`Hero.astro:334`:
```css
@media (max-height: 600px) and (orientation: landscape) {
  .hero__masthead,
  .hero__corner--tl,
  .hero__corner--tr {
    top: 1.5rem;
  }
}
```

This moves the masthead from `top: 7.5rem` to `top: 1.5rem` when the viewport is short and landscape. Protects the hero eyebrow/subtitle from overlapping the 3D type on landscape phones. **This breakpoint exists and is correct.**

However, on landscape phones (≤640 px wide in portrait → ≤360 px tall in landscape):

- The Three.js home scene is skipped (`isSmall = matchMedia('max-width: 640px')`). Wait: in landscape, a 667×375 iPhone SE has **width = 667 px > 640 px**, so `isSmall` is **false** and the Three.js scene WILL attempt to load on a landscape iPhone SE. The 3D hero canvas (`height: 100vh`) would be 375 px tall, the masthead is shifted to 1.5rem which is correct, but the scroll hint at `bottom: 2.5rem` might overlap with the audio button at `bottom: 1.25rem` (14 px gap). [WARN]

- The nav-cards grid at 667 px stays 3-col (860 px threshold not met). Three columns at 667 px = ~186 px each minus gaps. This is tight for card labels and descriptions. [WARN]

- **iPad portrait (768 px):** `max-width: 640px` rules inactive; `max-width: 720px` adjusts section grids; `max-width: 860px` not hit. The home page shows the Three.js hero scene (isSmall = false since 768 > 640). NavCards shows 3 columns at 768 px: each card is ~228 px. Workable but tight.

- **iPad landscape (1024 px):** Full desktop experience. No concern.

### Fixed-height hero on short landscape

The hero has `height: 100vh`. On iPhone SE landscape (375 px tall): hero is 375 px. The `max-height: 600px + landscape` rule pulls chrome to 1.5rem. But the 3D type centred in `100vh` occupies a large portion; the `hero__scroll-hint` at `bottom: 2.5rem` ≈ 40 px from bottom and `.bg-audio` at `bottom: 1.25rem` ≈ 20 px from bottom. They are 20 px apart vertically. On a 375 px tall viewport these two elements are adjacent but should not overlap.

---

## 9. Findings by Severity

### CRITICAL

**D-BL1: Audio button obscured by iOS home indicator**
[`src/components/BackgroundAudio.astro:257`](src/components/BackgroundAudio.astro#L257)–265. The `.bg-audio` button is positioned `bottom: 1.25rem` (20 px) on mobile, but `viewport-fit=cover` is declared. On iPhones without a physical home button (iPhone X and later, all current models), the home indicator swipe zone is ~34 px. The button's **bottom edge** at 20 px from the viewport bottom falls inside this swipe zone. Users may trigger the home indicator gesture instead of toggling audio. **Fix: add `padding-bottom: env(safe-area-inset-bottom, 0px)` to `.bg-audio` or adjust `bottom` to `max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))`.**

**D-BL2: Language switcher tap targets are 28 px tall on mobile**
[`src/components/nav/SiteNav.astro:81`](src/components/nav/SiteNav.astro#L81). Tailwind class `py-2` = 8 px padding each side + 12 px line-height = ~28 px total. iOS HIG requires 44 px. The EN/FI/SV language links are used on a phone to switch locale: a core internationalization interaction. **Fix: on mobile, increase to at least `py-3` (12 px) or add `min-height: 44px; display: inline-flex; align-items: center`.**

---

### HIGH

**D-MA1: `100vh` hero and MCC don't account for URL-bar collapse on mobile Safari**
[`src/components/home/Hero.astro:83`](src/components/home/Hero.astro#L83) and [`src/styles/mobile-contact-card.css:12`](src/styles/mobile-contact-card.css#L12). The hero is sized to `100vh` (static viewport height), so on first load with the URL bar visible, the hero occupies more than the visual viewport. When the user scrolls and the URL bar collapses, the next section snaps into view. This is the common `100vh` / mobile Safari issue. For the hero this is a known acceptable trade-off (no jump, just the scroll "feels natural"), but the MCC `min-height: 100vh` means the contact background may not fully fill the screen initially.

*Judgment call: the hero's `100vh` pattern is industry-standard and unlikely to cause user harm. The MCC background gap is cosmetic. Recommend switching both to `min-height: 100dvh` for correctness, but not urgent.*

**D-MA2: Nav-cards grid stays 3-column down to 320 px**
[`src/styles/nav-cards.css:38`](src/styles/nav-cards.css#L38)–42. `.nav-cards__grid { grid-template-columns: repeat(3, 1fr) }` collapses to 1-col only at `max-width: 860px`. At 320–640 px (all phones) each card is only ~90–180 px wide. The card labels (`font-size: 1.4rem`) and descriptions (`font-size: 0.9rem`) will overflow or wrap very aggressively. This is the home page "nav" section: a primary discovery surface. **Fix: add `@media (max-width: 640px)` or relax to 2-col at 640 px. The 860 px rule alone is not sufficient.**

**D-MA3: Three.js home scene loads on landscape iPhone (>640 px wide)**
[`src/page-content/HomePage.astro:117`](src/page-content/HomePage.astro#L117). `isSmall = matchMedia('max-width: 640px')`. In landscape, a 667-px wide phone (iPhone SE/standard) has a 375 px tall viewport. The Three.js scene runs at `height: 100vh = 375 px`. There is a landscape masthead override in [`src/components/home/Hero.astro:334`](src/components/home/Hero.astro#L334) but the scene still loads and the viewport is very short. This likely renders correctly given the landscape rule, but on underpowered older phones running the full WebGL scene in a 375×667 landscape is an unnecessary load. **Recommendation: consider gating on `min-height: 500px` in addition to width.**

---

### MEDIUM

**D-MI1: Body text at 0.96rem (15.4 px) on /experience with no mobile override**
[`src/styles/experience-timeline.css:350`](src/styles/experience-timeline.css#L350). `.timeline__body { font-size: 0.96rem }`. The experience page has no mobile-specific font-size increase. At 320–375 px body text is 15.4 px. Acceptable but below the 16 px recommendation for body copy. Consider bumping to `1rem` at `≤640 px`.

**D-MI2: MCC screen text at 0.85rem (13.6 px)**
[`src/styles/mobile-contact-card.css:153`](src/styles/mobile-contact-card.css#L153). `.mcc__screen { font-size: 0.85rem }`. This IS the mobile contact experience. Output includes email addresses and links. 13.6 px is below the minimum for interactive/content text on mobile. Matches the terminal aesthetic but real contact information is shown here.

**D-MI3: Project fallback card body text at 0.92rem (14.7 px)**
[`src/styles/project-grid.css:114`](src/styles/project-grid.css#L114). `.project-card__description { font-size: 0.92rem }`. Mobile-only surface (shown at ≤860 px). Slightly below 16 px but above the 13.6 px MCC concern.

**D-MI4: Orphan 1100 px breakpoint**
[`src/styles/projects-scene.css:385`](src/styles/projects-scene.css#L385). Used once to shrink the `.projects-scene__key` and `.projects-scene__list` panels. These panels are themselves hidden at ≤860 px, so the 1100 px rule only applies at 861–1100 px on desktop. It works but is undocumented and inconsistent with the established breakpoint set.

**D-MI5: `timeline__header { min-height: 100vh }` on /experience**
[`src/styles/experience-timeline.css:17`](src/styles/experience-timeline.css#L17). The header section of the experience page uses `100vh`. On mobile this causes the same URL-bar ambiguity as the hero: the "full screen" header may be slightly taller than the actual viewport when the URL bar is present. No `dvh` alternative used here.

---

### LOW / INFORMATIONAL

**D-NI1: Audio button height is ~36 px on mobile (below 44 px)**
[`src/components/BackgroundAudio.astro:257`](src/components/BackgroundAudio.astro#L257). The audio toggle is a secondary control (not primary navigation), but it is the only way to silence background music: a meaningful accessibility action. At 36 px it is measurably below the 44 px iOS minimum.

**D-NI2: Nav link tap targets are ~42 px (slightly below 44 px)**
[`src/components/nav/SiteNav.astro:58`](src/components/nav/SiteNav.astro#L58). `px-4 py-3` = 12 px each side. With `text-xs` (12 px) and standard line-height ≈ 18 px, total ≈ 42 px. Two pixels under threshold: borderline, unlikely to cause real issues.

**D-NI3: `project-detail` drawer uses `100vh` on desktop**
[`src/styles/project-detail.css:8`](src/styles/project-detail.css#L8). Fixed-height drawer, but only shown on desktop >860 px where URL-bar collapse is not a concern. Informational.

**D-NI4, No mobile breakpoints in experience-timeline.css**
The timeline CSS has zero width-based `@media` queries. The layout relies entirely on CSS Grid (`32px 1fr`) and the `max-width: 760px` container. Works down to ~320 px because the `1fr` column absorbs the width, but the 32 px fixed marker column leaves only ~270 px of text width at 320 px.

**D-NI5: `prefers-reduced-motion` consistently implemented**
All animation files (timelines, scene loaders, audio waves) respect `prefers-reduced-motion`. This is good cross-cutting implementation.

---

## 10. What I Didn't Cover

- **No real-device testing**: all analysis is static CSS reasoning. Rendering may differ on actual iOS/Android hardware.
- **No Android**: touch target issues may vary; Android Chrome's URL-bar behavior differs from Safari's.
- **No iOS < 16**: `env(safe-area-inset-*)` is available since iOS 11, `dvh` since iOS 15.4. No testing for older Safari.
- **No visual rendering verification**: font fallbacks, actual rendered heights, overflow scrolling behavior, WebGL rendering on mid-range phones are all inferred.
- **No Tailwind 4 breakpoint audit**: the project uses Tailwind 4. The `sm:` prefix in SiteNav maps to Tailwind's default 640 px `min-width` breakpoint. I did not audit whether the full Tailwind utility class cascade has any other responsive surprises in components not covered above.
- **No `clamp()` behavior verification at specific widths**: all `clamp()` computations are spot-checked at a few viewport widths, not exhaustively checked across the full range.
- **No notch/Dynamic Island overlap testing**: the `viewport-fit=cover` plus safe-area gap at the bottom is a static analysis; real device testing needed for confirmation.
