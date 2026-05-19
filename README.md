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

## Languages

Available in English, Finnish, and Swedish — served from `/`, `/fi`, and `/sv` respectively. English is the default locale and is served without a prefix. Translations live under `src/i18n/locales/`.

## Audio

A looping music bed plays across every page, dual-decked and crossfaded so the loop join is inaudible. On `/` and `/projects` a locale-specific voiceover narration is layered on top of the music. A single floating **sound on/off** button in `BackgroundAudio.astro` controls both tracks via a custom `bg-audio:state` event; on/off preference and music playhead persist across navigation through `sessionStorage`. Voice clips don't autostart — they kick in after the audio toggle resolves and recycle on a 50-second idle window so an active visitor isn't re-narrated at. Both narration layers respect `prefers-reduced-motion: reduce` and stay silent; music still plays.

Assets live in [`public/audio/`](public/audio/) and are keyed by locale: `voice-landing-{en|fi|sv}.mp3` (home) and `voice-projects-{en|fi|sv}.mp3` (galaxy view). Locales without a recording 404 the audio element silently and the page stays usable.

## Tech stack

- [Astro](https://astro.build/) — static site generator with island architecture
- [Three.js](https://threejs.org/) — 3D graphics for the home and projects pages
- [GSAP](https://gsap.com/) + ScrollTrigger — scroll-driven animation timelines
- [Tailwind CSS v4](https://tailwindcss.com/) — utility CSS, no component library
- TypeScript (strict, with `noUncheckedIndexedAccess`)

The build output is fully static — no SSR, no edge functions — so it can move from Vercel to any static host (S3 + CloudFront, Cloudflare Pages, etc.) with a config swap.

This stack is intentionally separate from the production stack used in my other projects (Next.js / React / MUI). This repo is the craft side of the brain.

## Local development

Requires Node 20+ (see [`.nvmrc`](./.nvmrc)).

```bash
npm install
npm run dev           # http://localhost:4321
npm run build         # build to dist/
npm run preview       # preview the production build
npm run typecheck     # astro check
npm run format        # prettier --write across src/
npm run format:check  # prettier --check (CI-friendly)
npm run build:og      # rasterize OG cards + manifest icons from the source SVGs
npm test              # run the Vitest suite (i18n + project data)
npm run test:watch    # Vitest in watch mode for TDD
```

`build:og` reads `public/og-*.svg` and `public/favicon.svg` and writes the PNGs referenced by `<head>` meta and `public/manifest.webmanifest`. Run it whenever any of those source SVGs change.

## Project structure

```
src/
  layouts/        BaseLayout — shared head, nav, transition overlay
  components/     One folder per page (home, projects, experience, contact, nav)
  page-content/   Page-level composition (one .astro per page, wrapped by the routed file)
  pages/          One file per route (.astro), including /fi and /sv mirrors
  lib/
    three/        Three.js scenes (homeScene, projectsScene)
    gsap/         GSAP timelines per page
    terminal/     Terminal command parser and runtime
    transitions/  Page transitions (canvas particle dissolve)
  data/           Project metadata, timeline entries
  i18n/           Locale dictionaries and locale-aware path helpers
  styles/         global.css (Tailwind v4 + CSS vars) and per-component CSS
public/           Static assets — favicon, manifest, OG images, fonts, robots, icons
scripts/          Build helpers (build-og.mjs)
```

## Performance & accessibility

- Three.js is dynamically imported and only loaded on the pages that need it
- Three.js scenes are skipped entirely on small screens and when `prefers-reduced-motion: reduce` is set, with a static fallback
- All animations respect `prefers-reduced-motion`; the home and projects voiceovers also skip narration on RM (music still plays)
- Skip-link, semantic landmarks, ARIA labels, focus-visible rings per theme
- All Three.js resources are explicitly disposed on `beforeunload`

## AI tooling

Custom Claude Code skills live in [`.claude/skills/`](.claude/skills/) — version-controlled, reviewed when added, audited per run. Each skill spawns N parallel Sonnet sub-agents that return structured reports; an Opus synthesizer applies the agreed-on rules and opens a PR. The orchestrator never merges — human review is the gate.

### [`/sync-readmes`](.claude/skills/sync-readmes/SKILL.md)

**Description:** Audits this site's project data (`src/data/projects.ts` + en/fi/sv `projectsData`) against the canonical READMEs of all 6 sibling repos in parallel. Opens a PR with drift corrections — factual fixes mirrored to all three locales, tech-list additions in `projects.ts`.

**Token economics per run:** ~140K Sonnet input across 6 parallel sub-agents, ~10K kept on the orchestrator's main context (vs ~31K if read inline), ~45s parallel wall-clock, ~$0.80 in API spend.

**Results to date** (2 runs): 15 factually wrong copy fixes across three locales (test counts, engine counts, normalization-pass counts), 14 missing tech tags across 5 projects, 4 cross-project link gaps caught. Self-correcting: run 2 caught a highlight that hadn't received the cross-project update its description got in run 1.

The token-savings story is honest: dollar savings vs an inline read are modest. The real win is keeping the orchestrator's context budget free for the actual edit work without triggering compaction — and surfacing factual drift that nobody hand-grep-audits across 6 sibling repos.

## Observability

Client-side errors and Core Web Vitals (LCP, CLS, INP, FCP, TTFB) are reported to Sentry from real visitors. Activation is gated on the `PUBLIC_SENTRY_DSN` env var — forks without it run silent. Do Not Track is honored (init bails early). No session replay, no PII capture beyond Sentry defaults (URL, browser, stack trace). The init lives in `src/lib/observability/initObservability.ts` and is called once from `BaseLayout.astro`. Rationale + alternatives in [`docs/decisions/0001-observability-sentry.md`](docs/decisions/0001-observability-sentry.md).

## Deployment

Deployed on [Vercel](https://vercel.com/) with caching and security headers configured in [`vercel.json`](./vercel.json):

- Long cache (1 year, immutable) for `/_astro/` hashed assets and `/fonts/`
- Short cache (1 day) for OG images and favicons
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, and `Content-Security-Policy` on every response

Deploys are automatic on every push to `master`.

### Security headers

The CSP shipped in `vercel.json` is deliberately baseline rather than strict:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self' https://*.ingest.sentry.io;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests
```

`connect-src` allows `*.ingest.sentry.io` for the observability beacon (see the Observability section above). The init module no-ops when `PUBLIC_SENTRY_DSN` is unset, so this domain only sees traffic on deployments that have the DSN configured.

`'unsafe-inline'` remains on both `script-src` and `style-src` because the site relies on:

- Astro's inline hoists for small island bootstrap code
- A JSON-LD `<script type="application/ld+json">` block in the layout
- An inline language-detection script in `BaseLayout` that runs before hydration
- Scoped inline styles from Astro component frontmatter

Moving to a nonce-based CSP would require plumbing a per-request nonce through every inline tag, which breaks the "fully static output" constraint (nonces must change per response). HSTS, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `upgrade-insecure-requests` cover the rest of the hardening surface in the meantime.

## License

[MIT](./LICENSE)
