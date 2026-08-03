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
Every other mention (root README, AGENTS.md, docs/rag-chat.md) describes the
harness structurally — "every static contract case plus every golden must-refuse
query" — precisely so that adding a case does not require editing four files.
Adding a numeric claim elsewhere is fine, but it belongs here too, or it is
unguarded by construction.
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
