# README drift report — 2026-07-24

## Summary

- README audited: `README.md` (at commit `4056085`)
- Trigger: PRs #406 (unified particle field replaces the hero scene) and #407 (goat bleat) merged to master
- Total drifts: 9 (stale: 6, missing: 2, flagged: 1)
- Rewrites applied: 7
- Rewrites skipped (voice/shape match unattainable): 1
- Voice profile: `docs/audits/readme-drift-scratch.md` (cached: yes — README head unchanged since profile commit `1b2fa55`)

## Findings

### Stale claims (rewritten)

| Axis | README claim | Reality | Section rewritten | Voice-match attempts |
| --- | --- | --- | --- | --- |
| feature | "3D name in WebGL" (line 11) | the extruded TextGeometry title was deleted in #406; the name is now formed by the particle field itself | "The four pages" | 1 |
| file-structure | `home/ Home-scene building blocks (galaxy, starfield, title)` (line 175) | `src/lib/home/` contains `dataFeedConsole.ts` + `commitPopups.ts`; the galaxy/starfield/name generators live in `src/lib/three/field/` | "Project structure" | 1 |
| feature | "All Three.js resources are explicitly disposed on `beforeunload`" (line 221) | disposal runs on client-side navigation via the `onRoute` lifecycle (`astro:before-swap`), not `beforeunload` — and has for some time | "Performance & accessibility" | 1 |
| status | "Astro 6" (line 141) | `package.json` has `astro: ^7.1.3` | "Local development" | 1 |
| file-structure | `public/` enumeration includes "fonts" (line 187) | `public/fonts/` holds only a LICENSE — the helvetiker typeface was deleted in #406 | "Project structure" | 1 |
| status | `npm test` "(i18n + project data)" (line 157) | the Vitest suite spans `src/` (field generators, gsap, home, i18n, data) plus `scripts/` `*.test.mjs` | "Local development" | 1 |

### Missing additions (added)

| Axis | Added | Section | Voice-match attempts |
| --- | --- | --- | --- |
| dependency | `postprocessing` (pmndrs, `^6.39.3`) — runtime dep added in #406 for the home field's bloom | "Tech stack" | 1 |

### Skipped (voice/shape match unattainable)

| Axis | Drift | Section | Reason |
| --- | --- | --- | --- |
| skill | `rag-audit`, `rag-backend`, `rag-experiment` exist under `.claude/skills/` but are absent from "Skills shipped in this repo" (which reads as an enumeration: "the four skills above") | "AI tooling" | adjacent entries are multi-paragraph with measured token-economics receipts; matching that shape would require fabricating figures. Recommend a manual decision: either add hand-written entries with real receipts, or reword the section opener so it doesn't imply completeness. |

### Unverifiable claims (flagged, not touched)

| Claim | Why unverifiable | Suggested action |
| --- | --- | --- |
| Token-economics figures in "AI tooling" (~140K/run, ~$0.80, "2 runs", etc.) | historical measured receipts tied to dated runs — immune per the dated-claims rule | none; they are receipts, not current-state claims |
| `vercel.json` still ships a `/fonts/` long-cache rule (README line 258 describes it accurately) | config is real but now vestigial (folder empty) | optionally drop the rule from `vercel.json` in a housekeeping commit; README follows the config either way |
