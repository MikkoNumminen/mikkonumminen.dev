# mikkonumminen.dev

Personal portfolio of Mikko Numminen — full-stack developer from Finland.

**Live:** https://mikkonumminen-dev.vercel.app

This is intentionally not a typical web app. It's a visual showcase, with each page built as its own concept and animation.

## The four pages

- **`/`** — Immersive scroll experience. 3D name in WebGL, particle field, GSAP scroll triggers, parallax sections, animated nav cards.
- **`/projects`** — Interactive solar system. Each project orbits a central sun. Hover a planet for the elevator pitch, click to zoom in.
- **`/experience`** — Parallax mountain landscape. A goat climbs as you scroll. The sky shifts from pre-dawn to bright day across the climb. Timeline markers fade in along the way.
- **`/contact`** — Terminal / CRT aesthetic. Real command parser, command history, tab completion, scan lines, blinking cursor, copy-to-clipboard. Try `help`.

Page-to-page navigation triggers a canvas particle dissolve coloured to the destination page's theme.

## Tech stack

- [Astro](https://astro.build/) — static site generator with island architecture
- [Three.js](https://threejs.org/) — 3D graphics for the home and projects pages
- [GSAP](https://gsap.com/) + ScrollTrigger — scroll-driven animation timelines
- [Tailwind CSS v4](https://tailwindcss.com/) — utility CSS, no component library
- TypeScript (strict)

The build output is fully static — no SSR, no edge functions — so it can move from Vercel to any static host (S3 + CloudFront, Cloudflare Pages, etc.) with a config swap.

This stack is intentionally separate from the production stack used in my other projects (Next.js / React / MUI). This repo is the craft side of the brain.

## Local development

Requires Node 20+ (see [`.nvmrc`](./.nvmrc)).

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # build to dist/
npm run preview    # preview the production build
npm run typecheck  # astro check
```

## Project structure

```
src/
  layouts/        BaseLayout — shared head, nav, transition overlay
  components/     One folder per page (home, projects, experience, contact, nav)
  pages/          One file per route (.astro)
  lib/
    three/        Three.js scenes (homeScene, projectsScene)
    gsap/         GSAP timelines per page
    terminal/     Terminal command parser and runtime
    transitions/  Page transitions (canvas particle dissolve)
  data/           Project metadata, timeline entries
  styles/         global.css (Tailwind v4 + CSS vars)
public/           Static assets — favicon, manifest, OG images, fonts, robots
```

## Performance & accessibility

- Three.js is dynamically imported and only loaded on the pages that need it
- Three.js scenes are skipped entirely on small screens and when `prefers-reduced-motion: reduce` is set, with a static fallback
- All animations respect `prefers-reduced-motion`
- Skip-link, semantic landmarks, ARIA labels, focus-visible rings per theme
- All Three.js resources are explicitly disposed on `beforeunload`

## Deployment

Deployed on [Vercel](https://vercel.com/) with caching and security headers configured in [`vercel.json`](./vercel.json):

- Long cache (1 year, immutable) for `/_astro/` hashed assets and `/fonts/`
- Short cache (1 day) for OG images and favicons
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` on every response

Deploys are automatic on every push to `master`.

## License

[MIT](./LICENSE)
