---
title: ReadLog .NET — ASP.NET Core reading tracker
project: readlog-dotnet
url: https://readlog-a2feef.azurewebsites.net/
---

# ReadLog .NET

ReadLog .NET is a complete ASP.NET Core 8 reimplementation of Mikko Numminen's personal reading-log web application. Users can search for books across Open Library and Google Books, log what they finish with a format (book, audiobook, or e-book), a finished-on date, and a 0–5 star rating, then browse, search, edit, and delete their personal library. A public "recently read" feed is available to anonymous visitors.

The app is live on Azure App Service F1 Linux at https://readlog-a2feef.azurewebsites.net/ and the source is at https://github.com/MikkoNumminen/readlog-dotnet.

## Stack

| Concern | Choice |
|---|---|
| Runtime | .NET 8 LTS |
| Web | ASP.NET Core Razor Pages |
| ORM | EF Core 8, code-first migrations |
| Database | SQLite (local file, persisted on Azure `/home`) |
| Auth | ASP.NET Core Identity — local accounts + optional Google OAuth |
| UI | Bootstrap 5, themed to the ReadLog palette with CSS custom properties |
| Tests | xUnit, `WebApplicationFactory<Program>` integration tests |
| Container | Multi-stage Dockerfile, `aspnet:8.0`, non-root, port 8080 |
| CI/CD | GitHub Actions — `ci.yml` (build + test on every push/PR), `deploy.yml` (manual, OIDC, gated by a `production` environment) |

## What is notable

The project is an explicit, deliberate port — not a transliteration — of the original Next.js / Prisma / Postgres ReadLog. Every architectural choice is documented in `PORTING-NOTES.md` with explicit rationale, mapping each TypeScript/React/Prisma pattern to its idiomatic .NET equivalent: Razor Pages in place of the App Router, EF Core code-first migrations in place of `schema.prisma`, typed `HttpClient` via `IHttpClientFactory` in place of `fetch`, `IOptions` in place of `process.env`, and ASP.NET Core Identity (local accounts + Google) in place of NextAuth.

The port adds things the original lacked: local email/password accounts (so the app runs with no Google credentials), a DB-level check constraint on rating (0–5), a `[NotInFuture]` validation attribute on `FinishedAt`, HTML sanitization of Google Books descriptions (the original used `dangerouslySetInnerHTML` unsanitised), and an account-takeover guard that refuses to auto-link a Google login to a pre-existing local account by email alone.

The deployment target is Azure App Service F1 Linux with SQLite — deliberately chosen to avoid any paid database tier. Total infrastructure cost is $0 (F1 plan + public GitHub Container Registry). EF Core migrations run on startup, so a clean deploy creates the database automatically with no manual step.
