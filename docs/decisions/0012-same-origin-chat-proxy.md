# ADR 0012 — Same-origin proxy for the RAG chat via Vercel rewrites

**Status:** accepted
**Date:** 2026-07-10
**Decided by:** repo owner

## Context

The `/contact` terminal reveals its chat affordance only when a browser-side
`fetch` to `${PUBLIC_CHAT_API_URL}/health` succeeds (`src/lib/terminal/chat.ts`),
and every chat turn POSTs to `${PUBLIC_CHAT_API_URL}/chat`. That URL pointed
directly at the Tailscale Funnel hostname (`https://paskamyrsky.tail6ed53b.ts.net`)
— a third-party origin from the browser's point of view.

Live testing surfaced the failure mode: the same page in the same browser showed
the chat in one profile and not in another. Content-blocker extensions, tracking
protection, and managed-profile DNS/URL filtering are all per-profile, and an
unfamiliar `*.ts.net` cross-origin request is exactly what they block. Because
chat is progressive enhancement, the failure is silent: the visitor sees a normal
terminal with no AI in it and no explanation, and the request log records nothing
— they never reached the backend. The backend itself was verified open (correct
CORS for the Vercel origin, ~0.4 s `/health`, per-IP rate buckets); the loss
happened entirely inside the visitor's browser.

## Decision

Serve the chat API same-origin. `vercel.json` gains three external rewrites:

- `/api/rag/health` → `https://paskamyrsky.tail6ed53b.ts.net/health`
- `/api/rag/chat` → `https://paskamyrsky.tail6ed53b.ts.net/chat`
- `/api/rag/session/reset` → `https://paskamyrsky.tail6ed53b.ts.net/session/reset`

and `PUBLIC_CHAT_API_URL` (Vercel project env) becomes the relative `/api/rag`.
The browser now only ever talks to the site's own origin; Vercel's edge forwards
to the Funnel server-side, where no extension or profile policy can interfere.
Response caching for the proxied paths is explicitly disabled
(`x-vercel-enable-rewrite-caching: 0` + `Cache-Control: no-store`) so `/health`
availability can never go stale at the CDN.

Only the three endpoints the frontend uses are proxied (`/health`, `/chat`,
and the terminal-reset's `/session/reset` — see the contract block in
`src/lib/terminal/chat.ts`) — `/usage` and anything else the backend exposes
stay funnel-only.

## Considered alternatives

- **Keep the direct URL, surface a "chat blocked/offline" notice.** Rejected
  because the requirement is that the chat *works* for every visitor, not that
  its absence is explained. A notice still loses the visitor.
- **Custom domain in front of the Funnel.** Rejected: Funnel only terminates TLS
  for its own `*.ts.net` hostname; a custom domain needs a different tunnel
  product (e.g. cloudflared) — new infra and DNS for the same result the
  existing host platform provides in config.
- **Longer probe timeout / more aggressive re-polling.** Rejected: the failing
  requests are blocked, not slow; no amount of retrying un-blocks them.

## Consequences

- Chat works in browser profiles that block third-party requests; the reveal
  gate and the SSE stream ride the site's own origin. The build output remains
  fully static (ADR 0002): the rewrite is host-platform routing config, the same
  role `vercel.json` already plays for headers. Porting to another static host
  means configuring the equivalent reverse proxy there — or falling back to an
  absolute `PUBLIC_CHAT_API_URL`, which keeps working unchanged.
- SSE streaming passes through the edge proxy; the backend already sends
  `Cache-Control: no-cache` + `X-Accel-Buffering: no` on the stream
  (`chat-backend/app/main.py`), which is what proxies need to not buffer it.
- **Per-client rate attribution is lost on the proxied path — accepted.** The
  backend's limiter keys on the first `X-Forwarded-For` hop
  (`chat-backend/app/ratelimit.py`), and Tailscale's serve proxy *replaces*
  that header with the observed connection source
  (`Header.Set(...)` in tailscale's `ipn/ipnlocal/serve.go`) — so proxied
  requests reach the backend keyed on Vercel egress IPs, not visitors. This is
  deterministic, not a contingency. The same replace behavior is why the
  direct-funnel path stays exactly as strong as before: a direct caller cannot
  spoof the first hop, and the per-IP limiter fully protects that path. On the
  proxied path the limiter degrades to a coarse throttle whose granularity
  depends on Vercel's egress pool; the machine guards that actually bound GPU
  work remain the ADR 0010 layers (`LLM_MAX_CONCURRENCY` shed-not-queue,
  `num_predict`/input caps). Recovering per-client identity through the proxy
  was rejected: Vercel-set client headers (`x-vercel-forwarded-for`) are
  forgeable by direct-funnel callers, and a static rewrite cannot attach a
  shared secret to distinguish the paths — trusting them would weaken the
  direct path to strengthen the proxied one. If legitimate visitors start
  429-ing each other on a shared bucket, `RATE_LIMIT_REQUESTS` in the WSL
  `.env` is the coarse runtime knob, understood as a global throttle for site
  traffic rather than a per-visitor limit.
- The CSP `connect-src` keeps the Funnel origin alongside `'self'` for now, so a
  deployment with the old absolute URL still works during the transition;
  dropping it is a follow-up once `/api/rag` is verified live.
- `chat-backend/CORS_ALLOW_ORIGINS` stays as-is: same-origin requests don't
  need CORS headers, and direct funnel access (ops, evals) is unaffected.
