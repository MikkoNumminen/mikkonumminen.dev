---
title: Mikko Numminen · CV
kind: cv
---

# Mikko Numminen

**AI engineering and full-stack development**

Tampere, Finland · numminen.mikko.petteri@gmail.com · [github.com/MikkoNumminen](https://github.com/MikkoNumminen) · [mikkonumminen.dev](https://mikkonumminen.dev)

Open to full-stack and AI engineering roles. Remote-friendly.

## Profile

I build systems around language models and design them for what happens when the model is wrong. Deterministic work stays deterministic, the model is used only where language genuinely cannot be rule-coded, and grounding is enforced by validation rather than by prompt wording. I measure what I ship, and I publish corrections when a measurement turns out to be broken.

Underneath that is ordinary full-stack work, end to end, SQL to ops, in TypeScript, C#, Python and Rust, moving data between APIs, databases, documents and files: PDF and EPUB through OCR, CSV and JSON open data, and code and prose chunked for retrieval. Four years of software: two employed, two independent and in production. Before that, 24 years in hardware retail and construction-trade B2B, which is why my main AI project is a Finnish retail system rather than a chatbot demo.

## Experience

### Independent software developer · 2024 to present

Thirteen projects taken from empty repository to running system, with real users and ownership across schema, application code, CI, deployment and signed installers. Every repository runs CI on every push.

- Built and operate a local LLM stack on my own hardware: **Ollama** serving quantised models on an RTX 3080 Ti, reached from cloud front ends over a **Tailscale Funnel**, at no per-query cost.
- Design the model boundary the same way every time: a deterministic layer that cannot hallucinate by construction, the model confined to what only language can do, and validation that drops uncited output instead of shipping it.
- Publish evaluations with their measurements and caveats attached, including a public retraction of one of my own findings after tracing it to too few rounds and a rate limiter corrupting the measurement.
- Treat AI-assisted development as a measured discipline: 14 cost-routing subagents and 16 skills, version-controlled and calibrated by A/B measurement rather than by feel.

### Kasvu Labs Oy, software developer · 2022 to 2024

First paid programming role. Full-stack client work in **React**, **Next.js** and **Node.js** on **PostgreSQL** and **Azure**. Built a data-visualisation platform that turned large datasets into decisions, added features to an existing kiosk-network management application including sales views and a map-of-Finland view over municipal open data, wrote the TypeScript that ingested that open data from CSV and JSON, and ran monthly client-data production updates against PostgreSQL in **Kubernetes** pods.

### Hardware retail and store operations · 1998 to 2022

Twenty-four years, nearly all in the same store as it changed hands twice. Detailed at the end of this document.

## Principal projects

### Feedback Intelligence

A feedback-analysis engine for Finnish retail, and where the 24 years and the AI work meet. The alert layer is rule-coded and runs before the model, so it cannot hallucinate an alert; counts and trends are arithmetic and sentiment is a deterministic lookup rather than a model judgement. Synthesis must cite the feedback ids it drew on, and a narrative that fails citation validation is dropped to a deterministic fallback and logged, so an untraceable claim cannot reach the view. The model was picked by blind measurement: Poro 2 took 26 of 30 first places for Finnish naturalness, Friedman chi-square 22.85, p < 0.0001. The retail domain is a data file of 27 departments and three catch-all buckets, and one flag swaps it for another domain with no core edits. 40 numbered decision records, a red-team fixture wired into the suite so a reopened hole is a red build, hosted free and proxied to my own GPU.
`C# · .NET 8 · Ollama · SQLite · Azure` · [live](https://red-ground-0bacf9c03.7.azurestaticapps.net/).

### Portfolio site and its RAG backend

A static site whose contact terminal answers from a self-hosted retrieval system. Containment is built in independent layers rather than asked for in a prompt: a byte cap before parsing, an input cap, a deterministic weak-retrieval gate that refuses before any model call, a hard generation cap, bounded concurrency, and per-IP limits. Retrieval fuses dense **pgvector** search with full-text ranking over chunks split on function and class boundaries. A May 2026 audit measured Lighthouse performance 96 to 99 across all twelve routes then served, with zero layout shift on every WebGL page.
`Astro · Three.js · FastAPI · pgvector · TypeScript` · [live](https://mikkonumminen.dev).

### HRM

A production HR system, and the largest test surface I maintain. **PostgreSQL** and **MongoDB** run side by side: relational data in one, an HMAC hash-chained tamper-evident audit log in the other. 2,910 tests at 92.2% line coverage, with mutation testing run on every pull request over the permission, audit-chain and TOTP logic, and CI that fails the build if the documented coverage drifts from reality. 14 Playwright suites drive the UI against a production build. 38 granular permissions, TOTP two-factor, and 18 languages.
`Next.js · React 19 · Prisma · TypeScript · OpenTelemetry` · [live](https://hr-manager-pearl.vercel.app).

## Other work

- **AudiobookMaker** · Windows desktop app turning PDF, EPUB and scanned books into audiobooks through three neural TTS engines, cloud, offline CPU and GPU voice cloning. A forward-hook leak in `resemble-ai/chatterbox` root-caused down to a discarded hook handle, with a repro, a fix and a pull request filed upstream. `Python · PyTorch · CUDA`
- **Platform** · Multi-tenant community site in production use by a live guild, carrying HRM as a git submodule so the HR product ships inside the platform without a fork. GDPR export and erasure. `Turborepo · Next.js · Prisma` · [vuohiliitto.com](https://vuohiliitto.com)
- **Spacepotatis** · Browser game running two engines in one app, with server-authoritative anti-cheat validating every save against the player's stored progression. `Phaser 4 · Three.js · Kysely` · [live](https://spacepotatis.vercel.app)
- **PasswordManager** · Zero-knowledge password manager. One Rust crypto core compiles natively and to WebAssembly, so CLI, server, browser and extension share one implementation. Argon2id at 256 MiB, XChaCha20-Poly1305 bound to record identity. `Rust · WebAssembly · axum`
- **SongGenerator** · Replaces a song's vocal with sung word clips on the original melody's notes and timings. Nothing musical is invented, and a song with no singing is refused rather than attempted. `Python · PyTorch · Demucs`
- **ReadLog, twice** · The same application built and deployed in two ecosystems, the port documented decision by decision, adding security the original lacked. `Next.js · C# · ASP.NET Core · EF Core` · [live](https://read-log-pi.vercel.app)
- **AI tooling, published** · `claude-agents`, an MIT library of 14 cost-routing subagents written after measuring five review workflows fan out roughly 3.8 million tokens at frontier rates, and `claude-skills`, 16 installable skills whose own documentation revised a 67% estimate down to a measured 22%. `Python · Claude Code`
- **claude-continue** · Cross-platform scheduler for long autonomous runs, driving terminals through four platform mechanisms including Windows console injection, on a three-OS CI matrix. `Python`
- **Strudel Patterns** · Algorithmic music, AI-directed, scoring Spacepotatis and this site. `JavaScript · Web Audio`

## Technology

**Languages** · TypeScript, JavaScript, Python, C#, Rust, SQL, Bash.

**AI and LLM** · Agent and pipeline design, evaluation harnesses, blind A/B model comparison, grounding validation and citation checking, structured-output salvage, prompt-injection containment and red-teaming, cost and latency measurement, RAG with hybrid retrieval and relevance gating, pgvector, local serving with Ollama, Microsoft.Extensions.AI, neural TTS.

**Backend** · REST API design, PostgreSQL, .NET 8 and ASP.NET Core, EF Core, Node.js, FastAPI, Prisma, Kysely, NextAuth, 2FA and TOTP, RBAC, audit trails, SQLite, MongoDB.

**Frontend** · React 19, TypeScript strict mode, Next.js, Astro, Tailwind CSS, MUI, Three.js, GSAP, Phaser 4, WebAssembly, WCAG AA accessibility.

**Platform** · Docker, GitHub Actions, CI gating with branch protection, Azure, Vercel, Kubernetes and Helm, Turborepo, Tailscale Funnel, self-hosted deployment.

**Testing** · Playwright UI automation against production builds, Vitest, Jest, xUnit, pytest, mutation testing, coverage thresholds enforced in CI, known-answer vectors, tamper detection.

**Security** · Zero-knowledge architecture, threat modelling, Argon2id, XChaCha20-Poly1305, constant-time comparison, secret-hygiene auditing, CodeQL.

Used at Kasvu Labs: TypeScript, JavaScript, React, Next.js, Node.js, PostgreSQL, MUI, Recharts, PgTyped, Kubernetes, Azure.

## Hardware retail, 1998 to 2022

Twenty-four years before programming, nearly all of it in the same hardware store as it changed hands twice. This is where the domain knowledge comes from: retail and construction-trade B2B, ERP and POS as a daily user for two decades, and supply chain and warehouse operations.

Two changes in that period are the ones a developer would recognise. An organisation-wide **ERP migration** from Kesko's ASCII-based Profix system to its browser-based successor, which changed every POS, department and warehouse process, absorbed while continuing to serve customers. And a store expansion where the whole staff moved the entire store to new premises over a single weekend.

**K-Niemi Oy** (2021 to 2022), senior salesperson. Hardware retail under the new retailer, the work continuing largely unchanged. Senior-level sales and service across consumer and trade customers, advising construction professionals, builders, contractors and renovators on materials and complete solutions. Product procurement and inventory work.

**Kesko Oyj** (2020 to 2021), senior salesperson. The family retailership ended and operations transferred to a Kesko holding company. With no owner-manager in place, the role grew: senior-level sales and service, carrying an increased share of day-to-day responsibility.

**Keijo Numminen Oy** (2012 to 2020), senior salesperson. The family hardware store, and the person other staff came to when their own knowledge ran out. Resolved the situations others could not and steered demanding customer conversations toward a workable outcome. Training, example-setting and a leadership role grew out of that.

Construction-trade specialist end to end: green roofs to house foundations, groundworks, gravel and sand, installation services, and factory-direct-to-site supply arrangements, up to a house or a large motorboat. Equally deep across the rest of the range: tools from electric and pneumatic to welding and battery, paints including factory-direct wholesale, interior decoration, HVAC, ventilation and lighting. I also delivered the ride-on mowers I had sold, handed over ready to drive.

Throughout the era: warranty and claims handling end to end, including transporting machines to and from service shops; dozens of annual stocktakes plus continuous zero-stock rounds feeding the automatic ordering system; shrinkage investigation; pricing and campaign execution; and daily freight paperwork for both replenishment and customer-ordered goods.

**Keijo Numminen Oy** (1998 to 2012), salesperson. Hardware store sales to private and professional customers. Began in 1998 under Keijo Numminen Tmi; the family business was incorporated in 2000 and the work continued unchanged. Checkout and POS work at the tool counter and the interior and paint counter, including a B2B invoicing flow where a professional customer's purchases were registered for invoicing and they walked past the till with a printed proof of payment. Several years of warehouse operations: serving customers, unloading and loading freight, handling freight documents daily, shelving construction materials, managing customer pickups.

Order processing and procurement across a full technology shift: from phone-based supplier ordering to electronic orders over supplier system interfaces, for example Onninen's before its Kesko acquisition. Supplier claims ran through the same interfaces, and in a specific order: create the order number in Kesko's system first, then file the claim against it.

## Education

**Tampere University** · Computer science, studies in progress.

## Languages

Finnish (native) · English (professional)
