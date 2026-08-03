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
