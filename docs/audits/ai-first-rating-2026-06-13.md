# AI-First Rating (re-rate) — mikkonumminen.dev

> **⚠️ Superseded by [ai-first-rating-2026-06-14.md](ai-first-rating-2026-06-14.md).**
> The gaps below were acted on in the push-to-9 campaign (#231–244). Kept for history.

**2026-06-13 · Overall: 8.4/10 (B+) — up from 7.3/10 (B) on 2026-06-12**

> A focused remediation pass (PRs #212–223) closed the gaps the [2026-06-12 rating](ai-first-rating-2026-06-12.md) surfaced. The weakest dimension — security/ops docs — rose the most (5.5 → 8.5), and onboarding cleared its headline gap (a clean clone now gets a committed contract). The visual layer (Three.js / GSAP) remains the largest untested surface and is the main thing still holding the score below an A.

## Scorecard

| Dimension | Weight | Prior | Now | Δ | Note |
| --- | ---: | ---: | ---: | ---: | --- |
| Code legibility | 18% | 8.7 | 8.7 | — | Already strong; gained a code-level security marker |
| Self-verification gates | 16% | 7.5 | 8.3 | +0.8 | +44 tests; build now in CI; visual layer still untested |
| Agent onboarding & navigation | 18% | 6.5 | 8.5 | +2.0 | `AGENTS.md` committed; README drift fixed |
| Decision & rationale capture | 12% | 7.0 | 8.3 | +1.3 | ADR index; stale root audit retired |
| Automation & tooling | 12% | 7.5 | 8.0 | +0.5 | Dependabot; prebuild no longer clobbers the registry |
| Type safety & data contracts | 10% | 7.5 | 8.3 | +0.8 | Runtime registry guard replaces the blind cast |
| Machine-readable artifacts | 7% | 7.5 | 8.3 | +0.8 | Registry now canonical + runtime-validated |
| Security/ops agent docs | 7% | 5.5 | 8.5 | +3.0 | `SECURITY.md`, threat model, Dependabot, invariant marker |
| **Weighted overall** | **100%** | **7.3** | **8.4** | **+1.1** | **B → B+** |

## Dimension detail

### Agent onboarding & navigation — 6.5 → 8.5
The headline gap is closed: [`AGENTS.md`](../../AGENTS.md) is now a committed contract (hard constraints, build order, commit conventions, commands), so a fresh clone no longer loses all project intent when the gitignored `CLAUDE.md` is absent (#212). The README drifts the prior pass flagged are fixed — the `src/lib` tree lists all 10 subdirs, `npm run lint` is in the command list, and the CSP block matches `vercel.json` (#220). Remaining: still no `CONTRIBUTING.md`, and `CLAUDE.md` stays local-only by design.

### Code legibility — 8.7 → 8.7
Already the strongest axis; unchanged in substance. Net positive: a `SECURITY INVARIANT` marker now sits on [`escapeHtml`](../../src/lib/utils/escapeHtml.ts), the one HTML-injection boundary (#215) — the code-level marker the prior pass found missing. The narrow gaps it noted (a couple of uncommented helpers, no single CONTRACT doc in `src/lib/three`) remain, so the score holds rather than climbs.

### Self-verification gates — 7.5 → 8.3
CI now runs `npm run build` (#212), closing the "a change that typechecks but breaks the build passes CI" gap. The suite grew 70 → **114** (#214, #223): the `escapeHtml` boundary, the terminal `History`/`tokenize`/`tabComplete`/command surface, the `timeline` data contract, and the new registry guard. What keeps it below ~9: the Three.js scenes, GSAP timelines, and `.astro` components still have no DOM/render/visual tests — the largest untested surface, and the one most likely to regress.

### Decision & rationale capture — 7.0 → 8.3
The front-door drift is gone: the undated root `AUDIT.md` (whose "critical" findings were already fixed) moved to [`docs/audits/AUDIT-2026-04-08.md`](AUDIT-2026-04-08.md) with a superseded banner, and [`docs/decisions/README.md`](../decisions/README.md) now indexes all five ADRs (#220). Load-bearing constraints are now also in committed `AGENTS.md`, not only the gitignored guide.

### Automation & tooling — 7.5 → 8.0
[`.github/dependabot.yml`](../../.github/dependabot.yml) adds weekly npm + actions update/advisory PRs (#215), and `prebuild` no longer overwrites the overlay-enriched registry on every build (#213). The drag the prior pass named persists: hardcoded `D:/koodaamista` Windows paths in some skill tooling, and a few scripts unreferenced from `package.json`.

### Type safety & data contracts — 7.5 → 8.3
The blind `as SkillRegistry` cast on runtime-fetched JSON is replaced by a dependency-free [`parseRegistry()`](../../src/lib/terminal/skills.ts) shape-guard with 8 tests (#223), and the toolchain is on TypeScript 6 with a clean typecheck (#221). The `projects`/`timeline` open `Record` typings remain, but `timeline` now has the same runtime test backstop `projects` had.

### Machine-readable artifacts — 7.5 → 8.3
`public/data/skills-registry.json` is now canonical and committed (no longer silently downgraded at build time) and is validated at the fetch boundary. Still no formal `*.schema.json` — the guard is the contract — and the calibration generators remain off-repo.

### Security/ops agent docs — 5.5 → 8.5
The biggest mover. From nothing to [`SECURITY.md`](../../SECURITY.md), [`docs/security/threat-model.md`](../security/threat-model.md) (trust boundaries, invariants, CSP, per-advisory reachability), Dependabot, and a code-level invariant marker (#215). The Astro 5→6 upgrade (#222) cleared the two Astro-native high advisories; the residual `npm audit` highs all reduce to one unfixable, dev-only esbuild pair, documented and accepted. Remaining: no hard CI security gate beyond Dependabot, and no `CODEOWNERS`.

## What moved the score

| PR | Change | Dimension(s) |
| --- | --- | --- |
| #212 | `AGENTS.md` + `npm run build` in CI | onboarding, verifiability |
| #213 | Stop prebuild clobbering the enriched registry | automation, machine-data |
| #214 | +36 tests (escapeHtml, terminal, timeline) | verifiability |
| #215 | `SECURITY.md`, threat model, Dependabot, invariant marker | security/ops, legibility |
| #220 | ADR index, retire stale audit, README drift | rationale, onboarding |
| #221 | Dev-tooling majors (eslint 10, TS 6, vitest 4) | automation |
| #222 | Astro 6 + Node 22 (clears Astro-native advisories) | security/ops, automation |
| #223 | Runtime registry shape-guard + tests | type-safety, verifiability |

## Remaining gaps (what would lift it toward an A)

1. **Test the visual layer.** Three.js scenes, GSAP timelines, and `.astro` components have no tests. Even dispose-assertion / smoke tests would close the biggest verification blind spot — the heaviest single drag at the 16% verifiability weight.
2. **De-Windows the tooling.** Hardcoded `D:/koodaamista` paths in skill scripts can't run on a macOS/Linux agent.
3. **A real CI security gate.** Dependabot is proactive but advisory-only; a `CODEOWNERS` and a (non-flaky) audit gate would harden the lowest-historical dimension further.
4. **Registry staleness.** The committed registry is now canonical, but goes stale if `/skill-localUpdate` isn't run after a new scan — a freshness check could guard it.

## Method & caveats

- **Calibrated self-assessment, same rubric and weights.** Unlike the 2026-06-12 baseline — an independent multi-agent panel with adversarial verification — this re-rate was produced by the agent that implemented the changes. The multi-agent re-run was attempted twice and failed both times on infrastructure limits (a session cap, then a multi-hour agent stall), so this is a calibrated judgement grounded in the merged, gate-verified diffs rather than a fresh independent measurement. It therefore carries more self-assessment bias risk than the baseline; treat the dimension scores as the implementer's honest estimate, and re-run the independent panel when infrastructure allows for a clean confirmation.
- **Same scale and weights** as the baseline (recomputed: the prior dimension scores still weight to exactly 7.3), so the +1.1 delta is apples-to-apples.
- **Point-in-time 2026-06-13**, current `master`, read-only. Every dimension claim maps to a merged PR verified green in CI (typecheck/lint/format/test/build) this session.
- **Not browser-verified.** The Astro 6 upgrade passed all gates and built cleanly, but the WebGL/GSAP visual experience was not QA'd in a browser (the Vercel preview is auth-walled); a visual once-over of the four worlds is still recommended.
