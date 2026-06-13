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

Out of scope: the third-party hosting platform (Vercel) itself, denial-of-service,
and findings that require a compromised local developer machine.

## Security posture

This site is deliberately small in attack surface:

- **Fully static output** — no SSR, no server runtime, no database, no
  authentication, and no user accounts. Pages are pre-rendered HTML served from a
  CDN. There is no server-side code path an attacker can reach.
- **No secrets** — the site requires no application secrets and ships no `.env`.
  The only environment variables read at build time are Vercel-injected metadata
  (`VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`) used to compute the
  canonical URL, plus an optional `CHROME_PATH` for local PDF rendering. The Sentry
  DSN used for client telemetry is public by design.
- **Hardened response headers** — a strict Content-Security-Policy, HSTS with
  `preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a
  locked-down `Permissions-Policy`, and `frame-ancestors 'none'` / `object-src
  'none'`. All defined in [`vercel.json`](vercel.json).
- **One HTML-injection boundary** — every string interpolated into `innerHTML`
  passes through [`escapeHtml`](src/lib/utils/escapeHtml.ts).

The trust boundaries, security invariants an agent or contributor must not weaken,
and the current dependency-advisory status are documented in
[`docs/security/threat-model.md`](docs/security/threat-model.md).

## Dependency advisories

Dependencies are monitored by [Dependabot](.github/dependabot.yml). Run
`npm audit` for the current state. As of this writing the open advisories resolve
with the Astro 5 → 6 major upgrade (a breaking change); see the threat model for
reachability analysis.
