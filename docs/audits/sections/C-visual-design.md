# Visual Design Audit: Agent C

**Date:** 2026-05-17
**Branch:** audit/C (off audit/baseline @ b3de9f2)
**Scope:** `src/styles/` (9 files), `src/components/BackgroundAudio.astro` style block, `public/og-*.svg`

---

## Introduction

The site has four distinct visual themes (home, projects, experience, contact), each built on a shared dark base with a different accent hue. The token story starts well (four page-level accent tokens are declared in `global.css`), but breaks down quickly: the majority of color expressions across the nine style files are raw hex or `rgba()` literals that reference the same conceptual accent shade without going through any token. The type scale is impressionistic rather than rhythmic. Spacing uses rem fractions with no underlying grid. None of this makes the site look broken, but it accumulates as compounding friction for every future edit.

---

## Findings by Severity

### Severity: High

#### C-MA1: Projects accent color has four distinct identities across the codebase

The projects page theme is built around a blue accent. The token `--color-projects-accent: #80a8ff` is declared in `global.css:32`. In practice four separate hex/rgb values name the same conceptual color at different points in the stylesheet:

| Value | Context | Files |
|---|---|---|
| `#80a8ff` | Token definition | [`src/styles/global.css:32`](src/styles/global.css#L32) |
| `rgba(120, 170, 255, …)` | Panel borders, backgrounds, close-button chrome | [`src/styles/project-detail.css:27`](src/styles/project-detail.css#L27); [`src/styles/project-grid.css:50`](src/styles/project-grid.css#L50); [`src/styles/projects-scene.css:58`](src/styles/projects-scene.css#L58) |
| `#c4d4ff` / `rgba(196, 212, 255, …)` | Text color on dark blue background | [`src/styles/project-detail.css:45`](src/styles/project-detail.css#L45); [`src/styles/project-grid.css:95`](src/styles/project-grid.css#L95); [`src/styles/projects-scene.css:47`](src/styles/projects-scene.css#L47) |
| `#80c8ff` / `rgba(128, 200, 255, …)` | External-API pill text and `--brand` fallback | [`src/styles/project-detail.css:181`](src/styles/project-detail.css#L181); [`src/styles/project-grid.css:189`](src/styles/project-grid.css#L189); [`src/styles/projects-scene.css:251`](src/styles/projects-scene.css#L251) |
| `rgba(80, 130, 255, 0.18)` | Hover-label box-shadow glow | [`src/styles/projects-scene.css:338`](src/styles/projects-scene.css#L338) |

`rgba(120, 170, 255)` appears **29 times** across those three files alone; none of those instances go through the declared token. `#80c8ff` is a third distinct blue used for external-API chips and as the `--brand` default inside `projects-scene.css`: brighter and more saturated than the token. The `::selection` rule in `global.css:207` introduces yet another shade: `rgba(128, 168, 255, 0.4)`.

In total, at least five different hex/rgb representations cover what the design intends as the single "projects blue" accent.

**Recommendation:** introduce `--color-projects-text` for the lighter `#c4d4ff`/`rgba(196,212,255)` reading-level variant, and `--color-projects-api` for the brighter `#80c8ff` API-chip color. Then replace every raw literal with the appropriate token.

---

#### C-MA2: `#f3eed9` experience page color is defined nowhere as a token

The experience page renders over the mountain scene and uses a warm parchment white `#f3eed9` as its base text color throughout [`src/styles/experience-timeline.css`](src/styles/experience-timeline.css). This value and its `rgba()` derivatives (`rgba(243, 238, 217, …)`) appear **8 times** in that file (lines 11, 33, 43–45, 66, 72, 85, 324, 353, 497, 540, 654) but it is never declared as a CSS custom property. If the background scene color shifts, all these line shades must be hunted down manually.

[`src/styles/global.css`](src/styles/global.css) defines `--color-paper: #f5f5f0` for the day-mode paper color, but `#f3eed9` is a subtly different warm-shifted variant tuned for the dusk background. It exists only as a magic literal.

---

### Severity: Medium

#### C-MI1: Type scale is impressionistic: 22+ distinct font-size values with no detectable ratio

The following `font-size` values appear across the nine style files (excluding `clamp()` declarations):

```
0.58rem, 0.60rem, 0.62rem (×3), 0.65rem (×7), 0.68rem (×3),
0.70rem (×7), 0.72rem (×7), 0.75rem, 0.78rem (×5), 0.80rem,
0.85rem (×4), 0.88rem, 0.90rem, 0.92rem (×3), 0.95rem (×4),
0.96rem, 0.98rem, 1.00rem (×2), 1.05rem, 1.2rem, 1.4rem,
1.5rem, 1.6rem, 2.4rem
```

That is over 22 distinct sizes below 2rem, at irregular intervals. The sub-1rem range alone spans from `0.58rem` to `0.98rem` with steps as small as `0.02rem`: visually indistinguishable differences that serve no semantic purpose. A 1.125× (major second) or 1.25× (major third) modular scale would collapse this to ~6–8 steps.

Worst offenders for redundant near-duplicates:

- `0.62rem` ([`src/styles/projects-scene.css:117`](src/styles/projects-scene.css#L117), [`src/styles/project-grid.css:166`](src/styles/project-grid.css#L166), [`src/styles/projects-scene.css:312`](src/styles/projects-scene.css#L312)) vs `0.60rem` ([`src/styles/project-grid.css:91`](src/styles/project-grid.css#L91)): 2 px difference at 16px base.
- `0.92rem` ([`src/styles/project-grid.css:115`](src/styles/project-grid.css#L115), [`src/styles/projects-scene.css:282`](src/styles/projects-scene.css#L282)), `0.95rem` ([`src/styles/experience-timeline.css:486`](src/styles/experience-timeline.css#L486), [`src/styles/mobile-contact-card.css:249`](src/styles/mobile-contact-card.css#L249)), `0.96rem` ([`src/styles/experience-timeline.css:351`](src/styles/experience-timeline.css#L351)), `0.98rem` ([`src/styles/project-detail.css:113`](src/styles/project-detail.css#L113)): four values all approximating "slightly smaller than 1rem body text."
- `0.65rem` appears 7 times across four files ([`src/styles/projects-scene.css:74`](src/styles/projects-scene.css#L74), [`src/styles/project-detail.css:72`](src/styles/project-detail.css#L72)).

#### C-MI2: Spacing is `rem` fractions with no grid

Surveying margins, paddings and gaps reveals no 4px or 8px base grid. Representative sample:

- `gap: 0.15rem` (`projects-scene.css`), `gap: 0.2rem` (`projects-scene.css`), `gap: 0.35rem` (×2), `gap: 0.4rem`, `gap: 0.45rem`, `gap: 0.5rem` (×4), `gap: 0.55rem`, `gap: 0.6rem`, `gap: 0.65rem`, `gap: 0.7rem` (×2), `gap: 0.75rem` (×3), `gap: 0.85rem`, `gap: 1rem`, `gap: 1.25rem` (×2), `gap: 1.5rem` (×2).

At 16px base, these produce: 2.4 px, 3.2 px, 5.6 px, 6.4 px, 7.2 px, 8 px, 8.8 px, 9.6 px, etc.: intervals that bear no consistent relationship to each other and cannot be verified against a grid without converting each value.

Padding values such as `0.15rem 0.55rem` ([`src/styles/experience-timeline.css:332`](src/styles/experience-timeline.css#L332)), `0.22rem 0.6rem` ([`src/styles/experience-timeline.css:534`](src/styles/experience-timeline.css#L534)), and `0.25rem 0.75rem` ([`src/styles/project-detail.css:69`](src/styles/project-detail.css#L69)) follow a similar pattern of arbitrary precision.

This is a judgment call: the site reads comfortably in the browser, and inconsistent spacing at this granularity may be imperceptible. But it makes future edits harder because every new component must measure by eye rather than pick the nearest grid step.

#### C-MI3: Terminal/contact color leaks into non-contact components

`rgba(74, 222, 128, …)` (the contact theme's CRT-green) appears **35 times** across the two contact-specific files ([`src/styles/terminal.css`](src/styles/terminal.css), [`src/styles/mobile-contact-card.css`](src/styles/mobile-contact-card.css)), but also leaks into three other files:

- [`src/styles/nav-cards.css:108`](src/styles/nav-cards.css#L108): `.nav-card[data-accent='contact']` uses the raw `rgba(74, 222, 128)` literal instead of `var(--color-contact-accent)` or `var(--color-term-green)`.
- [`src/styles/project-detail.css:80`](src/styles/project-detail.css#L80): "live" status pill border and background.
- [`src/styles/project-grid.css:99`](src/styles/project-grid.css#L99): "live" status pill border.

The four instances in non-contact CSS should reference `--color-term-green` (which is `#4ade80`, the same value) so token changes propagate automatically.

#### C-MI4: Border-radius has no token; 7 distinct values across the codebase

Card-level radii vary without a declared system:

| Value | Semantic usage | Files |
|---|---|---|
| `4px` | Tags, pills (inline), kbd | [`src/styles/global.css`](src/styles/global.css), [`src/styles/experience-timeline.css`](src/styles/experience-timeline.css) |
| `6px` | Link buttons (project-grid), highlight chips (project-detail) | [`src/styles/project-grid.css:212`](src/styles/project-grid.css#L212), [`src/styles/project-detail.css:129`](src/styles/project-detail.css#L129) |
| `8px` | Action links (project-detail), list-items (projects-scene) | [`src/styles/project-detail.css:204`](src/styles/project-detail.css#L204), [`src/styles/projects-scene.css:236`](src/styles/projects-scene.css#L236) |
| `10px` | MCC buttons | [`src/styles/mobile-contact-card.css:251`](src/styles/mobile-contact-card.css#L251) |
| `12px` | Cards (experience, projects-scene, mobile-contact-card) | [`src/styles/experience-timeline.css:277`](src/styles/experience-timeline.css#L277), [`src/styles/projects-scene.css:91`](src/styles/projects-scene.css#L91) |
| `14px` | Project grid cards | [`src/styles/project-grid.css:51`](src/styles/project-grid.css#L51) |
| `18px` | Nav cards | [`src/styles/nav-cards.css:53`](src/styles/nav-cards.css#L53) |

Six of these are distinct values applied to semantically similar "card" surfaces. A three-step system (small `4px`, medium `12px`, large `18px`) would cover all cases.

#### C-MI5: `--color-home-accent` and `--color-contact-accent` tokens barely used

`--color-home-accent` (`#c4d4ff`) is declared in [`src/styles/global.css:31`](src/styles/global.css#L31) but only consumed via `var()` in [`src/components/home/Intro.astro:164`](src/components/home/Intro.astro#L164). The identical hex `#c4d4ff` is used raw in 6 places across [`src/styles/project-detail.css`](src/styles/project-detail.css), [`src/styles/project-grid.css`](src/styles/project-grid.css), and [`src/styles/projects-scene.css`](src/styles/projects-scene.css). In those files it means "muted blue text on dark background": the same intent, but no token reference.

`--color-contact-accent` (`#b5f5c8`) is declared in [`src/styles/global.css:34`](src/styles/global.css#L34) but used in zero style files (confirmed: grep finds no `var(--color-contact-accent)` in `src/styles/`). The contact theme is entirely driven by the raw `rgba(74, 222, 128)` / `--color-term-green` values.

---

### Severity: Low

#### C-NI1: Four-theme palette is coherent in concept, inconsistent in naming

The four themes follow a clear concept: deep dark base, one chromatic accent per page, all running off the same `--color-ink`/`--color-paper` root pair. The [`src/components/BackgroundAudio.astro`](src/components/BackgroundAudio.astro) style block uses per-theme `--bg-audio-*` tokens that correctly reference the accent hue for each theme (e.g., `rgba(212, 255, 128, …)` for experience, `rgba(74, 222, 128, …)` for contact). This is well-structured.

The inconsistency is naming: the four accent tokens in [`src/styles/global.css`](src/styles/global.css) are `--color-{page}-accent` (good), but the BackgroundAudio component, [`src/styles/global.css:187`](src/styles/global.css#L187), and [`src/styles/nav-cards.css`](src/styles/nav-cards.css) each use different representations of the same colors, sometimes the token, sometimes a matching raw literal, sometimes an approximation. This is a low-severity token-hygiene issue rather than a visible design problem.

#### C-NI2: `!important` is used 10 times, all inside `@media (prefers-reduced-motion)` blocks

All 10 `!important` declarations are on `transform: none` or animation properties inside reduced-motion media queries:

- [`src/styles/experience-timeline.css:126`](src/styles/experience-timeline.css#L126): `transform: none !important`
- [`src/styles/experience-timeline.css:629`](src/styles/experience-timeline.css#L629): `animation: none !important`
- [`src/styles/global.css:173`](src/styles/global.css#L173)–176: 4× within the global `prefers-reduced-motion` block (transitions, animations, scroll-behavior)
- [`src/styles/mountain-scene.css:102`](src/styles/mountain-scene.css#L102): `transform: none !important`
- [`src/styles/nav-cards.css:167`](src/styles/nav-cards.css#L167): `transform: none !important`
- [`src/styles/project-detail.css:249`](src/styles/project-detail.css#L249): 3× `transform: none !important`
- [`src/styles/project-grid.css:240`](src/styles/project-grid.css#L240): `transform: none !important`

This is a legitimate pattern: specificity battles with GSAP's inline styles make `!important` the practical choice in reduced-motion overrides. **Not a problem.** Cited for completeness.

#### C-NI3: `z-index` ladder is shallow but undocumented

Values in use: 0, 1, 2, 3, 4, 5, 10, 30, 40.

- [`src/styles/project-detail.css:10`](src/styles/project-detail.css#L10): `.project-detail` at `z-index: 40` (same as [`src/components/BackgroundAudio.astro`](src/components/BackgroundAudio.astro)'s `.bg-audio` at `z-index: 40`). Both are fixed-position elements, and since they don't overlap spatially in the current layout this doesn't cause a visible conflict, but stacking context collisions become likely if either is resized.
- [`src/styles/projects-scene.css:330`](src/styles/projects-scene.css#L330): `.hover-label` at `z-index: 30`, below the `project-detail` drawer at 40. Correct intent.

No pathological high values (no `9999`, `99999`). No obvious stacking bugs. But no constants or tokens, if a new layer is added, the developer must grep for existing values to pick a safe number.

#### C-NI4: OG cards are visually aligned with the current theme palette

Comparing SVG hex values against live CSS tokens:

| Card | Key color | Match |
|---|---|---|
| `og-default.svg` | `#0f1430` background, `#80a8ff` rules, `#c4d4ff` text | Matches home/projects dark space look; uses `--color-projects-accent` value |
| `og-projects.svg` | `#0a1230` background, `#80a8ff` rule color | Matches projects scene background `#050818` closely enough; correct accent |
| `og-experience.svg` | `#1f1840`→`#e08855` sky gradient | Closely mirrors `mountain-scene.css` `--sky-top: #261b3a`→`--horizon: #d28e5a`; the OG sunset is slightly cooler/less red but reads as the same scene |
| `og-contact.svg` | `#0a1810` background, `#4ade80` text | Exact match for `--color-term-green: #4ade80` and `--color-term-bg: #050807` |

The OG cards are up to date with the current palette. No discrepancy found. The `build-og.mjs` note that PNGs are committed (not regenerated at deploy time) means a future token change will silently diverge: worth noting in the maintenance docs but not an active bug.

#### C-NI5: Dead CSS: none found in sampled classes

Spot checks on distinctive class names from each file confirm matching HTML:

- `.timeline__summit`, `.timeline__cta`, `.timeline__year-bg` → used in [`src/components/experience/TimelineContent.astro:123`](src/components/experience/TimelineContent.astro#L123)–127
- `.projects-scene__key`, `.projects-scene__credits` → used in [`src/page-content/ProjectsPage.astro:78`](src/page-content/ProjectsPage.astro#L78)
- `.ghost-num`, `.has-grain`, `.eyebrow-marker` → used in multiple home section Astro components
- `.hairline` → used in `Intro.astro`, `Velocity.astro`

No dead CSS selectors found in the sample. *(Caveat: full coverage would require matching every selector; only the architecturally-unusual ones were checked.)*

#### C-NI6: Terminal and mobile-contact-card are near-identical duplicates

[`src/styles/terminal.css`](src/styles/terminal.css) and [`src/styles/mobile-contact-card.css`](src/styles/mobile-contact-card.css) implement the same CRT frame (background gradient, vignette, scanlines, flicker animation, macOS-dot chrome, phosphor text) for desktop and mobile respectively. The two files share:

- Identical background values (`#07120a`, `#040806`, `#020403`)
- Identical scanline gradients
- Identical flicker keyframe values
- Identical traffic-light dot colors (`#ff5f57`, `#febc2e`, `#28c840`)
- Identical border/shadow values for the card/terminal frame

This is a deliberate responsive split (not dead CSS) but it means any CRT aesthetic change requires edits in two places. A shared `crt-base.css` extract would prevent drift. Low priority given the mobile breakpoint makes the two surfaces mutually exclusive.

---

## What I Didn't Cover

- No real-browser rendering: all analysis is static. Perceived visual weight, contrast at actual screen sizes, and animation timing were not evaluated.
- No dark-mode validation: the site appears to be dark-only (no `@media (prefers-color-scheme: light)` in any file). If a light mode is ever added, the token story becomes critical.
- No professional design review: "does the type hierarchy feel right," "do the four themes feel like one brand". These are judgment calls requiring human aesthetic evaluation.
- No print stylesheet check.
- No right-to-left layout check.
- Tailwind CSS v4 utility classes (generated via `@import 'tailwindcss'` in `global.css`) were not inventoried. Any design tokens Tailwind generates are opaque to this audit.
