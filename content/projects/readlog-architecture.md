---
title: ReadLog · architecture & design
project: readlog
---

# ReadLog: Architecture & Design

ReadLog is a personal reading-log web application: users search for books, record what they finished and in what format, and can browse a public feed of recent reads. The codebase is a Next.js 16 app backed by a PostgreSQL database on Neon and deployed to Vercel.

## Overview & High-Level Architecture

The application follows the Next.js App Router model with a clear split between server and client responsibilities. Server Components handle data-fetching pages (home feed, library, account). Client Components handle interactive UI (search input, dialogs, library filtering). All mutations and queries that touch the database are Next.js Server Actions in `src/lib/actions.ts`, marked `"use server"`. There is a single API route (the NextAuth catch-all at `/api/auth/[...nextauth]`), and no other custom API surface.

At runtime the request path looks like: browser → Vercel edge → Next.js server → Prisma (via Neon serverless driver) → PostgreSQL. There is no separate backend service or BFF layer.

## Tech Stack and the WHY

| Layer | Choice | Rationale visible in code |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server Actions eliminate a REST layer; `unstable_cache` + tag-based revalidation replaces a Redis cache |
| UI | MUI v7 (Material UI) + Emotion | Component library used throughout `src/components/` and pages |
| Database | PostgreSQL via Neon serverless | `@neondatabase/serverless` + `@prisma/adapter-neon` enable connection pooling compatible with Vercel's serverless edge |
| ORM | Prisma 7 | Schema-first type safety; client is generated to `src/generated/prisma` at build time (`prisma generate && next build`) |
| Auth | Auth.js v5 (next-auth beta) + Google OAuth | Single provider; `PrismaAdapter` persists sessions to the same database |
| Language | TypeScript 5, strict mode | `tsconfig` and CI `tsc --noEmit` gate on zero type errors |

## Data Model / Schema

The Prisma schema defines six models. The NextAuth models (`Account`, `Session`, `VerificationToken`, `User`) are all table-prefixed with `readlog_` to co-exist safely on a shared database schema. Two application models sit alongside them:

**Book**: a canonical book record keyed by `openLibraryId` (unique). Stores title, author, cover URL, page count, and first publish year. The `openLibraryId` field also accepts `google:` prefixed IDs for books found only via Google Books, making the field a logical source-of-record key rather than a strict Open Library identifier.

**ReadEntry**: joins a `User` to a `Book`, recording the `format` (enum: `BOOK`, `AUDIOBOOK`, `EBOOK`), completion date (`finishedAt`), and an optional 1–5 `rating`. A compound unique constraint on `(userId, bookId, finishedAt)` prevents duplicate entries for the same book on the same day. Both `userId` and `finishedAt` carry database indexes to support the most common query patterns (per-user listing ordered by date).

Cascade deletes on both `Account → User` and `ReadEntry → User` ensure clean removal when a user account is deleted.

## Auth & Authorization / Security Posture

Authentication is handled entirely by Auth.js with Google as the sole OAuth provider. Session state is stored in the database via `PrismaAdapter` rather than in JWTs, which means sessions can be revoked server-side.

Every Server Action that writes data calls `auth()` at the top and throws `"Not authenticated"` if the session is absent or the session user ID is missing. Mutation actions that operate on an existing `ReadEntry` (`updateReadEntry`, `deleteReadEntry`) additionally fetch the entry and verify `entry.userId === session.user.id` before proceeding, throwing `"Not found"` on mismatch: the same error for both "does not exist" and "belongs to another user," avoiding information leakage.

The public feed (`getRecentPublicReads`) surfaces the most recent reads; the homepage component renders only book title, author, cover, format, and rating from each entry, so no user identity is shown in the public feed.

Next.js image optimization is scoped to exactly two external hostnames (`covers.openlibrary.org`, `books.google.com`) via `remotePatterns` in `next.config.ts`, preventing open-proxy image loading.

## Multi-Source Book Search and Dedup Design

Book search runs two external API calls in parallel using `Promise.allSettled`:

1. **Open Library** (`/search.json`), no API key required; returns up to 15 results with cover ID, page count, and first publish year.
2. **Google Books** (`/books/v1/volumes`): requires `GOOGLE_BOOKS_API_KEY`; returns up to 15 results and adds series position information (`seriesInfo.bookDisplayNumber`) surfaced as a synthesized subtitle.

`Promise.allSettled` means either source failing independently does not degrade the other: fulfilled results from the surviving source are used as-is.

The two result lists share a common `BookSearchResult` interface (defined in `src/lib/openlibrary.ts`). Google Books results are assigned an `openLibraryId` of the form `google:<volumeId>` so they flow through the same downstream upsert path without schema changes.

Deduplication runs after merging: a normalisation function (`normalize`) strips case and non-alphanumeric characters from title and author, producing a composite key. When the same key appears from both sources, the result with more populated fields (cover URL and page count each worth one point) is kept. This prevents two entries for the same book appearing when both APIs return it, while still preferring the richer record.

If no search results are found, the UI offers a manual-entry escape hatch, generating a local-only `manual:<timestamp>` ID.

A separate `fetchBookDetails` function (used via `getBookDetails`) hits Google Books with a `maxResults=1` lookup to retrieve rich supplementary data (description, categories, publisher, preview link) for a detail dialog. This result is cached for 30 days via `unstable_cache`.

## Key Design Decisions and Trade-offs

**Server Actions as the only mutation surface.** There are no REST API routes for writes. Server Actions keep auth checks and database calls co-located and type-checked end-to-end, at the cost of being Next.js-specific.

**Tag-based cache invalidation.** `unstable_cache` wraps read queries with `"my-books"` and `"public-feed"` tags. Every mutation calls `updateTag` on the relevant tags. This gives sub-second staleness for the user's own library without a separate cache layer, though it ties the app to Next.js's built-in data cache.

**Book deduplication at search time, not storage time.** Books from different sources are deduplicated in memory on every search rather than reconciled in the database. This keeps the schema simple but means the same physical book can theoretically be stored twice under different `openLibraryId` keys if a user logs it from different source records on different occasions.

**Vercel ignore command.** `vercel.json` configures an `ignoreCommand` that skips deployment when only documentation, tests, or CI config changed: keeping production deploys tied to actual application changes.

## Testing Strategy

Tests live in `src/__tests__/` and are run with Jest (configured via `jest.config.ts` using `ts-jest` and a `node` test environment). Coverage is enforced at 80 % lines/branches/statements and 70 % functions across the four core library files and all components.

Each layer is tested in isolation:

- **`openlibrary.test.ts`**: mocks `global.fetch` and asserts URL construction, field mapping, null fallbacks, and error handling.
- **`googlebooks.test.ts`**: same pattern; additionally covers series-label synthesis and graceful degradation when the API key is absent.
- **`bookdetails.test.ts`**: covers the enrichment fetch used for the detail dialog.
- **`actions.test.ts`**: mocks `next/cache`, `@/lib/db` (Prisma), `@/lib/auth`, and both search modules; tests the deduplication logic, authentication guards, ownership checks, and cache tag invalidation across all Server Actions.

Pre-commit hooks (Husky + lint-staged) run ESLint and Prettier on staged TypeScript and formatting files before every commit.

## Infrastructure, Deployment, and CI

The app is deployed on Vercel with Neon PostgreSQL as the database. The Neon serverless driver (`@neondatabase/serverless` + `@prisma/adapter-neon`) is used instead of a traditional TCP connection, which is necessary for Vercel's function execution model.

The GitHub Actions CI workflow runs on every push and pull request to `master`: it installs dependencies, generates the Prisma client, runs ESLint, TypeScript type-checking, and the full Jest test suite with coverage. There is no separate staging environment visible in the repository; Vercel preview deployments serve that role implicitly for pull requests.

Database migrations are managed with Prisma Migrate, with the migration path configured in `prisma.config.ts`. The `DATABASE_URL` environment variable is the sole connection secret; no other runtime secrets exist beyond the Google OAuth credentials and Books API key.
