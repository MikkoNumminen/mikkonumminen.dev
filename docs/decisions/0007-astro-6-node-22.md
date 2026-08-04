# ADR 0007: Upgrade to Astro 6 + Node 22

**Status:** accepted
**Date:** 2026-06-13
**Decided by:** repo owner

## Context

The site ran on Astro 5. Two `high`-severity advisories were open against Astro
5 with no patch in the 5.x line:

- **XSS in `define:vars` via incomplete `</script>` sanitization.**
- **Server-island encrypted-parameter replay.**

Both had low reachability here (this site uses `define:vars` only with static,
author-controlled values, and `output: 'static'` means there are no server
islands), but the remediation of record is the **Astro 5 → 6 major upgrade**,
flagged in [the full audit](../audits/FULL-AUDIT-2026-05-17.md) and the AI-first
rating. Astro 6 requires **Node ≥ 22.12**.

## Decision

Upgrade `astro` 5 → 6 and bump `.nvmrc` 20 → 22 (CI reads `node-version-file`,
so the runner follows automatically). Move the Astro-ecosystem packages to their
Astro-6-compatible versions (`@astrojs/sitemap`, `@astrojs/check`,
`@sentry/astro`) and refresh `gsap` / `three` alongside.

## Considered alternatives

- **Stay on Astro 5.** Rejected: the only fix for the two Astro-native highs is
  the major upgrade; staying leaves them open indefinitely.
- **Force a patched `esbuild` via an npm `override`.** Rejected: the residual
  advisories (below) live in a transitive `esbuild` with no fixed release in
  Vite's supported range; forcing an override risks breaking the build for a
  vulnerability with no production reach.

## Consequences

- **Cleared** both Astro-native high advisories.
- **Residual:** the remaining `npm audit` highs all reduce to one transitive
  `esbuild` pair (Windows dev-server file read; Deno binary integrity), **no fix
  available**, both **build-time/dev-only**, and absent from the static
  production artifact. Accepted and documented in
  [`docs/security/threat-model.md`](../security/threat-model.md); they clear when
  the Vite/esbuild chain ships a fix.
- **Node 22** is now the floor (was 20). CI, local, and Vercel all run 22.
- Not browser-QA'd headlessly (the Vercel preview is auth-walled); all gates
  (typecheck/lint/test/build) pass and the build emits all 13 pages cleanly.

Landed in PR #222.
