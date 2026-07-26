"""The unnamed-project eval set must keep being unnamed.

`eval_set_unnamed_project.json` exists to measure ONE thing: what retrieval does
when a question is specific enough to have a single correct answering document
but never names its project, so `detect_projects` returns nothing and the
per-project diversity cap applies.

That premise is fragile in a way that fails silently. Widening `PROJECT_ALIASES`
or `TECH_ALIASES` — a reasonable thing to do for unrelated reasons — can make one
of these questions start naming a project. Named-project queries are never
capped, so the case would quietly start passing for the wrong reason and the
eval would report an improvement that is really a loss of coverage.

These tests pin the premise, not the retrieval result.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.query_projects import detect_projects

EVAL_SET = (
    Path(__file__).resolve().parents[1]
    / "evals"
    / "eval_set_unnamed_project.json"
)


def _cases() -> list[dict]:
    return json.loads(EVAL_SET.read_text(encoding="utf-8"))["queries"]


def test_eval_set_is_present_and_non_trivial() -> None:
    cases = _cases()
    assert len(cases) >= 10, "too few cases to say anything about a rate"


@pytest.mark.parametrize("case", _cases(), ids=lambda c: c["id"])
def test_question_names_no_project(case: dict) -> None:
    detected = detect_projects(case["question"])
    assert detected == set(), (
        f"{case['id']} now names project(s) {sorted(detected)}. "
        "Named-project queries bypass the diversity cap, so this case has "
        "stopped testing the unnamed path. Reword the question or move the case."
    )


@pytest.mark.parametrize("case", _cases(), ids=lambda c: c["id"])
def test_case_declares_one_expected_source(case: dict) -> None:
    # The probe's share metric divides by a single expected document; more than
    # one would make the measurement mean something different.
    assert len(case["expected_sources"]) == 1, (
        f"{case['id']} declares {len(case['expected_sources'])} expected sources; "
        "the unnamed-project probe assumes exactly one."
    )


def test_every_case_has_a_probe_anchor() -> None:
    # A case with no anchor would silently drop out of the answer-presence rate,
    # which is the metric the whole set exists to produce.
    from evals.unnamed_project_probe import ANCHORS

    missing = [c["id"] for c in _cases() if c["id"] not in ANCHORS]
    assert not missing, f"cases with no anchor phrase in the probe: {missing}"
