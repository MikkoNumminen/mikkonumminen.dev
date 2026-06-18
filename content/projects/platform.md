---
title: Platform — community platform built on HRM
project: platform
url: https://vuohiliitto.com
---

# Platform

**Community platform built on HRM**

Platform is a live community site serving a real World of Warcraft guild at vuohiliitto.com. It is built as a Turborepo monorepo with HRM embedded as a git submodule — the same authentication layer and audit log back both products.

The platform is multi-tenant and adds WoW-themed gamification on top of the HRM foundation: XP, levels, achievements, and quests. Communication runs through a tabbed chat system that supports whispers and slash commands. A Mythic+ team tracker pulls fresh roster data, recent run history, and rio scores via the Raider.IO API on every load — no stale screenshots. New members are onboarded through a guided tour. Authentication is handled by Google OAuth or GitHub OAuth; a zero-credential demo mode lets visitors explore without signing in.

## Highlights

- Real users on a live WoW guild community site (vuohiliitto.com)
- Multi-tenant Turborepo monorepo with HRM as a git submodule
- 1388+ tests
- Live Raider.IO API integration for Mythic+ tracking

## Tech stack

Turborepo, Next.js, React, TypeScript, PostgreSQL, Prisma, NextAuth, MUI, Playwright, Jest, next-intl

## External integrations

Raider.IO API, Google OAuth, GitHub OAuth, GitHub API

## Status

Live — [vuohiliitto.com](https://vuohiliitto.com) · [GitHub](https://github.com/MikkoNumminen/Platform)

## Connections

Platform consumes HRM as a git submodule, sharing the same auth system and audit log.
