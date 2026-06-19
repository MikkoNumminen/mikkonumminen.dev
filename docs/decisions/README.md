# Architecture decision records

Short, append-only records of the decisions that shaped this project and the
alternatives that were rejected. Each ADR is immutable once merged; a later
decision supersedes an earlier one with a new record rather than an edit.

| # | Decision | Status |
| - | --- | --- |
| [0001](0001-observability-sentry.md) | Client-side observability via Sentry (errors + Core Web Vitals), DSN-gated and DNT-respecting | Accepted |
| [0002](0002-static-output-only.md) | Static output only — no SSR/edge, portable from Vercel to S3 + CloudFront | Accepted |
| [0003](0003-astro-over-nextjs.md) | Astro over Next.js for a content-and-visuals site with island hydration | Accepted |
| [0004](0004-manual-audio-crossfade.md) | Hand-rolled audio crossfade instead of a Web Audio library | Accepted |
| [0005](0005-skill-registry-pdf-surface.md) | Ship the skills registry as a committed JSON + PDF surface (builds on 0002) | Accepted (Decision 3 superseded by 0006) |
| [0006](0006-skill-registry-canonical-artifact.md) | Committed registry JSON is canonical; prebuild no longer auto-syncs it | Accepted |
| [0007](0007-astro-6-node-22.md) | Upgrade to Astro 6 + Node 22 (clears the Astro-native CVEs) | Accepted |
| [0008](0008-testing-strategy.md) | Layered testing strategy (unit + Playwright scene boot-smoke + coverage ratchet + CodeQL); per-frame visual regression rejected | Accepted |
| [0009](0009-rag-chat-backend.md) | Local RAG chat as a separate, optional backend service — site stays static (builds on 0002), no hosted model/DB | Accepted |

## Writing a new one

Copy [`TEMPLATE.md`](TEMPLATE.md) (or an existing record): **Context → Decision →
Considered alternatives (with "Rejected because") → Consequences**. Number it
sequentially, cite the code it concerns by path, and add a row to the table above.
A superseding decision gets a NEW record plus a back-pointer on the old one's
status line — never an in-place rewrite.
