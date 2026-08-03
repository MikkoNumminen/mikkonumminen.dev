# Security policy

## Reporting a vulnerability

Email **numminen.mikko.petteri@gmail.com** with a description, reproduction steps,
and the affected URL or file. This is a personal portfolio with no bug-bounty
program, but reports are welcome and will be acknowledged. Please do not open a
public issue for an unfixed vulnerability.

A response can be expected within a few days.

## Scope

- The deployed static site (`mikkonumminen.dev` / the `vercel.app` alias).
- This repository's source and build output.
- The **RAG chat backend** reachable at `paskamyrsky.tail6ed53b.ts.net` and
  through the site's own `/api/rag/*` rewrite, including the shoutbox write
  endpoint.

Out of scope: the third-party hosting platform (Vercel) itself, denial-of-service,
and findings that require a compromised local developer machine.

## Security posture

The site and the backend have genuinely different postures, and conflating them
is the mistake this section exists to prevent. **The static-site claims below do
not extend to the backend.**

### The static site

Deliberately small in attack surface:

- **Fully static output** — no SSR, no server runtime, no database, and no
  authentication *in the deployed site itself*. Pages are pre-rendered HTML
  served from a CDN.
- **No secrets** — the site requires no application secrets and ships no `.env`.
  The environment variables it reads at build time are: Vercel-injected metadata
  (`VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`) used to compute the
  canonical URL; an optional `PUBLIC_SENTRY_DSN` enabling client telemetry (a
  `PUBLIC_`-prefixed value is exposed to the browser by design — a Sentry DSN is
  not a secret); and an optional `CHROME_PATH` for local PDF rendering.
- **Hardened response headers** — a strict Content-Security-Policy, HSTS with
  `preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a
  locked-down `Permissions-Policy`, and `frame-ancestors 'none'` / `object-src
  'none'`. All defined in [`vercel.json`](vercel.json).
- **One HTML-injection boundary** — every string interpolated into `innerHTML`
  passes through [`escapeHtml`](src/lib/utils/escapeHtml.ts).

### The RAG chat backend

A FastAPI service with a Postgres/pgvector database and a local LLM, running on
a home machine and published through a Tailscale Funnel. The honest posture:

- **Publicly reachable and unauthenticated.** The funnel proxies the whole
  origin, so every route is addressable by anyone who reads `vercel.json` or the
  CSP — not only through the site's `/api/rag/*` rewrite. No route carries
  authentication. This is a deliberate, documented choice for a portfolio demo,
  not an oversight; the compensating controls are architectural, described in
  [`docs/rag-chat.md`](docs/rag-chat.md) and in the module docstring of
  [`chat-backend/app/shoutbox.py`](chat-backend/app/shoutbox.py).
- **Per-IP rate limiting is weaker than it looks.** Tailscale's proxy overwrites
  `X-Forwarded-For`, so visitors arriving via Vercel share one bucket while a
  direct-to-funnel caller gets a real per-IP one. The limits that actually bound
  a flood are the identity-independent ones (`QUEUE_MAX_PENDING`, concurrency
  shedding).
- **The shoutbox stores visitor-submitted text server-side**, in a moderation
  queue. Nothing it accepts can reach the public page: the site renders a
  committed JSON snapshot that only changes when the owner approves an entry and
  commits it. The submission gate is deterministic and contains no LLM, by
  design.
- **Containment for the chat is architectural, not prompt-wording.** Input caps,
  a pre-LLM relevance gate, task gates, and a hard output cap are what make
  refusals hold. Prompt injection is not a solved problem and is not claimed to
  be solved here.
- **One real secret shape.** `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` for queue
  notifications, kept in a gitignored `.env`. There is no funnel bearer
  credential — Tailscale Funnel authenticates by tailnet membership.

The trust boundaries, security invariants an agent or contributor must not weaken,
and the current dependency-advisory status are documented in
[`docs/security/threat-model.md`](docs/security/threat-model.md).

## Dependency advisories

Dependencies are monitored by [Dependabot](.github/dependabot.yml). Run
`npm audit` for the current state. The **Astro 5 → 6 upgrade has been adopted**
(see [ADR 0007](docs/decisions/0007-astro-6-node-22.md)), which cleared the two
Astro-native high advisories. The remaining highs reduce to one transitive,
dev-only `esbuild` advisory pair with no fix available — not present in the
static production artifact. See [the threat model](docs/security/threat-model.md)
for the per-advisory reachability analysis.
