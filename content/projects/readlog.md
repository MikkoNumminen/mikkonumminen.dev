---
title: ReadLog — personal reading tracker
project: readlog
url: https://read-log-pi.vercel.app
---

# ReadLog

**Track every book you've read**

ReadLog is a personal reading tracker. When you search for a book it queries Open Library and Google Books in parallel, then deduplicates results before they reach the UI — whichever source returns the cleaner record wins, and you never see duplicates. Once found, you log the book with the format you read it in (paper, e-book, or audiobook) and the finish date.

The homepage shows a public anonymous feed of recently logged books, so the site has life even before you sign in. Authentication is via Google OAuth.

## Highlights

- 68 tests
- Multi-source book search: Open Library + Google Books queried in parallel, results deduplicated before display

## Tech stack

Next.js, React, TypeScript, Prisma, PostgreSQL, NextAuth, MUI, Jest

## External integrations

Open Library API, Google Books API, Google OAuth

## Status

Live — [read-log-pi.vercel.app](https://read-log-pi.vercel.app) · [GitHub](https://github.com/MikkoNumminen/ReadLog)
