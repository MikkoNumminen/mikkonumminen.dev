---
title: How Platform was built — development narrative
project: platform
kind: project
type: narrative
date: 2026-06-28
---

## Origin

Platform is a live community website for a real World of Warcraft guild, running in production at vuohiliitto.com on Vercel with a Neon.tech PostgreSQL database. The git history opens on 2026-03-26; after a bare initial commit, the foundational "Initialize Turborepo monorepo with HRM submodule and web app" commit establishes the structure — from the outset the project was a Turborepo monorepo with the separate HRM project embedded as a git submodule, so the two products share the same authentication layer and audit log. The bulk of the build is compressed into roughly twelve days (the log runs 2026-03-26 to 2026-04-06 across 427 commits), scaffolding boards, forums, a unified thread system, calendar, NextAuth, and a theme system in the first day alone.

## Key technical choices and the why

The architecture is RSC-first Next.js 15 + React 19: mutations go through Server Actions rather than REST route handlers, which removes a serialization layer and keeps the server auth context automatic. Persistence is Prisma over PostgreSQL (~30 models). Auth is NextAuth v5 with a JWT strategy that carries a resolved permission map, avoiding a database session read on every request. Authorization is centralized in a `guardedAction` higher-order wrapper that enforces a fixed sequence — authenticate, check the named permission key, rate-limit — so the rule cannot be accidentally skipped across the many action files. Rate limiting deliberately avoids Redis: it is a Postgres `INSERT ... ON CONFLICT DO UPDATE` atomic fixed-window counter, keeping the stack to a single store.

## Dead ends and how they resolved

The most revealing arc is the quest system. It was first built as two parallel models, `Quest` and `CustomQuest`, with separate query files, admin editors, and dashboard panels. That split caused real bugs — a demo-isolation leak because `CustomQuest` lacked a `sessionId` column (fixed by adding one), and a dashboard crash on schema mismatch. The commits show it was eventually collapsed: "unify quest system — merge CustomQuest into Quest" performed a data migration and made `key`, `criteria`, `icon`, and `description` nullable because assigned quests are status-driven, not criteria-driven.

The pivotal event is the 2026-04-03 production-readiness audit (AUDIT.md): 121 findings, grade B- raised to B+ after 106 fixes (88%). It caught concrete security gaps — demo login had only a client-side gate that could expose superuser access, DM actions bypassed the `dm:send` permission so pending users could reach them, and `getDmUsers()` leaked email PII. It also surfaced three N+1 query patterns in gamification (unread DM counts, achievement checks, quest progress), resolved by batching reads with `groupBy`/`findMany` before the loop. Honestly, the deep-dive records that several concurrency races (the daily XP-cap TOCTOU, the login-streak create, the achievement double-unlock) were flagged but had not landed fixes at audit time.

Infrastructure friction shows too: initializing PrismaClient at module load crashed CI builds where `DATABASE_URL` is absent, fixed with a lazy `Proxy` that only throws on first query. A `'use server'` file cannot re-export plain constants, forcing `DEMO_EMAIL` into a non-server module. And "cut serverless CPU usage" cut promotion polling from 5s to 60s (92% fewer requests) and throttled the per-request JWT `findUnique` to a 5-minute TTL, using a `permissionsVersion` counter so permission changes still propagate within five minutes.

## Notable implementation details

The Raider.IO Mythic+ integration started by casting the response with `as`; the audit's fix added a Zod schema as a contract, with a 24-hour tag cache and a 10-second abort timeout. Demo mode gives any visitor a full superuser session against synthetic data isolated by `tenant` + `sessionId` discriminators, seeded in a single transaction. Multi-tenancy itself was added late (2026-04-04), retrofitting a `tenant` field across 24 models. The CSP must keep `'unsafe-inline'` in `style-src` because MUI v7's Emotion injects styles at runtime.

## Outcome

The app is live at vuohiliitto.com, auto-deploying to Vercel on every push to master with two cron jobs. Testing is Jest with enforced coverage thresholds (70% lines/functions/statements, 60% branches); the audit counted 1,263 tests across 143 suites, and the corpus reports 1,300+.
