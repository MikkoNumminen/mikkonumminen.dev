# AI-First Rating — mikkonumminen.dev

> **⚠️ Superseded.** This is the original baseline. The findings here were
> acted on across PRs #212–233; see [`ai-first-rating-2026-06-13.md`](ai-first-rating-2026-06-13.md)
> for the re-rate. Kept for history.

**2026-06-12 · Overall: 7.3/10 (B)**

> One-line verdict: an autonomous coding agent can read, change, and self-verify this repo with high confidence — as long as it keeps a copy of the uncommitted CLAUDE.md, because a clean clone strips most of the project's stated intent.

**What this means.** The code itself is unusually agent-legible: dense WHY-comments, typed `*Handle` factory contracts, strict-plus TypeScript, and five fast CI-enforced verification gates. The weakness is at the edges — the richest orientation doc is gitignored, there is no committed agent contract (`AGENTS.md`/`CONTRIBUTING.md`), the Three.js/GSAP layer that holds the site's hardest logic is untested, and there is no `SECURITY.md` or threat model. The score reflects strong fundamentals undercut by discoverability and coverage gaps an agent would hit on a fresh checkout.

> **Update (PR #212):** `AGENTS.md` and the CI build gate — improvements #1 and #4 below — were committed alongside this report. The onboarding (6.5) and self-verification (7.5) scores describe the state *before* those landed; re-run the rating to capture the lift.

## Scorecard

| Dimension | Weight | Score | Note |
| --- | --- | --- | --- |
| Agent onboarding & navigation | 0.18 | 6.5 | Good README, but the richest doc (CLAUDE.md) is uncommitted; no `AGENTS.md` |
| Code legibility (why-comments, naming, boundaries) | 0.18 | 8.7 | Exemplary WHY-comments + typed `*Handle` contracts; a few uncommented modules |
| Self-verification gates (build/typecheck/lint/format/tests) | 0.16 | 7.5 | Five fast gates, 4 of 5 CI-enforced; build not in CI, Three.js untested |
| Decision & rationale capture (ADRs, audit trail) | 0.12 | 7.0 | Disciplined ADRs; stale undated root audits + discoverability gaps cap it |
| Automation & tooling (skills, scripts, CI, prebuild) | 0.12 | 7.5 | Self-verifiable deterministic tooling; Windows-path coupling + unwired scripts |
| Type safety & data contracts | 0.10 | 7.5 | Strict compile-time discipline; open `Record` data + unvalidated runtime JSON |
| Machine-readable structured artifacts | 0.07 | 7.5 | Self-describing, durably tracked artifacts; no schema, no shape test |
| Security/ops agent docs (SECURITY.md, threat model) | 0.07 | 5.5 | No `SECURITY.md`, no threat model, no CI security checks |
| **Weighted overall** | **1.00** | **7.3** | **B** |

## Dimension detail

### Agent onboarding & navigation — 6.5

The README is genuinely useful: a labelled command list with ports (`README:46-56`), a structure tree, and a per-page concept map (`README:9-16, 63-89`), and a 12+-path existence sweep returned zero link rot. But the richest orientation doc — hard constraints, build order, commit conventions — lives in `CLAUDE.md`, which is gitignored (`.gitignore:36`) and self-declares "never committed" (`CLAUDE.md:3`), so it vanishes on a fresh clone. There is no committed agent contract (`AGENTS.md` and `CONTRIBUTING.md` both absent), and the surviving README has measurable drift: the structure tree documents 4 of 10 `src/lib` subdirs, `README:61` omits the `render:audit-pdfs` prebuild step that is in `package.json:21`, and `npm run lint` is never mentioned despite `package.json:24` defining it.

### Code legibility — 8.7

This is the repo's strongest axis and the score is well-earned. The flagship WHY-comments are real and load-bearing — `createRenderer.ts:6-14` (the "56% of pixel work" math), `buildCollisionSparks.ts:89-96` (sqrt/power-curve rationale), `postprocessing.ts:60-67` (why dispose every pass) — and 18 distinct named `*Handle` interfaces give a consistent factory contract. Hygiene is clean: zero `TODO/FIXME/HACK`, zero `: any`/`as any`, zero `@ts-ignore`/`eslint-disable` across `src/`, with ~31% comment density in `homeScene.ts` (304/985). The gaps are narrow: `createHoverLabel.ts` has zero comments and unexplained `x+24`/`y-12` offsets (line 40), `buildStarfield.ts` has only 2, and the "caller owns disposal" convention for `GalaxyLayerHandle`/`TitleHandle` is documented only in spirit with no single stated CONTRACT doc inside `src/lib/three`.

### Self-verification gates — 7.5

All five gates were independently re-run and pass clean: vitest (70 tests / 7 files), `astro check` (0 errors across 127 files), `eslint .`, `prettier --check`, and `astro build` (13 pages, exit 0). CI (`.github/workflows/ci.yml`) enforces four of them on every push and PR via `npm ci` + `.nvmrc`. The honest, scoped weakness: CI does not run the build despite `CLAUDE.md:55,62` mandating it, so a change that typechecks but breaks the Astro build would pass CI; and the entire Three.js layer (30 modules), all 3 GSAP timelines, all 21 `.astro` components, the 8-module terminal subsystem, and the `escapeHtml` HTML-injection boundary (`src/lib/utils/escapeHtml.ts`) are untested. Coverage is configured in `vitest.config.ts` but no `test:coverage` script or CI step ever invokes it, so coverage can erode silently.

### Decision & rationale capture — 7.0

All five ADRs follow a disciplined Context/Decision/Considered-alternatives/Consequences template with explicit "Rejected because" rationale and accurate code citations (ADR 0004's `BackgroundAudio.astro` line refs reproduce verbatim). Cross-links are real (0005 cites 0002; dated amendment at L216) and audit density is high (70/71 source-line refs resolve). The cap comes from front-door drift: the root `AUDIT.md` is undated in-file and both its critical findings are already fixed/relocated (`killTweensOf` is present at `projectsScene.ts:661`; the ring-leak finding points at code that now lives in `buildPlanet.ts`), so an agent landing at the root reads code that no longer exists. Three of five ADRs are referenced from no file outside `docs/decisions`, there is no index, and two parallel audit lineages carry no superseded banner.

### Automation & tooling — 7.5

The deterministic tooling is strong and self-verifiable: script rationale headers are dense (`render-audit-pdfs.mjs:2-17` documents the drift it prevents), portability guards are real (`build-skills-pdf.mjs:936-940`, `render-audit-pdfs.mjs:50-53`), and the Chrome locator is cross-platform with no puppeteer dependency (`chrome-pdf.mjs:11-35`). The agent-tripping coupling is concrete: a hardcoded Windows path `D:/koodaamista` appears across `skill-registry/SKILL.md`, `skill-localUpdate/SKILL.md`, and `README.md:108` while this checkout is `/Users/mikko/...` on darwin; 6 scripts have zero `package.json` references (undiscoverable via npm); CI never runs prebuild/renderers, so `build-og` PNGs can drift silently; and `skill-localUpdate` encodes a manual working-directory prerequisite that an agent cannot satisfy headlessly.

### Type safety & data contracts — 7.5

Compile-time discipline is exemplary: `tsconfig` extends `astro/tsconfigs/strict` plus 5 hardening flags including `noUncheckedIndexedAccess`, `npm run typecheck` passes 0/0/0 across 127 files, locale parity is compile-enforced via `export const en/fi/sv: Translations`, and there are zero suppression directives. Two real runtime/data-contract boundaries pull it back from 8.5+: `projectsData`/`timelineData` are open `Record<string, {...}>` rather than id literal-unions (`types.ts:122-129, 150-165`), so a misspelled per-locale id falls back to `''` with only a DEV-only `console.warn`; and external JSON is consumed via a blind `as SkillRegistry` cast (`skills.ts:92`) with no schema library in `package.json`. ESLint is non-type-aware with `no-explicit-any` set to `warn` not `error`, so the (well-followed) discipline is enforced by review, not CI.

### Machine-readable structured artifacts — 7.5

The artifacts are genuinely agent-consumable and durably tracked: a TS interface (`skills.ts:18-54`), a prose schema + invariants (`skill-registry/SKILL.md:154-193`), a prebuild-wired sync generator, 28/28 git-tracked verdict JSONs, self-describing calibration/usage snapshots, and an ld+json Person block (`HomePage.astro:40-90`). What holds it short of exemplary is the total absence of a machine-enforced contract: no `*.schema.json` anywhere, no ajv/zod dependency, and no test pins any artifact's shape — a malformed registry would only surface at runtime in the terminal. There is also live working-tree drift in `public/data/skills-registry.json` (sync and overlay are non-idempotent against each other), and the calibration/usage generators are off-repo, so a fresh-clone agent can read but not regenerate them.

### Security/ops agent docs — 5.5

The lowest axis, and correctly so. There is no `SECURITY.md`, no `docs/security`, and no single agent-facing security contract or threat model. CI runs no security checks (no `npm audit`, secret scan, dependabot, or CodeQL), no test asserts headers/CSP so the `vercel.json` invariants are unverified, and the README CSP block has drifted from `vercel.json` (missing directives and ingest hosts). There is no `CODEOWNERS` or `.env.example` to signal secret-vs-public env vars. (Note: the postcss advisory was already remediated via the `package.json:57` override; only devalue and two astro moderates remain.)

## Top 5 highest-leverage improvements

Ranked by impact / effort.

1. **Commit an `AGENTS.md` (and stop gitignoring the project contract).** Effort: **S.** Promote the load-bearing parts of the uncommitted `CLAUDE.md` — hard constraints (static-only, no Next/React/MUI, dispose-on-unload), build order, commit conventions, and the no-AI-refs rule — into a tracked `AGENTS.md`. This is the single biggest needle-mover: on a clean clone today an agent loses *all* stated project intent, so every later strength (legibility, ADRs, gates) is operating without the rules that justify it.

2. **Author a `SECURITY.md` + minimal threat model and wire one CI security check.** Effort: **M.** A short `SECURITY.md` (trust boundaries: `escapeHtml`→`innerHTML`, external skills-registry JSON, CSP/headers in `vercel.json`) plus a `.env.example` and an `npm audit`/dependabot step gives an agent a place to reason about security invariants before it edits the terminal or headers. Currently it has none — the lowest-scored dimension.

3. **Add tests for the cheapest-to-test critical logic: `escapeHtml`, the terminal subsystem, and locale/data contracts.** Effort: **M.** `escapeHtml.ts` is a real HTML-injection boundary feeding `innerHTML` from three terminal modules and has zero tests; the 8 terminal modules are pure-ish and cheaply testable; and a `timeline.test.ts` would give the open-`Record` typing the same runtime backstop `projects.test.ts` already provides. This converts the largest untested surface into something an agent can change with a safety net.

4. **Put the Astro build into CI.** Effort: **S.** `ci.yml` runs typecheck/format/lint/test but not `astro build`, despite `CLAUDE.md` mandating it before declaring a page done. A change that typechecks but breaks the static build passes CI today; adding the build step closes the one gap in an otherwise complete, fast gate suite and is a near-zero-effort, high-trust win.

5. **Fix the front-door doc drift: retire/date the stale root audits and reconcile the README.** Effort: **S–M.** Add a "superseded" banner (or delete) the undated root `AUDIT.md` whose two critical findings are already fixed/relocated, add a `docs/decisions/README.md` index linking all five ADRs, and patch the three README drifts (lib-tree subdirs, the `render:audit-pdfs` prebuild step, the missing `npm run lint`). This stops an agent from acting on dead findings or an incomplete command map — the cheapest correctness-per-edit improvements in the report.

## Method & caveats

- **Multi-agent, adversarially verified.** Each dimension was scored by an assessor and then independently re-checked by a separate verifier that re-ran gates, re-grepped claims, and disputed any overstated evidence (disputed claims are recorded per dimension above). Where the assessor erred it was generally conservative, not inflated.
- **Read-only and point-in-time.** This is a snapshot of the working tree on **2026-06-12**; no source was modified to produce the scores. The `public/data/skills-registry.json` drift noted in the artifacts dimension was a side-effect of running the build during assessment and has since been restored — the committed tree is clean. The underlying cause (the `sync` step and the measurement overlay are non-idempotent) remains a real, separate issue worth a follow-up.
- **Calibrated judgement, not a benchmark.** Scores are rubric-anchored expert judgement on a 0–10 scale, not the output of an automated metric. The weighted overall (7.3, grade B) was computed deterministically by the orchestrator from the per-dimension scores and weights and is not re-derived here.
- **"AI-first" scope.** The question throughout is operational: how readily an autonomous coding agent can orient, understand intent, make correct changes, and verify its own work in *this* repo with no human in the loop — not general code quality or visual polish.
