# ADR 0005 — Skill registry as a terminal-download PDF

**Status:** accepted
**Date:** 2026-05-19
**Decided by:** repo owner

## Context

The portfolio claims AI-native development as a differentiator. To make
that claim falsifiable rather than vibes-based, the `/skill-registry`
skill (ADR-adjacent — its design rationale lives in
[`.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md`](../../.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md))
emits a dated JSON document listing every Claude Code skill across every
sibling repo with its token-savings receipt (where one exists).

The JSON is the source of truth. The open question this ADR addresses
is **how the registry data reaches a human reader** — specifically a
visitor on the contact page who wants to verify the portfolio's "26
skills, ~3.13M tokens/year" claim without grepping the repo.

Three surfaces were on the table:

1. A dedicated `/skills` route with a styled HTML table.
2. The existing `/contact` terminal — extend the command set with a
   `skills` inspector and a `download --skills` PDF.
3. Leave the JSON local; recruiters can clone the repo if they're
   curious.

Option 3 was the design's original posture (see "Site surfacing" under
"Open questions" in
[`SKILL-REGISTRY-AGENT.md`](../../.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md)),
deferred until the editorial-grade numbers carried better receipts. It
served the integrity question but failed the discoverability test —
nobody finds an in-repo JSON by accident.

Option 1 was attractive but expensive: an interactive table on a public
route turns the registry from a snapshot into a UI surface with
accessibility, responsiveness, and i18n obligations. The portfolio
already has three other pages each anchored by a distinct visual
metaphor; adding a fourth purely-data page dilutes the format.

Option 2 had the right shape. The contact terminal already runs a
command parser, history, tab completion, and a `download --cv` flow.
Adding `skills` (inline rendering) and `download --skills` (PDF) extends
existing infrastructure rather than building a new page.

Two engineering sub-decisions followed from picking Option 2.

### Sub-decision A: where does the PDF come from?

The terminal's `download --skills` needs an actual PDF file at
`/skills-registry.pdf`. Three options:

- **a1.** Bundle puppeteer / playwright as a devDep; render at build
  time on Vercel. Drags ~150MB of Chromium into the install, adds a
  build-time dependency on a sandboxed browser, and the bundled
  Chromium can drift from system Chrome over Chromium release cycles.
- **a2.** Use the developer's locally-installed Chrome via
  `--headless=new --print-to-pdf`. Zero npm install. Render runs only
  on machines that already have a browser.
- **a3.** Generate the PDF outside the build pipeline (manual export
  from Markdown previewer, then commit). Lowest tech complexity, highest
  drift risk — humans forget.

### Sub-decision B: how does the data stay fresh?

The skill writes JSON to `.claude/agent-verdicts/SKILL-REGISTRY-{date}.json`
(tracked, committed). The terminal reads from
`/data/skills-registry.json` (the static site's `public/data/`). Without
a sync step, those two files drift the moment a new dated registry
lands.

- **b1.** Manual copy after every registry refresh. Error-prone.
- **b2.** Symlink. Doesn't survive `git`-tracked file semantics; would
  need a build script anyway.
- **b3.** A `prebuild` npm hook that finds the latest dated JSON and
  copies it into `public/data/` automatically on every `npm run build`.

## Decision

1. **Surface the registry through the existing contact terminal.** Add
   a `skills` command for inline rendering (aggregate-by-repo by default;
   `--repo <name>`, `--all`, `--json` flags) and a `download --skills`
   command for the PDF download. The CV download (`download --cv`)
   stays unchanged.

2. **Generate the PDF using the local Chrome's `--print-to-pdf`** —
   option **a2** above. A tiny shared module at
   [`scripts/lib/chrome-pdf.mjs`](../../scripts/lib/chrome-pdf.mjs)
   locates Chrome (with `CHROME_PATH` override), invokes `--headless=new
   --print-to-pdf`, and asserts non-zero output bytes before reporting
   success. A content-aware wrapper at
   [`scripts/build-skills-pdf.mjs`](../../scripts/build-skills-pdf.mjs)
   reads the JSON, composes a landscape-A4 HTML template with `@page`
   CSS for layout, and calls the shared lib. A generic CLI at
   [`scripts/build-pdf.mjs`](../../scripts/build-pdf.mjs) handles any
   future "I need this report as a PDF" use case — the `md-to-pdf` skill
   ([`.claude/skills/md-to-pdf/SKILL.md`](../../.claude/skills/md-to-pdf/SKILL.md))
   documents the workflow.

3. **Auto-sync via a `prebuild` npm hook** — option **b3** above. The
   sync script
   ([`scripts/sync-skill-registry.mjs`](../../scripts/sync-skill-registry.mjs))
   picks the latest dated JSON and copies it into `public/data/`. The
   PDF generator runs after the sync. Both steps are short-circuited in
   CI / Vercel build environments (`CI` or `VERCEL` env vars set) so the
   committed PDF stays canonical for hosted builds — no transient
   deploy-time render can diverge from what was reviewed locally.

## Considered alternatives

### A. Dedicated `/skills` route

Rejected as scope creep. A new route earns the right to a custom visual
metaphor like the other three pages have (3D name, solar system,
parallax mountain) — a flat data table would feel out of place.
Surfacing through the existing terminal reuses the CRT aesthetic that
already exists, and the `skills` command's inline output (aggregate
table → per-repo drill-in via `--repo`) is arguably more inspectable
than a static HTML table would be.

### B. Bundled puppeteer / playwright

Rejected for installation cost and CI-runtime divergence. Puppeteer
pulls ~150MB of Chromium; the static-output constraint
([ADR 0002](./0002-static-output-only.md)) means the build artifact must
stay portable across hosts, and adding a chromium dep to `node_modules`
that some hosts may not be able to launch is the opposite of portable.
Local Chrome is a developer-machine assumption, but for a manual
"refresh the registry PDF" workflow that runs ~4× per year, it's a
defensible one.

### C. Client-side print-stylesheet PDF

Rejected for the `download --skills` shape. A `@media print` stylesheet
+ `window.print()` works on a dedicated `/skills` page (Option A above),
but the terminal's download flow expects a file URL it can trigger a
browser download against. Wiring `window.print()` into a terminal
command would surprise the user (browser print dialog vs file download).
Discarded.

### D. Skip the surface entirely (Option 3 above — original posture)

Rejected after re-evaluating. The "wait until receipts are stronger"
gate was reasonable when no surface existed; it stops being reasonable
once the registry has been running for a quarter and the numbers, while
editorial, are at least consistent across the portfolio. The terminal
treatment — quiet command name, no front-page tile, no big stat
billboard — lets the registry exist publicly without being load-bearing
for any hiring decision. A recruiter who clicks `download --skills` is
self-selecting into the detail; the "honest enough" bar for that
audience is lower than for a stat tile on `/`.

### E. Manual PDF commit, no script

Rejected for drift. The registry runs ~quarterly; humans forget. A
prebuild hook that auto-syncs the JSON + regenerates the PDF locally
removes the failure mode entirely. Vercel builds skip the regeneration
explicitly so the committed PDF is the source of truth for the
deployed site — humans review the PDF in a PR, not Vercel's renderer.

## Consequences

### Gained

- **One static asset, two consumers.** The same
  `public/data/skills-registry.json` powers the terminal's `skills`
  command (inline render) and the PDF generator. No data duplication
  beyond the committed snapshot under `.claude/agent-verdicts/`.
- **Zero new runtime / build dependencies.** The PDF tooling uses
  `node:fs` / `node:path` / `node:child_process` and the system Chrome.
  `package.json` only gains two npm script entries; `node_modules`
  doesn't gain anything.
- **Static-output constraint preserved** ([ADR 0002](./0002-static-output-only.md)).
  The PDF is a committed binary artifact; the JSON sync runs at build
  time, not at request time. Vercel serves both as ordinary static
  files.
- **Reusable primitive.** The `md-to-pdf` skill is a general-purpose
  HTML → PDF tool that will absorb future "I need this report as a PDF"
  moments (audit reports, briefs) without re-deriving the Chrome-headless
  invocation.

### Costs

- **Local Chrome assumption.** Anyone trying to regenerate the PDF
  without Chrome installed needs to either install Chrome or set
  `CHROME_PATH`. Fork-friendliness suffers slightly. Mitigated: the
  build script exits 0 with a clear message in that case, leaving the
  committed PDF in place.
- **CI never regenerates the PDF.** Intentional — see the rationale in
  Decision 3 — but it means a PR that changes only the JSON (no local
  PDF rebuild) will deploy with a stale-looking PDF until someone runs
  `npm run build:skills-pdf` locally and pushes the update. Spelled out
  in the `/skill-registry` skill's "Auto-sync to the site surface"
  paragraph so future runs catch this.
- **The terminal is the only public surface.** A visitor who skips the
  contact page never encounters the registry. Discoverability hinges on
  the help-screen tip including `download --skills` and `skills` —
  which it does, but it's a softer surface than a homepage stat tile
  would be. Accepted trade-off; the "softer surface" is also what keeps
  the editorial numbers from feeling overstated.

## Status

- [x] Terminal `skills` command shipped (PR #112)
- [x] `download --skills` PDF download shipped (PR #112)
- [x] `md-to-pdf` skill + scripts shipped (PR #112)
- [x] `prebuild` auto-sync hook shipped (PR #112 follow-up)
- [x] Help-screen tip surfaces `skills` and `download --skills` (PR #113)
- [ ] Frontmatter schema adoption across all 26 skills — the structural
      upgrade path that would turn the editorial figures into measured
      ones. Tracked in
      [`SKILL-REGISTRY-AGENT.md`](../../.claude/agent-verdicts/SKILL-REGISTRY-AGENT.md)'s
      "Open questions" section.
