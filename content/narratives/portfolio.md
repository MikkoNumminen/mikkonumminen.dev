---
title: How the portfolio site was built · development narrative
project: portfolio
kind: project
type: narrative
date: 2026-06-28
---

## Origin

mikkonumminen.dev began on 2026-04-06: the first commits bootstrapped an Astro + TypeScript project and added Tailwind, Three.js, and GSAP. It is a fully static personal portfolio for a full-stack developer. The README frames the stack choice as deliberate: kept separate from the author's production stack (Next.js / React / MUI) as "the craft side of the brain." Four routes each carry their own self-contained interactive concept: a home page with a 3D WebGL name and particle field, a `/projects` solar system where each project orbits a sun, an `/experience` parallax mountain with a goat that climbs as you scroll, and a `/contact` CRT terminal with a real command parser. Almost the entire structure. All four scenes, the canvas particle-dissolve page transition, OG images, and SEO, landed in the first day's burst of commits; the three locales (en/fi/sv) followed two days later.

## Key technical choices and the why

The governing decision is static output only (ADR 0002): `output: 'static'` for host portability, zero cold starts, and no server-side injection surface, at the cost of a once-per-session client-side locale redirect. Astro over Next.js (ADR 0003) follows from it: island architecture ships JS only on pages that opt in, and each Three.js scene owns its own lifecycle with no React reconciliation layer. TypeScript runs strict with `noUncheckedIndexedAccess`, and ESLint treats `any` as an error. Later choices: a dual-deck audio crossfade (ADR 0004), the skills registry as a committed artifact (ADR 0005/0006), an Astro 6 + Node 22 upgrade to stay on a supported toolchain (ADR 0007), and a RAG chat built as a separate local backend so the static-only constraint survives intact (ADR 0009).

## Dead ends and how they resolved

The git history records several real pivots. The `/projects` page shipped with CLS of 1.0 (Lighthouse perf 76): the scene block was hidden by an HTML attribute that JS removed on capable clients, producing a one-frame empty render then a full-viewport reflow; the fix moved hiding into CSS media queries so the correct state shows before JS runs (the mobile fallback had the same bug). An early Three.js refactor found that a font-load failure leaked the entire home scene graph: the font now loads before the renderer is built, and extracted a shared `disposeMaterial` helper; a later refactor added `disposePasses`, because `composer.dispose()` does not free `RenderPass`/`OutputPass` resources. A DPR-cap regression had hardcoded the resize handler to 2 while init used 1.5, silently re-upgrading retina DPR on every resize; sharing one `resolvePixelRatio` helper killed that drift class. Scene-boot perf went through `requestIdleCallback`, then a first-interaction trigger; a modulepreload attempt was reverted because Vite emitted the source `.ts` as an asset the browser refuses to load as a module. Named Three.js imports were adopted but did not shrink the ~540 KB bundle (tree-shaking defeated by Three's internal interdependencies). The registry auto-sync bug (ADR 0006) had `prebuild` overwriting the enriched committed registry with the raw scan on every Vercel build, downgrading ~1,850 lines of measured data, resolved by dropping the sync and treating the committed file as canonical. On the RAG side: the model deflected ("type help") on answerable questions until the prompt was rewritten to synthesize grounded answers; a ReadLog .NET question was answered from Platform's race until project-aware retrieval was added; tech-aware retrieval false-fired (bare "c#" on musical notes, "razor" on shaving) until narrowed to scoped aliases; and a hard English-only rule replaced the small model's poor Finnish.

## Notable implementation details

The audio crossfade uses equal-power cosine/sine curves so combined power stays constant; two decks share one source, playhead is persisted via `sessionStorage` across hard navigations, and an `ended` listener is the safety net. Voiceover layers guard two specific `bg-audio:state` races and exclude `pointermove` from the idle-replay timer. Other touches: frustum-fit title math, an `IntersectionObserver` offscreen pauser, a 60 fps cap on high-refresh displays, and on the RAG backend a deterministic weak-retrieval gate before the LLM, a `num_predict` hard cap, semaphore-bounded concurrency, and an SSE parser that writes via `textContent`, never `innerHTML`.

## Outcome

The 2026-05-17 audit recorded Lighthouse performance of 96–99 across all 12 routes with CLS 0.000 on the WebGL pages. Testing is layered (ADR 0008): Vitest + jsdom for extracted scene math, Playwright scene-smoke for all four pages, a coverage ratchet, and CodeQL on the `security-and-quality` suite as a CI gate. An AI-first self-rating reached 9.1/10. The site deploys to Vercel automatically on push to `master`; the RAG backend runs locally (WSL2 + Docker, RTX 3080 Ti) and is exposed over a Tailscale Funnel, toggling on and off without a redeploy. Status: work in progress.
