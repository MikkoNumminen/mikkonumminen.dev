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
  lib/
    three/        Three.js scenes, isolated modules with init + dispose
    gsap/         GSAP timelines, one file per page section
    terminal/     contact-page terminal subsystem (+ home, projects, timeline, ...)
  i18n/           locale tables, structural parity enforced at compile time
  data/           typed page/content data
  page-content/   per-page prose content
  styles/         global.css (Tailwind v4 + CSS vars)
  assets/         Imported assets processed by Astro
public/           Static assets served as-is (favicon, manifest, og images, JSON the terminal fetches)
docs/
  decisions/      ADRs (numbered, append-only)
  audits/         dated audit & review reports
scripts/          build/data tooling (og images, skills registry, audit PDFs)
```

## Pages — four visual worlds

| Route         | Concept                     | Status |
| ------------- | --------------------------- | ------ |
| `/`           | Immersive scroll experience | stub   |
| `/projects`   | Interactive solar system    | stub   |
| `/experience` | Parallax mountain landscape | stub   |
| `/contact`    | Terminal / CRT aesthetic    | wip    |

Build order: **Contact → Home → Projects → Experience**. Each page is fully polished
before the next is started. Confirm with Mikko before starting a new page.

## Workflow

- Small commits, [Conventional Commits](https://www.conventionalcommits.org/) style
  (`feat:`, `fix:`, `chore:`, `refactor:`, `style:`, `docs:`, `perf:`).
- No commit trailers and no co-author lines — commits read as ordinary development.
- Keep [`TODO.md`](TODO.md) current as work progresses.
- `npm run build` must succeed and `npm run typecheck` must pass before a page is "done".

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build (must succeed)
npm run preview      # preview the built site
npm run typecheck    # astro check
npm run lint         # eslint
npm test             # vitest
npm run format       # prettier --write (run before pushing)
npm run format:check # prettier --check (CI gate)
```
