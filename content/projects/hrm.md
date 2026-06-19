---
title: HRM — full-stack HR management system
project: hrm
url: https://hr-manager-pearl.vercel.app
---

# HRM

**Full-stack HR management system**

HRM is a production-ready HR system built to portfolio standards. It runs two databases side by side: PostgreSQL for structured relational data, and MongoDB for an immutable, hash-chained audit log. The dual-database approach means every mutation is permanently traceable without touching the transactional store.

The permission model has 38 granular permissions with per-user overrides, TOTP 2FA, and server-side rate limiting. For observability, the app ships OpenTelemetry tracing. The UI is internationalised across 18 languages. Real-time activity notifications are delivered over SSE, with a polling fallback for environments where SSE is unavailable.

## Highlights

- 1828+ tests at 91.9% line coverage
- HRM runs Stryker mutation testing on every PR — 91.9% line coverage means the lines ran; the mutation score means the assertions actually catch bugs
- PostgreSQL (structured data) + MongoDB (immutable audit log)
- 38 granular permissions, TOTP 2FA, OpenTelemetry tracing, 18 languages

## Tech stack

Next.js, React, TypeScript, PostgreSQL, MongoDB, Prisma, MUI, Jest, Playwright, Docker, Zod, NextAuth, ReactFlow, Pino, pg-boss

## External integrations

Google OAuth, GitHub OAuth, Sentry, OpenTelemetry

## Status

Live — [hr-manager-pearl.vercel.app](https://hr-manager-pearl.vercel.app) · [GitHub](https://github.com/MikkoNumminen/HRManager)

## Connections

HRM ships as a git submodule inside Platform — same auth layer, same audit log, two products from one core codebase.
