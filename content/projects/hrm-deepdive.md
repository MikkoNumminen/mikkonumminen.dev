---
title: HRM — engineering deep-dive
project: hrm
---

# HRM — Engineering Deep-Dive

This document picks up where the architecture and design docs leave off. It covers the specific problems that were hard to get right, the bugs that forced design changes, and the tradeoffs that weren't obvious until the code ran.

---

## Multi-Tenancy on a Single Schema

The demo sandbox model is the most pervasive constraint in the codebase. Every table carries a `sessionId` column: `NULL` identifies a real user, and a UUID identifies an isolated demo tenant. Queries must filter by both `sessionId IS NOT DISTINCT FROM $value` (the `IS NOT DISTINCT FROM` operator handles the NULL case without special-casing) and `deletedAt: null` for soft-deletable entities. Omitting either condition is a cross-tenant data leak.

The `IS NOT DISTINCT FROM` operator is slightly slower than a plain equality check because it forces the planner to consider NULL semantics. The SCALING.md analysis notes this is low-impact given the existing `@@index([sessionId])` on all tables, but it is a non-obvious SQL idiom for anyone reading a query for the first time.

Demo session cleanup is opportunistic, not scheduled: `cleanupStaleDemoSessions()` runs on each demo login in the background, deleting sessions older than 24 hours. This choice avoids a cron dependency on Vercel's Hobby tier, but it means stale sandbox data accumulates until the next demo login. The cleanup is fire-and-forget (`catch(() => console.error(...))`), so a database error during cleanup is logged but does not block the login.

The seeding transaction (`seedDemoData`) runs inside a single Prisma `$transaction` to avoid partial-state demos. Because teams reference persons by index position in the seed array, and departments reference teams by name, the seed script has a specific ordering constraint: persons must be created first, then teams (which look up managers by `persons[managerIndex].id`), then memberships, then departments (which update already-created teams to set `departmentId`). That ordering is implicit in the code structure, not documented with comments.

---

## The Superuser Bootstrap Race

The first OAuth user to sign in is automatically promoted to superuser. The naive implementation reads the user count, checks for zero, then creates the user — a classic TOCTOU race where two simultaneous first-time sign-ins both read zero and both receive superuser role.

The fix uses a `SERIALIZABLE` isolation level transaction in the NextAuth `signIn` callback:

```ts
await prisma.$transaction(
  async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: user.email! } });
    if (!existing) {
      const userCount = await tx.user.count();
      const role = userCount === 0 ? "superuser" : "user";
      await tx.user.upsert({ where: { email: user.email! }, update: {}, create: { ..., role } });
    }
  },
  { isolationLevel: "Serializable" },
);
```

`SERIALIZABLE` makes PostgreSQL detect the phantom-read condition and abort one of the concurrent transactions with a serialization failure. `upsert` then handles the case where the same email appears in two concurrent sign-ins, preventing a unique-constraint violation on email.

---

## JWT Freshness Without Round-Trips

Embedding permissions in the JWT means they can go stale the moment an admin changes a user's role or overrides. The typical answer is to add a DB round-trip on every request, which eliminates most of the benefit of stateless JWTs.

HRM uses a `permissionsVersion` integer on the `User` table. Each JWT callback performs a lightweight query that fetches only `id`, `role`, and `permissionsVersion`. If the version in the token matches the database, the cached permissions in the token are still valid and the full permissions join is skipped. Only when versions diverge (or on the initial sign-in) does the callback fetch the full `permissions` relation. In practice, the lightweight path is the common one.

The session tracking layer adds a related concern: pure JWTs cannot be revoked. The `UserSession` table gives the app force-logout capability without abandoning JWT. Every JWT callback (except sign-in itself) checks whether the token's embedded `sessionId` still has `active: true` in the database. If the session was deactivated — by an admin force-logout or by the concurrent session limit — the callback returns an empty token, which forces re-authentication on the next request.

To avoid a database write on every request, `lastActiveAt` updates are throttled to at most once per 60 seconds per session using a `sessionLastUpdate` field in the token itself. The update is wrapped in `.catch(() => {})` because a failure to update `lastActiveAt` is non-critical and should not fail the request. The REVIEW.md code review flagged this as ERR-04 — the silent catch means a DB-down condition lets stale sessions continue to pass validity checks — but the current behavior is an accepted tradeoff for not blocking requests on a non-critical write.

---

## Rate Limiting Without Redis

The sliding-window rate limiter is built entirely on PostgreSQL. The key challenge is the TOCTOU problem: two concurrent requests can both read the same count below the threshold and both proceed.

The solution is a single atomic SQL statement using `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`:

```sql
INSERT INTO "RateLimit" (id, identifier, action, count, "windowStart")
VALUES (gen_random_uuid(), $identifier, $action, 1, $now)
ON CONFLICT (identifier, action) DO UPDATE SET
  count = CASE
    WHEN "RateLimit"."windowStart" <= $windowStart THEN 1
    ELSE "RateLimit".count + 1
  END,
  "windowStart" = CASE
    WHEN "RateLimit"."windowStart" <= $windowStart THEN $now
    ELSE "RateLimit"."windowStart"
  END
RETURNING count
```

The `CASE` expression resets the window if the existing window has expired, or increments atomically otherwise. Because the entire check-and-increment happens in one statement, two concurrent requests cannot both read the same pre-increment value. The tradeoff versus Redis is a few milliseconds of latency per request and slightly higher database load, which the docs acknowledge explicitly.

IP-based identifiers are truncated before being stored in the rate-limit audit log: `ip:<base64-prefix>...`. The comment in the code calls this out as a GDPR PII concern — raw IPs should not appear in audit logs.

For authenticated users, rate limiting keys on `user:<id>` rather than IP. This means a user behind NAT shares their rate limit budget across all their sessions rather than sharing it with other users on the same IP.

---

## The Audit Log Chain and Its Deferred Write Problem

Every mutation appends a document to MongoDB's `auditLogs` collection. Each document carries a `prevHash` pointing to the preceding entry and a `hash` over its own fields using HMAC-SHA256. The admin `/api/audit/verify` endpoint walks the chain in chronological order and reports the first broken link.

The deferred write pattern introduces an ordering hazard. If two mutations happen concurrently, both call `getLatestHash()` to read the current chain head, get the same hash, and both try to set `prevHash` to that value. The result is a fork in the chain rather than a linear sequence, and verification will report a break.

The current mitigation is that `deferAudit` receives an array of entries from a single request and chains them in memory before writing:

```ts
let prevHash = await getLatestHash(entries[0].sessionId);
const docs = entries.map((entry) => {
  const doc = { ...entry, prevHash, hash: "" };
  doc.hash = computeHash(doc);
  prevHash = doc.hash; // each entry links to the previous
  return doc;
});
await col.insertMany(docs);
```

This guarantees internal consistency within a single request's audit entries. Cross-request concurrency is not addressed — two concurrent mutations can still produce a forked chain. The verification endpoint handles entries without a `hash` field (pre-dating the hash chain feature) by skipping them, which means the chain only applies to entries created after the feature was introduced.

The `$jsonSchema` validator on the MongoDB collection uses `validationAction: "warn"` so schema violations are logged but do not reject writes. This was a deliberate choice to allow the schema to evolve (new fields, changed field names) without breaking the audit pipeline during deployments. In a blue-green deployment, the new code version and the old would write slightly different shapes, and `warn` ensures neither fails.

---

## TOTP 2FA and the Session-Verification Bypass

TOTP secrets are encrypted at rest with AES-256-GCM. The key derivation falls back to `NEXTAUTH_SECRET` in development (via SHA-256 to produce a fixed 32-byte key from any-length string), but the CLAUDE.md golden rules state that production must have `TOTP_ENCRYPTION_KEY` set explicitly and the code throws if it is absent in production.

The setup flow returns the QR URI and recovery codes without persisting anything yet. Only after the user verifies a valid 6-digit code does the action store the encrypted secret. This prevents ghost TOTP records from accumulating if users abandon setup mid-flow.

A security fix is referenced in the CLAUDE.md golden rules at commits `301935a`, `50459c5`, and `4baf347`: the 2FA verification status was originally derived from a client-supplied session update payload, which allowed a client to set `twoFactorVerified: true` without actually passing the verification check. The fix moved verification state to `UserSession.twoFactorVerifiedAt` (server-owned) and the proxy middleware now checks `session.user.twoFactorRequired && !session.user.twoFactorVerified` to redirect unverified users, with both fields derived from the database, not from anything the client can manipulate.

Recovery codes are SHA-256 hashed before storage. Verification normalizes the code (removes dashes, uppercases) before hashing, so `ABCD-1234` and `abcd1234` match the same stored hash. Once a recovery code is used, it is deleted from the stored hash array.

---

## The Codebase Modularization

The REVIEW.md code review (dated 2026-03-25) was conducted against a flat structure with `src/components/`, `src/serverActions.ts`, and `src/queries.ts` at the root. The note at the top of REVIEW.md states that one day later (2026-03-26), the codebase was reorganized into the current `src/features/<domain>/` vertical-slice structure. The migration history confirms this: a migration timestamp of `20260326000000_add_performance_indexes` lands on the same day.

The review identified 41 findings across DRY violations, structure, error handling, and type safety. Several of the critical findings were directly addressed by the modularization and by the new infrastructure abstractions:

- DRY-03 (permission/rate-limit boilerplate in 24+ action files) was resolved by `src/lib/guardedAction.ts`, which collapses the three-step prelude into one call.
- DRY-04 (audit entry construction duplicated 50+ times, with `captureAuditContext()` incorrectly called inside the transaction) was resolved by `src/lib/auditedTransaction.ts`. The comment in that file explicitly calls out the ordering bug: calling `auth()` or `headers()` inside a Prisma transaction can cause timeouts because those calls block on the Next.js request context while the transaction holds a database connection.
- TYPE-01 (permissions typed as `Record<string, boolean>`) was addressed by introducing the `PermissionKey` union type (the `as const` array in `permissions.ts`), making a typo in a permission key a compile error.

Some findings remain open. The `LeaveRequest.status` field is still a plain string rather than a Prisma enum (CFG-01), `initials` computation is still repeated across components rather than extracted to a utility (DRY-05), and the `importPersonsCsv` action's non-standard return shape (ERR-02) is noted in the leave actions file with a comment that certain complex multi-step audit patterns cannot yet be fully converted to `withAuditedTransaction`.

---

## CSP Nonces and the Emotion/MUI Problem

Content-Security-Policy nonces are generated per request in `proxy.ts` (Next.js 16's middleware file). The nonce is injected as a request header (`x-nonce`) so that `layout.tsx` can retrieve it and pass it to MUI's `AppRouterCacheProvider`, which stamps the nonce onto every `<style>` tag that Emotion/MUI injects at runtime.

The `style-src` directive in the built CSP includes both `'nonce-${nonce}'` and `'unsafe-inline'`. The comment in `proxy.ts` explains why: CSP Level 2+ browsers ignore `'unsafe-inline'` when a nonce is present, giving strict nonce-based enforcement. Older browsers that do not understand nonces would block all inline styles without `'unsafe-inline'`, breaking MUI's entire styling model. The dual directive is the only way to get strict enforcement on modern browsers while maintaining compatibility.

The proxy middleware deliberately excludes high-frequency endpoints from nonce generation: `/api/health`, `/api/ready`, `/api/realtime/poll`, and `/api/realtime/sse`. These routes do not render HTML, so CSP nonces are irrelevant, but nonce generation and header injection still consume CPU time. On Vercel's Hobby tier this translates directly to Active CPU budget, so excluding the polling endpoint (hit every 30 seconds per connected client) is a meaningful cost reduction.

---

## Real-Time Transport: SSE and the Serverless Timeout

The SSE implementation uses a Node.js `EventEmitter` stored on `globalThis` to survive hot reloads in development. The singleton pattern (`globalThis.__realtimeEmitter`) is the standard workaround for Next.js's module re-evaluation during hot reload: without it, each reload creates a new emitter and existing subscribers on the old emitter stop receiving events.

The ring buffer for polling clients is also stored on `globalThis` (a separate `Map<sessionId, RealtimeEvent[]>`). Events are capped at 100 per session and shifted off the front when the buffer is full. Polling clients request events newer than a timestamp, so they catch up after a sleep or tab-away without receiving duplicates.

On Vercel's Hobby tier, serverless functions time out at 10 seconds, which makes persistent SSE connections impossible. The system auto-detects the environment and falls back to 30-second polling. The README explains the interval choice: 5-second polling burned 720 Lambda invocations per hour on an idle demo tab, which hit Vercel's Active CPU budget. 30 seconds was the highest frequency that kept invocations within the free tier for typical demo usage.

The in-process EventEmitter cannot distribute events across multiple server instances. The comment in `eventBus.ts` notes that switching to Redis pub-sub is a one-file change — the interface (`emitRealtimeEvent`, `subscribeEvents`, `getRecentEvents`) is already abstracted.

---

## N+1 Queries Found in Production-Scale Testing

The SCALING.md documents four N+1 query patterns that were found and fixed after the performance seeding script (`perf-seed.ts`) generated a 10k-employee dataset:

The most expensive was in review cycles: `getReviewCycles()` originally fetched all `requests` rows (status fields only) per cycle to count totals and submitted counts. With 500 requests per cycle across 10 cycles, this transferred 5,000 rows into application memory to produce two integers. The fix replaced the include with `_count` aggregation for totals and a single batched `groupBy` query for submitted counts.

Department and team queries suffered from `include: { head: true }` and `include: { manager: true, department: true }` fetching entire `Person` and `Department` records when only the `name` field was displayed. The fix narrowed every relation include to `select: { name: true }`.

The performance index migration (`20260326000000_add_performance_indexes`) added 14 indexes across 7 tables. The `LeaveRequest(startDate, endDate)` composite index was specifically added for the overlap detection query, which uses a range predicate (`startDate: { lte: endDate }, endDate: { gte: startDate }`). Without the index, this performs a sequential scan of all non-rejected leave requests for the person.

Known unresolved scaling cliffs at 10k+ employees: `getPersons()`, `getTeams()`, `getLeaveRequests()`, and `getLeaveBalances()` still fetch unbounded result sets. These are used in form dropdowns and the org chart. The SCALING.md recommendation is to replace dropdowns with autocomplete search endpoints and implement hierarchical lazy-loading for the org chart, but neither has been implemented.

---

## Vercel Deploy Skip: The VERCEL_GIT_PREVIOUS_SHA Subtlety

The `vercel-ignore.sh` script skips deployments when only docs, tests, or CI configs changed. The implementation compares against `VERCEL_GIT_PREVIOUS_SHA` (the SHA of the last successfully built commit) rather than `HEAD^`.

The comment in the script explains why: Vercel triggers a build only for the head commit of a push, not for each commit individually. A push containing three commits — a code change, another code change, then a docs-only change — would pass `git diff HEAD^ HEAD -- :(exclude)**/*.md` with zero code changes (because `HEAD^` only sees the last commit), and the build would be skipped despite the two earlier code-changing commits never having been deployed. Using `VERCEL_GIT_PREVIOUS_SHA` compares against the last built commit, capturing all changes since deployment regardless of how many commits are in the push.

The fallback chain handles edge cases: if `VERCEL_GIT_PREVIOUS_SHA` is unset (first deploy, preview builds) the script falls back to `HEAD^`, and if `HEAD^` is unreachable (shallow clone at depth 1) the script exits with code 1 to force a build rather than skipping unintentionally.

---

## The Cache Wrapper's Test Environment Escape Hatch

`next/cache`'s `unstable_cache` requires the Next.js incremental cache runtime, which is not available in Jest. Calling it directly in server-side tests produces runtime errors.

The `src/lib/cache.ts` wrapper handles this with a single check:

```ts
if (process.env.NODE_ENV === "test") return fn;
```

When running under Jest, every cached function becomes a passthrough, and tests call the underlying database function directly. This has the side effect that test assertions always see fresh data — there is no caching layer to make a mutation invisible to the next read. For production correctness, mutations call `updateTag` via `invalidateDashboardCache()` or `invalidateOrgCache()`, which uses Next.js 16's read-your-own-writes semantics: the calling request sees its own mutations immediately while other requests continue seeing cached data until the TTL expires.

---

## The Autofix Agent: Self-Limiting Design

The CI auto-fix workflow is disabled by default (the `if:` condition is prefixed with `false &&`). When enabled, it runs a 6-stage pipeline after CI failures: transient-detection, concurrent-run guard, log sanitization, infrastructure-bypass, targeted fix, PR creation. It never auto-merges.

The design includes two explicit safeguards against runaway behavior. First, the trigger check skips any branch starting with `autofix/`, which prevents the agent's own PRs from triggering another autofix cycle. Second, the concurrent-run guard queries for in-progress `autofix.yml` runs and exits if more than one is active, preventing pile-up when multiple failures arrive in quick succession.

Log sanitization redacts PostgreSQL and MongoDB connection strings, Anthropic API keys, GitHub tokens, and NPM tokens before sending logs to the Anthropic API. The redaction uses regex patterns (`postgresql://[^\s"']+`, `sk-[a-zA-Z0-9]{20,}`, etc.) applied before the last 15,000 characters are passed to the model.

The tool access for the fix step is explicitly constrained: `allowed_tools: "Edit,Read,Glob,Grep,Bash(npm run format),Bash(npm run lint)"`. The agent cannot write new files, run arbitrary shell commands, modify environment configuration, or touch the Prisma schema. These are hard constraints in the workflow definition, not guidelines in the prompt.
