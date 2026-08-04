# ADR 0002: Static output only

**Status:** accepted
**Date:** 2026-05-17
**Decided by:** repo owner

> **Update (2026-08-01):** Swedish (`/sv/`) was removed as a served locale in
> PR #476: the site now pre-renders `/` and `/fi/` only. The build-time /
> load-time locale-negotiation decision below is unchanged. See
> [`swedish-locale-removal-2026-08.md`](../audits/swedish-locale-removal-2026-08.md)
> for why it was removed and what was deliberately kept.

## Context

The site is a visual portfolio with four pages, no user accounts, no
server-side state, and no runtime data that changes between requests.
Every page can be fully resolved at build time: content is static,
translations are embedded into each locale's HTML, and personalisation
is not a goal.

The deployment target at the time this decision was made is Vercel, but
any static host (S3 + CloudFront, Cloudflare Pages, GitHub Pages) can
serve the output without change. Keeping that portability is a deliberate
requirement: it prevents lock-in to any one provider's proprietary
runtime and avoids introducing a billing surface tied to compute.

Astro supports three output modes: `'static'` (fully pre-rendered),
`'hybrid'` (opt-in SSR per route), and `'server'` (SSR by default). A
portfolio with no server-side needs sits naturally at `'static'`. The
choice is explicit in [`astro.config.mjs`](../../astro.config.mjs):

```js
output: 'static',
```

Locale negotiation follows the same constraint. Astro's i18n routing with
`prefixDefaultLocale: false` generates separate pre-rendered HTML trees
per served locale at build time, `/` and `/fi/` today; `/sv/` as well when
this was written, per the Update above. There is no `Accept-Language`
header inspection at runtime; browser locale negotiation is handled by a
small inline script in `BaseLayout.astro` that reads
`navigator.languages` and redirects once on the client side. This keeps
all routing logic in the browser and the build, with no edge middleware
needed.

The CSP rationale block in the README explicitly calls out that a
nonce-based CSP would require a per-request nonce plumbed through every
inline tag, which is incompatible with fully static output. Static files
cannot vary per response, so this constraint reinforces the `'static'`
choice: relaxing it would require SSR, which would in turn require a
runtime and a new CSP strategy.

## Decision

Set `output: 'static'` in `astro.config.mjs` and maintain it as a
hard constraint. No SSR routes, no edge functions, no runtime secrets,
no server-side state.

Locale negotiation is performed at build time (separate HTML trees per
locale) and at load time in the browser. No `Accept-Language` middleware
runs at the CDN or server layer.

The build artefact in `dist/` is a directory of static files that any
HTTP server can host.

## Considered alternatives

### A. `output: 'hybrid'` with a few SSR routes

Astro hybrid mode would allow, for example, a redirect route that reads
`Accept-Language` and issues a `302` before the browser loads anything.
**Rejected** because it introduces a Node.js / edge function runtime as a
deployment dependency. Moving hosts would then require matching function
support, eliminating the "config swap" portability guarantee. The UX
benefit (no client-side redirect flash) is marginal for a personal
portfolio.

### B. Vercel Edge middleware for `Accept-Language` redirect

A thin `middleware.ts` running on Vercel's edge network can inspect
`Accept-Language` and rewrite/redirect to the correct locale path before
the page is served. **Rejected** for the same reason as A: it binds
locale logic to Vercel's runtime. The current client-side redirect runs
once, is imperceptible at broadband latency, and keeps the build output
host-agnostic.

### C. Runtime secrets / server-rendered personalisation

Not a current need, but raised here for completeness. Adding any
server-side personalisation (e.g. A/B variants, auth-gated content)
would require SSR. **Not applicable**: the portfolio has no such
requirements and no plans to introduce them.

## Consequences

### Gained

- **Portability:** the `dist/` directory can be dropped on S3 + CloudFront,
  Cloudflare Pages, Vercel, GitHub Pages, or any plain web server. Moving
  hosts requires only a config swap, as documented in the README.
- **Simplicity:** no runtime, no cold starts, no function logs to manage,
  no server-side secrets to rotate.
- **Security surface reduction:** without a server runtime there are no
  server-side injection surfaces, no runtime dependency vulnerabilities
  to patch, and no server-side auth tokens to protect.
- **Cost floor:** static hosting is free or near-free at personal-portfolio
  traffic levels on every major provider.
- **CDN cacheability:** every response is identical for every visitor,
  so `Cache-Control: max-age=31536000, immutable` on hashed assets is
  unconditionally correct. No cache-keying by session or locale needed
  beyond the URL path.

### Costs

- **Client-side locale redirect:** a visitor whose browser prefers Finnish
  but lands on `/` will see a brief redirect to `/fi/`. This is a
  one-time cost per browser session (sessionStorage guards repeat
  redirects) and is imperceptible at normal latency.
- **No `Accept-Language` at the edge:** search engines may index the
  English root by default. `hreflang` annotations in `<head>` and the
  sitemap compensate for this, but it is a weaker signal than a
  server-side language redirect for SEO.
- **Build-time locale bake-in:** adding a new locale requires a full
  rebuild and redeploy rather than a runtime config change.
