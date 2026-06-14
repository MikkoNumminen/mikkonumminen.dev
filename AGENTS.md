# AGENTS.md — contributor & tooling contract

The committed source of truth for how this repo is built and what must never break.
The [`README.md`](README.md) covers structure, scripts, and the skill tooling in more
depth; this file is the short list of load-bearing constraints to read first.

## What this is

A personal portfolio site for Mikko Numminen. It is **not** a typical web app — it is a
visual showcase where every pixel matters. The reference quality bar is "Apple product
launch page".

## Tech stack

- **Astro** — static site generator, island architecture
- **Three.js** — 3D graphics, WebGL
- **GSAP** — ScrollTrigger, timelines, morphing
- **Tailwind CSS v4** — no component libraries
- **TypeScript** — strict (`tsconfig` extends `astro/tsconfigs/strict`)

## Hard constraints

These are non-negotiable. A change that violates one is wrong even if it builds.

- **Fully static output** — no SSR, no edge functions. The build must stay portable from
  Vercel to AWS S3 + CloudFront with a single config swap. See
  [`docs/decisions/0002-static-output-only.md`](docs/decisions/0002-static-output-only.md).
- **No heavy frameworks** — do not introduce Next.js, React (beyond a minimal Astro island
  only when truly necessary), or MUI / any component library. See
  [`docs/decisions/0003-astro-over-nextjs.md`](docs/decisions/0003-astro-over-nextjs.md).
- **60fps animations** — always dispose Three.js resources on teardown, drive frames with
  `requestAnimationFrame`, and honour `prefers-reduced-motion` on every animated surface.
  Three.js scenes and GSAP timelines are isolated modules exposing an explicit `init` +
  `dispose` contract; preserve that contract.

## Repo layout

```
src/
  layouts/        Astro layouts (BaseLayout wraps every page)
  components/     Astro components, grouped by page (nav, contact, ...)
  pages/          One file per route (.astro)
  lib/            (sibling subdirs, not nested)
    three/        core Three.js helpers + scene entry points (homeScene, projectsScene)
    home/         home-scene building blocks
    projects/     projects-scene building blocks (planets, hover labels)
    timeline/     experience-timeline scene helpers
    gsap/         GSAP timelines, one file per page section
    terminal/     contact-page terminal subsystem
    transitions/  page transitions (canvas particle dissolve)
    observability/ Sentry + Core Web Vitals init
    utils/        cross-cutting helpers (e.g. escapeHtml)
    debug/        dev-only diagnostics, stripped from production
    theme.ts      shared theme / palette constants
  i18n/           locale tables, structural parity enforced at compile time
  data/           typed page/content data
  page-content/   per-page prose content
  styles/         global.css (Tailwind v4 + CSS vars)
public/           Static assets served as-is (favicon, manifest, og images, JSON the terminal fetches)
docs/
  decisions/      ADRs (numbered, append-only)
  audits/         dated audit & review reports
scripts/          build/data tooling (og images, skills registry, audit PDFs)
```

## Pages — four visual worlds

| Route         | Concept                     | Status |
| ------------- | --------------------------- | ------ |
| `/`           | Immersive scroll experience | built  |
| `/projects`   | Interactive solar system    | built  |
| `/experience` | Parallax mountain landscape | built  |
| `/contact`    | Terminal / CRT aesthetic    | built  |

All four worlds are built and live (the Playwright scene smoke test boots every
one of them on each PR). They were built in the order **Contact → Home →
Projects → Experience**, each fully polished before the next; work now is
refinement — bug fixes, performance, i18n, accessibility. Confirm with Mikko
before any large new feature or a fifth page.

## Workflow

- Small commits, [Conventional Commits](https://www.conventionalcommits.org/) style
  (`feat:`, `fix:`, `chore:`, `refactor:`, `style:`, `docs:`, `perf:`).
- No commit trailers and no co-author lines — commits read as ordinary development.
- Branch first, then open a PR. CI must be green before squash-merge — three workflows run on every PR: the main gate (`typecheck → format:check → lint → test:coverage → build`, on Node 22), the **Playwright scene smoke** (`e2e/`, a headless-WebGL boot test of all four worlds), and **CodeQL** static security analysis.
- `TODO.md`, if present, is a gitignored personal working file — keep it current locally, but it is not committed (don't link or rely on it).
- `npm run build` must succeed and `npm run typecheck` must pass before a page is "done".

## Security

Before editing the contact terminal, the response headers, or anything that builds
HTML, read [`SECURITY.md`](SECURITY.md) and [`docs/security/threat-model.md`](docs/security/threat-model.md).
The project's one HTML-injection boundary is [`escapeHtml`](src/lib/utils/escapeHtml.ts):
every string interpolated into `innerHTML` must pass through it first (see the
`SECURITY INVARIANT` marker on that file). Do not weaken the CSP / headers in
[`vercel.json`](vercel.json) without recording a reason.

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build (must succeed)
npm run preview      # preview the built site
npm run typecheck     # astro check
npm run lint          # eslint (no-explicit-any is an error)
npm test              # vitest (unit)
npm run test:coverage # vitest + coverage ratchet (this is the CI test step)
npm run test:e2e      # Playwright scene smoke (build first; needs a browser)
npm run format        # prettier --write (run before pushing)
npm run format:check  # prettier --check (CI gate)
```
