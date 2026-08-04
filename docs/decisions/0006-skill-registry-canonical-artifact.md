# ADR 0006 · Committed skills-registry JSON is canonical; prebuild no longer auto-syncs it

**Status:** accepted, supersedes [ADR 0005](./0005-skill-registry-pdf-surface.md)'s Decision 3 (the `prebuild` auto-sync of the registry JSON).
**Date:** 2026-06-13
**Decided by:** repo owner

## Context

[ADR 0005](./0005-skill-registry-pdf-surface.md) wired a `prebuild` hook
(`sync:skills-registry`) that copied the latest dated
`.claude/agent-verdicts/SKILL-REGISTRY-{date}.json` into
`public/data/skills-registry.json` on every build, so the terminal always
served the freshest committed scan.

Since then the served file stopped being a plain copy of the dated scan. A
manual refresh chain (`/skill-localUpdate`) layers **transcript-measured
receipts** (`apply-measurement-overlay.mjs`) and **A/B calibration buckets**
(`build-review-stats.mjs`) onto it. Those passes read local `~/.claude` data
and **cannot run on a build server** (`build-review-stats` deliberately no-ops
in CI). So the committed `public/data/skills-registry.json` is an *enriched*
artifact, while the dated scan is *raw*.

That broke the ADR 0005 assumption: the `prebuild` sync was copying the **raw**
dated registry over the **enriched** committed file on every build, including
production Vercel builds: silently downgrading what the terminal served
(~1850 lines of measured data replaced by the raw scan), and then rendering the
catalog PDF from the downgraded data.

## Decision

**Remove `sync:skills-registry` from `prebuild`.** The committed
`public/data/skills-registry.json` is now the **canonical artifact for hosted
builds**: exactly the posture ADR 0005 already established for the committed
PDF. `sync` remains the first step of the manual `/skill-localUpdate` refresh
chain (`sync → apply-measurement-overlay → build-review-stats →
build-skills-pdf`); the enriched result is committed and reviewed in a PR.

`prebuild` is now `render:audit-pdfs && build:skills-pdf` (both skip in CI).

## Considered alternatives

- **Run the full enrichment chain in `prebuild`.** Rejected: `build-review-stats`
  needs local `~/.claude` transcripts that don't exist on a build server, so the
  buckets can't be regenerated there, and it would violate the static-output
  posture by reading developer-machine data at build time.
- **Make `sync` idempotent (skip when the destination is already enriched).**
  Rejected as fragile heuristic: "enriched" has no clean signal, and it leaves a
  destructive step armed in the build path for the case it misfires.

## Consequences

- **Gained:** production serves the enriched registry the terminal is meant to
  show; the local build no longer corrupts the JSON or the PDF; the registry
  joins the PDF as a reviewed, committed source of truth.
- **Cost:** the committed registry can go stale if `/skill-localUpdate` isn't run
  after a new scan: the same trade-off ADR 0005 already accepted for the PDF.
  A freshness check is a possible future guard.

Landed in PR #213. See [`scripts/sync-skill-registry.mjs`](../../scripts/sync-skill-registry.mjs)
for the header note and [`docs/security/threat-model.md`](../security/threat-model.md)
for the related data-boundary discussion.
