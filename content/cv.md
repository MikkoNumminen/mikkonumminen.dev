---
title: Mikko Numminen · CV
kind: cv
---

# Mikko Numminen

**Full-Stack Developer · Finland**

numminen.mikko.petteri@gmail.com · [github.com/MikkoNumminen](https://github.com/MikkoNumminen)

Open to full-stack and AI engineering roles. Remote-friendly.


## Summary

I work on systems built around language models, with a focus on what happens when the model is wrong. I keep deterministic work deterministic, put the model only where language genuinely cannot be rule-coded, and enforce grounding through validation rather than prompt wording. I measure results and publish corrections when a measurement turns out to be broken.

Underneath that is ordinary full-stack work, end to end, SQL to ops. Twelve projects carry it: a multi-tenant community platform serving a live WoW guild, a browser game built from an empty repo to live in 12 days, a Windows desktop app for audiobook generation, a reading tracker built twice in two ecosystems, a zero-knowledge password manager in Rust, and this site. Every repo runs CI on every push.

Domain strengths, from 24 years before this one: retail, construction-trade B2B, ERP and POS environments as a two-decade daily user, and supply chain and warehouse operations.

AI-native development is part of the toolchain, not a side note. I maintain a catalog of custom Claude Code skills: version-controlled, audited, and treated as production artifacts. A 2026-05-22 A/B calibration across 13 Spacepotatis skills (Sonnet only) measured a ~22% aggregate token saving versus cold scouting; a later portfolio-wide calibration across Sonnet, Opus, and Haiku covered 34 skills (33 calibrated) for a +17% aggregate save, ~327K tokens.


## Projects

- **HRM**: production HR system. Next.js, React, TypeScript, PostgreSQL + MongoDB (dual-database: relational + immutable audit log), 38 permissions, TOTP 2FA, OpenTelemetry, 18 languages, SSE notifications. 2910 tests, 92.2% coverage, Stryker mutation testing. [hr-manager-pearl.vercel.app](https://hr-manager-pearl.vercel.app)

- **Platform**: live community site for a WoW guild (vuohiliitto.com). Turborepo monorepo with HRM as a git submodule. Multi-tenant, Raider.IO API integration, tabbed chat, gamification (XP, levels, achievements, quests), guided onboarding. 1388 tests. [vuohiliitto.com](https://vuohiliitto.com)

- **Spacepotatis**: live browser game. Next.js 16 + Phaser 4 + Three.js. Empty repo to live in 12 days, 475 commits, ~1170 tests. PostgreSQL via Kysely, Google OAuth, cloud saves, leaderboard. [spacepotatis.vercel.app](https://spacepotatis.vercel.app)

- **AudiobookMaker**: Windows desktop app. PDF/EPUB/text → audiobook via five TTS engines (Edge-TTS cloud, Piper offline, Chatterbox voice cloning, VoxCPM2, Qwen VoiceDesign). 19-pass Finnish text normalization. 3000+ tests. Ships via GitHub Releases with auto-updates.

- **ReadLog**: reading tracker. Next.js, PostgreSQL, parallel multi-source book search (Open Library + Google Books) with deduplication. [read-log-pi.vercel.app](https://read-log-pi.vercel.app)

- **SongGenerator**: replaces a song's vocal with a bank of sung word clips, on the same notes and at the same moments. Python, PyTorch, Demucs separation, formant-preserving pitch shift via WORLD. Nothing musical is invented: note, onset and duration are read off the original vocal before it is discarded, and a song with no singing is refused rather than attempted. Runs locally on one GPU. 561 tests. [github.com/MikkoNumminen/SongGenerator](https://github.com/MikkoNumminen/SongGenerator)

- **Strudel Patterns**: algorithmic music library in Strudel (JS port of TidalCycles). Scores Spacepotatis and this portfolio site.

- **Portfolio**: this site. Astro, Three.js, GSAP, Tailwind CSS v4. Four pages, each a distinct interactive concept. The pages are static; the contact terminal talks to a self-hosted LLM (FastAPI, pgvector, hybrid retrieval) running on my own GPU behind a Tailscale funnel.



## Dominant tech

TypeScript, React, Next.js, PostgreSQL, Prisma, Python, Astro, Three.js, GSAP, Turborepo, Jest, Playwright, Phaser 4, Kysely, NextAuth, MUI, Tailwind CSS, Docker, GitHub Actions


## Experience

Two years of professional development at Kasvu Labs, two years of independent production work since, and 24 years of hardware retail and operations before that.

**Independent software developer** (2024–present). Own production projects: a dozen applications and tools in production, all maintained and still taking commits. Production systems across four stacks: TypeScript/Next.js, C#/.NET 8, Python, and Rust. Built and operate a fully local RAG stack (FastAPI, pgvector, Ollama) that powers the conversational terminal on this site. Published technical evaluations with their measurements attached, including a public retraction of one of my own findings.

**Kasvu Labs Oy** (2022–2024), software developer. First paid programming role. Full-stack work in client projects: a data visualization platform, a kiosk-network management application, open-data tooling, and a medical research project. Joined the existing kiosk-network application and built new features on it, including sales views and a map-of-Finland view over municipal open data, alongside bug fixing and investigation. Ran monthly client-data production updates directly against PostgreSQL in Kubernetes pods. Wrote TypeScript scripts that retrieved, processed and formatted municipal open data (CSV and JSON) for the map view. TypeScript, React, Next.js, Node.js, PostgreSQL, PgTyped, MUI, Recharts, Azure, Kubernetes.

**AI-native workflows** (2025–2026): agentic, AI-assisted development as a versioned discipline. Custom Claude Code skills as production artifacts. Parallel subagent orchestration, measured A/B calibration.

**The 2026 build** (2026): twelve projects carried from empty repo to running system. Real users, real ops, full ownership across schema, app code, CI, deploys, and signed Windows installers.


## Hardware retail, 1998 to 2022

Twenty-four years before programming, nearly all of it in the same hardware store as it changed hands twice. This is where the domain knowledge comes from: retail and construction-trade B2B, ERP and POS as a daily user for two decades, supply chain and warehouse operations.

**K-Niemi Oy** (2021–2022), senior salesperson. Hardware retail under the new retailer, the work continuing largely unchanged. Senior-level sales and service across consumer and trade customers, advising construction professionals, builders, contractors and renovators on materials and complete solutions. Product procurement and inventory work.

**Kesko Oyj** (2020–2021), senior salesperson. The family retailership ended and operations transferred to a Kesko holding company. With no owner-manager in place, the role grew: senior-level sales and service in hardware retail, carrying an increased share of day-to-day responsibility.

**Keijo Numminen Oy** (2012–2020), senior salesperson. The family hardware store, and the person other staff came to when their own knowledge ran out. Resolved the situations others could not and steered demanding customer conversations toward a workable outcome; training, example-setting and a leadership role grew out of that.

Construction-trade specialist end to end: green roofs to house foundations, groundworks, gravel and sand, installation services, and factory-direct-to-site supply arrangements, up to a house or a large motorboat. Equally deep across the rest of the range: tools from electric and pneumatic to welding and battery, paints including factory-direct wholesale, interior decoration, HVAC, ventilation and lighting. I also delivered the ride-on mowers I had sold, handed over ready to drive.

Throughout the era: warranty and claims handling end to end, including transporting machines to and from service shops; dozens of annual stocktakes plus continuous zero-stock rounds feeding the automatic ordering system; shrinkage investigation; pricing and campaign execution; and daily freight paperwork for both replenishment and customer-ordered goods.

Two changes in that period are the ones a developer would recognise. An organisation-wide ERP migration from Kesko's ASCII-based Profix system to its browser-based successor, which changed every POS, department and warehouse process. And a store expansion where the whole staff moved the entire store to new premises over a single weekend.

**Keijo Numminen Oy** (1998–2012), salesperson. Hardware store sales to private and professional customers. Began in 1998 under Keijo Numminen Tmi; the family business was incorporated as Keijo Numminen Oy in 2000 and the work continued unchanged.

Checkout and POS work at the tool counter and the interior and paint counter, including a B2B invoicing flow where a professional customer's purchases were registered for invoicing and they walked past the till with a printed proof of payment. Several years of warehouse operations: serving customers, unloading and loading freight, handling freight documents daily, shelving construction materials, managing customer pickups.

Order processing and procurement across a full technology shift: from phone-based supplier ordering to electronic orders over supplier system interfaces, for example Onninen's before its Kesko acquisition. Supplier claims ran through the same interfaces, and in a specific order: create the order number in Kesko's system first, then file the claim against it.
