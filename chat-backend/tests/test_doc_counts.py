"""The counts the docs quote for the eval and acceptance harnesses must be real.

WHY THIS TEST EXISTS: every number in prose is a promise with no enforcement
behind it, and these particular numbers drifted badly. The docs claimed the
acceptance harness ran "9 cases" and passed "9/9" long after it grew to 27, and
that `eval_set.json` held 17 questions when it held 58. That is worse than a
typo: an agent told to run the harness and confirm "9/9" sees 27 results, cannot
tell whether the doc or the harness is wrong, and has no way to decide except to
ask a human — which is exactly the dependency the self-verification gates exist
to remove.

The fix is not to correct the numbers. Corrected numbers drift again the next
time a case is added. The fix is to make the claim checkable, so the suite fails
the moment prose and reality disagree.

WHY THE NUMBERS LIVE IN ONE FILE: only `chat-backend/README.md` states them.
Every other mention describes the harness structurally — "every static contract
case plus every golden must-refuse query" — precisely so that adding a case does
not require editing several files.

That paragraph is enforced by `test_no_stale_case_counts_anywhere`, not merely
asserted — it was once written as a claim about files nobody had checked, and
several of them were wrong. A claim sitting next to a guard borrows the guard's
credibility, so it has to be checked or dropped.
"""

from __future__ import annotations

import re
from pathlib import Path

# Deliberately imported from `acceptance`, not `run_eval`: the latter pulls in
# `app.db` and therefore asyncpg, and `pyproject.toml` keeps the pure-logic suite
# runnable on a bare Python + pytest. Both modules point at the same file.
from evals.acceptance import CASES, EVAL_SET_PATH, golden_refusal_cases

CHAT_BACKEND = Path(__file__).resolve().parents[1]
BACKEND_README = CHAT_BACKEND / "README.md"


def _readme() -> str:
    return BACKEND_README.read_text(encoding="utf-8")


def _states(phrase: str) -> bool:
    """Whether the README states `phrase` as a whole-word claim.

    Word-anchored on purpose. A plain substring check would let "127 cases"
    satisfy a "27 cases" assertion, which is the precise failure mode this file
    exists to catch — a guard that can pass while the claim is wrong is worse
    than no guard, because it also certifies the claim.
    """
    return re.search(rf"\b{re.escape(phrase)}\b", _readme()) is not None


def test_acceptance_total_case_count_is_stated_correctly() -> None:
    """`main()` runs `CASES + golden_refusal_cases()`; the README must say so."""
    total = len(CASES) + len(golden_refusal_cases())
    assert _states(f"{total} cases"), (
        f"chat-backend/README.md does not state the real acceptance case count "
        f"({total} = {len(CASES)} static + {len(golden_refusal_cases())} golden). "
        f"Update the 'Acceptance harness' paragraph."
    )


def test_acceptance_static_and_golden_split_is_stated_correctly() -> None:
    """The split matters more than the total: the static cases are hand-written
    contract checks, the golden ones are pulled live from the eval set, and a
    reader who does not know that will not understand why the number moves when
    they edit a JSON file they think is unrelated."""
    assert _states(f"{len(CASES)} static"), (
        f"chat-backend/README.md must state the static case count ({len(CASES)})."
    )
    assert _states(f"{len(golden_refusal_cases())} golden"), (
        "chat-backend/README.md must state the golden must-refuse count "
        f"({len(golden_refusal_cases())})."
    )


def test_eval_set_question_count_is_stated_correctly() -> None:
    import json

    data = json.loads(EVAL_SET_PATH.read_text(encoding="utf-8"))
    total = len(data["queries"])
    assert _states(f"holds {total} questions"), (
        f"chat-backend/README.md does not state the real eval_set.json size "
        f"({total} queries). Update the 'Retrieval eval' paragraph."
    )


REPO_ROOT = CHAT_BACKEND.parent

# Markdown that is allowed to contain a stale count, and why:
#   docs/audits/**  — dated point-in-time reports. An audit that recorded what
#                     was true in June is not drift; rewriting it would be.
#   node_modules, .claude/worktrees — not ours.
_SCAN_SKIP = ("node_modules", ".claude/worktrees", "docs/audits", "dist", ".astro")

# "9/9", "27/27" — a self-referential pass ratio.
_RATIO_RE = re.compile(r"\*{0,2}(\d+)\s*/\s*\1\*{0,2}")
# "9 cases", "11 black-box contract cases".
_COUNT_RE = re.compile(r"\*{0,2}(\d+)\*{0,2}\s+(?:\w+[- ]){0,3}cases\b")
# Only claims sitting near this vocabulary are about THIS harness. Deliberately
# NOT the bare word "harness": the rag-experiment skill has its own harness and
# quotes per-model tallies like "containment refuse 9/3/3", which a looser
# pattern flagged as stale acceptance counts. A drift guard that cries wolf on
# an unrelated subsystem gets deleted, so it is scoped to the two names this
# repo actually uses for the acceptance suite.
_HARNESS_RE = re.compile(r"acceptance|containment contract", re.IGNORECASE)


def _markdown_files() -> list[Path]:
    """Every markdown file worth scanning, skip-matched on the REPO-RELATIVE path.

    Relative, not absolute, and that distinction is load-bearing: this repo is
    routinely worked on from a git worktree under `.claude/worktrees/<name>/`,
    which is itself one of the skip patterns. Matching the absolute path made
    every file in a worktree look skippable, so the scan silently found nothing
    and the test passed by doing no work — while still passing in CI, where the
    checkout path happens not to contain the pattern. Caught by planting a
    known-bad file and confirming the test went red; it did not.
    """
    files: list[Path] = []
    for path in REPO_ROOT.rglob("*.md"):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if any(rel.startswith(skip) or f"/{skip}" in rel for skip in _SCAN_SKIP):
            continue
        files.append(path)
    return files


def test_no_stale_case_counts_anywhere() -> None:
    """No markdown may state a hard acceptance-harness count that is not the
    real one.

    Scans every tracked markdown file for a pass-ratio ("9/9") or a case count
    ("9 cases") within a few lines of harness vocabulary, and requires any such
    number to equal reality. Structural phrasing trips nothing, which is the
    behaviour we want: the cheapest way to satisfy this test is to not state a
    number at all.
    """
    total = len(CASES) + len(golden_refusal_cases())
    static = len(CASES)
    golden = len(golden_refusal_cases())
    allowed = {total, static, golden}

    offenders: list[str] = []
    for path in _markdown_files():
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        for i, line in enumerate(lines):
            # A claim counts as "about the harness" if the vocabulary appears on
            # the same line or the two before it — enough for a sentence that
            # wraps, tight enough not to sweep in unrelated numbers.
            window = "\n".join(lines[max(0, i - 2) : i + 1])
            if not _HARNESS_RE.search(window):
                continue
            for match in (*_RATIO_RE.finditer(line), *_COUNT_RE.finditer(line)):
                value = int(match.group(1))
                if value not in allowed:
                    rel = path.relative_to(REPO_ROOT).as_posix()
                    offenders.append(f"{rel}:{i + 1}: {line.strip()!r}")

    assert not offenders, (
        "These files state an acceptance-harness count that is not real "
        f"(the harness runs {total} = {static} static + {golden} golden).\n"
        "Prefer structural phrasing — 'every static contract case plus every "
        "golden must-refuse query' — over a number that will drift again:\n  "
        + "\n  ".join(offenders)
    )


def test_golden_refusal_cases_are_actually_derived_from_the_eval_set() -> None:
    """Guards the premise the two tests above rest on. If `golden_refusal_cases`
    ever stops reading the eval set — say it grows a hardcoded list — the counts
    would still agree while the 'single source of adversarial truth' property
    the docstring claims would be quietly gone."""
    import json

    data = json.loads(EVAL_SET_PATH.read_text(encoding="utf-8"))
    must_refuse = [
        q
        for q in data["queries"]
        if str(q.get("expectation", "")).startswith("must_refuse")
    ]
    assert len(golden_refusal_cases()) == len(must_refuse)
    assert must_refuse, "the eval set must retain must_refuse_* coverage"
