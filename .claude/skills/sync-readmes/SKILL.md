---
name: sync-readmes
description: Audit project data against sibling repos' READMEs and open a PR with drift corrections. Runs parallel Sonnet diff agents (one per sibling repo), synthesizes drift, applies en+fi+sv corrections plus tech-list updates, and lands a PR for review on GitHub.
---

# README sync skill

Detect drift between the portfolio's project data and the canonical READMEs of the sibling repos those projects come from. Open a PR for the maintainer to review on GitHub.

## What this skill does

1. Reads [src/data/projects.ts](src/data/projects.ts) to discover sibling repos.
2. Spawns one parallel Sonnet agent per repo to diff its README against current portfolio data.
3. Synthesizes the structured drift reports.
4. Creates a worktree, applies edits to `projects.ts` + `en.ts` + `fi.ts` + `sv.ts`, runs CI checks, opens a PR.
5. Returns the PR URL. The maintainer reviews on GitHub.

End-to-end with no pauses. If nothing meaningful drifted, no PR is opened — just report "no drift."

## Scope

**Repos audited:** Every `Project` in `src/data/projects.ts` whose `githubUrl` matches `https://github.com/MikkoNumminen/*`, **excluding `id: 'portfolio'`** (this site is its own README, audited separately).

**Files edited:**

- [src/data/projects.ts](src/data/projects.ts) — `tech` arrays, `externalApis`, `status`
- [src/i18n/locales/en.ts](src/i18n/locales/en.ts), [fi.ts](src/i18n/locales/fi.ts), [sv.ts](src/i18n/locales/sv.ts) — `projectsData[id]` (`tagline`, `description`, `highlights`)

**NOT in scope (v1):** `timelineData`, `src/lib/terminal/commands.ts`, `src/lib/timeline/linkify.ts`, portfolio's own `README.md`. A v2 of this skill could add a grep pass for each project's `id` and `name` across `src/**` to surface stale mentions in those locations.

## Procedure

### 1. Discover repos

Read `src/data/projects.ts`. For each `Project` entry with `githubUrl` matching `https://github.com/MikkoNumminen/*` and `id !== 'portfolio'`, capture:

- `id`, `name`, `githubUrl`, `tech[]`, `externalApis[]` (if present), `status`, `liveUrl` (if present)
- Corresponding `projectsData[id]` from `en.ts`: `tagline`, `description`, `highlights[]` (if present)

### 2. Spawn parallel Sonnet diff agents

One `Agent` tool call per repo. **All in the same message** so they run in parallel. Use `subagent_type: "general-purpose"`, `model: "sonnet"`, `run_in_background: true`. Prompt template below — substitute the data captured in step 1.

### 3. Wait for completion

Each agent posts a `task-notification` when done. Do not poll; the harness re-invokes you.

### 4. Synthesize

Read each agent's structured report. Apply these rules:

**Apply:**

- Factual corrections (test counts, version numbers in prose, pass counts, engine counts) — always, regardless of CONFIDENCE
- Tech-list additions when README clearly lists the dep as headline tech
- `description` / `highlights` rewrites when `CONFIDENCE: high` and the change is non-cosmetic
- `STATUS_DRIFT` changes when justified (e.g., archived now → archived)
- Cross-project link gaps (e.g., "X also scores Y" if true per the README)

**Reject:**

- Version-number additions to tech arrays — portfolio convention is unversioned (`Next.js`, never `Next.js 15`)
- `EXTERNAL_APIS_DRIFT.remove` for auth providers when other projects keep them listed — convention is to list Google/GitHub OAuth under `externalApis`
- Micro-deps in `tech[]` (testing-helper libs, format-parsing libs that don't define a product feature) unless agent's NOTES explicitly justifies
- Tagline rewrites unless the current tagline is **factually misleading** (not just stylistically off)
- Cosmetic re-wordings of an otherwise-accurate description

**If synthesis yields zero applicable changes:** Report "no drift detected across all N repos" and exit. Do not open a PR.

### 5. Worktree + branch

```bash
DATE=$(date +%Y-%m-%d)
git worktree add .claude/worktrees/sync-readme-drift-$DATE -b sync/readme-drift-$DATE master
cd .claude/worktrees/sync-readme-drift-$DATE
npm ci  # only if node_modules missing
```

### 6. Apply edits

For each project with applicable drift:

- Update `projects.ts` entry (`tech` array, `externalApis`, `status`).
- Update `en.ts` `projectsData[id]` (`description`, `highlights`, `tagline`).
- **Mirror factual corrections to `fi.ts` and `sv.ts`.** Mechanical fact swaps (numerals, engine counts, version mentions) are safe. New sentences need proper translation — match the existing fi/sv prose tone in the same entry. The maintainer reviews fi/sv prose on the PR.

### 7. CI checks (in worktree)

```bash
npm run typecheck
npm run lint
npx prettier --check src/data/projects.ts src/i18n/locales/en.ts src/i18n/locales/fi.ts src/i18n/locales/sv.ts
# Format-fix if needed:
npx prettier --write <changed files>
```

If any check fails non-trivially, abort and report — do not commit broken code.

### 8. Commit + push

```bash
git add src/data/projects.ts src/i18n/locales/en.ts src/i18n/locales/fi.ts src/i18n/locales/sv.ts
git commit -m "chore(projects): sync project data with sibling README sources

[per-project change summary]"
git push -u origin sync/readme-drift-$DATE
```

No Anthropic attribution. No `Co-Authored-By: Claude` trailer.

### 9. Open PR

Use `gh pr create` with the template below. Return the PR URL.

```
## Summary

Sync project data (`src/data/projects.ts` + i18n `projectsData`) against the canonical READMEs of {N} sibling repos. Caught by a {N}-way parallel README audit.

### Factual corrections (en/fi/sv)
[per project: numerals, engine counts, version mentions in prose]

### Tech-list additions (`projects.ts`, locale-agnostic)
| Project | Added |
|---|---|
[per project]

### Explicitly NOT in scope
[anything rejected during synthesis, with one-line reason — keeps the rejection rationale visible to reviewer]

## Test plan
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run format:check` passes on changed files
- [ ] Visual: `/projects`, `/fi/projects`, `/sv/projects` planet descriptions
```

PR title: `chore(projects): sync project data with sibling README sources` (or `chore(projects,i18n)` if scope feels broad — match the recent file convention).

### 10. Done

Print the PR URL. **Do not merge** — the maintainer reviews fi/sv prose (translation risk is the only thing a human catches that the agent can't) and merges manually.

---

## Agent prompt template

Each agent gets this exact prompt with `{REPO}`, `{ID}`, and `{CURRENT_DATA}` substituted.

```
You are auditing one sibling repo's README against this portfolio site's data. READ-ONLY — do not edit, do not commit, do not push.

**Repo:** MikkoNumminen/{REPO}
**Portfolio project id:** `{ID}`

**Step 1 — Fetch README**
Run: gh api repos/MikkoNumminen/{REPO}/readme --jq '.content' | base64 -d > /tmp/readme-{ID}.md
Then read /tmp/readme-{ID}.md.

**Step 2 — Current portfolio data**
{CURRENT_DATA}
(includes tech[], externalApis[], status, liveUrl from projects.ts; tagline, description, highlights from en.ts projectsData)

**Step 3 — Return EXACTLY this structured report. No preamble, no markdown headers, no closing remarks:**

PROJECT: {ID}
README_LAST_TOUCHED: <date if in README, else "unknown">

TAGLINE_DRIFT:
  current: "<current tagline>"
  suggestion: <one-line tagline drawn from README, OR "NONE">
  rationale: <one sentence OR "NONE">

DESCRIPTION_DRIFT:
  current: <excerpt — first 80 chars>
  suggestion: <replacement OR "NONE">
  rationale: <one sentence OR "NONE">

HIGHLIGHTS_DRIFT:
  current: <current highlights array>
  suggestion: <new array OR "NONE">
  rationale: <one sentence OR "NONE">

TECH_DRIFT:
  add: [<tech names in README but missing from portfolio>]
  remove: [<tech names in portfolio but absent from README>]
  rationale: <one sentence OR "NONE">

EXTERNAL_APIS_DRIFT:
  add: [<APIs in README but missing>]
  remove: [<APIs in portfolio but absent from README>]
  rationale: <one sentence OR "NONE">

STATUS_DRIFT:
  current: <current status>
  suggestion: <live | wip | archived | NONE>
  rationale: <one sentence OR "NONE">

CONFIDENCE: <high | medium | low>
NOTES: <one or two lines for anything else worth flagging>

**Rules:**
- "NONE" if no change needed.
- Tech names use the EXACT casing from the portfolio's current tech list. Only suggest add/remove for genuinely missing or extraneous items — don't flag normalize-spelling drift.
- Brand/proper nouns are not translatable; preserve verbatim.
- No marketing fluff. Match the existing portfolio's terse factual tone.
- If README is sparse, CONFIDENCE: low and NOTES explains.
- Test counts and percentages: only suggest update if README clearly states a different number.
- Return ONLY the structured block. Do not narrate your work.
```

---

## Failure modes

- **Repo unreachable** (deleted, renamed, private without auth): `gh api` returns 404. Skip that project; flag in PR body's NOT-in-scope section.
- **README too sparse** (e.g., < 500 bytes, no facts to drift-check): agent returns `CONFIDENCE: low`. Skip drift unless it's a clear factual correction.
- **CI fails in worktree:** Format-fix and re-check before committing. If typecheck fails for a real reason (broken type), abort and report — do not push broken code.
- **All "NONE" reports across all agents:** Exit without opening a PR. Report the run date and "no drift detected" to the invoker.

## Token expectations

For a 6-repo run (first-run measured):

- Sonnet input ~140K, output ~7K, across all parallel agents
- Main-context absorption ~10K (structured reports only)
- Wall-clock ~45s parallel + ~3 min orchestration
