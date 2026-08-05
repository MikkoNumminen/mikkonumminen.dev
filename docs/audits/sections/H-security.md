# Agent H: Security & Deploy Audit

**Date:** 2026-05-17
**Branch:** audit/H (off audit/baseline, HEAD = b3de9f2)
**Scope:** npm advisory triage, HTTP security headers, git-history secret scan, static deploy hygiene, build reproducibility, Sentry DSN, third-party network calls, CORS.

---

## Summary by severity

| Severity | Count | Items |
|----------|-------|-------|
| High | 1 | devalue DoS (GHSA-77vg-94rm-hx3p), unexploitable in this static deploy |
| Moderate | 3 | astro XSS (GHSA-j687-52p2-xcff), astro replay (GHSA-xr5h-phrj-8vxv), postcss XSS (GHSA-qx2v-qp2m-jg93), all unexploitable today |
| Low | 2 | CSP gaps (missing worker-src / manifest-src), comment-only mismatch in initObservability.ts vs vercel.json connect-src |
| Info | 2 | Permissions-Policy gaps (midi, bluetooth, display-capture, gamepad), CORS not configured for cross-origin font/audio requests |
| Clean |, | No secrets in git history, dist/ not committed, no third-party script loads, Sentry DSN not in repo |

---

## 1. npm Advisory Findings

**Command run:** `npm audit --omit=dev --json`
**Result:** 3 vulnerabilities (1 high, 2 moderate). No critical.

### H-MA1: devalue: DoS via sparse array deserialization (HIGH)

- **Advisory:** GHSA-77vg-94rm-hx3p
- **CVE:** none assigned
- **CVSS:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)
- **Affected range:** devalue 5.6.3 – 5.8.0. **Installed: 5.6.4.**
- **Advisory description (verbatim):** "Malicious input to `devalue.unflatten()` with a very large sparse array specification can cause the Node.js process to run out of memory and crash."
- **Dependency path:** `mikkonumminen.dev` → `astro@5.18.1` → `devalue@5.6.4`
- **Reachability:** devalue's `unflatten()` (the vulnerable function) is called by Astro's serialization layer for server-rendered islands and actions. This site uses `output: 'static'` (verified in `astro.config.mjs:39`), no SSR routes, no actions, no Astro middleware that processes request bodies. The build process calls `devalue.stringify()` (the safe direction), not `unflatten()`. **The vulnerable code path is unreachable in production at deploy time and at request-serving time.**
- **Fix:** Upgrade `astro` to 6.3.3 (semver major); `devalue` will resolve to a fixed version transitively. No direct `devalue` installation to pin.
- **Effort:** Major version bump, moderate effort. Astro 5 → 6 brings breaking changes; requires smoke-testing all four routes and reviewing the Astro 6 migration guide. Non-urgent given zero reachability.

### H-MI1: astro: XSS via incomplete `</script>` sanitization in `define:vars` (MODERATE)

- **Advisory:** GHSA-j687-52p2-xcff
- **CVE:** none assigned
- **CVSS:** 6.1 (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N)
- **Affected range:** astro < 6.1.6. **Installed: 5.18.1.**
- **Advisory description (verbatim):** "The `define:vars` directive does not properly sanitize values containing `</script>` sequences, allowing injection of arbitrary HTML when the values are user-controlled."
- **Dependency path:** direct dependency (`package.json`).
- **Reachability:** grep for `define:vars` across all `.astro` files returns zero results. No component in this codebase passes user-controlled values through `define:vars`. **Not reachable.**
- **Fix:** Same Astro 6.3.3 upgrade as above.

### H-MI2: astro: server island encrypted parameters vulnerable to cross-component replay (MODERATE)

- **Advisory:** GHSA-xr5h-phrj-8vxv
- **CVSS:** 6.1 (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N)
- **Advisory description (verbatim):** "Encrypted parameters passed to server islands can be replayed against a different island component on the same deployment, potentially exposing data intended for a specific component."
- **Dependency path:** direct (`astro`).
- **Reachability:** grep for `server:defer` returns zero results. The site has no server islands (`output: 'static'`). **Not reachable.**
- **Fix:** Astro 6.3.3 upgrade.

### H-MI3: postcss: XSS via unescaped `</style>` in CSS Stringify output (MODERATE)

- **Advisory:** GHSA-qx2v-qp2m-jg93
- **CVE:** none assigned
- **CVSS:** 6.1 (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N)
- **Affected range:** postcss < 8.5.10. **Installed: 8.5.8** (shared by `@tailwindcss/vite` and `astro` via Vite).
- **Advisory description (verbatim):** "PostCSS fails to escape `</style>` sequences in CSS output, which could allow an attacker to inject HTML into a `<style>` block if the CSS origin is user-controlled."
- **Dependency path:** `astro → vite@6.4.2 → postcss@8.5.8` and `@tailwindcss/vite → vite@7.3.2 → postcss@8.5.8`.
- **Reachability:** PostCSS is used only at **build time** to process static CSS authored by the developer. There is no mechanism by which visitor-supplied CSS enters the PostCSS pipeline. **Not reachable in this static build.**
- **Fix:** `npm audit fix` can resolve this independently of the Astro major bump (postcss 8.5.10+ is a patch upgrade). Run: `npm update postcss` or wait for transitive fix in the next Vite/Tailwind patch.
- **Effort:** Low, patch-level transitive update, likely `npm audit fix --force` or `overrides` in `package.json`.

### Overall fix recommendation

1. **Short-term (low effort):** Add a `postcss` override to `package.json` to pull in 8.5.10+:
   ```json
   "overrides": { "postcss": ">=8.5.10" }
   ```
2. **Medium-term:** Plan Astro 5 → 6 upgrade to resolve devalue, both astro advisories, and any future transitive issues in one sweep.

---

## 2. `vercel.json` Header Analysis

### 2a. Content-Security-Policy (line 60)

Current policy (reformatted for readability):

```
default-src 'self';
script-src  'self' 'unsafe-inline';
style-src   'self' 'unsafe-inline';
img-src     'self' data:;
font-src    'self' data:;
media-src   'self';
connect-src 'self' https://*.ingest.sentry.io;
frame-ancestors 'none';
base-uri    'self';
form-action 'self';
object-src  'none';
upgrade-insecure-requests
```

**`'unsafe-inline'` on `script-src` and `style-src`:**
The README (line 121–128) documents the rationale: Astro's island bootstrap hoists, JSON-LD `<script type="application/ld+json">`, a language-detection inline script, and scoped inline styles all require inline execution. A nonce-based strict CSP cannot work with fully static output because nonces must be unique per response. The justification is sound for the current architecture. Accept as known limitation.

**Missing directives: H-NI1 (LOW severity):**

| Directive | Current state | Assessment |
|-----------|--------------|------------|
| `worker-src` | Absent, falls back to `child-src`, then `default-src 'self'` | No service workers or web workers are registered anywhere in the codebase (grepped `serviceWorker`, `Worker(`, `.sw.js`, zero results). Falls back safely to `default-src 'self'`. Low risk, but worth adding explicitly as `worker-src 'none'` for defence in depth. |
| `manifest-src` | Absent, falls back to `default-src 'self'` | `manifest.webmanifest` is served from `'self'`. Fallback is correct. Adding `manifest-src 'self'` would be explicit hygiene. |
| `frame-src` | Absent, falls back to `default-src 'self'` | No iframes in the codebase. `default-src 'self'` disallows cross-origin frames. Acceptable; explicit `frame-src 'none'` would be cleaner. |

**`connect-src` and Sentry (H-NI2):**
The policy allows `https://*.ingest.sentry.io`. The Sentry SDK (`@sentry/browser`) sends envelopes to `https://o<orgId>.ingest.sentry.io`. The wildcard covers all Sentry ingest regions. The comment in [`src/lib/observability/initObservability.ts:25`](src/lib/observability/initObservability.ts#L25)–26 says `connect-src` must include both `https://*.sentry.io` **and** `https://*.ingest.sentry.io`, but the actual policy only has `https://*.ingest.sentry.io`. Modern Sentry SDKs (including v10 used here) route exclusively through `*.ingest.sentry.io`; the `*.sentry.io` notation is legacy. The code comment is misleading but the actual header is correct. The comment in [`src/lib/observability/initObservability.ts`](src/lib/observability/initObservability.ts) should be updated to remove the stale `*.sentry.io` reference.

**OG images served cross-origin:**
OG images (`/og-*.png`, `/og-*.svg`) are served from the same origin (`'self'`). No external image CDN. `img-src 'self' data:` is sufficient.

### 2b. Permissions-Policy: [`vercel.json:56`](vercel.json#L56) (H-NI3)

Current value:
```
camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=(), payment=(), usb=()
```

Disabled: camera, microphone, geolocation, interest-cohort (FLoC legacy), browsing-topics, payment, usb. All appropriate for a portfolio site.

**Missing features (low priority, defence-in-depth):**

| Feature | Risk without it | Recommendation |
|---------|----------------|----------------|
| `midi` | Could allow MIDI device access via browser API | Add `midi=()` |
| `bluetooth` | Could allow Web Bluetooth | Add `bluetooth=()` |
| `display-capture` | Could allow screen capture | Add `display-capture=()` |
| `gamepad` | Gamepad API exposure | Add `gamepad=()` |
| `accelerometer`, `gyroscope`, `magnetometer` | Sensor APIs | Add `=()` for each |

These are low-risk omissions: none of these APIs are in scope for a personal portfolio. Adding them provides defence-in-depth if a future XSS were exploited. Suggest adding in a follow-up housekeeping commit.

### 2c. Strict-Transport-Security (line 51–53)

```
max-age=63072000; includeSubDomains; preload
```

- `max-age=63072000` = 730 days (2 years). Meets HSTS Preload List minimum (1 year).
- `includeSubDomains`: present. Appropriate for a portfolio with no subdomains; ensures any future subdomain also gets HSTS.
- `preload`: present. Eligible for HSTS preload list submission. No issues.

### 2d. X-Frame-Options (line 47)

`DENY`: prevents framing by any origin. Consistent with `frame-ancestors 'none'` in CSP (belt-and-suspenders for old browsers that don't parse CSP). Correct.

### 2e. X-Content-Type-Options (line 48)

`nosniff`: present. Correct.

### 2f. Referrer-Policy (line 49)

`strict-origin-when-cross-origin`: sends full path on same-origin requests, origin-only on cross-origin, nothing on downgrade. Appropriate for a portfolio site.

### 2g. CORS / Access-Control headers

No `Access-Control-*` headers in `vercel.json`. No cross-origin font loading (fonts are served from `'self'`, confirmed by `font-src 'self' data:` and `public/fonts/` contents). No cross-origin audio loading. All static assets are same-origin. CORS headers are not required for this site's current architecture.

---

## 3. Secrets in Git History

**Command:** `git log -p --all | grep -iE "key|secret|token|password|api_key|bearer"`

**Findings:**

All matches are false positives:

1. **`cmdSudoPasswordPrompt`** (appears in multiple commits): a UI string in the terminal simulator (`'[sudo] password for guest: ********'`). Not a real credential.
2. **`@azure/keyvault-secrets`**: appears in a `package-lock.json` diff from a commit that updated dependencies. This is a package name, not a key value.
3. **`PUBLIC_SENTRY_DSN`**: appears as a variable name / env-var reference in README and source changes. No actual DSN value (of the form `https://...@...ingest.sentry.io/...`) is present anywhere in the history.
4. Long string literal scan: all results were semver version strings and npm package names in `package-lock.json` diffs.

**Verdict: No real secrets leaked in git history. Clean.**

---

## 4. Static Deploy Hygiene

| Check | Result |
|-------|--------|
| `dist/` in `.gitignore` | Pass, line 2: `dist/` |
| `dist/` committed to repo | Pass, `dist/` does not exist in the worktree at any tracked path (`ls dist` → not found) |
| `.output/` in `.gitignore` | Pass, line 3 |
| `.env` files in `.gitignore` | Pass, lines 15–18: `.env`, `.env.production`, `.env.local`, `.env.*.local` |
| `.env` files in `public/` | Pass, no `.env.*` files in `public/` |
| `node_modules/` in `.gitignore` | Pass, line 6 |
| `.git/` / `.github/` in `dist/` | N/A, `dist/` not committed |
| Stale backup files in `public/` | Pass, no `.bak`, `.tmp`, `.backup`, `.orig` files found |
| `public/` contains only expected assets | Pass, favicon.svg, fonts/, audio/, icons, manifest.webmanifest, OG images (PNG+SVG), robots.txt |
| `public/fonts/` contents | `helvetiker_bold.typeface.json` (Three.js font for 3D text), `LICENSE`, both expected |

The one minor observation: `public/og-*.svg` source files are committed alongside the rasterized `og-*.png` outputs. The SVGs are the canonical source and `build:og` generates PNGs from them. Both being in `public/` is correct per the README (line 57). Not a hygiene issue.

---

## 5. Build Reproducibility

**Verification method:** README inspection + `package.json` scripts review (no re-build run in this read-only audit; baseline agent already ran a successful build).

`README.md` documents all required steps:
```
npm install
npm run dev / build / preview / typecheck / format / lint / test
```

`package.json` `engines` field requires Node `^20.3.0 || ^22.0.0`. The README says "Requires Node 20+ (see .nvmrc)". Both are consistent.

No post-checkout hooks, no undocumented one-time setup steps. `npm ci && npm run build` from a clean clone should produce a deterministic output: all assets are either checked into `public/` or generated from them by `build:og`, which is a separate optional script (OG images are pre-rasterized and committed, so it is not part of the main build path).

**One finding:** `.nvmrc` is referenced in the README but not verified in this audit. If it pins a version outside the `engines` field (e.g., Node 24), CI/CD and local dev could silently diverge. Not a security issue but worth confirming `.nvmrc` matches the engines constraint.

---

## 6. Sentry DSN Exposure

`PUBLIC_SENTRY_DSN` is an Astro `PUBLIC_` env var, which means it is baked into client-side JS at build time and visible to anyone who reads the bundle. This is standard and expected for client-side Sentry SDKs: the DSN is intentionally public per Sentry's documentation (it identifies the project for ingest, not an authentication credential).

**DSN format verification:** No actual DSN value exists in the repository (confirmed in section 3). The DSN is set in Vercel environment variables at deploy time, not committed to source. The `PUBLIC_` prefix on the env var name signals this intent correctly.

**Is it a service-role key in disguise?** A Sentry DSN follows the format `https://<public_key>@o<org_id>.ingest.sentry.io/<project_id>`. It carries no write-beyond-ingest permissions; it cannot read event data, manage users, or access the Sentry API. The only action it enables is sending new events to the associated project. Verdict: correctly scoped, not misused.

---

## 7. Third-Party Network Loads

**Grep for external script/link/fetch calls in `src/`:**

Results from searching `<script src="https://...">`, `fetch('https://...')`, and similar patterns in all `.astro` and `.ts` files return zero external URLs in component or library code.

**The only external network destination is Sentry ingest:**
- `@sentry/browser` SDK (bundled at build time from `node_modules`) sends envelopes to `https://o<org>.ingest.sentry.io` at runtime.
- Gated on `PUBLIC_SENTRY_DSN` being set (no-op without it).
- Covered by `connect-src https://*.ingest.sentry.io` in CSP.

**Fetch in terminal command (`src/lib/terminal/commands.ts:113`):**
```ts
const res = await fetch(CV_PATH, { method: 'HEAD', cache: 'no-store' });
```
`CV_PATH = '/mikko-numminen-cv.pdf'`: a relative path, same-origin only. Not a third-party call.

**Audio prefetch (`BackgroundAudio.astro`):** All audio is prefetched from `/audio/`, same-origin. No external CDN.

**Verdict: site is effectively self-contained except for Sentry.**

---

## 8. CORS / Preflight

No `Access-Control-*` headers in `vercel.json`. This is correct for the current architecture:

- **Fonts (`/fonts/`):** Served from `'self'`. The only font asset is `helvetiker_bold.typeface.json` (a JSON file loaded by Three.js via `fetch()` from the same origin). No cross-origin font requests.
- **Audio (`/audio/`):** Served from `'self'`. All audio elements reference relative paths.
- **OG images (`/og-*.png`):** Consumed by social crawlers (Slack, Twitter, etc.) via direct `<meta>` URL references, not by `fetch()` with CORS headers. Social crawlers follow the URL directly; CORS headers are not relevant.
- **No public API endpoints.** The site is fully static; there are no routes that other origins would `fetch()`.

If a future feature required cross-origin font loading (e.g., moving fonts to a CDN), adding `Cross-Origin-Resource-Policy: cross-origin` to the `/fonts/` header block would be the correct fix.

---

## What This Audit Did Not Cover

- **Penetration testing**, no active probing, XSS payload testing, or clickjacking attempts.
- **Proprietary static analysis**, no Snyk, Semgrep, or CodeQL scans beyond `npm audit`.
- **Third-party supply-chain audit**: individual npm packages were not audited for malicious code beyond the npm advisory database.
- **Runtime behavior verification**: CSP violations, actual Sentry beacon delivery, and header values as seen by browsers were not tested against the live deployment.
- **Vercel platform security**: Vercel's own infrastructure, deployment access controls, and team permissions were not reviewed.
- **CI/CD pipeline**: GitHub Actions workflow files were not audited for secret exposure, injection attacks, or overly permissive job permissions.

---

## Recommended Fix Priority

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | H-MI3 | Add `overrides: { "postcss": ">=8.5.10" }` to [`package.json`](package.json) to resolve GHSA-qx2v-qp2m-jg93 | 5 min |
| 2 | H-NI2 | Fix stale comment in [`src/lib/observability/initObservability.ts:25`](src/lib/observability/initObservability.ts#L25), remove `https://*.sentry.io` (SDK only uses `*.ingest.sentry.io`) | 2 min |
| 3 | H-NI1 | Add explicit `worker-src 'none'; manifest-src 'self'; frame-src 'none'` to CSP in [`vercel.json`](vercel.json) | 10 min |
| 4 | H-NI3 | Expand Permissions-Policy with `midi=(), bluetooth=(), display-capture=(), gamepad=(), accelerometer=(), gyroscope=(), magnetometer=()` | 5 min |
| 5 | H-MA1, H-MI1, H-MI2 | Plan Astro 5 → 6 upgrade to resolve all three remaining advisories (devalue, astro XSS, astro replay) | 2–4 h |
