# AI-readiness audit, 2026-05-17

Scope: evaluate how prepared this repository is for AI agents (Claude Code and equivalents) to do useful work in it, and capture the roadmap to close the gap.

Two dimensions, scored 1–10:

- **Documentation**: how well a fresh agent can pick up the codebase from rest.
- **Power**: tooling, harness, and verification surfaces that let an agent move fast without breaking things.

## 0. Baseline (before)

| Dimension | Score |
| --- | --- |
| Documentation | **8 / 10** |
| Power | **6 / 10** |
| **Average** | **7 / 10** |

### Documentation strengths

- High-quality inline comments throughout the audio + scene layers. `BackgroundAudio.astro`, `HeroVoiceover.astro`, `projectsScene.ts` each carry 15–20 % comment lines that explain *why*: past bugs, race conditions, browser quirks, constraints. A new collaborator (human or AI) can pick up cold.
- `README.md` covers pages, languages, audio, tech stack, structure, perf/a11y, observability, deployment, security.
- ADR framework present at [`docs/decisions/0001-observability-sentry.md`](../decisions/0001-observability-sentry.md). Pattern set, light usage so far.
- Dated point-in-time audits at [`docs/audits/`](.).
- Baseline scaffolding solid: `.editorconfig`, `.nvmrc`, `.prettierignore`, `.git-blame-ignore-revs`.

### Documentation gaps

- **No `CLAUDE.md` / `AGENTS.md` at root.** Every new session re-learns the worktree-per-PR workflow, the "no Anthropic attribution" preference, the rule-of-three convention.
- `AUDIT.md` / `AUDIT-2026-05-07.md` sit at the repo root rather than in [`docs/audits/`](.), so they are less discoverable.
- Only one ADR; decisions like "static output only", "manual loop crossfade vs `<audio loop>`", "rule of three before refactoring" are implicit.
- No `CONTRIBUTING.md` / `CHANGELOG.md` (acceptable for a solo repo, noted for completeness).

### Power strengths

- TypeScript strict + `noUncheckedIndexedAccess`.
- Prettier + ESLint with both `:check` and `:fix` scripts; `astro check` typecheck.
- CI ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) gates on lint + format.
- Git worktree workflow adopted, so multiple branches coexist without checkout thrash.
- `.git-blame-ignore-revs` so format passes don't pollute blame.

### Power gaps

- **Zero automated tests.** `find . -name '*.test.*'` returns nothing. Every behavior change relies on manual browser verification. Recent PRs (#77 / #78 / #80) chased audio race conditions that an integration test would have caught the first time.
- **No `.claude/settings.json`.** Every `git push`, `gh pr merge`, `git worktree remove --force` triggers a permission prompt. Tight, project-tuned allowlist would cut friction.
- **No `.claude/skills/`** for project workflows (e.g. `/new-worktree`).
- **No `npm test` script** in `package.json`.
- Conventions live in the user's global Claude memory but aren't visible to teammates or to a fresh session for someone else.

## 1. Roadmap

Four highest-leverage improvements, ranked.

| # | Action | Estimated effort | Bumps |
| --- | --- | --- | --- |
| 1 | Add `CLAUDE.md` at root documenting working + code conventions | ~15 min | Docs 8 → 9 |
| 2 | Add `.claude/settings.json` with a tight allowlist (`Bash(npm run *)`, `Bash(git push:*)`, `Bash(gh pr *)`, `Bash(git worktree *)`) | ~10 min | Power 6 → 7 |
| 3 | Add a minimal Vitest suite, ~5 tests over the audio state machine + planet-orbit invariants | ~3 h | Power 7 → 9 |
| 4 | Write 2–3 more ADRs: `static-output-only`, `astro-over-nextjs`, `manual-audio-crossfade` | ~30 min each | Docs 9 → 10 |

## 2. Projected target state (after)

| Dimension | Before | After |
| --- | --- | --- |
| Documentation | 8 / 10 | **10 / 10** |
| Power | 6 / 10 | **9 / 10** |
| **Average** | 7 / 10 | **9.5 / 10** |

Total realistic effort: about a half-day, dominated by the test-suite item.

## 3. Status

| # | Action | Status |
| --- | --- | --- |
| 1 | Add `CLAUDE.md` | **Done** |
| 2 | Add `.claude/settings.json` allowlist | **Done** |
| 3 | Add a Vitest test suite | **Done** |
| 4 | Write 2–3 more ADRs | **Done** |

All four closed, verified 2026-08-14: `CLAUDE.md` and `.claude/settings.json`
are both tracked in this repository, the suite runs 816 tests across 81 files,
and the ADRs run to 0018. The "zero automated tests" finding above was true on
2026-05-17 and is the starting point that number should be read against.

Items 2–4 are tracked in Claude's per-project memory (outside the repo, in `~/.claude/projects/...`) so the roadmap survives across sessions.
