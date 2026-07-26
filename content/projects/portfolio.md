---
title: Portfolio — mikkonumminen.dev
project: portfolio
url: https://mikkonumminen.dev
---

# Portfolio

**This site**

This is the portfolio site you are reading from. It is fully static — no SSR, no edge functions — built with Astro, Three.js, and GSAP. The site is a visual showcase, with each page built as its own concept and animation, intentionally separate from the production stack used in HRM and Platform.

The four pages each have a distinct interactive concept:

- **Home (`/`)** — immersive scroll experience where a WebGL particle field reshapes continuously between the formed name, a galaxy, a wordmark and a sparse field, reacts to clicks, and dissolves into a starfield behind the content as you scroll; GSAP scroll triggers and parallax sections.
- **Projects (`/projects`)** — interactive solar system where each project orbits a central sun. Hover a planet for its elevator pitch; click to zoom in.
- **Experience (`/experience`)** — parallax mountain landscape. A goat climbs as you scroll; the sky shifts from pre-dawn to bright day. Timeline markers fade in along the way.
- **Contact (`/contact`)** — terminal / CRT aesthetic with a real command parser, command history, tab completion, scan lines, and blinking cursor.

Page-to-page navigation is client-side (Astro's ClientRouter) with the built-in view transition, so the music bed plays continuously across pages. The site is available in English, Finnish, and Swedish.

Audio is a first-class feature: a looping music bed plays across every page, with locale-specific voiceover narration layered on top on the home and projects pages. Both layers respect `prefers-reduced-motion`. Three.js scenes are skipped entirely on small viewports and when `prefers-reduced-motion: reduce` is set.

The build output is fully static so it can move between Vercel, S3 + CloudFront, or Cloudflare Pages with a config swap.

## Tech stack

Astro, Three.js, GSAP, TypeScript, Tailwind CSS v4

## Connections

- The site's looping music bed is composed in strudel-patterns.

## Status

Work in progress — [mikkonumminen.dev](https://mikkonumminen.dev) · [GitHub](https://github.com/MikkoNumminen/mikkonumminen.dev)
