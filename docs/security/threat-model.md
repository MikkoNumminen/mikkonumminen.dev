# Threat model — mikkonumminen.dev

A lightweight threat model for a fully static portfolio site. The goal is to make
the trust boundaries and the invariants that protect them explicit, so a change
(human or automated) doesn't silently weaken one.

**Last reviewed:** 2026-06-12

## What we're protecting

| Asset | Why |
| --- | --- |
| Visitor's browser | The only place untrusted-ish data meets code — must never become an XSS vector. |
| Site integrity & availability | A defaced or unavailable portfolio is the headline risk for a personal site. |
| Author reputation | The site _is_ the product; a security embarrassment is a credibility cost. |

There is **no user data to protect**: no accounts, no logins, no form submissions
stored server-side, no PII collected beyond anonymous client telemetry.

## Architecture in one paragraph

The site is pre-rendered to static HTML/CSS/JS by Astro and served from a CDN.
There is no server runtime, no database, and no authentication. The only "dynamic"
behaviour is client-side: Three.js scenes, GSAP timelines, and the contact-page
terminal, which fetches a **same-origin static JSON file** (`public/data/skills-registry.json`)
at runtime. All third-party network egress is to Sentry for telemetry.

## Trust boundaries & mitigations

| # | Boundary | Threat | Mitigation | Invariant |
| - | --- | --- | --- | --- |
| 1 | String → `innerHTML` (terminal output, Three.js hover label) | Reflected/stored XSS via command args or registry text | [`escapeHtml`](../../src/lib/utils/escapeHtml.ts) escapes the five HTML-significant characters; applied at every sink (`commands.ts`, `dom.ts`, `skills.ts`, `createHoverLabel.ts`) | **Anything reaching `innerHTML` must pass `escapeHtml` first.** Covered by `escapeHtml.test.ts`. |
| 2 | Runtime fetch of `skills-registry.json` | Malformed/oversized data breaking the terminal; tampered data injecting markup | Same-origin, author-controlled committed file; CSP `connect-src 'self'`; values are escaped at the `innerHTML` sink (boundary 1) | The file is cast `as SkillRegistry` **without runtime schema validation** — a known gap. Treat its contents as data, never as trusted HTML. |
| 3 | HTTP response headers | Clickjacking, MIME sniffing, protocol downgrade, referrer leakage, feature abuse | CSP, HSTS `preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, locked `Permissions-Policy`, `frame-ancestors 'none'`, `object-src 'none'` — all in [`vercel.json`](../../vercel.json) | **Do not weaken these without a recorded reason.** Widening `script-src`/`connect-src` or removing `frame-ancestors`/`object-src` needs explicit justification. |
| 4 | Third-party egress (Sentry) | Data exfiltration via a compromised or over-broad allowlist | `connect-src` allowlists only `*.ingest.sentry.io` (+ regional hosts); DSN is public by design; no other third-party scripts load | Keep the Sentry hosts the **only** non-`'self'` `connect-src` entries. No new third-party origins without updating this model. |
| 5 | npm dependencies | Supply-chain / known-CVE exploitation | [Dependabot](../../.github/dependabot.yml) update PRs; `npm audit`; static output shrinks reachability (see below) | New `high`/`critical` **production** advisories should be triaged, not ignored. |

## CSP (current)

The active policy in `vercel.json` — the canonical copy:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
media-src 'self';
connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io;
frame-ancestors 'none'; base-uri 'self'; form-action 'self';
object-src 'none'; worker-src 'none'; manifest-src 'self'; frame-src 'none';
upgrade-insecure-requests
```

`'unsafe-inline'` on `script-src`/`style-src` is the one notable relaxation. It is
required because a fully static build cannot emit a per-request nonce (nonces must
change per response, which breaks portable static hosting — see
[ADR 0002](../decisions/0002-static-output-only.md)). The mitigation is that the
site loads **no third-party scripts** and there is no server-reflected HTML, so the
classic injection path for inline-script XSS does not exist; boundary 1 closes the
client-side one.

## Dependency advisory status (2026-06-13)

The **Astro 5 → 6 upgrade has been adopted**, which cleared the two Astro-native
high advisories:

- ~~**Astro — XSS in `define:vars` via incomplete `</script>` sanitization.**~~
  Fixed in Astro 6 (and never reachable here — `define:vars` is used only with
  static, author-controlled values).
- ~~**Astro — Server-island encrypted-parameter replay.**~~ Fixed in Astro 6 (and
  not reachable — `output: 'static'`, no server islands).

The advisories that **remain** all reduce to a single transitive package,
**`esbuild` (0.17.0–0.28.0)**, with **no fix available** — it propagates up through
`vite` and `astro`, so `npm audit` counts it on each:

- **esbuild — arbitrary file read via the dev server (Windows).** Reachable only
  while running `astro dev` on Windows; not part of any deployed artifact.
- **esbuild — missing binary integrity verification in the Deno module.** Requires
  Deno, which this project does not use.

Both are **build-time/dev-only**: esbuild runs during local dev and the build, never
in the static files served to visitors. There is no patched esbuild in `vite`'s
supported range, so they are **accepted, not actionable** — forcing an override
risks breaking the build for a vulnerability with no production reach. They will
clear when the Vite/esbuild chain ships a fixed release. (Dev tooling such as
`@astrojs/check` may surface separate advisories that likewise never reach
visitors.)

## Out of scope / non-goals

- DoS / volumetric attacks (handled at the CDN/platform layer).
- Hardening the Vercel platform itself.
- Anything requiring a compromised developer machine or stolen credentials.
- A nonce-based CSP (incompatible with the static-output constraint).

## Reporting

See [`SECURITY.md`](../../SECURITY.md).
