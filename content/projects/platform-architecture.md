---
title: Platform — architecture & design
project: platform
---

# Platform — Architecture & Design

Platform is a production community web application running at [vuohiliitto.com](https://vuohiliitto.com). It is built as a Turborepo monorepo and serves real users via Vercel.

## Overview and High-Level Architecture

The monorepo has four top-level members:

- `apps/web/` — the community platform (Next.js 15, the main application)
- `apps/hrm/` — a standalone HR management showpiece included as a git submodule; never modified from within this repo
- `packages/ui/` — shared UI components published internally as `@platform/ui`
- `packages/config/` — shared TypeScript types and configuration as `@platform/config`

Data flow inside `apps/web` follows the Next.js App Router pattern: React Server Components render server-side by default; mutations go through Next.js Server Actions (`"use server"`), not REST endpoints. The only Route Handlers are the NextAuth catch-all, a promotion-polling endpoint, and two cron trigger endpoints. The two applications (Platform and HRM) have completely separate databases.

## Tech Stack and Key Choices

| Layer | Choice | Documented reason |
|---|---|---|
| Framework | Next.js 15 + React 19 | RSC-first; Server Actions eliminate a separate API layer |
| Language | TypeScript `strict` + `noUncheckedIndexedAccess` | Full-stack type safety, enforced by CI |
| UI | MUI v7 + Emotion | Accessible component library; deep-import paths preserve tree-shaking |
| ORM | Prisma 7 + `@prisma/adapter-pg` | Type-safe query builder; schema-first migrations |
| Database | PostgreSQL (Neon.tech in production) | Single relational store including rate-limit counters |
| Auth | NextAuth v5 JWT strategy | No database session rows; JWT carries resolved permission set with 5-minute sync TTL |
| i18n | next-intl 4 | Cookie-based locale detection with Accept-Language fallback; RTL support for Arabic |
| Monorepo tooling | Turborepo 2 | Incremental task caching; single command for lint/test/build |
| Rate limiting | PostgreSQL atomic upsert | Keeps the stack simple; `ON CONFLICT DO UPDATE` is an atomic fixed-window counter without Redis |

## Data Model and Persistence

The schema has 30 Prisma models across these domains:

**Users and permissions:** `User` (UUID PK, soft-delete via `deletedAt`, `permissionsVersion` for JWT invalidation), `Permission` (25 named keys), `UserPermission` (per-user grant/revoke overrides on top of role defaults).

**Content:** `Board`, `Post`, `Forum`, `Topic`, `Thread` (unified reply system with a `ParentType` enum with values `POST` and `TOPIC`, routing replies to either a board post or a forum topic), `CalendarEvent`, `Shout`, `IssueReport`, `Feedback`.

**Gamification:** `XpTransaction`, `UserLevel`, `Achievement`, `UserAchievement`, `Quest`, `UserQuestProgress`, `LoginStreak`.

**Surveys:** `SurveyRound` (with `customQuestions` JSON column), `SurveyResponse` (with `customAnswers` JSON column).

**Messaging:** `Conversation` (unique constraint on `[participantA, participantB, sessionId]`), `DirectMessage`.

**WoW Mythic+:** `WowCharacter` (stores character name, realm, region, class, spec, specRole, item level, Mythic+ rating, and a Raider.IO profile URL; linked to the owning `User`), `MythicPlusTeam` (five nullable `WowCharacter` FK slots: tankId, healerId, dps1Id–dps3Id; creator FK to `User`).

**Operations:** `RateLimit`, `AuditLog`, `PlatformSetting` (composite PK `[tenant, key]` for per-tenant MOTD and settings), `DemoSession`, `UserTourProgress`.

**Multi-tenancy:** Every content model carries a `tenant` field (default `"vuohiliitto"`) and an optional `sessionId` for demo isolation. All queries filter by both. The Vercel build command runs `npx prisma generate && next build`, keeping the generated client in sync with the deployed schema.

## Auth and Authorization

**Authentication** uses NextAuth v5 with Google OAuth, GitHub OAuth, and a credentials provider for zero-friction demo mode. The sign-in callback bootstraps the first user as `superuser`; all subsequent new users receive the `pending` role with zero permissions. The demo credentials provider is gated by the `NEXT_PUBLIC_DEMO_LOGIN` env var: when its value is `"false"` the `authorize` callback returns `null` immediately, blocking demo logins without code changes.

**Permission resolution** (`lib/permissions.ts`) has five roles: `superuser`, `vuohi`, `admin`, `user`, `pending`. It starts from role defaults (superuser gets all 25 keys; pending gets none) then applies per-user `UserPermission` overrides to grant or revoke individual keys. The resolved `Record<string, boolean>` is embedded in the JWT.

The `permissionsVersion` integer on `User` lets the JWT callback detect stale tokens without forcing sign-outs: it re-fetches from the database only when the version has changed, with a maximum stale window of 5 minutes.

**Enforcement** uses a three-layer stack. The `guardedAction` wrapper enforces in sequence: (1) authentication check, (2) permission key check against the JWT payload, (3) rate limit check via atomic PostgreSQL upsert. Most mutating server actions are wrapped in `guardedAction(...)`. DM actions (`lib/dm-actions.ts`) do not use `guardedAction`; instead they call `requireUser()` directly, then perform an inline `permissions['dm:send']` check against the resolved JWT payload, then call `rateLimit('dm:send')` before proceeding. Middleware guards `/admin/*` routes at the edge by decoding the JWT and checking role membership.

**Rate limiting** uses a PostgreSQL fixed-window counter (default 30 requests / 60 seconds; `windowStart` resets only once the prior window expires). The identifier is the authenticated user ID or the Vercel-forwarded IP for unauthenticated callers. Per-action limits are tuned: 3/min for account deletion, 10/min for alias changes.

**Security headers** are applied globally via `withSecurityHeaders` in `next.config.ts`: CSP with `object-src 'none'`, `frame-ancestors 'none'`, and `media-src 'self'`; HSTS with a 2-year max-age and preload flag; `X-Frame-Options: DENY`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` blocking camera, microphone, and geolocation. `'unsafe-eval'` is only added to the CSP in development.

**GDPR:** Users can export all their data as JSON and delete their account (PII scrubbed, authored content anonymized, sent DMs replaced with `[deleted]`). A weekly Vercel Cron job (`0 3 * * 0`) hard-deletes records soft-deleted more than 30 days ago and purges audit logs older than one year. IP addresses used for rate limiting are removed within 24 hours.

## Key Design Decisions and Trade-offs

**Server Actions over REST:** Mutations go through Next.js Server Actions rather than API routes, eliminating a serialization layer and keeping the server-side auth context automatic. The trade-off is that the mutation surface is only accessible from within the Next.js application.

**Multi-tenancy via a discriminator column:** Every content table carries a `tenant` string column rather than separate schemas or databases. This keeps deployment simple — one database, one connection pool — and lets a superuser switch between tenants at runtime via a TopBar toggle. Cross-tenant leak risk is mitigated by centralizing tenant filtering through `getTenantFilter()` in `lib/tenant.ts`.

**Demo mode with real isolated data:** Demo mode creates an actual `superuser` session with a `DemoSession` record and seeds comprehensive mock data (6 users, 10 shoutbox messages, 5 survey responses, 4 custom quests, gamification profiles) scoped by `sessionId`. Real community data is never exposed. Auto-cleanup is login-triggered: on the next demo login, `cleanupStaleDemoSessions()` runs fire-and-forget, issuing a `deleteMany` per content table filtered by `sessionId` for any session older than 24 hours, then removing the `DemoSession` record itself.

**HRM as a git submodule:** New feature patterns are developed in the HRM repo first, then ported to Platform. HRM is never modified from within this repo.

## Testing Strategy

**Unit and integration tests** use Jest 30 + React Testing Library + jsdom — an extensive suite (1,300+ tests) covering server actions, query functions, gamification services, and UI components. Coverage thresholds are enforced in `jest.config.ts`: 70% lines/functions/statements, 60% branches. Pre-push Husky hooks require the full suite to pass before code reaches the repository.

`jest-axe` is available for accessibility assertions within the unit suite. There is no end-to-end test layer in this repo: no Playwright config, no `*.spec.ts` browser tests, and no `@playwright/test` dependency.

## WoW Mythic+ Integration

The `/mythic-plus` section is a first-class feature that lets community members register their World of Warcraft characters and compose five-person Mythic+ dungeon teams.

**External dependency — Raider.IO API (`lib/raiderio.ts`):** Character data is fetched from `https://raider.io/api/v1/characters/profile`. The response is validated with a Zod schema and returns name, realm, region, class, spec, specRole, race, item level, and the current-season Mythic+ composite score. Fetch results are cached with a 24-hour Next.js tag (`"raiderio"`) and a 10-second abort timeout. 400/404 responses surface as `characterNotFound`; other non-OK responses surface as `raiderIoError`.

**Data models:** `WowCharacter` stores the enriched profile per user (unique on `[characterName, realm, region, sessionId]`). `MythicPlusTeam` holds five nullable FK references — `tankId`, `healerId`, `dps1Id`, `dps2Id`, `dps3Id` — each pointing to a `WowCharacter`; slot removal uses `onDelete: SetNull` so a deleted character vacates its slot without dropping the team.

**Server actions (`lib/mythicplus-actions.ts`):** `addCharacter`, `removeCharacter`, `refreshCharacter`, `refreshAllCharacters`, `createTeam`, `updateTeamSlot`, `deleteTeam`. All are wrapped in `safe()` and validate slot names against a typed `VALID_SLOTS` constant before writing. Both `WowCharacter` and `MythicPlusTeam` carry `tenant` and `sessionId` columns, so the feature participates in multi-tenancy and demo isolation.

## Server Actions Result Contract

Every mutating server action returns `ActionResult`, a discriminated union defined in `lib/actionUtils.ts`:

```ts
type ActionResult = { error: string; code: string } | undefined;
```

`undefined` means success; an object with `error` and `code` means a handled failure. The `code` field is a typed `ErrorCode` union (`lib/actionErrors.ts`) with domain-specific values (`invalidBoardName`, `characterNotFound`, `rateLimited`, etc.) that the client can branch on without parsing message strings.

**`safe(fn)`** is the standard wrapper: it runs `fn`, catches `ActionError` and `RateLimitError` into the result shape, re-throws Next.js redirect/notFound errors unchanged, and logs unexpected errors without exposing internals.

**`requireUser()`** calls `auth()` and throws `ActionError("permissionDenied", ...)` if no session or no `user.id` is present. **`requireAdmin()`** extends that by also checking that `role` is one of `superuser`, `vuohi`, or `admin`.

**`createStringValidator(fieldName, maxLength, emptyCode, tooLongCode)`** returns a trim-and-validate function used across actions to enforce field constraints in a single expression, throwing typed `ActionError`s for empty or oversized inputs.

## Infrastructure, Deployment, and CI/CD

`apps/web` auto-deploys to Vercel on every push to master, with `apps/web` as the root directory. Two Vercel Cron jobs are defined in `vercel.json`: `purge-deleted` (weekly, Sunday 03:00 UTC) and `reset-quests` (daily, 00:05 UTC). Both require `Authorization: Bearer ${CRON_SECRET}` for protection.

GitHub Actions CI runs a single job on ubuntu-latest with Node 22: checkout with recursive submodules, `npm ci --ignore-scripts`, Prisma client generation, lint, format check, tests, and build. `GITHUB_TOKEN` is injected into the build step to avoid GitHub API rate limits for the Dev Log commit feed.

Husky git hooks enforce quality locally: Prettier runs on staged files at pre-commit; ESLint, Prettier check, and the full test suite must pass at pre-push.

## Notable Engineering Challenges

**N+1 queries in gamification:** The initial `checkAchievements`, `updateQuestProgress`, and `getMyConversations` implementations each had N+1 query patterns. These were resolved by batching action counts before the loop, pre-loading all progress rows, and using a single `groupBy` query for unread counts.

**Permission sync without session invalidation:** Admin permission changes needed to propagate to active sessions without forcing sign-outs. The `permissionsVersion` counter on `User` triggers a JWT re-sync on the next token refresh, bounded by a 5-minute cache window.

**Demo mode safety:** Production audit identified that DM actions bypassed the `dm:send` permission check. This was resolved: `lib/dm-actions.ts` now calls `requireUser()` and performs an explicit inline `permissions['dm:send']` check before reaching any database write. The demo login is gated by `NEXT_PUBLIC_DEMO_LOGIN` (a client-visible flag); the `authorize` callback returns `null` when the value is `"false"`, which is the intended gating mechanism rather than a server-only secret.

**Production audit remediation:** A 121-finding automated audit resulted in 106 fixes (88%). Key structural fixes included deduplicating constants (`WHISPER_COLOR`, `DEMO_EMAIL`, `CRITERIA_ACTIONS`) that had drifted to 3–6 separate definitions, resolving the N+1 gamification queries, and adding UUID and length validation across server actions.
