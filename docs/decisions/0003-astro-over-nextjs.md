# ADR 0003 — Astro over Next.js for the portfolio

**Status:** accepted
**Date:** 2026-05-17
**Decided by:** repo owner

## Context

The author's production work is built on Next.js and React. Choosing the
same stack for a personal portfolio would be the path of least resistance:
no new mental model, shared tooling, same deployment story. The question
was therefore not "what framework do I know?" but "what framework fits
this specific site?"

The site has four pages. Each page is its own visual concept: a WebGL
particle field on the home page, an interactive solar system on projects,
a parallax mountain landscape on experience, and a CRT terminal on
contact. Page-to-page navigation triggers a canvas particle dissolve.
None of these pages share state with each other at runtime. None of them
require a client-side router beyond what the browser's native navigation
already provides.

The README frames the intent directly:

> This stack is intentionally separate from the production stack used in
> my other projects (Next.js / React / MUI). This repo is the craft side
> of the brain.

The core technical contrast between the two frameworks at the time of
this decision:

**Next.js** is a React framework. Every page ships the full React runtime
to the browser, and the SPA router takes over navigation after the first
load. Client components hydrate eagerly by default. This is the right
model for apps with shared client state, complex component trees, and
many interactive surfaces.

**Astro** is a multi-page framework. Each page is server-rendered (or
pre-rendered) HTML. JavaScript reaches the browser only where explicitly
opted into via `client:*` directives — the "island architecture." The
browser's native navigation handles page changes; each page is a fresh
document. There is no shared React context, no SPA router, and no
framework runtime on pages that have no islands.

For a site where each page is a self-contained visual experience with its
own JavaScript scene (Three.js, GSAP), Astro's model maps cleanly: each
page owns its own scripts, initialises its own scene, and disposes
everything on unload. There is no need to reconcile React component
lifecycles with Three.js renderer lifecycles across navigations.

## Decision

Use **Astro** (`output: 'static'`) as the site framework. React is not
used. JavaScript reaches the browser only as inline `<script>` tags in
Astro component frontmatter or as dynamically imported modules (Three.js,
GSAP) loaded only on the pages that need them.

Page transitions (the canvas particle dissolve) are implemented as a
vanilla JS module in `src/lib/transitions/` that intercepts link clicks
and performs a hard navigation after the animation — preserving MPA
semantics while giving the user a smooth visual handoff.

## Considered alternatives

### A. Next.js (App Router, static export)

Next.js supports `output: 'export'` for fully static builds. Technically
viable. **Rejected** because:

- The App Router ships the React server-component runtime and client
  bundle infrastructure even for static exports. For a site with three
  external dependencies (Three.js, GSAP, Sentry) and no component
  library, this is unnecessary overhead.
- React's hydration model would add complexity around Three.js scene
  initialisation: each scene would need a `useEffect` + ref dance to
  attach to the canvas after hydration, adding an extra render before
  the scene starts.
- The "craft side of the brain" goal is specific: this repo is a space
  to work differently from production habits. Using Next.js would make it
  a slightly simpler version of normal work.

### B. SvelteKit (static adapter)

SvelteKit with its static adapter would also produce a fully static build
and is leaner than Next.js for this use case. **Rejected** primarily
because it is a third framework to maintain context-switching between.
Astro integrates any UI framework (including Svelte components as islands
if ever needed) while keeping the shell in a familiar template syntax.

### C. Vanilla HTML + JS (no framework)

No build framework, hand-authored HTML per page, scripts loaded via
`<script>` tags. The simplest possible deployment. **Rejected** because:

- TypeScript (strict, with `noUncheckedIndexedAccess`) provides real
  value across the Three.js scene code, i18n, and GSAP timelines. A
  framework-free setup would require a separate build pipeline for TS.
- Shared layout (nav, head, fonts, page transition overlay, audio
  component, observability init) would have to be maintained manually
  across four files, with no component abstraction.
- Astro adds almost nothing at runtime while providing the full
  component and build toolchain at author time.

## Consequences

### Gained

- **Minimal JS on pages that don't need it.** The contact and experience
  pages ship no framework runtime; only the scripts they explicitly
  import.
- **Simple scene lifecycle.** Each page's Three.js scene initialises
  once on `DOMContentLoaded` and disposes on `beforeunload`. No
  framework reconciliation step.
- **Clear mental model.** Astro's component model (frontmatter server
  code + HTML template + optional `<script>` for client behaviour)
  maps directly onto "this is a page with some interactive parts." New
  contributors can read an Astro component without knowing React.
- **Intentional separation.** The portfolio remains a distinct creative
  space from the production stack, which was a stated goal.

### Costs

- **A third framework context.** The author maintains fluency in both
  Next.js (for production work) and Astro (for this repo). The cognitive
  overhead is small but real.
- **No shared-state primitives.** Cross-page state (audio playhead,
  user locale preference) is managed via `sessionStorage` and custom
  DOM events rather than a React context or Zustand store. This is
  adequate for the current use cases and fits the static-output
  constraint, but a future requirement for richer cross-page state would
  need a custom solution.
- **Island architecture requires explicit opt-in.** Any component that
  needs client-side interactivity must be identified and mounted with a
  `client:*` directive. For a site this small this is a feature (all
  client JS is visible at a glance), but it adds a decision point when
  adding new interactive components.
