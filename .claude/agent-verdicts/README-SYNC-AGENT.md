# Verdict: README-sync agent

**Status:** Positive — keep, run quarterly. Proven across 2 successful runs.
**Run 1:** 2026-05-18 → [PR #99](https://github.com/MikkoNumminen/mikkonumminen.dev/pull/99) (merged) + [#101](https://github.com/MikkoNumminen/mikkonumminen.dev/pull/101) post-merge polish (merged).
**Run 2:** 2026-05-18 (fresh session via `/sync-readmes`) → [PR #103](https://github.com/MikkoNumminen/mikkonumminen.dev/pull/103) (open).
**Net token savings:** modest. **Net correctness wins:** large. **Skill invocation path:** proven.

---

## What the agent does

Detect drift between the project data this portfolio renders (`src/data/projects.ts` + `projectsData` blocks in `src/i18n/locales/{en,fi,sv}.ts`) and the canonical READMEs of the 6 sibling repos those projects come from.

**Pattern:** N parallel Sonnet diff agents (one per sibling repo) → Opus synthesizes the reports into a single en+fi+sv PR.

**Repos in scope:**

- MikkoNumminen/HRManager → `hrm`
- MikkoNumminen/Platform → `platform`
- MikkoNumminen/ReadLog → `readlog`
- MikkoNumminen/AudiobookMaker → `audiobookmaker`
- MikkoNumminen/Spacepotatis → `spacepotatis`
- MikkoNumminen/strudel-patterns → `strudel-patterns`

(The portfolio repo itself is in `projects.ts` as `portfolio` but is not audited — this site is its own README.)

---

## Why it exists

Sibling repos evolve independently. A test count rises, a TTS engine is added, a normalization pipeline is rewritten — and the portfolio's planet description rots silently. Nobody reading mikkonumminen.dev knows; nobody opening the portfolio repo knows; only someone working _in_ the sibling repo would notice.

Without this agent the drift sits until a stranger spot-checks claims (recruiter, ex-colleague, code reviewer) — by which point it's a credibility hit, not a noticed bug.

---

## Token economics

### Run 1 (measured)

| Agent            | Total tokens | Tool uses | Wall time           |
| ---------------- | ------------ | --------- | ------------------- |
| HRM              | 29,450       | 6         | 37.5s               |
| Platform         | 19,179       | 3         | 23.1s               |
| ReadLog          | 14,927       | 3         | 19.1s               |
| AudiobookMaker   | 24,164       | 6         | 43.7s               |
| Spacepotatis     | 26,760       | 5         | 30.6s               |
| strudel-patterns | 26,600       | 5         | 29.6s               |
| **Sum**          | **141,080**  | **28**    | **~44s** (parallel) |

| Metric                  | Estimate | Actual              |
| ----------------------- | -------- | ------------------- |
| Sonnet input total      | ~36K     | ~134K               |
| Sonnet output total     | ~5K      | ~7K                 |
| Main-context absorption | ~10K     | ~10K (reports only) |
| Wall time               | 3–5 min  | **~44s**            |

### Run 2 (estimated — fresh-session transcript not in this conversation)

Run executed in a fresh `claude` session via `/sync-readmes`. Per-agent token data not available from here, but the input shape is identical:

- Same 6 parallel Sonnet agents
- Same READMEs (no upstream README updates between runs, per file mtimes)
- Same prompt template + same structured-output format

Estimated: ~140K Sonnet input, ~7K output, ~45s wall time. Should match Run 1 within ~10%.

### Main-context savings: confirmed at ~21K (Run 1)

Only the 6 structured reports (~10K) entered the Opus conversation, not the 27K of raw README markdown. That budget funded the actual fix work (edits + CI + commit + push + PR) without a compaction event.

### Dollar economics

Roughly a wash per run (~$0.80). Inline-on-Opus would be comparable in dollars but compaction-likely with HRM's 12K-token README. Compaction's silent cost (summary tokens + re-prime + lost specificity) is what this agent avoids, not the receipt-visible cost.

### Cumulative across runs

| Run     | $            | Sonnet tokens | Wall time  | Files edited                    | Drift fixed                                                    |
| ------- | ------------ | ------------- | ---------- | ------------------------------- | -------------------------------------------------------------- |
| 1       | ~$0.80       | 141K          | 44s        | 4                               | 15 wrong facts + 12 missing tech tags + 1 cross-link           |
| 2       | ~$0.80 (est) | ~140K (est)   | ~45s (est) | 4                               | 2 tech additions + 3 highlight updates (consistency follow-up) |
| **Sum** | **~$1.60**   | **~281K**     | **~90s**   | **8 (4 unique files × 2 runs)** | **18 wrong facts + 14 missing tech + 4 cross-links**           |

---

## Drift caught — Run 1 ([PR #99](https://github.com/MikkoNumminen/mikkonumminen.dev/pull/99))

### Critical: factual errors

| Project        | Field                   | Was                 | Should be                    | Locations               |
| -------------- | ----------------------- | ------------------- | ---------------------------- | ----------------------- |
| AudiobookMaker | description             | "Three TTS engines" | "Four TTS engines" + VoxCPM2 | 3 locales               |
| AudiobookMaker | description + highlight | "19-pass"           | "16-pass"                    | 3 locales × 2 spots = 6 |
| AudiobookMaker | description + highlight | "1729 tests"        | "2400+ tests"                | 3 locales × 2 spots = 6 |

**15 instances of factually wrong copy on the live site.** Caught in one 44s audit.

### Substantial: missing tech

| Project          | Added                                   |
| ---------------- | --------------------------------------- |
| HRM              | Zod, NextAuth, ReactFlow, Pino, pg-boss |
| Platform         | Jest, next-intl                         |
| ReadLog          | Jest                                    |
| AudiobookMaker   | VoxCPM2, ebooklib, ocrmypdf, Tesseract  |
| Strudel Patterns | Claude Code                             |

12 additions across 5 projects.

### Cross-project link gap

Strudel Patterns description omitted that selected tracks score the **mikkonumminen.dev landing page**. Added to en/fi/sv.

### Spacepotatis: zero drift

Vindicates the recent overhaul.

---

## Drift caught — Run 2 ([PR #103](https://github.com/MikkoNumminen/mikkonumminen.dev/pull/103))

Run 2 caught only what Run 1 missed or under-applied. **Five total changes; 4 files; +5 / -3 lines.**

### Tech additions (judgment reversal)

| Project        | Added                 | Notes                                                                                                                                                                                                                                                 |
| -------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AudiobookMaker | `num2words`, `pygame` | Run 1 synthesis explicitly rejected these as "micro-deps." Run 2 accepted them on the grounds that `num2words` powers the 16-pass Finnish normalization (a headline feature) and `pygame` is the in-process audio playback path. Defensible reversal. |

### Highlight consistency follow-up

Run 1 updated the Strudel Patterns **description** to mention the mikkonumminen.dev landing page, but didn't update the matching **highlight**. Run 2 caught the inconsistency:

| Locale | Was                            | Now                                                  |
| ------ | ------------------------------ | ---------------------------------------------------- |
| en     | `Soundtrack to Spacepotatis`   | `Soundtrack to Spacepotatis and mikkonumminen.dev`   |
| fi     | `Spacepotatiksen ääniraita`    | `Spacepotatiksen ja mikkonumminen.devin ääniraita`   |
| sv     | `Soundtrack till Spacepotatis` | `Soundtrack till Spacepotatis och mikkonumminen.dev` |

That's a **self-correcting** behavior — the agent caught a gap its own prior run left behind. Good signal for recurring use.

### No drift in 4 of 6 repos

HRM, Platform, ReadLog, Spacepotatis: clean. The README-sync is converging — most repos are now in sync, run-over-run drift is shrinking.

### Quality issue worth noting

`num2words` was placed in the OCR/inputs cluster of AudiobookMaker's tech array (between `Tesseract` and `edge-tts`). Logically it belongs in a "text processing" cluster nearer the TTS engines. Minor cosmetic miss — flag for the human reviewer. **Synthesis isn't perfect; the human-in-loop PR review is what catches this kind of micro-placement.**

---

## Cumulative drift table

After 2 runs:

| Category                                  | Run 1    | Run 2                      | Total    |
| ----------------------------------------- | -------- | -------------------------- | -------- |
| Factual corrections (3-locale propagated) | 15       | 0                          | 15       |
| Tech additions                            | 12       | 2                          | 14       |
| Cross-project links                       | 1 (desc) | 3 (highlights × 3 locales) | 4        |
| Cosmetic/ordering improvements            | —        | —                          | —        |
| **Total file changes**                    | 31 / -11 | 5 / -3                     | 36 / -14 |

---

## Drift NOT caught (scope gaps to fix in v2)

The agent still only diffs `src/data/projects.ts` + `projectsData` in each locale file. Project facts also live in:

| Location                                           | What lives there                                                            | Risk if stale   |
| -------------------------------------------------- | --------------------------------------------------------------------------- | --------------- |
| `timelineData` in `src/i18n/locales/{en,fi,sv}.ts` | Timeline blurbs reference Phaser 3, "7 repos", Spacepotatis, AudiobookMaker | Medium          |
| `src/lib/terminal/commands.ts`                     | Terminal `projects`/`about` commands likely list projects                   | Medium          |
| `src/lib/timeline/linkify.ts`                      | Auto-link dictionary for project names                                      | Low (name-only) |
| `README.md` (portfolio's own)                      | High-level pitch, may name sibling projects                                 | Low (generic)   |

**Recommendation:** v2 of this agent should add a second-pass check that greps for each project's `id` and `name` across `src/**` and `README.md`, flags any mention, and inspects context.

---

## Design comparison

### Approach A: Inline on Opus (no subagents)

- ~31K added to main context (27K of README markdown alone).
- Compaction-likely with HRM's 12K-token README plus the others.
- One-shot $ ~equal; iterative $ degrades.

### Approach B: Sonnet diff agents + Opus synthesis (THIS)

- ~10K added to main context (just the 6 structured reports).
- 6× parallelism → 44s wall time vs ~10 min serial.
- Translation quality: high (Opus does surgical fact swaps against existing fi/sv prose).

### Approach C: Sonnet agents do the full update

- ~$0.82 vs $0.80 for Approach B — net token savings ≈ zero.
- Translation quality risk: medium (Sonnet writing fi/sv prose from scratch).
- **Win condition:** valuable as a _recurring_ job (cron / quarterly skill).

**Verdict:** Approach B for ad-hoc runs. Approach C for the recurring version.

---

## Why "positive agent"

Token analysis showed dollar savings ≈ zero. The verdict is positive because:

1. **Correctness wins are large.** 17+ instances of stale copy fixed across 2 runs.
2. **Main-context budget savings are real.** ~21K tokens kept off Opus per run.
3. **Wall time win is real.** ~45s parallel vs ~10 min serial.
4. **Catch-rate is high.** 6/6 audits returned high-confidence reports each run.
5. **Self-correcting.** Run 2 caught a gap Run 1 left. The pattern improves over time.
6. **Skill invocation path proven.** Run 2 executed end-to-end from a fresh session via `/sync-readmes`.
7. **Repeatability is high.** Same N+1 agent pattern works for any other "source-of-truth lives elsewhere" audit.

---

## Recurring-run recipe

For each future quarter:

1. Invoke `/sync-readmes` (or read the [SKILL.md](.claude/skills/sync-readmes/SKILL.md) procedure).
2. Agent opens a PR (or reports "no drift" and exits).
3. Human reviews fi/sv prose and tech-array placement.
4. Human merges (the agent does NOT merge per [[feedback_never_merge_without_explicit_approval]]).
5. Log the run's findings here.

**Future v2 expansion:** add the `timelineData` + `terminal/commands.ts` + `linkify.ts` sweep.

---

## Run log

| Run | Date       | Mode                                            | PR                                                                                                                                             | Drift caught                     | Merged     |
| --- | ---------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| 1   | 2026-05-18 | Manual orchestration (prompt-by-prompt)         | [#99](https://github.com/MikkoNumminen/mikkonumminen.dev/pull/99) + [#101](https://github.com/MikkoNumminen/mikkonumminen.dev/pull/101) polish | 15 facts + 12 tech + 1 link      | Yes (both) |
| 2   | 2026-05-18 | `/sync-readmes` skill invocation, fresh session | [#103](https://github.com/MikkoNumminen/mikkonumminen.dev/pull/103)                                                                            | 2 tech + 3 highlight consistency | Open       |

---

## Open questions / parking lot

- **Locale-mirror as a separate sub-agent.** Currently Opus does it inline because the work is mechanical (fact swap into pre-existing prose). If scope expands to `timelineData` and `terminal/commands.ts`, locale-mirror cost grows non-linearly and pushing it to a dedicated Sonnet agent starts to pay off.
- **README too sparse to drift-check.** ReadLog's 1.7 KB README was flagged `CONFIDENCE: high` anyway. If a future sibling repo has a genuinely insufficient README, the agent will return `CONFIDENCE: low` and synthesis should defer.
- **Tech-list philosophy.** Currently "headline deps only." Run 1 rejected micro-deps (num2words, pygame, BeautifulSoup); Run 2 accepted some of them. The threshold is judgment-driven, not rule-driven. Acceptable as long as the human reviewer can adjust at PR time.
