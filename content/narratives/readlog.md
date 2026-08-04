---
title: How ReadLog was built · development narrative
project: readlog
kind: project
type: narrative
date: 2026-06-28
---

## Origin

ReadLog is a personal reading tracker: you search for a book, log the format you read it in (paper, e-book, or audiobook) with a finish date, and browse your library. The homepage shows a public, anonymous feed of recently logged books so the site has life before anyone signs in. The git history shows the core was built in a single compressed burst: the initial commit and nearly the entire feature set (search, log, library, public feed) land on 2026-04-05, with performance work and the ratings feature following on 2026-04-06. It is a Next.js 16 App Router app on PostgreSQL (Neon), deployed to Vercel, with Google OAuth as the only sign-in.

## Key technical choices and the why

The commits and architecture doc show a deliberate "no extra layers" posture. **Server Actions are the only mutation surface** (there are no REST write routes, so auth checks and database calls stay co-located and type-checked end to end. **Caching is `unstable_cache` with tag-based invalidation rather than Redis or a CDN**: read queries carry tags like `public-feed` and `my-books`, and every mutation calls `updateTag`, giving sub-second staleness without a separate cache service. **Prisma 7 runs through the Neon serverless adapter** (`@prisma/adapter-neon` over `@neondatabase/serverless`), routing traffic over HTTP/WebSocket because raw TCP connections are incompatible with Vercel's cold-boot function model. **Auth.js v5 stores sessions in the database** via PrismaAdapter rather than JWTs, so sessions can be revoked server-side. A shared-database constraint drove an early decision: every Prisma model gets a `@@map` `readlog_` prefix so its tables don't collide with other apps on the same Neon instance) a permanent choice, since removing it would need a live migration.

## Dead ends and how they resolved

The history carries several concrete bugs and pivots. The **Next.js 16 middleware deprecation** broke the build: the scaffolded `export { auth as middleware }` pattern no longer worked, so the middleware was removed and auth gating moved entirely into Server Components and Actions. The same commit also wired `prisma generate` into the build, fixing a Vercel deployment failure. The sharpest bug was **`unstable_cache` date serialization**: the cache round-trips its return through JSON, turning Prisma `Date` objects into strings, so pages calling `.toISOString()` worked on cache misses but threw `toISOString is not a function` on hits, fixed by wrapping every date read in `new Date(...)`. A **duplicate-`auth()` performance issue** (protected pages querying the session twice) was collapsed by having `getMyBooks()` return `null` for unauthenticated callers instead of an empty array. A **mobile-autofill problem**, password managers attaching to NextAuth's default email form on a Google-only app, was solved with a bespoke `/signin` page containing only a Google button. The test suite also fought jsdom: an assertion was switched to `toContain` to survive URL normalization, and a non-existent `getByAlt` was replaced with `getByRole`. Coverage thresholds were lowered twice (to 75% then 70% functions) as new files entered scope.

## Notable implementation details

The multi-source search is the centerpiece. Open Library and Google Books are queried in parallel with `Promise.allSettled` so either source failing doesn't degrade the other. Results are deduplicated by normalizing title and author to lowercase alphanumerics, then keeping the record with more populated fields (cover URL and page count each score a point); ties favor Open Library. A three-namespace ID scheme packs everything into one column: Open Library work paths, `google:` IDs, and `manual:<timestamp>` IDs for books found in neither API. Authorization returns a uniform `"Not found"` for both missing and foreign records to avoid information leakage. `dangerouslySetInnerHTML` renders Google Books descriptions deliberately (the content is Google's, not user input), and `vercel.json` uses an `ignoreCommand` to skip deploys for doc/test-only changes.

## Outcome

ReadLog is live at read-log-pi.vercel.app. It ships with 90 tests across 5 suites covering the API integrations, Server Actions, and components, with coverage enforced (80% lines/branches/statements, 70% functions). Quality gates run at three points: pre-commit (ESLint + Prettier via lint-staged), pre-push (type-check, lint, full suite), and GitHub Actions CI on pushes and PRs targeting `master`.
