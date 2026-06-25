---
title: ReadLog .NET — architecture & design
project: readlog-dotnet
---

# ReadLog .NET — Architecture & Design

## Overview and High-Level Architecture

ReadLog .NET is a server-rendered, page-centric CRUD application built on ASP.NET Core 8 Razor Pages. The request path is: browser → Azure App Service TLS termination → Kestrel → Razor Page handler → domain service → EF Core → SQLite. There is no client-side framework, no REST API layer, and no JavaScript beyond the Bootstrap 5 bundle and jQuery unobtrusive validation that ships with the standard ASP.NET Core template.

The app has five user-facing URL groups: `/` (public feed, anonymous), `/book` (Google Books detail, anonymous), `/library` + `/library/edit/{id}` (personal reading log, authenticated), `/log` (book search + log entry form, authenticated), and `/account` (stats + profile, authenticated). Auth pages sit at `/signin`, `/register`, `/signout`, and `/external-login`. The four authenticated pages carry `[Authorize]`; the cookie middleware redirects unauthenticated requests to `/signin?ReturnUrl=…` server-side before any page handler runs.

The repository structure is a single solution with two projects: `src/ReadLog.Web` (the ASP.NET Core application) and `tests/ReadLog.Tests` (xUnit). All domain concerns — entities, the DbContext, services, DTOs, validation, auth helpers, and Razor Pages — live in folders within the single web project rather than in separate class library projects. This is an intentional choice documented in `PORTING-NOTES.md`: for an app with two real entities, a four-project Domain/Application/Infrastructure/Web split adds project boundaries without buying anything. Services are still abstracted behind interfaces where that buys testability; the line is "abstract at seams worth mocking," not "abstract everything."

## Tech Stack and Key Choices

### .NET 8 LTS

.NET 8 was chosen over 9/10 for its LTS status and the mature, interoperating package matrix it brings (EF Core 8, `Microsoft.AspNetCore.Identity.EntityFrameworkCore` 8, `Microsoft.EntityFrameworkCore.Sqlite` 8 all ship cleanly together). The target framework moniker is centralised in `Directory.Build.props` so moving to a future LTS is a one-line change. The exact SDK version (8.0.422) is pinned in `global.json` with `rollForward: latestFeature` for reproducible local and CI builds.

### Razor Pages over MVC or Blazor

Razor Pages' page-per-URL model maps almost 1:1 onto the original's Next.js App Router file-based routes: `Pages/Library.cshtml` + `LibraryModel` is the direct equivalent of `app/library/page.tsx`. This keeps request handlers co-located with their markup and eliminates the controller/view/route-map ceremony that MVC would add for an app where every URL is a distinct page. Blazor Server was considered and deliberately rejected: it introduces a stateful SignalR circuit and a component runtime that a mostly-static, form-driven app does not need.

### Build Hygiene

`Directory.Build.props` centralises `Nullable=enable`, `LangVersion=latest`, `ImplicitUsings=enable`, `Deterministic=true`, and — critically — `WarningsAsErrors=nullable`. Nullable reference type violations are treated as build errors, not warnings. `AnalysisLevel=latest-recommended` and `EnforceCodeStyleInBuild=true` run the .NET analyzers and code-style checks at build time. An `.editorconfig` enforces formatting. `dotnet-ef` 8.0.8 is pinned in a committed local tool manifest (`.config/dotnet-tools.json`).

### UI: Bootstrap 5, themed

The original ReadLog uses MUI v7 (a React component library) with a brown palette. The idiomatic ASP.NET Core equivalent is the standard Bootstrap 5 (grid, cards, badges, list-group, form + validation styling) re-themed with CSS custom properties to the same palette in `wwwroot/css/site.css`. This keeps the app on the standard ASP.NET Core front-end stack — including jQuery unobtrusive validation, which the DataAnnotations model-binding story plugs into naturally.

## Data Model and Persistence

### Entities

Three application entities live in `src/ReadLog.Web/Models/`:

**`Book`** is a shared catalogue row, one per real-world work. Fields: `int Id` (autoincrement), `required string Title`, optional `Author`, `CoverUrl`, `OpenLibraryId` (the natural key for find-or-create — holds an Open Library work key, a `google:<volumeId>`, or a `manual:<guid>` for hand-entered books), `PageCount`, `FirstPublishYear`, and `DateTime CreatedAt`. The `ICollection<ReadEntry>` navigation is present but not eagerly loaded.

**`ReadEntry`** is a user-owned "I finished this" record. Fields: `int Id`, `string UserId` (FK to `AspNetUsers`, cascade delete), `int BookId` (FK to `Books`, restrict delete), `Format` (enum persisted as string), `DateOnly FinishedAt`, `int? Rating` (null = unrated, 0 = a real zero-star rating), and `DateTime CreatedAt`.

**`ApplicationUser`** extends `IdentityUser` with `Name`, `Image` (Google profile photo URL), and `CreatedAt`. It carries Identity's GUID string primary key.

The `Format` enum (`Book`, `Audiobook`, `Ebook`) is persisted with `HasConversion<string>()` so the column contains readable strings rather than opaque ordinals.

### DbContext and Configuration

`ApplicationDbContext` inherits `IdentityDbContext<ApplicationUser>` so the Identity tables (`AspNetUsers`, `AspNetUserLogins`, `AspNetRoles`, etc.) and the application tables (`Books`, `ReadEntries`) share one context and one migration. This means no cross-context coordination and no migration ordering problem.

Fluent configuration in `OnModelCreating` sets:
- A unique index on `Book.OpenLibraryId`
- A non-unique index on `Book.Title`
- A composite unique index on `(ReadEntry.UserId, ReadEntry.BookId, ReadEntry.FinishedAt)` — matching the original Prisma `@@unique`
- Individual indexes on `ReadEntry.UserId` and `ReadEntry.FinishedAt`
- `HasMaxLength(16)` on the Format string conversion
- A check constraint `CK_ReadEntry_Rating` (`[Rating] IS NULL OR ([Rating] >= 0 AND [Rating] <= 5)`) — a defence-in-depth addition the original schema lacked
- FK delete behaviors: `Cascade` on User → ReadEntry, `Restrict` on Book → ReadEntry

`ApplicationDbContext` overrides `SaveChanges` and `SaveChangesAsync` to stamp `CreatedAt = DateTime.UtcNow` on any newly added entity that implements `ICreatedAt`. This avoids the provider-specific `CURRENT_TIMESTAMP` default and gives full UTC precision.

### Migrations

A single migration (`InitialCreate`) created by `dotnet ef migrations add` covers both the Identity schema and the app tables. A `DesignTimeDbContextFactory` lets the EF tooling build the context without booting the app, so `migrations add` never trips the startup migration logic.

At runtime, `Program.cs` applies pending migrations on every startup via `Database.Migrate()`. Before migrating, the program creates the database directory (`Directory.CreateDirectory`) if it does not exist, then logs the resolved absolute path so operators can confirm from the log stream that the DB is on the persistent storage mount rather than ephemeral container storage. A retry loop (3 attempts, 2-second sleep, logging each failure, rethrowing on the last) guards against the transient lock or permission hiccup that can occur on Azure App Service's SMB-mounted `/home` share on a cold first boot.

### Key Schema Decisions vs. the Original

The original Prisma schema used `cuid()` string primary keys for `Book` and `ReadEntry`. The port uses autoincrement `int` keys — idiomatic for a single SQLite database and more compact. The `NextAuth` tables (`Account`, `Session`, `VerificationToken`) are dropped entirely; Identity owns those concerns via `AspNetUserLogins` and the auth cookie. `FinishedAt` becomes `DateOnly` rather than a UTC-midnight `DateTime`, because `DateOnly` says precisely what it means. The `readlog_` table-name prefix (which existed only to share a Postgres instance with other apps) is dropped because a dedicated SQLite file has no such constraint.

## Auth and Security

### ASP.NET Core Identity

The original Next.js app used NextAuth v5 with Google as the sole provider and database-backed sessions via `PrismaAdapter`. The port uses ASP.NET Core Identity with local email/password as the primary path and Google as an optional external login.

`AddIdentity<ApplicationUser, IdentityRole>()` is used rather than `AddIdentityCore` because it wires all three Identity cookie schemes (application, external, two-factor) automatically — the external-login challenge/callback depends on the external cookie scheme, and rolling that by hand with `AddIdentityCore` would be more error-prone. The built-in Identity UI Razor Class Library is not used; the Login, Register, Logout, and ExternalLogin pages are written by hand to keep them on the ReadLog theme and to make the `SignInManager` and `UserManager` flows explicit.

Sessions are a signed, sliding, 14-day auth cookie (not database session rows). A custom `DisplayNameClaimsPrincipalFactory` emits a `display_name` claim from `ApplicationUser.Name` at sign-in, so the navbar can greet the user without a database hit on every request.

Lockout is configured at 5 failed attempts → 5-minute lockout. Password policy: minimum 8 characters, `RequireNonAlphanumeric = false`, `RequireUniqueEmail = true`. `RequireConfirmedAccount = false` (no email sender wired up — demo posture, explicitly documented as a known limitation with the consequence that email enumeration is possible via Identity's default duplicate-email message).

Google external login registers conditionally: the `AddAuthentication().AddGoogle(...)` call is inside a guard on the configuration keys, so the "Sign in with Google" button appears when, and only when, `Authentication:Google:ClientId` and `Authentication:Google:ClientSecret` are set. The app runs fully with local accounts alone and requires no Google credentials.

### Account-Takeover Guard

The `ExternalLogin` callback (`OnGetCallbackAsync`) contains an explicit account-takeover defence: if a Google login arrives for an email that already has a local password account, the callback refuses to auto-link and tells the user to sign in locally first. An email-string match alone is not proof of ownership; silently attaching the Google provider to a pre-existing password account would let an attacker who pre-created an account with a victim's email hijack it the moment the victim uses Google sign-in.

### Web Surface Hardening

- **CSRF**: all state-changing operations are POST forms protected by ASP.NET Core antiforgery tokens. A GET to `/signout` is intentionally inert — a regression test pins this.
- **Open redirect**: every post-auth redirect uses `LocalRedirect`, which throws on non-local URLs.
- **XSS in book descriptions**: Google Books descriptions are untrusted HTML. The original rendered them with `dangerouslySetInnerHTML` without sanitization. The port passes them through `HtmlSanitizer` (the `Ganss.Xss` package) configured in `BookDescriptionSanitizer`, which also removes the `target` attribute to prevent reverse-tabnabbing. This is the only `@Html.Raw` in the codebase.
- **Security response headers**: inline middleware in `Program.cs` (immediately after `UseForwardedHeaders`) sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a Content Security Policy (`default-src 'self'`, `img-src 'self' https: data:`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `form-action 'self' https://accounts.google.com`). The `form-action` carve-out for `accounts.google.com` is required because the Google sign-in form POSTs to `/signin`, which 302-redirects to `accounts.google.com`, and browsers enforce `form-action` against the redirect target.
- **LIKE injection**: the "have I read this?" search in `ReadLogService.CheckIfReadAsync` uses `EF.Functions.Like` with `ESCAPE '\'` and pre-escapes the user's `%`, `_`, and `\` characters, preventing wildcard injection.
- **Data Protection keys**: `AddDataProtection` persists the key ring to the filesystem at `/home/data/keys` (next to the SQLite file on Azure's persistent `/home` share) and pins the application name. Without this, the key ring regenerates on every cold start and silently logs everyone out while also breaking in-flight OAuth correlation cookies.
- **Forwarded headers**: `UseForwardedHeaders` is the first middleware, with `KnownNetworks` and `KnownProxies` intentionally cleared because Azure App Service is the sole ingress. This makes HTTPS redirection, HSTS, and auth cookie security flags reflect the original `https` scheme.

## Key Engineering Challenges and Solutions

### EF Core vs. Prisma: Code-First vs. Schema-First

Prisma is schema-first: you write `schema.prisma`, run `prisma generate`, and get a generated client. EF Core used here is code-first: the C# entity classes and the `DbContext` fluent configuration are the schema, and `dotnet ef migrations` diffs the model to produce migration code. The conceptual mapping is: `schema.prisma` model → POCO entity class; `PrismaClient` → `ApplicationDbContext`; `prisma db push` → `dotnet ef migrations add` + `Database.Migrate()`; `@@index`/`@@unique` → `HasIndex(...).IsUnique()`; `onDelete:` → `.OnDelete(DeleteBehavior.Cascade/Restrict)`; `@default(now())` → the `SaveChanges` override; Postgres `enum` → C# `enum` + `HasConversion<string>()`.

### The Book Find-or-Create Race

Multiple users logging the same book simultaneously would race to insert the same `OpenLibraryId` value, violating the unique index. `ReadLogService.GetOrCreateBookAsync` handles this explicitly: on a `DbUpdateException` after an insert attempt, it detaches the failed entity, queries for a row with the same `OpenLibraryId`, and returns it if found (logging the race). If no winning row exists, the original exception is re-thrown — so a non-race failure such as a locked database is not silently masked as a race condition.

### The `Promise.allSettled` Problem

The original book search used `Promise.allSettled` to fan out to both providers concurrently and degrade each independently. The port preserves this exact shape: `BookSearchService.SearchAsync` starts both provider calls concurrently via `Task.WhenAll`, wrapping each in `SearchSafelyAsync`, which catches all exceptions except `OperationCanceledException` when the caller's token is cancelled (caller-initiated cancellation must surface, not degrade to empty results). Open Library results are concatenated first, so they win de-dup ties — matching the original's ordering.

### Provider Failure Asymmetry

The original `OpenLibraryClient` threw on a non-OK HTTP response while `GoogleBooksClient` returned `[]`/`null`. The port preserves this asymmetry exactly: `OpenLibraryClient` throws `HttpRequestException` on non-success; `GoogleBooksClient` returns empty lists or `null`. Each is wrapped by `SearchSafelyAsync`, which converts exceptions to empty results (except caller cancellation). This lets `BookSearchService` be ignorant of provider-specific error handling while still providing graceful degradation.

### De-Duplication Across Providers

After merging both provider lists (Open Library first), `BookSearchService.Deduplicate` normalises each result's title and author (lower-case, strip non-alphanumeric via a source-generated `[GeneratedRegex]`) and produces a composite key. A `List<BookSearchResult>` + `Dictionary<string, int>` reproduces the JavaScript `Map`'s insertion-order-preserving "replace value, keep position" semantics: when a duplicate is found, the existing slot in the list is upgraded in-place to the richer result (scored by has-cover + has-page-count) without changing its position. This is a deliberate port of the original's JS logic.

### Caching Strategy: What to Cache and When to Evict

The port uses `IMemoryCache` for two distinct caching concerns with very different TTLs:

**Book details** (30-day TTL, keyed by a `("book-details", title, author)` ValueTuple): mirrors the original's `unstable_cache` with a 30-day TTL. The ValueTuple key uses structural equality, avoiding the delimiter-collision risk of a `"{title}|{author}"` string. Crucially, only non-null results are cached, so a transient failure or a missing API key is retried rather than cached as "no details" for 30 days.

**Public feed** (60-second TTL, evicted on every write): the feed is a global hot read shared across all visitors. Output caching the page itself would serve one user's navbar (signed in vs. out) to another, so the data is cached inside `ReadLogService.GetRecentPublicReadsAsync` using `IMemoryCache.GetOrCreateAsync`. Every write path (`LogBookAsync`, `UpdateReadEntryAsync`, `DeleteReadEntryAsync`) calls `_cache.Remove(PublicFeedCacheKey)` — the direct equivalent of the original's `revalidateTag("public-feed")`.

The cache populate query for the feed uses `CancellationToken.None` deliberately: the populating request serves all concurrent readers, so one request's cancellation should not abort the shared cache population.

### The Shared-Title Hazard

The original's edit action allowed mutating the shared `Book.Title`, which would change the displayed title for every user who had logged that book. The port makes title read-only on the edit path: `UpdateReadEntryAsync` includes a comment documenting this, and the edit form exposes only per-user fields (`Format`, `FinishedAt`, `Rating`). This is a deliberate divergence from the original, documented in `PORTING-NOTES.md`.

### Typed HttpClient and Socket Exhaustion

The original called `fetch()` directly in server actions (hidden behind serverless function isolation). The idiomatic .NET equivalent is typed `HttpClient` registered through `IHttpClientFactory`. `OpenLibraryClient` and `GoogleBooksClient` each get an `HttpClient` with a configured `BaseAddress`, a 10-second timeout, and (for Open Library) a `User-Agent` header identifying the app. `IHttpClientFactory` pools and recycles the underlying `HttpMessageHandler` instances, avoiding the socket exhaustion problem that would arise from constructing `HttpClient` instances directly.

### The "Local Accounts" Addition

The original required a Google account to log in. Adding local email/password accounts as the primary path was a deliberate departure: the app runs out-of-the-box with no Google credentials, which makes it immediately runnable for a reviewer or interviewer who does not have the OAuth client set up. Google login registers only when `Authentication:Google:ClientId` and `ClientSecret` are both configured. This is documented as "more idiomatic, not less" in `PORTING-NOTES.md` because local accounts plus external providers is exactly the Identity pattern the framework is designed for.

### The `[Authorize]` vs. Client Redirect

The original `/log` page was gated with a `useEffect` that pushed to `/signin` after a brief blank flash — a client-side redirect after the page had already been delivered. The port marks the page `[Authorize]`, so the cookie authentication middleware issues a `302 → /signin?ReturnUrl=/log` server-side before any Razor handler runs. No blank flash, and the `ReturnUrl` round-trips the user back after login.

### Data Protection Key Persistence

On Azure App Service with `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`, the `/home` directory is a persistent SMB share. Without explicit `PersistKeysToFileSystem`, ASP.NET Core Data Protection generates ephemeral keys stored in the container's ephemeral layer, which are lost on every cold start or redeploy. The result is silent, confusing failures: all existing auth cookies become invalid (users are logged out), and in-flight OAuth correlation cookies — which the external-login callback relies on — fail to decrypt. `Program.cs` persists the key ring under `/home/data/keys` and pins the application name with `SetApplicationName("ReadLog")` so the ring survives restarts and redeploys.

## Testing Strategy

The test suite is organised into service unit tests and page/auth/smoke integration tests in `tests/ReadLog.Tests/`.

**Service unit tests** (`Services/`) test `ReadLogService`, `BookSearchService`, `BookDetailsService`, `OpenLibraryClient`, `GoogleBooksClient`, and `BookDescriptionSanitizer` directly. `ReadLogService` tests construct the service over an in-memory SQLite database (`SqliteTestDatabase` infrastructure helper) using a shared, kept-open `SqliteConnection` with `Foreign Keys=True`. Delete behaviour is tested in a fresh context (untracked dependents) so the assertion verifies the database FK constraint rather than EF's client-side cascade. `OpenLibraryClient` and `GoogleBooksClient` tests use a `StubHttpMessageHandler` that returns canned JSON or status codes and records requests — covering field mapping, cover URL construction, `http → https` normalisation, the throw-vs-empty contracts, and that a blank query or missing API key makes no HTTP call. `BookSearchService` tests use hand-written stub clients to verify de-dup/scoring, Open-Library-first ordering, failure resilience, and the two cache behaviours (hit, null-not-cached, per-(title,author) keying).

**Integration tests** (`Pages/`, `Auth/`, `Smoke/`) boot the real application using `WebApplicationFactory<Program>`. `ReadLogAppFactory` overrides `ConfigureTestServices` to swap `ApplicationDbContext` onto an isolated temp SQLite file (a critical fix documented in PORTING-NOTES: an earlier approach using connection-string override silently did not apply, so tests had been sharing and accumulating state in the real `readlog.db`). A fresh factory per test gives deterministic entity IDs. `WebTestClient` extension methods handle the antiforgery token flow: each POST extracts the `__RequestVerificationToken` from the rendered form HTML and includes it in the POST body along with the session cookie, making the tests drive the full HTTP stack including CSRF validation. Tests cover: `[Authorize]` → `/signin?ReturnUrl=` redirect for each protected page; home feed render; the full log → library round-trip; edit; delete (verifying the shared Book row is kept); ownership 404 (a non-owner's entry ID returns 404); account count; detail page with no API key; register/login/logout round-trip; wrong password, password mismatch, and duplicate email rejection; display-name greeting; and that GET `/signout` does not sign the user out. `SecurityHeadersTests` pins all five security response headers on every response, including the CSP `form-action` carve-out for `accounts.google.com`.

**Validation tests** (`Validation/`) exercise DataAnnotations on the request DTOs (`LogBookRequest`, `UpdateReadEntryRequest`) including the custom `[NotInFuture]` attribute, confirming that boundary values (rating 0, 5, null; future dates; past dates) validate correctly.

**Smoke test** (`Smoke/HomePageSmokeTests`) boots the real app and asserts the home page returns 200 — gating "it compiles and starts" from PR1 onward.

## Infrastructure, Deployment, and CI

### Dockerfile

A multi-stage build: the `sdk:8.0` stage copies project files first (so the restore layer caches unless they change), restores, then `dotnet publish`es framework-dependent with `/p:UseAppHost=false`. The `aspnet:8.0` runtime stage carries only the published output, runs as the image's non-root `$APP_UID` user, and listens on port 8080. A persistent directory `/home/data` is created and owned by the app user at image build time. On Azure App Service with `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`, the platform mounts its SMB share over `/home` at container start, mapping the SQLite file and the Data Protection key ring onto durable storage.

The Dockerfile sets `ASPNETCORE_ENVIRONMENT=Production` explicitly, making the posture self-documenting and immune to a future change in the base-image default.

### CI and Deploy Pipelines

`ci.yml` runs `dotnet restore`, `dotnet build -c Release`, and `dotnet test` (with coverage collection) on every push and pull request to `develop` and `master`. The `deploy.yml` is `workflow_dispatch`-only (no automatic triggers), pushes the multi-stage image to `ghcr.io/mikkonumminen/readlog` with both `:latest` and `:<commit-sha>` tags, and deploys the pinned `:<sha>` image (not `:latest`) to Azure App Service via OIDC authentication (an Entra federated credential tied to the `production` GitHub Environment). No stored credentials: the deploy uses ephemeral OIDC tokens. A `production` environment required-reviewer gate means nothing ships without a human approving the run. OIDC permissions are scoped per-job (`packages: write` and `id-token: write` on the build-and-push job; `id-token: write` on the deploy job).

### Azure App Service F1 and SQLite

The deployment target is Azure App Service Free F1 Linux. The deliberate trade-off (documented in `docs/DEPLOY.md` and `PORTING-NOTES.md`): F1 has no Always On — the app idles after approximately 20 minutes and the first request after idle is a slow cold start (image pull + JIT + `Database.Migrate()`). F1 is single-instance and cannot scale out, which is what makes SQLite's single-writer model viable on the platform (no concurrent writers contending for the file lock). The free tier comes with approximately 60 CPU-minutes/day and 1 GB storage. Total infrastructure cost is $0.

Microsoft's official guidance is that SQLite on the App Service Linux `/home` SMB share is unsupported because exclusive file locks are not reliable. This is acknowledged in the documentation and accepted as a deliberate, defensible tradeoff for a personal demo: F1 is single-instance, the app is low-traffic, and the EF Core data layer is provider-agnostic (LINQ-only, no raw SQL) so swapping to Postgres or Azure SQL is a provider-change rather than a rewrite.

A startup SQLite `DefaultTimeout = 30` seconds (set via `SqliteConnectionStringBuilder`) and a `WEBSITES_CONTAINER_START_TIME_LIMIT=600` App Service app setting guard against the two most common first-boot failures on the SMB share: transient file locks and permission issues during the platform's mount-over-chown sequence.

## Scale and Performance Notes

The app is sized for a single personal-use instance. `IMemoryCache` is used throughout (not `IDistributedCache`), which is appropriate for single-instance deployment. The public feed cache (60 seconds) is the only query that benefits from caching; library and account queries are per-user `WHERE` filters over a local SQLite file and are cheap without caching.

Account stats use EF Core's `GroupBy` translation to a single SQL `GROUP BY` query — not client-side grouping. The public-feed query uses `Take(20)` with `OrderByDescending(e => e.CreatedAt)`, served from in-memory cache on all but the first hit after a write.

There is no horizontal scale path in the current configuration. Moving to a managed database (Postgres or Azure SQL) and `IDistributedCache` would be the prerequisites for multi-instance deployment; the LINQ-only data access layer requires no raw SQL changes.
