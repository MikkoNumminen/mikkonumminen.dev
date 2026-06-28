---
title: How HRM was built — development narrative
project: hrm
kind: project
type: narrative
date: 2026-06-28
---

## Origin

HRManager began in August 2024 as a small person-and-team management app — the first commits add basic CRUD, then wrap the mutations in transactions and make a team's manager nullable. It then sat dormant for roughly a year and a half. In March 2026 it was revived and deliberately rebuilt to production and portfolio standards: the README frames it as "a showcase of real architectural decisions" where "every technical choice has a reason." Today it runs as a live Vercel demo and ships as a git submodule inside the Platform monorepo, sharing one auth and audit core.

## Key technical choices and the why

The defining choice is polyglot persistence: PostgreSQL for relational data (people, teams, permissions) because it needs ACID transactions and JOINs, and MongoDB for the audit log because audit entries are append-only and variable-shape — a document store is the natural fit. The audit trail is immutable and hash-chained (HMAC-SHA256 per entry, with an admin `/api/audit/verify` endpoint that walks the chain), and writes are deferred via Next.js `after()` so logging never delays the user's response. Soft deletes are used everywhere, with partial unique indexes (`WHERE deletedAt IS NULL`) so a deleted record doesn't block re-creating it — the stated reason is that HR systems must answer "who was on this team last quarter?" years later. Auth is NextAuth v5 with JWTs; a `permissionsVersion` integer lets the callback skip the full permissions join when the token is still fresh. Both rate limiting and the background job queue (pg-boss) run on PostgreSQL specifically to avoid requiring Redis. The March revival also swapped Tailwind for MUI, upgraded the whole stack (Node 22, Next 16, React 19, MUI 7, Prisma, Zod 4, Jest 30), and split reads (Server Components and `queries.ts`) from mutations (Server Actions).

## Dead ends and how they resolved

The revival opened with a long bug-fixing spree the commits lay out plainly: list keys keyed on array index moved to member email; `alert()` became a disabled-button state; swallowed server errors were shown inline; discarded Zod parse results were actually used; `window.location.reload()` became `router.push()`. Several real security bugs surfaced and were fixed: a superuser-bootstrap TOCTOU race (two first sign-ins both reading a zero user count) was closed with a SERIALIZABLE transaction plus upsert; a `demoSessionId` cross-user hijack was fixed by validating ownership in the JWT callback; and, in a later June 2026 hardening pass, a 2FA verification bypass — where verified status was derived from a client-supplied session payload — was moved to a server-owned `UserSession.twoFactorVerifiedAt`. A REVIEW.md code review on 2026-03-25 found 41 issues; the next day the flat `src/` layout was reorganized into feature modules and `guardedAction` plus `withAuditedTransaction` were extracted — the latter fixing `captureAuditContext()` being called inside the Prisma transaction, which could block on the request context and time out. A 10k-employee perf-seed then surfaced N+1 patterns (review-cycle counts pulling thousands of rows for two integers), fixed with `_count`/`groupBy` and a 14-index migration. Finally, the Vercel Hobby tier hit 75% of its 4-hour CPU budget, which drove polling from 5s to 30s, `cache()` memoization of permission lookups, an Edge health route, and a docs-only deploy skip — whose `ignoreCommand` first broke Vercel's 256-char limit (moved to a script) and was then corrected to compare against `VERCEL_GIT_PREVIOUS_SHA` instead of `HEAD^`.

## Notable implementation details

Multi-tenancy runs on a single schema: every table carries a `sessionId` and queries filter with `IS NOT DISTINCT FROM` to handle the NULL (real-user) case. The rate limiter is one atomic `INSERT ... ON CONFLICT ... RETURNING count` to defeat the check-then-increment race. CSP nonces are generated in `proxy.ts` with a dual `nonce` + `unsafe-inline` style policy to keep MUI/Emotion working across browser generations. SSE real time falls back to polling on serverless, and the CI autofix agent ships disabled by default with explicitly constrained tools.

## Outcome

The corpus reports 2906+ tests at 92.2% line coverage, with Stryker mutation testing gating pull requests (failing below a 60% mutation score). The git history shows coverage being pushed from 88% to 99% in one large pass. It is live on Vercel (Vercel Postgres/Neon + MongoDB Atlas free tier), carries Kubernetes manifests and a Helm chart for production-grade deployment, and is embedded in the Platform monorepo as a submodule.
