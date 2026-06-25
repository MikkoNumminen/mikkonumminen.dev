# Corpus deep-dive — gaps to fill (2026-06-25)

The deep-dive docs in `content/projects/` were mined strictly from each
project's real repo; where the repo didn't record a detail, the mining agent
flagged it rather than invent. This is the consolidated fill-list. The inline
`[gap: …]` markers were deliberately kept OUT of the corpus text so the chat
never surfaces them in an answer — they live here instead.

## ReadLog .NET

- Exact post-PR7 test count (PORTING-NOTES has 86 at end of PR6; grew after).
- CVE-2025-55315 pin status (AUDIT flags the 8.0.8 pins — confirm they're bumped).
- `ReadEntry.Notes` exists in the model + migration but is unused everywhere (dead code, or planned feature?).
- Whether the Google profile-photo URL is refreshed on subsequent logins.

## claude-continue

- `gui.py` and `selfremove.py` internals weren't read in depth.
- The "~300 tests / ~0.4 s" figure is quoted from `ARCHITECTURE.md`, not independently counted.
- The screenshots are unreadable, so there's no UI description beyond the README mockup.

## HRM

- The 2FA-bypass commit diffs (`301935a`, `50459c5`, `4baf347`) are referenced in CLAUDE.md but the diffs weren't read.
- The audit-chain concurrent-write fork has no documented mitigation.
- The Postgres→MongoDB audit-log migration reason comes from README prose, not the migration SQL.

## Spacepotatis

- No CHANGELOG; chronology reconstructed from ADRs + in-code references.
- `CombatScene.finishEarly()` boss early-finish not confirmed line-by-line.
- Cited PR numbers come from in-code/ADR references, not a verified PR list.

## AudiobookMaker

- Commit SHAs omitted (no git-log access in the run).
- v3.15.3 floor-aware band-guard thresholds + the healthy-chunk distribution methodology (release notes only).
- The "500-call Tier-1 validator" (v3.9.0 notes) wasn't located as a file.
- The EOS-suppression / gemination patch lives in the Chatterbox venv, not the repo source tree.
- Voice-pack LoRA training specifics (time, batch size, target layers beyond the four attention projections).

## Platform

- The concurrent XP-cap and achievement double-unlock races are documented as **open** findings (no fix commit at audit time) — described as unresolved, not fabricated as fixed.
- The GitHub-commits-integration Zod gap was flagged, not fixed.
- The Shoutbox `useState` reduction has no before/after count.
- No ADRs in this repo to cross-reference; rationale came from commits + audit docs + comments.

## ReadLog (TS)

- No CHANGELOG; history reconstructed from git log.
- The migrations directory is empty in the checkout, so the table-rename migration history isn't recoverable.
- The Google Books no-API-key behaviour (returns `[]` silently) has no rationale comment beyond the guard.

## strudel-patterns

- No test suite / CI to mine.
- Strudel MCP integration is planned, not implemented.
- Git history starts 2026-04-21; no pre-project iteration record.
- WAV sources are gitignored (only committed MP3s exist).

## Portfolio

- `projectsScene.ts`, the canvas particle-dissolve page transition, and the experience-page scenes weren't mined (already covered by the existing architecture doc).
- `evals/run_eval.py` details weren't included (planned-eval work, not shipped behaviour).
- The agent reported `docs/rag-chat.md` "not found" — it **does** exist on master (merged in #281); that was an agent miss, not a real gap.
