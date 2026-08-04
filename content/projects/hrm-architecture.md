---
title: HRM · architecture & design
project: hrm
---

# HRManager: Architecture & Design

HRManager is a full-stack HR management system built with Next.js 16 App Router, TypeScript 5.9, and polyglot persistence (PostgreSQL + MongoDB). It targets production operational standards: granular RBAC, an immutable audit trail, real-time updates, TOTP 2FA, and a 2910-test suite with coverage tracked in CI.


## Overview and High-Level Architecture

The system is a single Next.js application organized around a feature-based module structure. Each domain (persons, teams, departments, reviews, leave, admin, sessions, twoFactor, featureFlags, jobs, realtime) lives under `src/features/<domain>/` and owns its schemas, queries, server actions, and components. Shared infrastructure (auth, permissions, audit logging, rate limiting, caching) lives in `src/lib/` and `src/` root files.

Request flow:

1. Most requests pass through `proxy.ts`, which generates a per-request CSP nonce and injects security headers. Its matcher deliberately excludes high-frequency endpoints (the health/readiness and realtime poll/SSE routes) and static assets, so they don't pay for nonce generation on every hit.
2. Next.js App Router dispatches to async Server Components that fetch data directly via `features/*/queries.ts`, no separate API layer for reads.
3. Mutations flow through React 19 `action=` props into `features/*/actions.ts` Server Actions. Every action runs inside a Prisma `$transaction`, validates input with Zod, and checks permissions before touching the database.
4. After the transaction commits and the response is sent, `next/server`'s `after()` hook defers an audit write to MongoDB: the user's response is never delayed by logging.
5. Server-Sent Events (`/api/realtime/sse`) broadcast mutation events to connected clients in real time; the system falls back to 30-second polling on Vercel's free tier, where serverless timeouts prevent persistent SSE connections.

HRManager also lives inside a [Turborepo monorepo](https://github.com/MikkoNumminen/Platform) as a git submodule alongside other applications. The feature-module structure and server action isolation make it embeddable without an adapter layer.


## Tech Stack and Key Choices

| Layer | Technology | Stated reason |
|---|---|---|
| Framework | Next.js 16 App Router | Server Components eliminate data-fetching waterfalls |
| UI | React 19 + MUI v7 + MUI X Charts | `useOptimistic` and `useActionState` remove form boilerplate |
| Org Chart | ReactFlow + dagre | First-class React integration with built-in zoom/pan/minimap |
| Language | TypeScript 5.9 | End-to-end type safety from database schema to UI props |
| ORM | Prisma 7 | Type-safe queries plus raw SQL escape hatch for CTEs and window functions |
| Relational DB | PostgreSQL | ACID transactions and JOINs for structured entity data |
| Document DB | MongoDB 8 | Append-only, variable-shape audit logs; TTL index for automatic 90-day purge |
| Validation | Zod 4 | Runtime validation and TypeScript type inference from one schema definition |
| Auth | NextAuth v5 (JWT) | Stateless tokens that scale without session storage; `permissionsVersion` field detects stale JWTs without extra DB calls |
| TOTP | otpauth | TOTP-based 2FA; chosen over SMS to avoid SIM-swap vulnerability |
| Job queue | pg-boss | PostgreSQL-backed async jobs; eliminates Redis as a required dependency |
| Logging | Pino | Fastest Node.js logger; structured JSON parseable by Datadog/Loki/CloudWatch |
| Tracing | OpenTelemetry SDK | Vendor-neutral; instruments PostgreSQL queries automatically via `@opentelemetry/instrumentation-pg` |
| Error tracking | Sentry (`@sentry/nextjs`) | Opt-in; app runs without a DSN |
| i18n | next-intl | 18 locale files; missing keys auto-translated via Claude API (`@anthropic-ai/sdk`) |
| CI/CD | GitHub Actions | Lint, format, test, build on every push to `main` |


## Data Model and Persistence

HRManager uses **polyglot persistence**: PostgreSQL for all relational data and MongoDB for the audit log collection.

**PostgreSQL models (via Prisma):**

- `Person`: employees; `deletedAt` soft-delete with index; `sessionId` column for demo isolation
- `Department` / `Team` / `TeamMember`: org hierarchy; FK indexes on manager and department references; composite unique on `(personId, teamId)` for memberships
- `User` / `Permission` / `UserPermission`: auth users separate from `Person` records; `UserPermission.granted` boolean enables both grant and deny overrides
- `RateLimit`: sliding-window counters stored in PostgreSQL; `@@unique([identifier, action])` for atomic upserts
- `UserSession` / `TwoFactorAuth` / `DemoSession`: session tracking and TOTP secrets (`encryptedSecret` field)
- `ReviewTemplate` / `ReviewCycle` / `ReviewRequest` / `ReviewSubmission`: 360-degree feedback system; cycle lifecycle is `DRAFT → OPEN → CLOSED`
- `LeaveType` / `LeaveRequest` / `LeaveBalance`: absence management; overlap detection uses a composite index on `(startDate, endDate)`
- `Position`: standardized job title catalog; unique on `(name, sessionId)` for demo isolation
- `FeatureFlag` / `UserFeatureFlag`: 4-level feature flag resolution

All tables carry a `sessionId` column. A `NULL` value identifies real users; a UUID identifies an isolated demo sandbox. Partial unique indexes enforce uniqueness only on active (non-deleted) records.

**MongoDB (audit log):**

The `AuditLog` collection stores `userId`, `userEmail`, `action`, `entityType`, `entityId`, `before`/`after` JSON snapshots, `sessionId`, and `createdAt`. A TTL index on `createdAt` purges documents older than 90 days automatically. A `$jsonSchema` validator (validationLevel `moderate`, validationAction `warn`) checks required fields and BSON types; violations are logged but not rejected in any environment, so schema can evolve without breaking writes.

Each audit entry includes an **HMAC-SHA256 hash** linking it to the previous entry. An admin-only `/api/audit/verify` endpoint walks the chain and reports the first broken link, providing tamper detection.

**Migrations** are managed by Prisma (`prisma/migrations/`). The build command runs `prisma migrate deploy && prisma generate && next build`, so migrations apply automatically on each deployment.


## Auth, Authorization, and Security

**Authentication** uses NextAuth v5 with JWT sessions. Google and GitHub OAuth are supported. The first OAuth user is auto-promoted to superuser. Demo users authenticate without OAuth by clicking "Try Demo," which creates a private sandbox seeded with sample data.

**RBAC** resolves permissions in a three-step order:

1. Superusers receive all permissions (immutable).
2. Per-user `UserPermission` overrides (grant or deny) take precedence over role defaults.
3. Role defaults (Administrator, User, Guest) apply when no override exists.

The system defines 38 permission keys (e.g., `person:create`, `team:delete`, `review:manage`, `leave:approve`). Permissions are embedded in the JWT at sign-in; a `permissionsVersion` integer on `User` detects stale tokens on each request.

**TOTP 2FA** uses the `otpauth` library. The setup flow generates a QR code; verification requires a 6-digit code. Ten one-time recovery codes are stored as SHA-256 hashes. TOTP secrets are encrypted at rest with AES-256-GCM. A Next.js middleware redirects unverified users to the verification page.

**Session management** tracks active sessions in the `UserSession` table with device and IP info. A maximum of 5 concurrent sessions is enforced; the oldest session is deactivated when the limit is exceeded. JWT tokens carry a `sessionId` verified on every request, enabling force-logout.

**Rate limiting** uses a sliding-window algorithm built on PostgreSQL (30 req/min for actions, 10 req/min for auth endpoints). An atomic `INSERT...ON CONFLICT` prevents two simultaneous requests from both passing the limit. A pg-boss background job prunes expired rows.

**CSP and security headers** are applied by `proxy.ts` on every response. Each request generates a unique random nonce; only scripts and styles tagged with that nonce execute. Additional headers include X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.

**Employee self-service** data access is IDOR-safe by design: queries derive `personId` from the session email rather than from caller-supplied IDs.


## Key Design Decisions and Trade-offs

**Polyglot persistence**: PostgreSQL for relational data, MongoDB for audit logs. The reasoning documented in the README: audit logs are append-only and variable-shape; a document store is the natural fit. Using a single database for both workloads was considered but rejected.

**Soft deletes everywhere**: Records receive a `deletedAt` timestamp rather than being removed. Partial unique indexes (`WHERE deletedAt IS NULL`) enforce uniqueness only on active records. The stated reason: HR systems must answer questions like "who was on this team last quarter?" years later.

**Deferred audit writes via `after()`**: Audit logging happens in a background task after the HTTP response is sent. This prevents logging latency from affecting the user's perceived response time while ensuring every mutation is eventually recorded.

**Rate limiting without Redis**: The sliding-window rate limiter uses only PostgreSQL (atomic `INSERT...ON CONFLICT`). The documented trade-off: one fewer service to deploy and operate at the cost of slightly higher latency than an in-memory store.

**Job queue without Redis (pg-boss)**: The background job queue runs on PostgreSQL, again avoiding Redis. Features include retry with exponential backoff, a dead-letter queue, and 24-hour job archival.

**Real-time transport: SSE with polling fallback**, Next.js App Router does not support WebSocket upgrade in route handlers. SSE works natively with `ReadableStream`. On Vercel's Hobby tier (10-second serverless timeout), the system detects the environment and falls back to 30-second polling. The interval is explicitly documented as a deliberate trade-off against Lambda invocation costs.

**In-process event bus**: The SSE event bus uses Node.js `EventEmitter` with a per-session ring buffer of 100 events and zero external dependencies. The README notes this is swappable to Redis pub-sub in a single file.

**Raw SQL for analytics**: Dashboard and report queries use CTEs and window functions that Prisma's query builder cannot express. These are the only queries that bypass the ORM.

**`unstable_cache` for high-traffic reads**: Org-wide list queries, dashboard metrics, and org-chart data are cached with a 5-minute TTL keyed by `sessionId`. Mutating server actions call `updateTag("org-data")` to implement read-your-own-writes within the same request.

**Vercel `ignoreCommand`**: A shell script at `scripts/vercel-ignore.sh` short-circuits Vercel deployments when only docs, tests, or CI config files change, reducing build minutes on the free tier.


## Testing Strategy

| Layer | Count | Notes |
|---|---|---|
| UI components | 734 | Covers all 52 components including themes, skeletons, mobile views |
| Server actions | 253 | Happy path, errors, permission denials, cascades |
| Zod schemas | 94 | Validation rules and edge cases |
| Prisma queries | 83 | Run against real PostgreSQL + in-memory MongoDB (no mocks) |
| Real-time (SSE) | 43 | Event bus, ring buffer, schema validation |
| E2E (Playwright) | 75 | Full user flows against a production build |
| Accessibility | 25 | axe-core WCAG AA checks across 25 components |
| OpenTelemetry | 22 | SDK init, span creation, metrics, middleware tracing |
| RBAC logic | 28 | Resolution order, overrides, deny-wins, superuser bypass |
| Reviews UI | 86 | Cycle management, submission flow, template CRUD |
| **Total** | **2910** | **Coverage tracked in CI** |

The documented testing philosophy is to run server-side tests against real databases. CI spins up a PostgreSQL 16 service container; in-memory MongoDB is provided by `mongodb-memory-server`. Playwright E2E tests run against a production build.

A Stryker mutation testing workflow runs on pull requests and fails if the mutation score drops below 60%.


## Infrastructure, Deployment, and CI/CD

**CI (GitHub Actions):**

The `ci.yml` workflow runs on every push to `main` and on pull requests. It: installs dependencies, pushes the Prisma schema to a test database, checks formatting (Prettier), lints (ESLint), runs the full test suite with coverage, and builds the Next.js app.

The `mutation.yml` workflow runs Stryker mutation testing on pull requests against real PostgreSQL and MongoDB services.

The `autofix.yml` workflow (disabled by default; requires Anthropic API credits) runs a 6-stage pipeline on CI failures: transient detection, concurrent-run guard, context gathering with log sanitization, infrastructure-failure bypass, targeted fix, and PR creation. It never auto-merges.

**Primary deployment: Vercel:**

The live demo deploys to Vercel with Vercel Postgres (Neon) and MongoDB Atlas (free tier). The build command is `prisma migrate deploy && prisma generate && next build`. The `vercel.json` `ignoreCommand` skips deployments for docs/test/CI-only commits.

**Kubernetes / Helm:**

Production-grade manifests are provided in `k8s/manifests/` and a Helm chart in `k8s/helm/hrmanager/`. Key configuration:

- Deployment: 2 replicas minimum, rolling update with `maxUnavailable: 0`
- HPA: 2–10 replicas, scaling targets CPU 70% / Memory 80%
- PDB: `minAvailable: 1` for zero-downtime node drains
- Ingress: NGINX with TLS redirect, rate limiting at 100 rps/IP
- Both liveness and readiness probes target `/api/health` (edge runtime, fast); `/api/ready` exists as a deeper PostgreSQL + MongoDB connectivity check but is not wired as a k8s probe target
- Security: non-root user (UID 1001), all capabilities dropped, topology spread constraints for node distribution

**Observability:**

- Pino structured logging (JSON in production); every log line includes OpenTelemetry `traceId` and `spanId` via a mixin
- OpenTelemetry SDK (opt-in via `OTEL_ENABLED=true`): auto-instrumented PostgreSQL queries, per-server-action spans with auth/rate-limit/business-logic events, custom metrics (`hrm.action.count`, `hrm.action.duration`, `hrm.db.query.duration`, `hrm.error.count`), `X-Trace-Id` and `Server-Timing` headers on every response, OTLP export to any compatible backend
- Sentry (`@sentry/nextjs`) for error capture; opt-in via DSN


## Scale and Performance Considerations

SCALING.md documents known scaling cliffs and their mitigations:

Performance indexes were added in migration `20260326000000_add_performance_indexes` across the hot query tables (Person, Department, Team, TeamMember, ReviewCycle, ReviewRequest, LeaveRequest, LeaveBalance). Notable: a composite index on `LeaveRequest(startDate, endDate)` for overlap detection queries.

**N+1 queries fixed:** Review cycle request counts were replaced with `_count` aggregations and batched `groupBy`; department and team relation includes were narrowed with `select` to fetch only columns used for display.

**Known cliffs at 10k+ employees:** Several queries (`getPersons`, `getTeams`, `getLeaveRequests`) fetch all records for form dropdowns and the org chart. The documented recommendation is to replace these with autocomplete search endpoints and implement hierarchical lazy-loading for the org chart.

**Caching:** A `cache()` wrapper around `unstable_cache` is applied to the four core org-wide listing queries, dashboard metrics, and org-chart data (5-minute TTL, keyed by `sessionId`). Per-request permission memoization via React's `cache()` collapses multiple `getUserPermissions()` calls within one Server Component render into a single DB hit.

**Performance tools:** `scripts/perf-seed.ts` generates 10k employees / 200 teams / 50 departments; `scripts/perf-benchmark.ts` measures all major query patterns with warm-up runs and P95 reporting.

The target dataset profile documented in SCALING.md is 100,000 employees / 2,000 teams / 200 departments.
