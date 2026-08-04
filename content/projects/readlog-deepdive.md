---
title: ReadLog · engineering deep-dive
project: readlog
---

# ReadLog: Engineering Deep-Dive

This document covers the specific hard problems encountered during development and the concrete decisions made to solve them. It complements the existing architecture and project overview documents, which cover the stack rationale and data model; everything here is grounded in the actual commits and source.

## The Shared-Database Table-Prefix Problem

The Neon PostgreSQL instance is shared, not isolated. NextAuth's PrismaAdapter by default creates tables named `account`, `session`, `user`, and `verification_token`: generic names that collide with any other application on the same database schema. This was addressed in the second substantive commit (`feat: add CI pipeline and prefix all tables with readlog_`) by adding a `@@map` directive to every Prisma model, forcing Prisma to emit `readlog_account`, `readlog_session`, `readlog_user`, `readlog_verification_token`, `readlog_book`, and `readlog_entry` as the actual table names. The schema comment reads: "NextAuth models (prefixed to avoid conflicts with other apps sharing the database." This is a permanent constraint, not a temporary measure) removing the prefix now would require a live migration and could break concurrent applications on the same instance.

The database URL comment in `prisma/schema.prisma` deliberately omits `url` from the datasource block; the connection string is injected entirely at runtime through `prisma.config.ts` using `dotenv/config`, which keeps the schema file self-contained and free of environment-specific syntax.

## Prisma on Vercel: the Serverless Adapter Requirement

A standard Prisma client uses TCP connections, which are incompatible with Vercel's function execution model: functions boot cold, handle a request, and shut down, leaving TCP connections dangling or crashing the pool. ReadLog uses `@prisma/adapter-neon` on top of `@neondatabase/serverless`, which routes database traffic over HTTP/WebSocket instead of raw TCP. The `db.ts` singleton pattern (`globalForPrisma.prisma ?? createPrismaClient()`) prevents a new client from being instantiated on every hot-reload in development (the classic Next.js HMR problem), while still creating a fresh client per cold-start in production where `globalThis` is not reused across function invocations.

Prisma client generation is wired into both `build` (`prisma generate && next build`) and `postinstall`, which is required for Vercel: the deployment environment installs packages and then builds, so client code generated from the schema must exist before `next build` runs. This was a concrete deployment failure fixed in `fix: remove deprecated middleware, add prisma generate to build`.

The same commit also removed `src/middleware.ts`, which had been scaffolded as the standard NextAuth middleware pattern (`export { auth as middleware }`). Next.js 16 deprecated that pattern and the middleware was causing build failures, so auth gating was moved entirely into individual Server Components and Server Actions.

## The `unstable_cache` Date Serialization Bug

After adding `unstable_cache` to wrap database reads (commit `perf: cache feed, library, account stats, and book details`), the library and home-feed pages started throwing runtime errors. The bug: `unstable_cache` serializes its return value to JSON and deserializes it on cache hits. Prisma returns `Date` objects, but JSON serialization converts them to strings. Pages that called `.toISOString()` directly on the returned value worked on cache misses (where Prisma returned a real `Date`) but threw `TypeError: entry.finishedAt.toISOString is not a function` on cache hits (where the value was already a string).

The fix, in commit `fix: handle string dates returned from unstable_cache`, was to wrap every date read with `new Date(...)` before calling `.toISOString()`:

```
- finishedAt: entry.finishedAt.toISOString(),
+ finishedAt: new Date(entry.finishedAt).toISOString(),
```

This is a subtle invariant: every page that reads from a cached action must treat date values as `string | Date` regardless of what TypeScript infers from the Prisma type, because the cache layer lies about the runtime type. The fix was applied to both `src/app/library/page.tsx` and `src/app/page.tsx`.

## Duplicate Auth Calls and Static Prerendering

An early version of the library page called `auth()` twice: once in the page component to redirect unauthenticated users, and again inside `getMyBooks()` to satisfy its auth guard. The account page had the same pattern. Each `auth()` call hits the database to look up the session, so protected pages were making two session queries per request.

The fix in `perf: make /log and /opengraph-image static, remove duplicate auth calls` collapsed this into a single signal: `getMyBooks()` returns `null` for unauthenticated callers rather than an empty array, and the page component checks `if (entries === null) redirect(...)`. One database query, one place to update if the redirect target ever changes.

The same commit made `/log` fully static. Originally it had a server-side layout that ran `auth()` at request time to block unauthenticated access, forcing the page into dynamic rendering. This was replaced with client-side session checking: the page renders immediately as a static shell, then `useSession` in a `useEffect` redirects to `/signin` if the status resolves to `"unauthenticated"`. The tradeoff is a brief flash of content for unauthenticated users on cold load, but the Server Action that actually writes data (`logBook`) still throws `"Not authenticated"` server-side, so the shell renders harmlessly and no data is ever logged without a valid session. The `/opengraph-image` route was also converted from an edge-rendered dynamic route to a statically prerendered asset at the same time.

## Mobile Autofill Interference

The default NextAuth sign-in page includes an email/password form even when only OAuth providers are configured. On mobile, password managers and browser autofill parse the form and offer to fill credentials, creating a confusing UI for a Google-OAuth-only application. The fix (commit `fix: custom sign-in page to avoid mobile autofill issues`) was a bespoke `/signin` page containing only a "Sign in with Google" button, no form, no inputs, no opportunity for autofill to attach. All auth redirects across the app were updated to use `/signin?callbackUrl=<destination>` rather than `/api/auth/signin`. The custom page reads `callbackUrl` from the search params and passes it through to `signIn("google", { callbackUrl })`, preserving the intended post-login destination.

## Multi-Source Book Search: Deduplication Logic

Two separate issues had to be solved for the parallel book search to be usable.

**Source failure isolation.** The two external calls are wrapped in `Promise.allSettled` rather than `Promise.all`. If either Open Library or Google Books is unavailable (5xx, network timeout, missing API key), `allSettled` still resolves with the results from the surviving source. Each rejected promise contributes an empty array to the merge step. Tests in `actions.test.ts` confirm all three failure modes: OL fails, Google fails, both fail.

**Deduplication quality.** Merging up to 15 results from each source naively would produce obvious duplicate entries when both APIs return the same book. The `deduplicateResults` function in `src/lib/actions.ts` normalizes title and author to lowercase alphanumerics (`str.toLowerCase().replace(/[^a-z0-9]/g, "")`) and builds a composite key. When the same key appears twice, the result with more populated fields is kept: cover URL and page count each contribute one point to a score, and the higher-scoring record wins. If scores tie, the first result (from Open Library, since it appears earlier in the merged array) is kept.

This scoring approach is intentional: Google Books typically has better cover images at higher resolution, while Open Library is more likely to have page counts from the `number_of_pages_median` field. In practice, on a tie the deduplicator favors Open Library, but a Google Books result with a cover URL beats an Open Library result without one.

**The ID namespace collision.** Open Library keys are paths of the form `/works/OL1234W`. Google Books volume IDs are short alphanumeric strings like `abc123`. Both flow through the same `openLibraryId` column in the `Book` table, so a naming collision is possible in principle. Google Books IDs are prefixed with `google:` to prevent this: `openLibraryId: 'google:${item.id}'`. Manual entries (books not found in either API) use a `manual:<timestamp>` prefix, creating a three-namespace system within a single string column.

## Cache Invalidation Without a Cache Layer

Rather than adding Redis or a CDN, the application uses Next.js `unstable_cache` with tag-based invalidation via `updateTag`. Four caches exist:

- `"public-feed"`: 60 second TTL, re-fetched on any `logBook`, `updateReadEntry`, or `deleteReadEntry` call
- `"my-books"`: 5 minute TTL per user ID, same invalidation triggers
- `"account-stats"`: 5 minute TTL, shares the `"my-books"` tag so stats update when the library changes
- `"book-details"`: 30 day TTL, never explicitly invalidated (book metadata from Google Books is treated as effectively immutable)

The `getCachedMyBooks` and `getCachedAccountStats` functions accept `userId` as a parameter, which becomes part of the cache key. This means the cache is partitioned per user without any explicit namespace: two users with different IDs get independent cache entries automatically. The public feed uses no user parameter, so all users share one feed cache entry.

The `updateTag` calls at the end of each mutation happen after the database write completes. There is no rollback of the cache invalidation if the write itself fails (Prisma would throw, and the Server Action would reject before reaching `updateTag`), so the cache is only invalidated on successful mutations.

## Authorization: Uniform Error for Missing and Foreign Records

Server Actions that modify or delete an existing entry use a deliberate pattern: fetch the entry first, then check ownership:

```typescript
const entry = await prisma.readEntry.findUnique({ where: { id: entryId } });
if (!entry || entry.userId !== session.user.id) throw new Error("Not found");
```

Both "entry does not exist" and "entry belongs to another user" throw the same `"Not found"` error. This prevents information leakage: a caller who probes arbitrary entry IDs cannot distinguish between IDs that do not exist and IDs that belong to other accounts. A distinct `"Not authorized"` error would confirm that a given ID is valid and owned by someone else.

## Testing Infrastructure Trade-offs

The `unstable_cache` wrapper in `src/lib/actions.ts` would make Server Action tests non-deterministic if the real implementation were used, caches would bleed between test cases. The test file mocks the entire `next/cache` module at the top of `actions.test.ts`:

```typescript
jest.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  updateTag: jest.fn(),
  revalidateTag: jest.fn(),
}));
```

Passing the wrapped function through unchanged (`fn => fn`) means the actions execute their actual database logic without caching, and `updateTag` is a spy that tests can assert against. This pattern was retrofitted when caching was added: the mock was not present in the initial test suite.

The component test file (`components.test.tsx`) uses `jsdom` as the test environment, which is incompatible with native ESM `fetch`. An early test that asserted `expect(img.src).toBe("https://fallback.jpg")` failed because jsdom normalizes URLs, encoding certain characters. The fix (commit `fix: use toContain for URL assertion to handle jsdom normalization`) switched to `toContain`, which is resilient to jsdom's URL rewriting. A separate fix in the same session replaced `getByAlt` (which does not exist in Testing Library) with `getByRole("img", { name: "..." })`.

Coverage thresholds were adjusted twice during development. Initial targets were 90% lines, 85% branches, 90% functions. When `bookdetails.ts` was added to the coverage scope, the function threshold dropped to 75% to accommodate it, then further to 70% in a standalone commit when the final component suite failed to reach 75% on functions.

## The `dangerouslySetInnerHTML` Decision

The Google Books API returns HTML-tagged descriptions in some responses. `BookDetailDialog.tsx` renders the description with `dangerouslySetInnerHTML={{ __html: details.description }}`. This is intentional: the content comes from Google's API, not from user input, and stripping tags would lose formatting like bold genre terms and paragraph breaks that make descriptions readable. The risk surface is limited to what Google Books returns, not to any user-controlled string.

## Vercel Deployment: Skipping Doc-Only Builds

`vercel.json` configures an `ignoreCommand` that exits with a non-zero code when the only changed files are documentation, tests, or CI configuration:

```
git diff HEAD^ HEAD --quiet --
  ':(exclude)README.md'
  ':(exclude)TODO.md'
  ':(exclude)CLAUDE.md'
  ':(exclude)src/__tests__'
  ':(exclude).github'
  ':(exclude).husky'
  ':(exclude)jest.config.ts'
  ':(exclude).gitignore'
```

When the command exits quietly (all changes excluded), Vercel skips the deployment. This keeps production deploys tied to application changes and avoids burning build minutes on README edits: a concrete concern given the three consecutive documentation-only commits at the tip of the commit log.
