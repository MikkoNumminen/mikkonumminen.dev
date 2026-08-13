# CLAUDE.md

Conventions for AI agents (Claude Code and friends) working in this repo. Skim this before opening anything — it's short on purpose.

## Hard rules (no interpretation)

These rules have been violated repeatedly. They are hard walls, not preferences. If you find yourself reasoning around them, stop.

- **Never merge a PR without an explicit, fresh per-PR approval.** `gh pr merge` requires the user, in this conversation, to have typed the literal word "merge" tied to the specific PR number, **against that PR's current HEAD**. Force-push, rebase, an additional commit, or conflict-resolution that introduces code all reset the approval clock — the previous "merge" no longer applies. Compound commands like "merge and X", "fix all", "ship it", "its green now", "looks good", or `/review`-approved verdicts are NOT merge authorizations. If you cannot point at a user message containing the PR number AND a merge verb addressed to the PR's current state, **ASK**. Format: `"Merge PR #N now, or wait?"`. Asking is cheap; the unauthorized merge is not recoverable.

- **Announce every PR creation clearly.** When you invoke `gh pr create`, the next message to the user MUST lead with `**PR #N opened**: <url>` followed by a one-line summary, and MUST end with the literal phrase `Not merging — waiting for your word.` Never bury the link in prose. The user can only give the explicit approval the rule above requires if they see the PR exists and that you are stopped.

## Working conventions

- **One worktree per PR.** Create at `.claude/worktrees/<short-name>` from `master`, branch off there, push, open a PR. Don't commit directly to `master`. The worktree pattern keeps the main checkout clean and lets multiple branches coexist.
- **Never attribute a commit or PR to Claude.** No `Co-Authored-By: Claude`
  trailer, no "Generated with Claude Code" footer, no mention of the assistant
  in a commit message, PR title or PR body. This is about AUTHORSHIP, not
  secrecy: the AI-assisted development is documented openly in the README, the
  ADRs and a published skills catalog. What this repository will not do is
  enter Claude as an author in git metadata or as a contributor on GitHub, and
  a `Co-Authored-By` trailer is exactly what GitHub reads to build that list.
- **PR title format**: `<type>(<scope>): <imperative>` — `feat(hero):`, `fix(projects):`, `chore(projects):`, `docs(readme):`. Match recent merged PR titles.
- **Translate locales last.** While iterating on user-facing copy, edit only `src/i18n/locales/en.ts`. Mirror to `fi.ts` once the English text is approved (Swedish was removed in 2026-08) — translating every iteration is wasted work.
- **Delegate routine subtasks to the cost-routing agents (`~/.claude/agents/`) instead of doing them inline.** Bright-line triggers, not a preference: a Grep/Read fan-out across 3+ files → `scout`; the same edit repeated across 3+ files, or an already-specified mechanical change + its verify → `mechanic`; a formatter/lint pass → `tidy`; writing tests in an existing pattern → `test-writer`; extracting/aggregating log/JSONL/CSV → `log-miner`; drafting a commit/PR body from a diff → `scribe`. Each agent is pinned to the cheapest model **and** effort for its job, so delegating a mechanical task is strictly cheaper than running it in this session — the win holds even at high session effort. Keep on the main (Opus) session — or `architect` when it needs a written plan first — only the correctness-critical logic (auth, RAG containment, concurrency) and deciding the *shape* of the work.
- **Confirm before destructive operations.** Don't `git checkout -- <file>`, `git reset --hard`, `git worktree remove --force`, or delete branches without asking. The user-authorized scope of "clear worktrees" doesn't extend to modified files in the main checkout.

## Code conventions

- **Comments explain *why*, not *what*.** Default is no comments. Add one when the WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. Don't reference the current task / fix / callers in comments — that belongs in the PR description.
- **Rule of three before refactoring.** Wait for the third duplicate before extracting a shared helper. `HeroVoiceover.astro` and `ProjectsVoiceover.astro` are intentionally duplicated; add a "PARALLEL TO" header comment in both so bug fixes get mirrored.
- **TypeScript strict + `noUncheckedIndexedAccess`.** Don't suppress with `as` / `!` unless the invariant is documented.
- **Don't bolt on test infra for a single fix.** If the repo has a test suite, use its existing patterns. If it doesn't yet, file the gap rather than spinning up a one-off harness.

## Project specifics

- **Static output only.** No SSR, no edge functions, no runtime secrets. The build must remain portable across static hosts.
- **Astro 7 + Three.js + GSAP + Tailwind v4.** Three.js scenes live in `src/lib/three/`; dynamically imported and skipped on small viewports / `prefers-reduced-motion`.
- **Audio orchestration is centralized.** `BackgroundAudio.astro` owns the music bed and dispatches `bg-audio:state` events that voice layers listen for. Locale-keyed audio files live in `public/audio/` (`voice-landing-{en|fi|sv}.mp3`, `voice-projects-{en|fi|sv}.mp3`), and blog narration in `public/audio/blog/<slug>-<locale>.mp3` keyed by entry as well as locale, gated by the required `hasAudio` frontmatter flag. Missing locale files 404 silently — the `voice.play()` try/catch handles it.
- **`prefers-reduced-motion: reduce`** is honored by Three.js scenes (skipped entirely) and voiceover layers (suppressed). Music continues; toggling-on at runtime requires a reload.
- **Always run `npm run typecheck && npm run lint` before pushing.** CI gates on both plus `format:check`. Run `npm run format` if you've edited anything substantial.

## Where to look

- **Facts about the projects** (stacks, test counts, which sibling repos are the
  same project) → [`docs/portfolio-facts.md`](docs/portfolio-facts.md). Read it
  before re-deriving anything from the other repositories, and before quoting a
  measured number anywhere durable.
- **Architecture decisions** → [`docs/decisions/`](docs/decisions/) (numbered ADRs).
- **Point-in-time audits** → [`docs/audits/`](docs/audits/).
- **High-level project tour** → [`README.md`](README.md).
- **Per-component rationale** → the doc-block at the top of each `.astro` / `.ts` file. They're verbose on purpose.
