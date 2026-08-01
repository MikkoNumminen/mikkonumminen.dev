---
title: Mikko Numminen — CV
kind: cv
---

# Mikko Numminen

**Full-Stack Developer · Finland**

numminen.mikko.petteri@gmail.com · [github.com/MikkoNumminen](https://github.com/MikkoNumminen)

Open to full-stack and AI engineering roles. Remote-friendly.


## Summary

I work on systems built around language models, with a focus on what happens when the model is wrong. I keep deterministic work deterministic, put the model only where language genuinely cannot be rule-coded, and enforce grounding through validation rather than prompt wording. I measure results and publish corrections when a measurement turns out to be broken.

Underneath that is ordinary full-stack work, end to end, SQL to ops. Twelve projects carry it: a multi-tenant community platform serving a live WoW guild, a browser game built from an empty repo to live in 12 days, a Windows desktop app for audiobook generation, a reading tracker built twice in two ecosystems, a zero-knowledge password manager in Rust, and this site. Every repo runs CI on every push.

AI-native development is part of the toolchain, not a side note. I maintain a catalog of custom Claude Code skills — version-controlled, audited, and treated as production artifacts. A 2026-05-22 A/B calibration across 13 Spacepotatis skills (Sonnet only) measured a ~22% aggregate token saving versus cold scouting; a later portfolio-wide calibration across Sonnet, Opus, and Haiku covered 34 skills (33 calibrated) for a +17% aggregate save, ~327K tokens.


## Projects

- **HRM** — production HR system. Next.js, React, TypeScript, PostgreSQL + MongoDB (dual-database: relational + immutable audit log), 38 permissions, TOTP 2FA, OpenTelemetry, 18 languages, SSE notifications. 2910 tests, 92.2% coverage, Stryker mutation testing. [hr-manager-pearl.vercel.app](https://hr-manager-pearl.vercel.app)

- **Platform** — live community site for a WoW guild (vuohiliitto.com). Turborepo monorepo with HRM as a git submodule. Multi-tenant, Raider.IO API integration, tabbed chat, gamification (XP, levels, achievements, quests), guided onboarding. 1388 tests. [vuohiliitto.com](https://vuohiliitto.com)

- **Spacepotatis** — live browser game. Next.js 16 + Phaser 4 + Three.js. Empty repo to live in 12 days, 475 commits, ~1170 tests. PostgreSQL via Kysely, Google OAuth, cloud saves, leaderboard. [spacepotatis.vercel.app](https://spacepotatis.vercel.app)

- **AudiobookMaker** — Windows desktop app. PDF/EPUB/text → audiobook via five TTS engines (Edge-TTS cloud, Piper offline, Chatterbox voice cloning, VoxCPM2, Qwen VoiceDesign). 19-pass Finnish text normalization. 3000+ tests. Ships via GitHub Releases with auto-updates.

- **ReadLog** — reading tracker. Next.js, PostgreSQL, parallel multi-source book search (Open Library + Google Books) with deduplication. [read-log-pi.vercel.app](https://read-log-pi.vercel.app)

- **Strudel Patterns** — algorithmic music library in Strudel (JS port of TidalCycles). Scores Spacepotatis and this portfolio site.

- **Portfolio** — this site. Astro, Three.js, GSAP, Tailwind CSS v4. Four pages, each a distinct interactive concept. The pages are static; the contact terminal talks to a self-hosted LLM (FastAPI, pgvector, hybrid retrieval) running on my own GPU behind a Tailscale funnel.



## Dominant tech

TypeScript, React, Next.js, PostgreSQL, Prisma, Python, Astro, Three.js, GSAP, Turborepo, Jest, Playwright, Phaser 4, Kysely, NextAuth, MUI, Tailwind CSS, Docker, GitHub Actions


## Experience

**Kasvu Labs Oy** (2022–2024) — first paid programming role. Node.js backend, React frontend, large sets of open data. Full-stack development, UI design, database management on Azure, product maintenance.

**Hardware retail** (1998–2022) — 24 years in hardware retail, mostly at the family business. Decor, renovation, tools, construction — every category, every kind of customer.

**AI-native workflows** (2025–2026) — agentic, AI-assisted development as a versioned discipline. Custom Claude Code skills as production artifacts. Parallel subagent orchestration, measured A/B calibration.

**The 2026 build** (2026) — twelve projects carried from empty repo to running system. Real users, real ops, full ownership across schema, app code, CI, deploys, and signed Windows installers.
