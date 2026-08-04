---
title: How ReadLog .NET was built · development narrative
project: readlog-dotnet
kind: project
type: narrative
date: 2026-06-28
---

## Origin

ReadLog .NET is a complete ASP.NET Core 8 reimplementation of Mikko Numminen's personal reading-log web app. The original is a Next.js 16 / React 19 / Prisma 7 / Postgres application; this is an explicit, deliberate **port, not a transliteration**. PORTING-NOTES states the goal directly: map each TypeScript/React/Prisma pattern to its idiomatic .NET equivalent so every choice can be defended in a technical interview. Users search books across Open Library and Google Books, log a finished read with a format (book/audiobook/e-book), a finished-on date, and a 0–5 rating, then browse, edit, and delete a personal library; anonymous visitors get a public "recently read" feed. The git history shows it built PR-by-PR over roughly 21–24 June 2026: scaffold, data layer, integrations, auth, CRUD, UI, Docker, followed by a hardening/audit wave.

## Key technical choices and the why

- **.NET 8 LTS over 9/10**: the broadest battle-tested package matrix (EF Core 8, Identity 8, Sqlite 8 interoperate cleanly); the machine already had the 8.0 runtime; the TFM is centralised in `Directory.Build.props` for a one-line future bump.
- **Razor Pages over MVC/Blazor**: page-per-URL maps almost 1:1 onto the original's App Router file routes; Blazor's stateful SignalR circuit was deliberately rejected for a form-driven app.
- **EF Core code-first + SQLite**: replaces Prisma's schema-first model; one `InitialCreate` migration covers both Identity and app tables, so there is no cross-context ordering problem.
- **Single web project**, not a four-project clean-architecture split: "abstract at seams worth mocking," not everywhere.
- **ASP.NET Core Identity with local accounts as the primary path** plus optional Google: the original was Google-only; local accounts make the app runnable with no OAuth credentials.
- **Azure App Service F1 Linux + SQLite** for $0 infrastructure.

## Dead ends and how they resolved

The most instructive failures are in the commit history:

- **Tests silently shared the real database.** An early `WebApplicationFactory` approach overrode the connection string, which never actually applied: tests had been accumulating state in the real `readlog.db`. The fix overrode `ConfigureTestServices` to swap the DbContext onto an isolated temp SQLite file (PR4 review).
- **CSP broke Google sign-in.** The hardening PR shipped `form-action 'self'`, but `form-action` is enforced on the redirect *target* too: the Google form POSTs to `/signin`, which 302-redirects to `accounts.google.com`, so the browser blocked the handoff. It slipped through because the integration suite runs over HTTP with no browser and never exercised CSP. PR #24 allowed `accounts.google.com` and added a security-headers regression test.
- **Data Protection keys were ephemeral on F1.** The default key store lives in the container's ephemeral layer, regenerating on every cold start (frequent on F1): silently logging everyone out and breaking in-flight OAuth correlation cookies. Fixed by persisting the ring to `/home/data/keys` and pinning `SetApplicationName`.
- **The manual-add fallback was hidden.** Niche/Audible-exclusive titles returned irrelevant-but-nonzero search hits, hiding the manual-add link that only showed on zero results. The fix mints a manual id on every search and always offers "Add manually."
- **Book find-or-create race.** Concurrent inserts of the same `OpenLibraryId` violated the unique index; on `DbUpdateException` the service detaches, re-queries, and returns the winning row: re-throwing if it was not actually a race, so a locked DB is not masked.
- **Dead `Notes` column**: persisted but never read or written; dropped via a hand-authored migration (no .NET SDK in the build env), verified by the suite applying all migrations to a fresh DB.
- **Shared-title hazard**: the original edit path could mutate the shared `Book.Title` for every user; the port made title read-only on edit.

## Notable implementation details

An account-takeover guard in the external-login callback refuses to auto-link a Google login to a pre-existing local account by email alone. Google Books descriptions (untrusted HTML the original rendered with `dangerouslySetInnerHTML`) are sanitized via `Ganss.Xss`, stripping `target` to block reverse-tabnabbing. The original's `Promise.allSettled` fan-out is preserved as `Task.WhenAll` + `SearchSafelyAsync`, keeping the provider asymmetry (Open Library throws, Google Books returns empty). `IMemoryCache` carries two TTLs: 30-day book details (only non-null cached) and a 60-second public feed evicted on every write. Typed `HttpClient` via `IHttpClientFactory` avoids socket exhaustion. A DB check constraint pins rating to 0–5 and a `[NotInFuture]` attribute guards `FinishedAt`. A one-off Neon Postgres → Azure SQLite ETL migrated real reading history: cuid→int PK remap, enum-name translation, `DateOnly` date-part, anonymized non-owner readers, and `AspNetUserLogins` left untouched so the owner's Google link survives.

## Outcome

The port is feature-complete and deployed live, free, on Azure App Service F1 Linux at readlog-a2feef.azurewebsites.net, shipped by a manual, reviewer-gated OIDC GitHub Actions pipeline that pushes to GHCR. The xUnit suite (unit + integration via `WebApplicationFactory`) is green and grew over the PR sequence from around 86 tests. A later audit wave added CSP/security headers, a `/health` endpoint, a vulnerable-package CI gate, and the dead-column and shared-title fixes above. Total infrastructure cost is $0.
