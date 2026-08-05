# README drift report: 2026-05-26

## Summary

- README audited: `README.md` (at commit `1b2fa55295f89f28e486e8a1fcb48e58c6a63b64`)
- Total drifts: 3 (stale: 0, missing: 2, unverifiable: 1)
- Rewrites applied: 0 (task scope: drift detection only, no README edits)
- Rewrites skipped (voice match failed): 0
- Voice profile: `docs/audits/readme-drift-scratch.md` (cached: yes, first ~500 chars unchanged since 2026-05-26 extraction at this same commit)

## Scope note

Task asked for the drift report only, not the working-tree README edit. Findings below are detection-only: the README is not modified by this run. Severity defaults applied; calibration rules respected (aspirational, quoted, dated claims immune).

## Findings

### Stale claims (none)

Every file path, script name, ADR reference, skill name, dependency, and verifiable status claim in the README resolved cleanly against the repo. No stale references found.

| Axis | README claim | Reality | Verdict |
| --- | --- | --- | --- |
| _none_ | | | |

### Missing additions

| # | Axis | Added | Location in README | Severity | Suggested edit pattern |
| --- | --- | --- | --- | --- | --- |
| 1 | file-structure | `scripts/apply-measurement-overlay.mjs` is missing from the "Project structure" code block at lines 81–89, but is **named in the README body** (line 112, under `/skill-localUpdate` step 3: `node scripts/apply-measurement-overlay.mjs`). The README contradicts itself, the body says the script exists at that path, the structure block enumerates `scripts/` without it. | Lines 81–89 (`scripts/` enumeration inside the project-structure code block) | **major** (self-contradicting README) | Append one line to the `scripts/` enumeration, after the `build-pdf.mjs` row, before the `lib/` row, in the same two-column shape: `  apply-measurement-overlay.mjs  Merge measured token usage into the registry; dedupes library-canonical skills` (or similar one-liner in the README's existing voice, phrasing should match the adjacent rows' "verb-object" pattern: "Copy latest…", "Bespoke HTML…", "Generic HTML → PDF CLI…"). |
| 2 | feature | `npm run lint` (and the secondary `npm run lint:fix`) is in `package.json` and is gated by CI (per `CLAUDE.md`: "Always run `npm run typecheck && npm run lint` before pushing. CI gates on both plus `format:check`"), but is absent from the README's "Local development" command block at lines 44–57. The block lists `typecheck`, `format`, `format:check`, `test`, `test:watch`, `lint` is the obvious peer that's missing. | Lines 44–57 (the code block under "## Local development") | **minor**, leaning **major** because CI gates on it and a contributor following only the README will be missing the lint step | Append two lines to the code block, after `format:check` (since they're peers): `npm run lint            # eslint .` and `npm run lint:fix        # eslint . --fix`, matching the indentation and trailing-comment style of adjacent lines (two-space alignment, lowercase, no period). |

#### Notes on detection of finding #1

The script `apply-measurement-overlay.mjs` exists at `d:/koodaamista/mikkonumminen.dev/scripts/apply-measurement-overlay.mjs` (verified via `Glob` + `Read`). The README's project-structure code block enumerates every other current sibling under `scripts/` (`build-og.mjs`, `sync-skill-registry.mjs`, `build-skills-pdf.mjs`, `build-pdf.mjs`, and the `lib/` subdir), but omits this one. Since the enumeration is comprehensive for the five files it does list, the omission reads as a stale enumeration, not selective documentation.

A second sub-issue in the same block: `scripts/lib/skills-pdf.css` exists on disk but isn't in the `lib/` enumeration (which lists `chrome-pdf.mjs` and `escape.mjs`). Severity **trivial**: `lib/` is described at the granularity of "shared helpers" and a CSS asset isn't a helper module. **Do not flag** for rewrite; mentioned only for completeness.

#### Notes on detection of finding #2

`package.json` defines:

```
"lint": "eslint .",
"lint:fix": "eslint . --fix",
```

`CLAUDE.md` at the repo root (lines 50–51 in the version at this commit) reads: "**Always run `npm run typecheck && npm run lint` before pushing.** CI gates on both plus `format:check`." The README's `Local development` block lists `typecheck`, `format`, `format:check`, `test`, `test:watch` but not `lint`. A new contributor reading only the README would skip `lint` and hit CI failure on their first push. The README is the contributor's first stop; the omission is a real footgun.

`npm start` (alias for `astro dev`) and `npm run astro` are also in `package.json` but absent from the README, **not flagged**, they're trivial pass-throughs and not CI-gated.

### Skipped (voice match failed twice)

| Axis | Drift | Section | Reason |
| --- | --- | --- | --- |
| _none_ | | | |

No rewrites were attempted in this run (task scope: detection only). If the human invokes rewrites in a follow-up, the voice profile at `docs/audits/readme-drift-scratch.md` applies.

### Unverifiable claims (flagged, not touched)

| # | Claim | Location | Why unverifiable | Suggested action |
| --- | --- | --- | --- | --- |
| 1 | `/sync-readmes` "**Results to date** (2 runs): 15 factually wrong copy fixes across three locales (test counts, engine counts, normalization-pass counts), 14 missing tech tags across 5 projects, 4 cross-project link gaps caught." | Line 107 | Historical / cumulative metric, depends on the user's actual `gh pr list` history for the sync-readmes skill, which is not visible from inside the repo. Was true at the timestamp it was written; may have grown since. | Per calibration rule "dated claims keep the date": consider adding a parenthetical timestamp ("as of 2026-05-XX") if not already accurate at last write, or leave alone. |
| 2 | All token-economics figures: "~140K Sonnet input", "~10K kept on the orchestrator's main context", "~45s parallel wall-clock", "~$0.80 in API spend", "~80K Sonnet input across 3 parallel sub-agents", "~25K end to end", "~80K dominated by step 2's parallel sub-agents", "~30–60s wall-clock". | Lines 106, 109, 111, 113 | These are author estimates / single-run measurements baked into prose. Some are flagged in the README itself as "author estimate" (line 120) vs "measured" (line 117), so the README is already honest about the editorial grade. The numbers themselves can only be re-verified by re-measuring. | None. The README's existing "editorial vs measured" disclaimer at lines 115–120 handles this responsibly. Re-measure during the next `/mikko-skill-usage` run and update if the editorial values drift more than ~20%. |
| 3 | "deployed to Vercel ... Deploys are automatic on every push to `master`." | Lines 132, 138 | External deploy state, can't verify from inside the repo. Vercel project config not committed (it lives in the Vercel dashboard). | None, `vercel.json` exists in the repo and matches the CSP and headers claims, which is the verifiable part. |

Unverifiable #2 is the largest cluster but the README is already self-aware about it, no action needed.

## Axes that ran clean

| Axis | Verdict | Notes |
| --- | --- | --- |
| file-structure-drift | 1 missing addition (finding #1 above) | All other paths verified: `LICENSE`, `vercel.json`, `.nvmrc`, `docs/decisions/0001-*.md`, `docs/decisions/0005-*.md`, `src/lib/observability/initObservability.ts`, `public/data/`, `public/audio/`, `.claude/agent-verdicts/*` (all four referenced verdict/registry files exist), `.claude/skills/skill-localUpdate/SKILL.md`, `scripts/*.mjs` (except finding #1), `scripts/lib/*.mjs`. README's selective enumeration of `src/lib/` subdirs (only `three`, `gsap`, `terminal`, `transitions` listed; actual has 10+) reads as illustrative not exhaustive, not flagged. |
| dependency-drift | NO HITS | `package.json` deps match the README's "Tech stack" claims exactly: `astro` ^5.18.1, `three` ^0.183.2, `gsap` ^3.14.2, `tailwindcss` ^4.2.2, `typescript` ^5.9.3 (devDep, strict + `noUncheckedIndexedAccess` enabled in `tsconfig`). The Observability section's `@sentry/astro` ^10.51.0 and `web-vitals` ^5.2.0 are both present. No deps named in README are missing from the manifest; no deps in the manifest are claimed-but-absent. |
| skill-drift | NO HITS | `.claude/skills/` contains exactly the four directories the README enumerates under "Skills shipped in this repo": `sync-readmes`, `skill-registry`, `md-to-pdf`, `skill-localUpdate`. Names and descriptions line up with each `SKILL.md` frontmatter. |
| feature-drift | 1 missing addition (finding #2 above) | Every README-documented npm script exists in `package.json` and runs the documented binary. The `prebuild` automation claim (line 61: "`prebuild` runs `sync:skills-registry && build:skills-pdf` automatically on every `npm run build`") is verified, `package.json` line 19 confirms exact command. Terminal commands referenced in the body (`help`, `skills`, `download --skills`) exist in `src/lib/terminal/commands.ts` at lines 25, 177, 100. |
| status-drift | NO HITS | README claims "Node 20+", `.nvmrc` says `20`, `package.json` `engines.node` says `"^20.3.0 || ^22.0.0"`. Both consistent with "20+". No version badges, no test-count claims, no coverage claims to verify. `vercel.json` CSP directives at lines 145–155 of the README match the file byte-for-byte in `vercel.json`. |

## What this report does NOT cover

- **Non-EN locales.** README is English-only; no FI/SV side-by-side. Locale audit not applicable here: the i18n dictionaries under `src/i18n/locales/` translate the *site*, not the *README*.
- **The two `AUDIT-*.md` files at repo root.** They're not mentioned in the README and are pre-existing artifacts. Not in scope.
- **Per-component doc-block accuracy** (e.g. comments inside `BackgroundAudio.astro`). Out of scope. This skill only audits `README.md`.

## Recommendation

Two low-cost edits resolve all actionable drift:

1. Add `apply-measurement-overlay.mjs` to the `scripts/` enumeration in the project-structure code block (lines 81–89).
2. Add `npm run lint` and `npm run lint:fix` to the "Local development" code block (lines 44–57).

Both are mechanical additions in the README's existing format. A follow-up invocation of `readme-drift-sync` with rewrite scope (or a hand-edit) would close the gap. The voice profile at `docs/audits/readme-drift-scratch.md` covers the voice constraints for both edits: the surrounding lines provide clean templates.

Unverifiable claims should be left alone; the README is already explicit about editorial vs measured grades.
