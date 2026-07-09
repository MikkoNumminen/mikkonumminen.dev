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

Serve the chat API same-origin. `vercel.json` gains two external rewrites:

- `/api/rag/health` → `https://paskamyrsky.tail6ed53b.ts.net/health`
- `/api/rag/chat` → `https://paskamyrsky.tail6ed53b.ts.net/chat`

and `PUBLIC_CHAT_API_URL` (Vercel project env) becomes the relative `/api/rag`.
The browser now only ever talks to the site's own origin; Vercel's edge forwards
to the Funnel server-side, where no extension or profile policy can interfere.
Response caching for the proxied paths is explicitly disabled
(`x-vercel-enable-rewrite-caching: 0` + `Cache-Control: no-store`) so `/health`
availability can never go stale at the CDN.

Only the two endpoints the frontend uses are proxied — `/usage` and anything
else the backend exposes stay funnel-only.

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
- The backend's rate limiter keys on the first `X-Forwarded-For` hop
  (`chat-backend/app/ratelimit.py`). Behind the proxy chain
  (client → Vercel edge → Funnel → backend) the first hop is expected to remain
  the real client IP (Vercel sets it; the Funnel's reverse proxy appends).
  Verify after deploy; if buckets turn out to collapse onto Vercel edge IPs,
  raise `RATE_LIMIT_REQUESTS` in the WSL `.env` (runtime knob, no code change).
- The CSP `connect-src` keeps the Funnel origin alongside `'self'` for now, so a
  deployment with the old absolute URL still works during the transition;
  dropping it is a follow-up once `/api/rag` is verified live.
- `chat-backend/CORS_ALLOW_ORIGINS` stays as-is: same-origin requests don't
  need CORS headers, and direct funnel access (ops, evals) is unaffected.
