# Skill registry — 2026-05-19

**Scope:** every `.claude/skills/*/SKILL.md` under `D:/koodaamista/*`, excluding `claude-audit-skill/`.

**First end-to-end run.** Procedure followed: SKILL.md as of PR #108 (description-based redirect heuristic, `path: d:/koodaamista` + relative pattern for `Glob`, Bash `ls` fallback).

## Aggregate

| Repo              | Total skills | Redirects | With receipts | Estimated tokens saved/year |
| ----------------- | -----------: | --------: | ------------: | --------------------------: |
| mikkonumminen.dev |            2 |         0 |             2 | ~325K (estimate, see notes) |
| Spacepotatis      |           14 |         1 |            13 |                      ~3.13M |
| AudiobookMaker    |           10 |         0 |             0 |                           — |
| **Total**         |       **26** |     **1** |        **15** |                  **~3.45M** |

Receipts column counts skills with token-savings estimates traceable to a `docs/SKILLS.md` or `.claude/agent-verdicts/*.md` file.

## Per-repo

### mikkonumminen.dev

| Skill           | Description                                                                                                                                                                                       | Tokens / use                  | Uses / year | Total | Receipt                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------: | ----------: | ----: | -------------------------------------------------------------------------------------- |
| sync-readmes    | Audit project data against sibling repos' READMEs and open a PR with drift corrections. Runs parallel Sonnet diff agents (one per sibling repo), synthesizes drift, applies en+fi+sv corrections… | ~140K Sonnet in + ~7K out + ~10K main, per run | ~quarterly (4) | ~260K | [README-SYNC-AGENT.md](README-SYNC-AGENT.md) (local-only) |
| skill-registry  | Scan every sibling repo under D:/koodaamista for `.claude/skills/*/SKILL.md` files and emit a consolidated registry — per-repo tables of skill name, description, and (where receipts exist) token-savings estimates. | ~65K (30K read frontmatter + 30K read receipts + 5K write report)            | ~quarterly (4) |  ~65K | [SKILL-REGISTRY-AGENT.md](SKILL-REGISTRY-AGENT.md) (tracked); methodology in [SKILL.md§Token expectations](../skills/skill-registry/SKILL.md) |

Notes: both receipts are per-run, not per-year. The annual totals assume ~quarterly cadence (4 runs/year), matching the verdict doc's recommended `/schedule`. `sync-readmes` total includes both Sonnet sub-agent cost (~140K input) and main-context absorption (~10K) — Sonnet cost is materially cheaper per token, so the dollar-weighted total is closer to the lower bound.

### Spacepotatis

| Skill                      | Description                                                                                                                                  | Tokens / use   | Uses / year | Total  | Receipt                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------: | ----------: | -----: | ------------------------------------------------------------------------------------------------ |
| ai-codegen-smell-audit     | Read-only audit for 10 concrete AI-codegen failure modes (defensive checks, paraphrase comments, single-use helpers, swallowed errors, etc) |        ~10.0K  |          30 |  ~300K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| audit                      | Multi-phase modular-architecture audit + refactor orchestrator (5 phases, gated)                                                             |         ~5.0K  |           5 |   ~25K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| balance-review             | Diff uncommitted changes to game data and report DPS, TTK, energy-cost-per-DPS, augment-folded effective DPS, loot-pool roster shifts        |        ~13.5K  |          50 |  ~675K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| content-audit              | Pre-commit content invariants check (orphan refs, missing sprite generators, perk drop-weight sanity, mission prereq DAG, story integrity)   |        ~15.0K  |          50 |  ~750K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| equipment                  | Create / modify / remove a weapon or piece of equipment (full CRUD lifecycle on ship-loadout content surface)                                |  ~4.3K (avg)¹  |          56 |  ~240K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| new-enemy                  | Scaffold a new enemy (enemies.json + sprite generator + optional wave + integrity test)                                                      |         ~5.5K  |          25 |  ~138K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| new-migration              | Add a Postgres schema migration end-to-end (dated SQL + Database interface + prod apply + verify + PR checkbox)                              |         ~7.0K  |          15 |  ~105K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| new-mission                | Scaffold a new combat mission across missions.json, waves.json, galaxy planet binding, and smoke test                                        |         ~8.0K  |          30 |  ~240K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| new-perk                   | Scaffold a new mission-only perk (perks.ts + icon generator + HUD chip + PerkController switch case)                                         |         ~9.0K  |          10 |   ~90K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| new-solar-system           | Add a new solar system to the galaxy (solarSystems.json + union extension + on-system-enter cinematic + galaxy-view music bed)               |        ~13.0K  |           5 |   ~65K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| new-story                  | Add / modify / remove story content (cinematic popups, voiceovers, music beds, body text, auto-trigger wiring)                               |  ~5.4K (avg)²  |          40 |  ~216K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| **new-weapon** *(redirect)* | _Superseded by `/equipment`. This stub redirects._                                                                                          |             — |           — |     — | n/a (redirect)                                                                                   |
| save-roundtrip-audit       | Pre-commit save-pipeline invariants check (walks every StateSnapshot field through 8 layers of the round-trip)                                |        ~12.0K  |          20 |  ~240K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| security-audit             | Multi-phase security audit + remediation orchestrator (attack-surface mapping → remediation plan → fixes with regression tests, gated)       |  ~5.0K (avg)   |          10 |   ~50K | [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md)       |
| **Subtotal**               |                                                                                                                                              |                | **346**     | **~3.13M** |                                                                                                  |

¹ `/equipment` is the weighted average across add/change/remove × weapon/augment/equipment ops.
² `/new-story` is the weighted average across CREATE / MODIFY / REMOVE ops with their estimated mix.

### AudiobookMaker

| Skill                      | Description                                                                                                                                                | Tokens / use | Uses / year | Total | Receipt |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------: | ----------: | ----: | ------- |
| ai-codegen-smell-audit     | Read-only audit for specific failure modes that recur in LLM-generated code (defensive guards, generic names, swallowed errors, single-use helpers…)        |           — |           — |     — | —       |
| audit                      | Multi-phase robustness audit; 5 parallel subagents across resource lifecycle / data integrity / concurrency / error paths / external boundaries            |           — |           — |     — | —       |
| ci-failure-triage          | Walk CI failure modes against a recipe library built from the project's `fix(ci)` commit history                                                            |           — |           — |     — | —       |
| copyright-scan             | Scan a git diff for accidental third-party copyright leaks before they land on origin. CLAUDE.md P0 ritual; one-pass scan.                                  |           — |           — |     — | —       |
| pronunciation-corpus-add   | Append a Finnish pronunciation failure (a word the Chatterbox Grandmom voice mispronounces) to `docs/pronunciation_corpus_fi.md`                            |           — |           — |     — | —       |
| release-bundle-audit       | Audit the PyInstaller release bundle for unused deps, dead-code data files, ML-stack pollution; propose spec-only fixes on `chore/release-bundle-size`     |           — |           — |     — | —       |
| release-cut                | Cut a new AudiobookMaker release (bump APP_VERSION, tag vX.Y.Z, push, verify CI lands SHA-256 in release notes AND sidecar). Auto-update existential.       |           — |           — |     — | —       |
| voice-pack-finnish         | Build a Finnish voice pack end-to-end (chunked analyze, ECAPA diarization, transcript validation, LoRA training / few-shot packaging, ear-check by synth)   |           — |           — |     — | —       |
| work-session               | Start / pause / finish a TODO.md work session as one of the 4 permanent parallel Claude sessions in AudiobookMaker                                          |           — |           — |     — | —       |
| worktree-launch            | Start a new parallel Claude session safely. Pick a free slot (Claude 1/2/3/4), create worktree, claim a task, verify isolation                              |           — |           — |     — | —       |
| **Subtotal**               |                                                                                                                                                            |              |             |     — |         |

## Notes & gaps

- **Skills without receipts: 10 of 25 catalog** (all in AudiobookMaker). The skills exist and are operationally valuable, but no `docs/SKILLS.md` or `.claude/agent-verdicts/` aggregate has been written for that repo. To close this gap, either (a) write a per-repo aggregate doc mirroring the Spacepotatis pattern, or (b) move to a frontmatter schema (`tokens_per_use`, `uses_per_year`, `last_audited`) on each SKILL.md so the registry can pull receipts uniformly.
- **Redirect stubs counted separately:** Spacepotatis's `new-weapon` is the only one detected. Its description literally starts *"Superseded by /equipment. … This stub redirects."* — a textbook description-based redirect; the heuristic catches it cleanly.
- **All Spacepotatis token-savings figures are author-estimated** — see [docs/SKILLS.md](https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md) in Spacepotatis for the methodology section, which explicitly labels the numbers educated guesses with 3× error bars.
- **mikkonumminen.dev receipts are per-run, not per-year.** The annual totals assume ~quarterly cadence for both `sync-readmes` and `skill-registry`. Without a recorded invocation history, the annual figure is the noisiest data point in this whole report.
- **Drift caught in this run:** none beyond what PR #108 already addressed. Spacepotatis's `docs/SKILLS.md` total of ~3.13M matches the site copy that was just updated; the 13-catalog + 1-redirect split is consistent with the site framing of "a catalog of … skills."
- **Aggregate total of ~3.45M tokens/year** is the sum of Spacepotatis's ~3.13M + this repo's ~325K. AudiobookMaker contributes zero to the verifiable total because nothing's been written up yet — its 10 skills represent the biggest opportunity to raise the portfolio-wide receipt coverage from 60% to 100%.

## Procedural notes from this run

- `Glob` with `path: d:/koodaamista` + pattern `*/.claude/skills/*/SKILL.md` returned no results in this session's environment; fell back to `ls d:/koodaamista/*/.claude/skills/*/SKILL.md` per the SKILL.md's documented fallback. The fallback works. Pattern-args portability still wants investigation (separate concern from this skill).
- Frontmatter extraction via `head -6` on each file was sufficient — every SKILL.md surveyed has its YAML block in the first 6 lines.
- The description-based redirect heuristic from PR #108 caught `new-weapon` on the first match. No false positives from the other 24 descriptions (none contain the redirect-keyword set: superseded / redirect / renamed / moved to / see also).

---

_Run completed 2026-05-19. Output is local (gitignored under `.claude/agent-verdicts/SKILL-REGISTRY-*` pattern)._
