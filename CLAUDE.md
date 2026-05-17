# CLAUDE.md

Conventions for AI agents (Claude Code and friends) working in this repo. Skim this before opening anything — it's short on purpose.

## Working conventions

- **One worktree per PR.** Create at `.claude/worktrees/<short-name>` from `master`, branch off there, push, open a PR. Don't commit directly to `master`. The worktree pattern keeps the main checkout clean and lets multiple branches coexist.
- **No Anthropic attribution on commits or PRs.** Never add a `Co-Authored-By: Claude` trailer or a "Generated with Claude Code" PR footer. This is a hard preference.
- **PR title format**: `<type>(<scope>): <imperative>` — `feat(hero):`, `fix(projects):`, `chore(projects):`, `docs(readme):`. Match recent merged PR titles.
- **Translate locales last.** While iterating on user-facing copy, edit only `src/i18n/locales/en.ts`. Mirror to `fi.ts` and `sv.ts` once the English text is approved — translating every iteration is wasted work.
- **Prefer Sonnet for routine subtasks.** Delegate broad searches, formulaic edits, and lookups to Sonnet via the `Agent` tool. Reserve Opus for the parts that need it.
- **Confirm before destructive operations.** Don't `git checkout -- <file>`, `git reset --hard`, `git worktree remove --force`, or delete branches without asking. The user-authorized scope of "clear worktrees" doesn't extend to modified files in the main checkout.

## Code conventions

- **Comments explain *why*, not *what*.** Default is no comments. Add one when the WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. Don't reference the current task / fix / callers in comments — that belongs in the PR description.
- **Rule of three before refactoring.** Wait for the third duplicate before extracting a shared helper. `HeroVoiceover.astro` and `ProjectsVoiceover.astro` are intentionally duplicated; add a "PARALLEL TO" header comment in both so bug fixes get mirrored.
- **TypeScript strict + `noUncheckedIndexedAccess`.** Don't suppress with `as` / `!` unless the invariant is documented.
- **Don't bolt on test infra for a single fix.** If the repo has a test suite, use its existing patterns. If it doesn't yet, file the gap rather than spinning up a one-off harness.

## Project specifics

- **Static output only.** No SSR, no edge functions, no runtime secrets. The build must remain portable across static hosts.
- **Astro 5 + Three.js + GSAP + Tailwind v4.** Three.js scenes live in `src/lib/three/`; dynamically imported and skipped on small viewports / `prefers-reduced-motion`.
- **Audio orchestration is centralized.** `BackgroundAudio.astro` owns the music bed and dispatches `bg-audio:state` events that voice layers listen for. Locale-keyed audio files live in `public/audio/` (`voice-landing-{en|fi|sv}.mp3`, `voice-projects-{en|fi|sv}.mp3`). Missing locale files 404 silently — the `voice.play()` try/catch handles it.
- **`prefers-reduced-motion: reduce`** is honored by Three.js scenes (skipped entirely) and voiceover layers (suppressed). Music continues; toggling-on at runtime requires a reload.
- **Always run `npm run typecheck && npm run lint` before pushing.** CI gates on both plus `format:check`. Run `npm run format` if you've edited anything substantial.

## Where to look

- **Architecture decisions** → [`docs/decisions/`](docs/decisions/) (numbered ADRs).
- **Point-in-time audits** → [`docs/audits/`](docs/audits/).
- **High-level project tour** → [`README.md`](README.md).
- **Per-component rationale** → the doc-block at the top of each `.astro` / `.ts` file. They're verbose on purpose.
