# ADR 0001 — Client-side observability via Sentry + Web Vitals

**Status:** accepted
**Date:** 2026-05-08
**Decided by:** repo owner

## Context

The site is a fully static Astro build. There are no API routes, no backend,
no server logs. The runtime is the visitor's browser. The site is actively
iterated on: the codebase ships hand-written Three.js scenes, GSAP timelines,
a custom terminal command parser, and a canvas page-transition. Each of those
is a real surface for runtime errors that don't fail the build, don't fail
typecheck, don't fail any current test (there are none), but **do** fail in
the wild — a Three.js init exception on Safari iOS, a font-load rejection on
a flaky CDN, a GSAP tween writing to a disposed Vector3.

Until this ADR, none of those errors had any feedback path back to the
developer. A recruiter could load the site, see a blank canvas, and the
developer would have no signal whatsoever.

A maturity audit (2026-05-08) scored the project at T0 on the
"runtime & observability" axis — the floor of the model. Code structure,
security headers, and documentation all sit at T2. The floor capped the
project; raising observability to T1 was the cheapest, highest-leverage
single change.

## Decision

Adopt **Sentry's `@sentry/browser` SDK** for client-side error tracking,
plus the **`web-vitals` library** for Core Web Vitals (LCP, CLS, INP, FCP,
TTFB) reporting into Sentry as custom measurements / breadcrumbs.

Implementation:

- One init module: `src/lib/observability/initObservability.ts`. Called once
  from `BaseLayout.astro`'s primary client script.
- Activation gated on `import.meta.env.PUBLIC_SENTRY_DSN`. Without the env
  var (default for forks, local dev) the init is a no-op.
- Do Not Track honored: if `navigator.doNotTrack === '1'`, init bails before
  any beacon fires.
- `Sentry.browserTracingIntegration()` auto-starts a pageload span on every
  visit so Web Vitals attach as span attributes (chartable in Sentry's
  Performance / Insights views) rather than falling through to breadcrumbs.
- `tracesSampleRate: 1.0`. Personal-portfolio traffic is well under
  Sentry's free-tier 10K performance-units/month cap; full sampling gives
  meaningful real-user metrics without breaking the budget. Initial draft
  used 0.1 — that dropped 90% of pageload spans, leaving 90% of vitals
  un-chartable. Revised before merge.
- No session replay, no PII capture beyond Sentry defaults (URL, browser,
  stack trace).
- CSP `connect-src` extended to allow `https://*.ingest.sentry.io` only.
  The Sentry SDK runtime only needs the DSN's ingest endpoint; `*.sentry.io`
  proper (web UI, dashboard) is not reached from the browser. Documented
  inline in [`vercel.json`](../../vercel.json) and the README CSP rationale
  block.

## Considered alternatives

### A. Vercel Analytics + Vercel Speed Insights

Native Vercel integrations, no third-party domain in CSP, simpler. **Rejected**
because they capture aggregate metrics only — no JS-error tracking. The actual
floor-axis gap is "we can't see when the page throws," not "we can't count
pageviews." Vercel's offerings would leave that gap open.

### B. Self-hosted error endpoint via a tiny Vercel Edge function

Zero new third-party domain in CSP. **Rejected** because the site is
explicitly static (`output: 'static'` in `astro.config.mjs`). Adding any
runtime function changes the deploy-target story documented in the README
("can move from Vercel to any static host with a config swap"). Sentry's
ingest URL keeps the static-only constraint intact.

### C. GoatCounter or Plausible analytics

Privacy-friendly, simpler, smaller. **Rejected** for the same reason as A —
analytics-only, no error tracking. Could be added alongside Sentry if
visitor metrics are wanted; orthogonal to this decision.

### D. `@sentry/astro` integration with auto-init + source-map upload

The canonical Astro path. Auto-instruments client and server, uploads source
maps during build if `SENTRY_AUTH_TOKEN` is set. **Rejected (for now)**
because the integration assumes both client + server contexts (the SSR side
is a no-op for a static site but adds bundle weight) and its boot timing is
opinionated. The browser-only path with explicit init at the layout level
matches the existing codebase's "explicit lifecycle" style (every Three.js
scene, every GSAP timeline, the page-transition manager all init explicitly
from BaseLayout). Source-map upload can be added later as a separate ADR
without rewiring the runtime path.

## Consequences

### Gained

- **Errors and unhandled rejections from real visitors land in Sentry** with
  stack trace, browser, OS, URL, and breadcrumbs. MTTD (mean time to detect)
  for a runtime regression drops from "if a recruiter happens to email" to
  "minutes."
- **Real Core Web Vitals from real visitors** instead of Lighthouse-on-CI
  guesses. LCP/CLS/INP medians become observable.
- **Maturity axis raised:** Runtime & observability moves T0 → T1. The
  project floor shifts from observability to testing-and-quality (next
  candidate for follow-up).

### Costs

- One new third-party domain in CSP (`*.sentry.io`, `*.ingest.sentry.io`) —
  documented in README. CSP loosening is small but real.
- One runtime dependency (`@sentry/browser` is ~30 KB gzipped, lazy-loaded
  after the page is interactive via Sentry's standard init pattern).
- `web-vitals` is ~2 KB gzipped.
- Recurring: a Sentry account on the free tier (covers personal portfolio
  traffic indefinitely; 5K errors / 10K performance units per month).

### Operator setup (one-time)

1. Create a free Sentry account → create a project → copy the DSN.
2. Set `PUBLIC_SENTRY_DSN` in Vercel project env vars (Production AND
   Preview).
3. Verify by visiting the deployed preview, throwing a synthetic error from
   DevTools console, and confirming the issue appears in Sentry within a
   minute.
4. Until step 2 is done, the init module is a no-op — the site behaves
   identically to before this ADR. Forks without the DSN see zero impact.

## Open follow-ups

- **Source-map upload at build time** for symbolicated stack traces. Requires
  `SENTRY_AUTH_TOKEN` in CI + Vercel build env. Separate ADR / PR. Worth
  doing once the first non-trivial production error lands and the
  unsymbolicated stack proves frustrating.
- **Performance budget alerts** wired from Sentry into a Slack/email channel
  once enough baseline data accumulates.
- **The next maturity-floor jump** (testing & quality T1 → T2 via Playwright
  smoke tests) is now the cheapest next move per the same audit. Separate
  proposal.
