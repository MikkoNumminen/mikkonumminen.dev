# Threat model — mikkonumminen.dev

A lightweight threat model for a portfolio site that is mostly, but no longer
entirely, static. The goal is to make the trust boundaries and the invariants
that protect them explicit, so a change (human or automated) doesn't silently
weaken one.

**Last reviewed:** 2026-08-03

> **Scope changed since the 2026-06-13 review.** This model used to describe a
> purely static site, and said so in terms — no server runtime, no database, no
> stored submissions. That stopped being true when the RAG chat backend
> (ADR 0009), the same-origin proxy (ADR 0012) and the shoutbox shipped.
> Boundaries 6-8 below cover them. If you are reading an older copy of this file
> and it claims there is no server, the file is the thing that is wrong.

## What we're protecting

| Asset | Why |
| --- | --- |
| Visitor's browser | The only place untrusted-ish data meets code — must never become an XSS vector. |
| Site integrity & availability | A defaced or unavailable portfolio is the headline risk for a personal site. |
| Author reputation | The site _is_ the product; a security embarrassment is a credibility cost. |

There are **no accounts and no logins**, and no PII is collected beyond anonymous
client telemetry. Two things *are* stored server-side and must be treated as
data to protect:

| Asset | Why |
| --- | --- |
| Shoutbox submissions awaiting moderation | Visitor-authored text held in Postgres until the owner approves or rejects it. Never rendered from the database — see boundary 8. |
| Chat request log | `rag-logs/requests.jsonl`, which since 2026-07-02 records question and answer text (truncated). Deliberately carries **no client IP and no identity**, and that must stay true. |

## Architecture in one paragraph

The site is pre-rendered to static HTML/CSS/JS by Astro and served from a CDN;
that part has no server runtime and no authentication. Client-side behaviour is
Three.js scenes, GSAP timelines, and the contact-page terminal, which fetches a
**same-origin static JSON file** (`public/data/skills-registry.json`) at runtime.
Behind `/api/rag/*` — rewritten same-origin to a Tailscale Funnel host, per
ADR 0012 — sits a **FastAPI backend** on a home machine with a Postgres/pgvector
database and a local LLM, serving the chat and the shoutbox write endpoint.
Third-party network egress from the browser is Sentry telemetry and the funnel
host, and nothing else.

## Trust boundaries & mitigations

| # | Boundary | Threat | Mitigation | Invariant |
| - | --- | --- | --- | --- |
| 1 | String → `innerHTML` (terminal output, Three.js hover label) | Reflected/stored XSS via command args or registry text | [`escapeHtml`](../../src/lib/utils/escapeHtml.ts) escapes the five HTML-significant characters; applied at every sink (`commands.ts`, `dom.ts`, `skills.ts`, `createHoverLabel.ts`) | **Anything reaching `innerHTML` must pass `escapeHtml` first.** Covered by `escapeHtml.test.ts`. |
| 2 | Runtime fetch of `skills-registry.json` | Malformed/oversized data breaking the terminal; tampered data injecting markup | Same-origin, author-controlled committed file; CSP `connect-src 'self'`; the fetched JSON passes the [`parseRegistry`](../../src/lib/terminal/skills.ts) shape-guard (malformed input → graceful empty state, never a crash); values are still escaped at the `innerHTML` sink (boundary 1) | **`parseRegistry` validates the skeleton before use** (`repos[].skills[]` shape); it is deliberately skeleton-only (does not check receipt inner fields or `totals`), so still treat contents as data, never as trusted HTML. |
| 3 | HTTP response headers | Clickjacking, MIME sniffing, protocol downgrade, referrer leakage, feature abuse | CSP, HSTS `preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, locked `Permissions-Policy`, `frame-ancestors 'none'`, `object-src 'none'` — all in [`vercel.json`](../../vercel.json) | **Do not weaken these without a recorded reason.** Widening `script-src`/`connect-src` or removing `frame-ancestors`/`object-src` needs explicit justification. |
| 4 | Third-party egress (Sentry, funnel host) | Data exfiltration via a compromised or over-broad allowlist | `connect-src` allowlists the Sentry ingest hosts (DSN is public by design) and the single funnel origin that serves the chat (ADR 0012); no other third-party scripts load | The Sentry hosts **and the one funnel origin** are the only permitted non-`'self'` `connect-src` entries. No further origins without updating this model in the same change. |
| 5 | npm dependencies | Supply-chain / known-CVE exploitation | [Dependabot](../../.github/dependabot.yml) update PRs; `npm audit`; static output shrinks reachability (see below) | New `high`/`critical` **production** advisories should be triaged, not ignored. |
| 6 | The funnel-exposed backend origin | Direct unauthenticated calls to any backend route, bypassing the site entirely | Nothing upstream filters: the funnel proxies the whole origin and no route authenticates. Controls are in the app — input caps, rate limits, `MAX_BODY_BYTES`, concurrency shedding — and are documented in [`chat-backend/README.md`](../../chat-backend/README.md) and [`docs/rag-chat.md`](../rag-chat.md) | **Assume every backend route is directly addressable by anyone.** A control that only holds when traffic arrives via the site's rewrite is not a control. Per-IP limits are a courtesy check because Tailscale overwrites `X-Forwarded-For`; the real bound must be identity-independent. |
| 7 | Retrieved corpus text → LLM prompt | Prompt injection via indexed content or the user's question; prompt disclosure; off-task use of the model | Architectural containment: input cap, pre-LLM relevance gate that refuses **without calling the model**, generative/translation task gates, hard output cap. Asserted by the black-box acceptance harness, which includes injection and prompt-reveal cases | **Containment must not become prompt-wording-only.** A refusal that depends on the model choosing to refuse is not a boundary. Injection is not solved here — these layers reduce it, and the harness proves the gates fire. |
| 8 | Shoutbox submission → moderation queue → published snapshot | Stored XSS, spam/link injection, flooding, or unreviewed text reaching the page | Deterministic gate ([`shoutbox.py`](../../chat-backend/app/shoutbox.py)): normalisation, length/line caps, zero-links, markup rejection, duplicate hashing, rate limit, `QUEUE_MAX_PENDING` backpressure. Publication is a separate owner action that rewrites a committed JSON snapshot. Rule-attributed red-team suite in `tests/test_shoutbox_redteam.py` | **The write endpoint cannot publish.** Accepting a submission only enqueues it; the public page renders the committed snapshot. Keep it that way — an endpoint that writes directly to the rendered artifact would collapse this boundary. **No LLM in the gate**: a rule that must be explainable to the person it refused cannot be a model that can be argued with. |

## CSP (current)

`vercel.json` holds the active policy; the copy below is a **mirror of it**, kept
in sync by [`scripts/csp-doc-sync.test.mjs`](../../scripts/csp-doc-sync.test.mjs),
which fails the suite if the two disagree. It previously drifted — the funnel `connect-src` entry landed with
ADR 0012 and `manifest-src` was tightened, neither of which reached this file,
so the block labelled "canonical" was quietly describing a policy the site had
not served for weeks. Directives appear one per line here for readability; the
test compares them as a set.

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
media-src 'self';
connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://paskamyrsky.tail6ed53b.ts.net;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
worker-src 'none';
manifest-src 'none';
frame-src 'none';
upgrade-insecure-requests
```

`'unsafe-inline'` on `script-src`/`style-src` is the one notable relaxation. It is
required because a fully static build cannot emit a per-request nonce (nonces must
change per response, which breaks portable static hosting — see
[ADR 0002](../decisions/0002-static-output-only.md)). The mitigation is that the
site loads **no third-party scripts** and there is no server-reflected HTML, so the
classic injection path for inline-script XSS does not exist; boundary 1 closes the
client-side one.

## Dependency advisory status (2026-08-03)

**`npm audit` currently reports 0 vulnerabilities.**

Cleared since the previous review:

- ~~**Astro — XSS in `define:vars`**~~ and ~~**Astro — server-island parameter
  replay**~~. Fixed by the Astro 5 → 6 upgrade ([ADR 0007](../decisions/0007-astro-6-node-22.md)),
  and neither was reachable here to begin with (`define:vars` takes only static
  author-controlled values; `output: 'static'` means no server islands).
- ~~**esbuild (0.17.0–0.28.0)** — dev-server arbitrary file read, and Deno module
  integrity.~~ This review recorded them as "accepted, no fix available". They no
  longer apply: the resolved `esbuild` is **0.28.1**, outside the affected range.
  The chain shipped a fix, exactly as predicted — the prediction was right and the
  document was simply never revisited to notice.
- ~~**postcss ≤8.5.17** — path traversal via `sourceMappingURL` auto-loading
  ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)).~~
  Reached the tree transitively through `vite` / `eslint-plugin-astro`. Fixed by
  `npm audit fix` on 2026-08-03 — a seven-line lockfile change, no direct
  dependency touched.

**Why this section kept going stale**, and what to do about it: nothing runs
`npm audit` in CI, so this is the one part of the threat model with no drift
guard behind it — unlike the CSP block above, which
[`scripts/csp-doc-sync.test.mjs`](../../scripts/csp-doc-sync.test.mjs) enforces.
Between reviews, the advisory set moved in **both** directions: one described
advisory silently stopped applying, and a new high-severity one appeared
undescribed. Re-run `npm audit` when touching this section rather than trusting
what it says; treat the date in the heading as the last time anyone actually
looked.

Build-time-only reachability still applies as a triage rule: a `high` in tooling
that never ships to a visitor is triaged differently from one in the static
artifact. It is a reason to deprioritise, never a reason to leave it undescribed.

## Out of scope / non-goals

- DoS / volumetric attacks (handled at the CDN/platform layer).
- Hardening the Vercel platform itself.
- Anything requiring a compromised developer machine or stolen credentials.
- A nonce-based CSP (incompatible with the static-output constraint).

## Reporting

See [`SECURITY.md`](../../SECURITY.md).
