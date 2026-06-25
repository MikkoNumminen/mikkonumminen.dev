---
title: Platform — engineering deep-dive
project: platform
---

# Platform — Engineering Deep-Dive

This document covers the hard engineering problems in Platform: the bugs that had to be fixed, the tradeoffs that shaped the architecture, and the places where the obvious approach did not work. It assumes familiarity with the basic stack and data model documented elsewhere.

---

## The Three-Layer Authorization Stack

The most load-bearing engineering decision in the codebase is how authorization is enforced across ~39 server action files without being duplicated or accidentally skipped.

The solution is `guardedAction` in `lib/guardedAction.ts`. It is a higher-order function that wraps any server action in a fixed enforcement sequence: (1) authenticate, (2) check the named permission key against the JWT payload, (3) call `rateLimit`. Every mutating action that requires a permission is declared as `guardedAction("post:create", "post:create", async (session, ...args) => { ... })`. The resulting wrapper is exported directly as the server action.

The pattern has a deliberate gap: DM actions initially used `requireUser()` instead of `guardedAction`. The audit found this in finding S2 — `sendDirectMessage` and `startConversation` were reachable by `pending` users who have no permissions at all. The fix added an explicit `permissions['dm:send']` check inline before proceeding, since the DM actions return a value (`conversationId`) rather than `void`, and `guardedAction` is typed to return `ActionResult` (void union). The two code paths — `guardedAction` for void mutations, inline check for returning mutations — are intentional rather than accidental.

Permission resolution itself (`lib/permissions.ts`) is pure: it takes a role string and an array of `{key, granted}` overrides and returns a `Record<string, boolean>`. The resolved map is embedded in the JWT at sign-in. This avoids a per-request database read for the common case. The tradeoff is that permission changes are not instant: they propagate only when the JWT callback detects a version mismatch.

---

## Permission Propagation Without Session Invalidation

The requirement was that an admin changing a user's role or permissions should take effect within a bounded time window, without forcing a sign-out and without a database read on every page request.

The solution uses `permissionsVersion`, an integer column on `User` that is incremented on every permission or role change. The JWT callback in `auth.ts` stores `lastDbSync` (a millisecond timestamp) and `permissionsVersion` in the token. On each token refresh, the callback first checks whether fewer than five minutes have elapsed since the last sync. If yes, it does nothing. If no, it runs a lightweight `findUnique` that fetches only `id, role, permissionsVersion, alias`. If `permissionsVersion` in the database does not match the token, it re-fetches the full user with permissions included and rebuilds the resolved permission map.

The commit message for this change (`perf(web): cut serverless CPU usage`) records the concrete motivation: the original implementation called `prisma.user.findUnique` on every token refresh with no throttle. In production this produced a database query on every page navigation for every logged-in user. The 5-minute TTL cut that to at most one query per user per 5 minutes. The version counter ensures a worst-case propagation delay of 5 minutes rather than permanent staleness.

The `markPromotionSeen` server action increments `permissionsVersion` as a side effect even though it is not a permission change, because the JWT token also carries `hasSeenPromotion`. Bumping the version forces a token re-sync that picks up the new field value.

---

## Gamification: Three N+1 Queries and One Race Condition

### The N+1 Problems

The gamification subsystem was built incrementally and accumulated three N+1 query patterns before they were caught in the April 2026 production readiness audit.

`getMyConversations` originally called `directMessage.count()` per conversation in a loop to compute unread counts. With N conversations the function issued N+1 queries. The fix replaced the loop with a single `directMessage.groupBy({ by: ["conversationId"], where: { senderId: { not: userId }, readAt: null } })`, then built an in-memory map from conversation ID to count. The test file change confirms the shift: the mock swapped from `mockDirectMessageCount` to `mockDirectMessageGroupBy`.

`checkAchievements` originally called `getActionCount(userId, action)` inside the loop over all achievements, because each achievement was checked independently. Since all achievements in a single `triggerGamification` call share the same action string, the per-achievement call was identical every iteration. The fix hoisted the call to before the loop: one query regardless of how many achievements exist for that action.

`updateQuestProgress` originally ran a `findUnique` + `upsert` per quest in the loop. The fix pre-fetched all progress rows for the user with a single `findMany`, built a `Map<questId, progress>`, and used the map inside the loop. The upserts remain per-quest since they write different rows, but the reads collapsed from N to 1.

### The XP Cap Race Condition

The May 2026 audit flagged a time-of-check/time-of-update race in `awardXp` for the daily XP cap. The code in `xp-service.ts` reads the total XP awarded today via `xpTransaction.aggregate`, then if under the cap calls `applyXp`. Two concurrent requests from the same user — possible if two browser tabs submit the shoutbox simultaneously — can both pass the cap check and both proceed to `applyXp`, granting more XP than the cap allows. The aggregate read and the transaction create are not atomic.

The production audit recorded this as critical (`TOCTOU on daily XP cap: aggregate read at L70 then applyXp at L100 with no transaction`) but the fix had not yet landed at the audit date. The code as of the audited commit still carries the race.

### The Login Streak Race

`recordLogin` in `login-streak.ts` uses `findUnique` then `create` for new users. Two simultaneous first logins — possible if a user has a slow connection and double-clicks — can both see null and attempt `create`, hitting the unique constraint on `userId`. The audit recommended switching to `upsert`. This also remained open at the audit date.

### The Achievement Double-Unlock Race

`checkAchievements` reads `userAchievement` rows, checks which achievements are not yet unlocked, then inserts new rows inside a loop. Concurrent invocations of `triggerGamification` for the same user can both observe the same not-yet-unlocked state and create duplicate `userAchievement` rows. The XP is then granted twice. A database unique constraint on `(userId, achievementId)` would be the backstop, but the schema does not enforce one at the time of the audit.

---

## Demo Mode: Isolation Without a Separate Database

Demo mode is a zero-credential path where any visitor gets a full superuser session against a rich synthetic dataset, without touching real community data. The implementation makes every content row carry two discriminator columns — `tenant` and `sessionId` — and scopes all queries through `getTenantFilter()`, which returns both. Demo sessions set `sessionId` to the `DemoSession.id`; real users have `sessionId = null`.

`seedDemoData` runs inside a single `prisma.$transaction` and creates six users, boards, posts, threads, shouts, events, issues, survey responses, XP profiles, custom quests, achievement unlocks, quest progress, DM conversations, and a survey round — in dependency order, with a `Map` tracking the newly created IDs so foreign keys remain consistent. Slug fields include a session ID prefix to avoid unique constraint collisions when multiple demo sessions are alive simultaneously (`${seed.slug}-${sessionId.slice(0, 8)}`). User emails are similarly namespaced: `${seed.email}-${sessionId.slice(0, 8)}`.

Cleanup runs fire-and-forget on the next demo login via `cleanupStaleDemoSessions().catch(() => {})`. This is a known weakness noted in the May audit: demo-session quota can leak in production with no signal if cleanup throws. The cleanup function itself issues a cascade of `deleteMany` calls in dependency order — teams before characters before users — rather than relying on database cascades, because the foreign key relationships point into the shared `Quest` and `SurveyRound` tables that mix demo and real data.

One gap that required a dedicated fix commit (`fix(web): add sessionId to CustomQuest for demo isolation`) was that the original `CustomQuest` model had no `sessionId` column, meaning custom quests created by a demo session were visible to real users. The fix added the column and the seed to populate it.

The later quest system unification (`feat(web): unify quest system — merge CustomQuest into Quest`) folded `CustomQuest` entirely into `Quest` via a data migration. The two separate admin interfaces, two separate query files, and two separate dashboard panels merged into one. The commit records that `criteria`, `key`, `icon`, and `description` had to be made nullable on `Quest` because assigned quests have none of those fields — they are status-driven rather than criteria-driven.

---

## Rate Limiting: PostgreSQL as the Counter Store

The rate limiter in `lib/rateLimit.ts` uses a raw SQL `INSERT ... ON CONFLICT DO UPDATE` against the `RateLimit` table rather than Redis. The query is atomic at the database level:

```sql
INSERT INTO "RateLimit" (id, identifier, action, count, "windowStart")
VALUES (${id}, ${identifier}, ${action}, 1, ${now})
ON CONFLICT (identifier, action) DO UPDATE SET
  count = CASE
    WHEN "RateLimit"."windowStart" <= ${windowStart} THEN 1
    ELSE "RateLimit".count + 1
  END,
  "windowStart" = CASE
    WHEN "RateLimit"."windowStart" <= ${windowStart} THEN ${now}
    ELSE "RateLimit"."windowStart"
  END
RETURNING count
```

When the existing `windowStart` is older than the window, the counter resets to 1. Otherwise it increments. The RETURNING clause gives the current count in the same round-trip. This is a fixed-window counter with no external dependency beyond the existing Neon.tech PostgreSQL instance.

The identifier is the authenticated user ID when a session exists, or the Vercel-forwarded IP (`x-vercel-forwarded-for`) for unauthenticated callers. The Vercel header is chosen first because it cannot be spoofed by the client, unlike `x-forwarded-for`.

Per-action rate limits were initially uniform (30/min). The April 2026 audit (finding S15) identified that account deletion and alias changes warrant tighter limits because they are higher-risk operations. The fix added configurable `maxRequests` to `rateLimit(action, maxRequests)`: account deletion is capped at 3/min, alias changes at 10/min.

---

## The Raider.IO Integration: Zod as a Contract

The WoW Mythic+ integration fetches character data from `raider.io/api/v1/characters/profile`. The initial implementation cast the response with `as` and accessed fields directly. Finding T1 in the April audit noted that if Raider.IO changes their schema, the app silently produces `undefined` values that propagate into the database.

The fix added a Zod schema (`RaiderIoResponseSchema`) with explicit field types and `.default([])` on `mythic_plus_scores_by_season` so that a missing season array does not crash the accessor. The schema also marks `gear`, `region`, and `realm` as `.optional()` because the Raider.IO API omits those fields for some character states. After `safeParse`, the code falls through to `throw new ActionError("raiderIoError", ...)` on parse failure rather than trusting the shape.

The fetch uses `AbortSignal.timeout(10000)` and `next: { revalidate: 60 * 60 * 24, tags: ["raiderio"] }`. The 24-hour Next.js tag cache means character data is fetched from the API at most once per day per character. The `revalidateTag("raiderio")` call in `refreshCharacter` forces a bypass when the user explicitly requests fresh data.

The GitHub commits integration (`lib/github-commits.ts`) is structurally similar but does not have Zod validation on the response — the commit entries are accessed via field names on `any` casted `json()`. The May audit recorded this as a high finding (missing timeout on the `Promise.all` of status calls, missing type validation). At audit time neither fix had landed.

---

## CSP and the MUI Emotion Problem

The Content Security Policy in `lib/security-headers.ts` cannot be locked down to `style-src 'self'` because MUI v7 uses Emotion for CSS-in-JS, which injects `<style>` tags at runtime. This requires `'unsafe-inline'` in `style-src`. The comment in the file is explicit: `'unsafe-inline' required by MUI emotion CSS-in-JS style injection`.

`script-src` also carries `'unsafe-inline'`, which Next.js requires for inline hydration scripts. The mitigation is that `'unsafe-eval'` is only added in development (Next.js hot module replacement). Production scripts are `'self' 'unsafe-inline'` without eval.

The CSP includes `object-src 'none'` and `frame-ancestors 'none'` explicitly. These were missing in the original implementation and were added as part of the S2 fix cluster in the April audit (finding I2). The `X-XSS-Protection` header that was present in the original was removed in the same pass because it is deprecated and can introduce vulnerabilities in older browsers.

---

## GDPR Account Deletion: Balancing Erasure Against Content Preservation

The right-to-erasure implementation in `gdpr-actions.ts` had a requirement conflict: GDPR demands PII removal, but deleting forum posts and threads would break threaded discussions for other users.

The resolution distinguishes content types by their social impact. Posts, topics, and threads are soft-deleted (their `deletedAt` is set to now), which removes them from the UI but preserves thread structure and makes the authored content invisible rather than deleted. Shouts and issue reports are hard-deleted immediately because they do not have replies. Sent DMs are anonymized (`message` replaced with `[deleted]`) rather than deleted, so the other participant's conversation is not broken. Calendar events and survey responses have their `authorId` set to null via `onDelete: SetNull` in the schema.

The PII scrub is specific: email becomes `deleted-${userId}@deleted.invalid` (preserving the unique constraint), name, alias, image, avatarUrl, and bio are set to null, and the role is demoted to `pending`. The user record itself is not deleted — a hard delete would orphan audit log entries and break foreign keys in content that was soft-deleted.

A weekly cron job (`purge-deleted`) runs the actual hard deletes for soft-deleted records older than 30 days. Audit logs older than one year are also purged, but only where `sessionId = null` — demo session audit logs are cleaned up by the demo session cleanup instead.

The audit (finding S11) caught a pre-fix bug where the audit log entry written at account deletion time included `actorName: user.alias ?? user.name`. This stored the user's real name or alias in the audit log. Since the scrub then null-ed those fields on the user record, the PII lived on in the audit log, defeating erasure. The fix reordered the operations: `logAudit` is now called before the transaction that scrubs PII, but the `details` payload no longer includes the name — only the `entityId` (userId). That way the audit log records that a deletion happened for a given ID without retaining the person's name.

---

## Serverless Cold Start: The DATABASE_URL Proxy

In CI, `next build` runs without `DATABASE_URL` set (the database is not available at build time). The original code initialized the Prisma client at module load time via `new PrismaClient(...)`, which crashed the build immediately on the missing env var.

The fix in `lib/db.ts` uses lazy initialization: if `DATABASE_URL` is not present at module load time, `prisma` is set to a `Proxy` object that throws a descriptive error on any property access. This means the module can be imported during the build without crashing. The error only surfaces at runtime when the first actual database query runs. The CI build step passes because no database queries execute at build time.

The global singleton pattern (`globalThis as { prisma: PrismaClient }`) prevents PrismaClient from creating a new connection pool on every Next.js hot-reload in development, which would exhaust the Neon.tech connection limit rapidly.

---

## Shoutbox: The 247-Line Handler and Its Decomposition

The April audit's most visually striking finding was `handleSubmit` in `Shoutbox.tsx` at 247 lines (finding C5). It handled `/help`, `/who`, `/motd`, `/w` (whisper), guild send, and DM send through a single function with nested conditionals. The function also carried 14 `useState` calls in the parent component (finding P11), causing broad re-renders on any state change.

The fix in `refactor(web): extract useDmConversations and useShoutboxCommands hooks` pulled the slash-command dispatch into a `useShoutboxCommands` custom hook and the DM conversation lifecycle into `useDmConversations`. The two near-identical implementations of DM logic that had grown independently in `Shoutbox.tsx` and `DirectMessages.tsx` (finding C4) now share the hook. The optimistic update pattern, the `ensureUsersLoaded` call, and the `openConversation` handler are defined once.

`WHISPER_COLOR` had been defined in five separate files as the hex string `"#FF80FF"` (finding C2). The consolidation moved it to `app/styles.ts` as a named export. Similarly, `DEMO_EMAIL` had three definitions across `user-queries.ts`, `demo-session.ts`, and `dm-queries.ts` (finding C6). The fix created `lib/demo-constants.ts` as the single source, but hit a constraint: `demo-session.ts` uses `"use server"` and cannot re-export constants that need to be imported by non-server files. The constant had to live in a separate non-`"use server"` file to be importable on both sides of the boundary.

---

## Polling: The 5-Second Tax

The `usePromotionPolling` hook watched for pending users being promoted to a real role. The initial implementation polled `/api/check-promotion` every 5 seconds. In production this became a measurable Vercel Fluid CPU cost: every open tab from a pending user was issuing 720 requests per hour, hitting the auth check and a Prisma `findUnique` each time.

The fix in `perf(web): cut serverless CPU usage` changed the interval to 60 seconds (a 92% reduction per the commit message) and added an automatic stop after 30 minutes of tab inactivity. The polling hook also stops itself on promotion detection, so a successfully promoted user does not continue polling.

---

## Multi-Tenancy: A Discriminator Column and Its Leak Risk

The two tenants (`"vuohiliitto"` for the live guild, `"platform"` for admin/internal use) share a single database with every content row carrying a `tenant` column. Isolation is enforced entirely in the query layer through `getTenantFilter()`. There is no schema-level enforcement.

The leak risk identified in the May audit was in `tenant-actions.ts`: the tenant cookie was set with `httpOnly: false`, meaning client-side JavaScript could read and exfiltrate the active tenant string. An XSS attack could then forge server action calls against the other tenant. The fix set `httpOnly: true`. The remaining question is whether any server action that uses `getTenantFilter()` is callable without the cookie (the filter falls back to `"platform"` for non-superuser roles, which limits the blast radius to the caller's own tenant).

The superuser tenant-switch UI is the only place where a user can deliberately cross the tenant boundary. That action is rate-limited and logged to the audit trail.

---

## Testing: 1,300 Tests and a Coverage Floor

The test suite runs under Jest with a `coverageThreshold` of 70% lines/functions/statements and 60% branches, enforced in `jest.config.ts`. Before the April audit, CI ran `jest --verbose` without `--coverage` or any threshold, so coverage could drop silently.

The audit also identified that `auth.ts` — the 196-line callbacks that handle first-user superuser promotion, JWT permission hydration, and permission-version drift — had zero behavioral tests. The `auth.test.ts` file only verified that exports exist. The fix added tests for the `signIn` callback (first user gets superuser, subsequent users get pending), the JWT callback with a `permissionsVersion` mismatch, and the permissions re-sync path.

Pre-push Husky hooks run the full suite locally before any push reaches CI. The CI job runs on ubuntu-latest with Node 22 and includes `GITHUB_TOKEN` injection into the build step so the GitHub commits API does not rate-limit during build. Before this fix, CI builds that ran without the token would occasionally fail on the unauthenticated GitHub API rate limit.
