# Architecture decision records

Short, append-only records of the decisions that shaped this project and the
alternatives that were rejected. Each ADR is immutable once merged; a later
decision supersedes an earlier one with a new record rather than an edit.

| #                                                 | Decision                                                                                                                                                                          | Status                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [0001](0001-observability-sentry.md)              | Client-side observability via Sentry (errors + Core Web Vitals), DSN-gated and DNT-respecting                                                                                     | Accepted                                 |
| [0002](0002-static-output-only.md)                | Static output only — no SSR/edge, portable from Vercel to S3 + CloudFront                                                                                                         | Accepted                                 |
| [0003](0003-astro-over-nextjs.md)                 | Astro over Next.js for a content-and-visuals site with island hydration                                                                                                           | Accepted                                 |
| [0004](0004-manual-audio-crossfade.md)            | Hand-rolled audio crossfade instead of a Web Audio library                                                                                                                        | Accepted                                 |
| [0005](0005-skill-registry-pdf-surface.md)        | Ship the skills registry as a committed JSON + PDF surface (builds on 0002)                                                                                                       | Accepted (Decision 3 superseded by 0006) |
| [0006](0006-skill-registry-canonical-artifact.md) | Committed registry JSON is canonical; prebuild no longer auto-syncs it                                                                                                            | Accepted                                 |
| [0007](0007-astro-6-node-22.md)                   | Upgrade to Astro 6 + Node 22 (clears the Astro-native CVEs)                                                                                                                       | Accepted                                 |
| [0008](0008-testing-strategy.md)                  | Layered testing strategy (unit + Playwright scene boot-smoke + coverage ratchet + CodeQL); per-frame visual regression rejected                                                   | Accepted                                 |
| [0009](0009-rag-chat-backend.md)                  | Local RAG chat as a separate, optional backend service — site stays static (builds on 0002), no hosted model/DB                                                                   | Accepted                                 |
| [0010](0010-rag-containment.md)                   | Layered architectural containment for the RAG chat (builds on 0009) — input/output caps, pre-LLM relevance gate, grounded prompting, concurrency/rate limits, acceptance contract | Accepted                                 |
| [0011](0011-hybrid-retrieval-and-code-corpus.md)  | Hybrid dense+BM25 retrieval (RRF) over a code-enriched corpus for the RAG chat (builds on 0009/0010) — code-aware chunking, language/chunk_type metadata, hard per-project filter | Accepted                                 |
| [0012](0012-same-origin-chat-proxy.md)            | Same-origin `/api/rag/*` proxy for the RAG chat via Vercel external rewrites (builds on 0009) — the chat reveal and SSE stream ride the site's own origin, immune to content blockers | Accepted                                 |
| [0013](0013-client-side-routing-persisted-audio.md) | Client-side routing (Astro ClientRouter) + `transition:persist` audio so the sound toggle persists continuously across views (builds on 0002) — every page's client init moves to an `onRoute` lifecycle helper; the custom canvas transition is removed | Accepted                                 |
| [0014](0014-unified-home-particle-field.md)       | One uniform-driven particle field for the entire home page — galaxy → name formation → persistent starfield on a fixed opaque canvas, field-based interactivity, pmndrs bloom, and a measured-ready loading gate that moves shader compilation behind an overlay (cures a measured 306 ms first-scroll block) | Accepted                                 |
| [0015](0015-home-field-name-state-life.md)        | Life in the home field's name state (builds on 0014) — shader micro-life, a dedicated click impulse on the letterforms, and a delta-driven idle choreography cycling alternative formations; one tuning block, frame delta bounded at source | Accepted (idle choreography superseded by 0016) |
| [0016](0016-continuous-shape-cycle.md)            | The home field reshapes continuously and the name is one shape of four (supersedes the idle-choreography half of 0015) — four-shape rotation on a 5 s hold / 3 s morph, clicks strike any shape, per-shape micro-life | Accepted                                 |
| [0017](0017-shoutbox-moderation-queue.md)         | Shoutbox moderation queue — a public write endpoint that cannot publish: deterministic no-LLM gate, moderation verbs off the public HTTP surface, Telegram digest, committed-snapshot publication | Accepted                                 |

## Writing a new one

Copy [`TEMPLATE.md`](TEMPLATE.md) (or an existing record): **Context → Decision →
Considered alternatives (with "Rejected because") → Consequences**. Number it
sequentially, cite the code it concerns by path, and add a row to the table above.
A superseding decision gets a NEW record plus a back-pointer on the old one's
status line — never an in-place rewrite.
