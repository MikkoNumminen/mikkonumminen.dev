# K — Observability & Ops Audit

**Date:** 2026-05-17
**Branch:** audit/K (off audit/baseline @ b3de9f2)
**Auditor:** Agent K (read-only)

---

## 1. Observability Inventory

### Implementation

Single init module: [`src/lib/observability/initObservability.ts`](src/lib/observability/initObservability.ts) (110 lines).
Called once from [`src/layouts/BaseLayout.astro:214`](src/layouts/BaseLayout.astro#L214), so every route is covered.
SDK: `@sentry/browser` (not `@sentry/astro`) + `web-vitals@5.2.0`.

### What is tracked

| Signal | Tracked? | Notes |
|--------|----------|-------|
| JS exceptions (window error) | Yes | Sentry SDK auto-hooks `window.onerror` on `Sentry.init()` |
| Unhandled promise rejections | Yes | Sentry SDK auto-hooks `unhandledrejection` on `Sentry.init()` |
| LCP | Yes | `onLCP(reportVital)` — line 104 |
| CLS | Yes | `onCLS(reportVital)` — line 105 |
| INP | Yes | `onINP(reportVital)` — line 106 |
| FCP | Yes | `onFCP(reportVital)` — line 107 |
| TTFB | Yes | `onTTFB(reportVital)` — line 108 |
| Page views | Implicit | `browserTracingIntegration` auto-starts a pageload transaction per navigation; no explicit `Sentry.captureMessage("pageview")` call |
| Custom events | No | No `Sentry.captureMessage` / `captureEvent` calls anywhere in src/ |
| User identification | No | No `Sentry.setUser()` — correct for a public portfolio |
| Session replay | No | `replaysSessionSampleRate: 0` (line 91); Replay integration not imported |

### Sampling rate

`tracesSampleRate: 1.0` (line 86). Full sampling is justified in both the
file header comment and ADR 0001: personal-portfolio traffic is well under
Sentry's free tier of 10 K performance units/month. Correct choice at current
traffic levels; the comment directs the reader to dial it back if traffic grows.

### DSN gating

[`src/lib/observability/initObservability.ts:75`](src/lib/observability/initObservability.ts#L75)–76:
```ts
const dsn = import.meta.env[DSN_ENV_KEY] as string | undefined;
if (!dsn) return;
```

If `PUBLIC_SENTRY_DSN` is absent (local dev, forks, CI), `initObservability`
returns before calling `Sentry.init`. No beacon, no network request, no
console noise. The gate is solid.

### Do Not Track

[`src/lib/observability/initObservability.ts:33`](src/lib/observability/initObservability.ts#L33)–41 and line 73: `dntEnabled()` checks both `navigator.doNotTrack` and
`window.doNotTrack` for the values `'1'` and `'yes'`. If either is set, the
function returns before `Sentry.init` is called — meaning zero SDK
initialisation, zero beacons. The README claim is accurate; the code honors it
correctly.

### Session replay

Confirmed absent. `@sentry/replay` is not imported anywhere in the codebase.
`replaysSessionSampleRate: 0` (line 91) is defensive documentation, not a
live configuration.

---

## 2. PII / GDPR Assessment

### What Sentry sends by default (when active)

Sentry's browser SDK collects the following by default, regardless of any
explicit user identification:

- **URL** (full path, including query string) — attached to every event.
- **User agent string** — browser name, version, OS, device class.
- **IP address** — sent in the HTTP `X-Forwarded-For` header by the SDK.
  Sentry stores it unless `sendDefaultPii: false` or a server-side scrubbing
  rule is configured. The code does NOT set `sendDefaultPii: false`.
- **Stack trace** — file paths (as built), line/column numbers.
- **Breadcrumbs** — up to 50 (line 99: `maxBreadcrumbs: 50`). Breadcrumbs
  auto-capture: DOM click targets, `console.*` calls, XHR/fetch URLs, and
  navigation events. URL changes and clicked element descriptions are in scope.
- **Transaction name** — the page URL path (e.g. `/fi/projects`).
- **Performance attributes** — Web Vitals values with `webvital.*` keys.

### GDPR judgment

Under GDPR Art. 4(1) "personal data" includes any information that can
identify a natural person directly or indirectly. IP address is personal data
by consensus of EU supervisory authorities (ECJ case C-582/14, Breyer v.
Germany). User agent + IP together can narrow identity further.

**Conclusion: the current Sentry integration does collect personal data within
the meaning of GDPR.** The site serves Finnish and Swedish visitors; both
Finland and Sweden are EU member states. The data is processed by Sentry (a
US company), which is a transfer to a third country. Even though Sentry offers
a EU-region ingest endpoint and has DPA/SCCs available, the combination of:

1. IP address collection (not suppressed),
2. Transfer to a US sub-processor (Sentry, Inc.),
3. No consent mechanism,

means the site technically needs either (a) a legitimate-interest / strictly-
necessary lawful basis documented and published, or (b) opt-in consent before
the SDK initialises.

**Practical risk for a personal portfolio: low.** Supervisory authorities
do not pursue sole traders running non-commercial portfolios as a priority.
But the gap is real, not theoretical.

**Mitigation options (cheapest first):**
1. Add `sendDefaultPii: false` to `Sentry.init` — this stops IP from being
   forwarded. Error + Web Vitals tracking remains fully functional. This single
   change removes the most clearly personal datum (IP) with zero UX cost.
2. Enable server-side IP scrubbing in the Sentry project settings (belt +
   braces alongside option 1).
3. If a cookie banner is ever added for other reasons, wire Sentry init to
   consent acceptance. The DNT gate already models this pattern.

---

## 3. Cookie Banner

**No cookie banner exists.** There is no consent UI anywhere in `src/`.

**Should there be one?** Sentry does not set cookies and does not use localStorage
for tracking. The SDK does use a session envelope that can persist a `sentry-trace`
header value, but this is not a "cookie" under ePrivacy Directive Article 5(3)
meaning.

**Judgment: a cookie banner is not strictly required solely for Sentry.** The
ePrivacy Directive targets cookies and similar tracking technologies; Sentry's
beacon is a first-party XHR/fetch, not a cookie. GDPR consent is the more
relevant concern (see §2 above), and that can be addressed by `sendDefaultPii:
false` rather than a consent flow.

ADR 0001's implicit position (no banner needed) is defensible for this use
case given Sentry's non-cookie architecture.

---

## 4. Dashboard or Fire-and-Forget

ADR 0001 documents the *setup* process (create account, set DSN, verify with
a synthetic error) but **does not specify any review cadence or alert
configuration.** The "Open follow-ups" section mentions:

> **Performance budget alerts** wired from Sentry into a Slack/email channel
> once enough baseline data accumulates.

This is aspirational, not committed. At present there is no stated process for
looking at the data — no weekly triage, no alert rules for error-rate spikes,
no P95 LCP threshold alert.

**Tag: fire-and-forget.** Data accumulates; nobody has committed to reading it.
This is acceptable for a personal portfolio (the cost of missing a minor error
is low) but it defeats the MTTD improvement cited as the primary motivation in
ADR 0001. A single Sentry alert rule ("new issue opened") sent to the owner's
email would convert this from fire-and-forget to minimally operational at
zero cost.

---

## 5. manifest.webmanifest Validity

File: [`public/manifest.webmanifest`](public/manifest.webmanifest)

| Required field | Present? | Value |
|----------------|----------|-------|
| `name` | Yes | `"Mikko Numminen"` |
| `short_name` | Yes | `"Mikko N."` |
| `start_url` | Yes | `"/"` |
| `display` | Yes | `"standalone"` |
| `theme_color` | Yes | `"#050807"` |
| `background_color` | Yes | `"#050807"` |
| `icons` | Yes | 4 entries (SVG any, 192 PNG, 512 PNG, 512 maskable) |

All required fields are present and well-formed.

### Icon file verification

Manifest references these files under `public/`:

| Reference | Exists on disk? |
|-----------|----------------|
| `/favicon.svg` | Yes (`public/favicon.svg`) |
| `/icon-192.png` | Yes (`public/icon-192.png`) |
| `/icon-512.png` | Yes (`public/icon-512.png`) |
| `/icon-maskable-512.png` | Yes (`public/icon-maskable-512.png`) |

All icon references resolve to real files. Manifest is valid.

---

## 6. PWA Install Path

**Would the site install as a PWA?**

Chrome and Edge require all of: HTTPS, a valid manifest, a service worker with
a `fetch` handler, and install-criteria icons (192×192 and 512×512).

| Criterion | Status |
|-----------|--------|
| HTTPS | Met — Vercel provides TLS on all deployments |
| Valid manifest with required fields | Met (see §5) |
| Service worker (`serviceWorker.register` / `sw.js`) | **Missing** — no `sw.js` in `public/`, no `serviceWorker.register` call anywhere in `src/` |
| 192×192 icon | Met — `/icon-192.png` |
| 512×512 icon | Met — `/icon-512.png` |
| 512×512 maskable icon | Met — `/icon-maskable-512.png` |

**The site does NOT qualify for PWA installation.** The only missing piece is
a service worker. Without a registered service worker with a `fetch` event
handler, Chrome will not show the "Add to Home Screen" / install prompt,
regardless of how well the manifest is constructed.

**Judgment:** for a portfolio site this is not a material gap. PWA install is
typically motivated by repeat-use apps (email, news, games). A recruiter/
hiring-manager visiting once has no reason to install. The manifest is
correct and ready; a minimal service worker (even a no-op that registers and
immediately activates) would unlock PWA install if that becomes desirable.

---

## 7. Deploy Posture (CI + Vercel)

File: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

The CI job (`check`) runs on both `push` to `master` AND `pull_request`. Steps:

1. `npm ci`
2. `npm run typecheck`
3. `npm run format:check`
4. `npm run lint`
5. `npm test`

`npm test` (Vitest) was added in PR #90 (commit 7933574). The pipeline now
gates on all four static-check passes plus test pass before a green CI status
is reported.

### Deploy trigger and required-status-checks

Vercel deploys are triggered via the Vercel GitHub integration (webhook on push),
**not** from the CI workflow. This means:

- A `git push master` triggers **both** a Vercel deployment **and** a CI run,
  concurrently and independently.
- If CI fails (e.g. a broken test), the Vercel deployment is NOT blocked — it
  proceeds from the pushed commit regardless.
- This is the standard Vercel free-tier behaviour unless "Required Status
  Checks" are configured on the `master` branch in GitHub repository settings
  (Settings → Branches → Branch protection rules).

**Risk:** a push that breaks `npm test` or `npm run typecheck` will still be
deployed to production by Vercel. CI is advisory, not a hard gate.

**The CI workflow file itself cannot enforce this.** Branch protection with
required status checks is a GitHub repository settings configuration, not a
file in the repo. This audit cannot verify whether it is configured (requires
dashboard access).

**Recommendation:** Enable a branch protection rule on `master` requiring the
`check` CI job to pass before Vercel's deployment is triggered. Alternatively,
configure Vercel's "Ignored Build Step" to poll CI status — Vercel supports a
`vercel.json` `ignoreCommand` pattern for this.

---

## 8. Vercel Project Hygiene

File: `vercel.json`

### Cache headers

| Path pattern | Cache-Control |
|-------------|---------------|
| `/_astro/*` | `public, max-age=31536000, immutable` (1 year) |
| `/fonts/*` | `public, max-age=31536000, immutable` (1 year) |
| `/audio/*` | `public, max-age=31536000, immutable` (1 year) |
| `/favicon.svg` | `public, max-age=86400` (1 day) |
| `/og-*.{svg,png}` | `public, max-age=86400` (1 day) |

Hashed `_astro/` assets get `immutable` correctly. Fonts and audio are also
`immutable`, which is correct since those filenames don't change on re-deploy.
The manifest.webmanifest, icon PNGs, and HTML files fall through to Vercel's
default (no explicit Cache-Control sent, Vercel defaults to `no-cache` for
HTML). This is correct — HTML should not be immutably cached.

### Security headers

Applied via the catch-all `source: "/(.*)"` rule:

- `X-Frame-Options: DENY` — correct
- `X-Content-Type-Options: nosniff` — correct
- `Referrer-Policy: strict-origin-when-cross-origin` — correct
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (2 years) — correct
- `Permissions-Policy` — disables camera, microphone, geolocation, interest-cohort, browsing-topics, payment, usb — correct
- `Content-Security-Policy` — see note below

**CSP note:** `connect-src` allows `'self' https://*.ingest.sentry.io` — correct for
Sentry beacons. However, ADR 0001 mentions `https://*.sentry.io` should be in
CSP, but `vercel.json` only has `*.ingest.sentry.io`. This is actually *more
restrictive* (better) than the ADR implied; the Sentry SDK only needs the ingest
endpoint from the browser, not the full `*.sentry.io` wildcard. No issue.

**CSP gap:** `script-src 'self' 'unsafe-inline'` — `'unsafe-inline'` weakens
XSS protection significantly. This is flagged here for completeness; the
security-depth review is delegated to Agent H per the audit brief.

### Rewrites / Redirects

**None.** `vercel.json` has no `rewrites` or `redirects` array. There is no
server-side locale detection or redirect (e.g. no `/` → `/fi` for Finnish
browsers). This is intentional per Astro's i18n config:

```js
// astro.config.mjs
i18n: {
  defaultLocale: 'en',
  locales: ['en', 'fi', 'sv'],
  routing: { prefixDefaultLocale: false },
}
```

English is the default locale and has no URL prefix (`/` not `/en/`).
Finnish users visiting `/` get the English version; they must manually navigate
to `/fi/`. There is no Accept-Language redirect. For a portfolio this is a
deliberate simplicity trade-off, not an error.

---

## 9. Backup / Recovery

The entire site is a git repository pushed to GitHub. Every commit is the
canonical source of truth. Vercel redeploys any prior commit on demand via the
dashboard. Recovery from a bad deploy is a one-click rollback in Vercel, with
the previous artifact already built. There are no databases, no user-generated
content, no secrets in the repo. **This is a strength, not a gap.** The backup
story for this site is as good as it can practically be.

---

## Findings by Severity

### K-MI1 — CI does not hard-gate Vercel deploys
A push that breaks `npm test` or `npm run typecheck` still deploys to production
because Vercel's webhook fires concurrently with CI, not after it. Branch
protection rules with required-status-checks on `master` are not verifiable from
this audit (dashboard setting) but are likely absent. **Fix:** enable a
`master` branch protection rule requiring the `check` job to pass, or use
Vercel's "Ignored Build Step" to defer deployment until CI is green.
([`.github/workflows/ci.yml`](.github/workflows/ci.yml))

### K-NI1 — IP address sent to Sentry without suppression
`Sentry.init` does not set `sendDefaultPii: false`, so the client's IP address
is forwarded to Sentry (a US company) in the HTTP envelope. For EU/Finnish
visitors this is a personal-data transfer without explicit consent or documented
legitimate-interest basis. **Fix:** add `sendDefaultPii: false` to `Sentry.init`
in [`src/lib/observability/initObservability.ts:78`](src/lib/observability/initObservability.ts#L78). This removes the IP with
zero functional impact on error tracking or Web Vitals reporting.

### K-NI2 — Sentry is fire-and-forget; no alert rules documented
ADR 0001 motivates Sentry as a MTTD reducer but does not commit to any review
cadence or alert configuration. Without at least a "new issue" email alert, the
data accumulates unread and the MTTD benefit is not realised.
**Fix:** configure one Sentry alert rule: notify owner email on first occurrence
of any new issue. Takes ~2 minutes in the Sentry dashboard.

### K-NI3 — No source maps uploaded
Stack traces in Sentry are unsymbolicated (minified function names, hashed
filenames). ADR 0001 acknowledges this as an open follow-up. Until source maps
are uploaded (`SENTRY_AUTH_TOKEN` + `@sentry/astro` or Sentry webpack plugin),
debugging production errors from the Sentry UI will be painful.
**Fix:** add source-map upload as a follow-up ADR/PR (already noted in ADR 0001
open follow-ups).

### Informational — No service worker; PWA install is not possible
`manifest.webmanifest` is complete and all icon files exist, but there is no
service worker. Chrome will not surface an install prompt. Not a material gap
for a portfolio but noted for completeness.

### Informational — No cookie banner needed
Sentry does not use cookies; the ePrivacy banner requirement does not apply.
The `sendDefaultPii: false` fix (above) addresses the more relevant GDPR
concern without adding any consent UI.

### Informational — No locale auto-redirect
Finnish/Swedish visitors see the English site at `/` unless they manually
navigate to `/fi/` or `/sv/`. No Accept-Language redirect exists. This is a
deliberate design choice consistent with `astro.config.mjs` (`prefixDefaultLocale:
false`). Not a defect.

### Strength — Backup / recovery
Full git history on GitHub + Vercel one-click rollback = the best-possible
recovery story for a static site. No action needed.

---

## What I Did Not Cover

- **Live Sentry dashboard**: no access to the production Sentry project. Cannot
  confirm whether the DSN is actually configured in Vercel's production env vars,
  whether any errors have landed, or what the actual error rate looks like.
- **Real EU traffic for GDPR testing**: the GDPR analysis is based on SDK
  behaviour documentation and code inspection, not a live network trace of an
  actual beacon from a Finnish IP.
- **Production-incident drill**: no tabletop exercise of "Three.js init throws
  on Safari iOS — how does the team detect and respond?"
- **Branch protection settings**: GitHub repository settings (required-status-
  checks on `master`) are a dashboard configuration, not visible in the repo
  files. The CI deploy-gate risk is flagged but cannot be confirmed as absent.
- **Vercel environment variable inventory**: cannot confirm `PUBLIC_SENTRY_DSN`
  is set in production without Vercel dashboard access.
- **Security header depth**: `'unsafe-inline'` in `script-src` and any other CSP
  weaknesses are noted but the full security-headers audit is delegated to Agent H
  per the audit brief.
