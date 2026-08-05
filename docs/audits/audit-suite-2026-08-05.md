# Audit suite, 2026-08-05

**Scope:** project root (`content/code/**` excluded by every audit as RAG corpus data, not this project's code)
**Detected shape:** TypeScript without React (Astro 7 front-end) plus Python (FastAPI backend in `chat-backend/`); both rows resolve to the same audit list
**Audits run:** 3 (two from the decision matrix, one dispatched outside it; see the dispatch gaps below)
**Commit:** `3e44c1266ab1caf0d79aee4a6196051351e20d87` on branch `master`

## Reports

| Audit | Status | Report | Findings |
| --- | --- | --- | ---: |
| audit | ✅ ok | [docs/audits/audit-2026-08-05.md](./audit-2026-08-05.md) | 13 standing (15 raised, 2 refuted; severity-tallied below) |
| ai-codegen-smell-audit | ✅ ok | [docs/audits/ai-smell-2026-08-05.md](./ai-smell-2026-08-05.md) | 34 |
| llm-injection-audit | ✅ ok (dispatched outside the matrix) | [docs/audits/llm-injection-2026-08-05.md](./llm-injection-2026-08-05.md) | 21 |

## Severity rollup (from `audit`)

| Severity | Count |
| --- | ---: |
| critical | 0 |
| high | 2 |
| medium | 5 |
| low | 6 |

The other two reports carry their own tallies: ai-smell 3 high / 9 medium /
22 low; llm-injection 2 high / 14 medium / 5 low.

## What the decision matrix did not dispatch

Two audits that plainly fit this codebase were not selected by the suite's own
decision matrix. Both are gaps in the suite skill, not in this repo, and both
are recorded here so the next matrix revision closes them.

- **`llm-injection-audit` was not dispatched by the matrix at all.** No LLM
  row exists in it: the matrix keys on language and framework shape, and a
  repo whose entire backend exists to splice untrusted text into a model
  prompt triggers nothing. It was dispatched manually for this suite run,
  which is why its status row above carries the note.
- **`security-audit` did not fire.** The matrix's security trigger sniffs
  dependency names for Node (`express`, `pg`, `jsonwebtoken`) and .NET
  (`Microsoft.AspNetCore.Identity`, `EntityFrameworkCore`, and friends) only.
  There is no Python row, so a FastAPI backend with a public write endpoint
  (the shoutbox) did not trigger it. It was not run manually this round; the
  matrix gap stands as the finding.

## Phase 1 static analysis coverage

Phase 1 ran clean where it ran: `ruff check .` pass, `mypy app evals
ragctl.py` pass (47 source files), `eslint .` pass, `astro check` 0 errors 0
warnings, `npm audit` 0 vulnerabilities.

But `bandit` and `vulture` are **not installed**, so the Python security-smell
pass and the dead-code pass never ran. A green Phase 1 here means the linters
and type checkers that exist are clean; it does not imply any security scan
was performed on the Python side. Do not read the table above as security
coverage. (The `audit` report records the same caveat in its own static
analysis section.)

## What this is and isn't

This index aggregates report paths and counts; it doesn't synthesise findings
across audits. Each report stands on its own; the suite's value is having them
all run in one pass at the same commit, not having them collapsed into one
mega-report. The honest parts of this run are the two dispatch gaps and the
two absent Phase 1 tools recorded above: a suite index that only listed three
green rows would overstate what was actually checked.
