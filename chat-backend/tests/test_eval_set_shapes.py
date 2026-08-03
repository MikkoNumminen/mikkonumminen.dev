"""Structural shape tests for every eval fixture.

PURE-LOGIC: stdlib + `evals.eval_shapes` only. Deliberately does NOT import
`evals.run_eval` (that module imports `app.db`, which pulls in asyncpg) or
`evals.acceptance` (imports `app.pipeline`/`app.guardrails`, unneeded here) —
this suite must run with just pytest, per `pyproject.toml`'s
`[tool.pytest.ini_options]` note that the fast suite needs no heavy deps.

Before this, only `eval_set_unnamed_project.json` had any structural check
(`tests/test_unnamed_project_eval_set.py`, two fields). This covers every
fixture consumed anywhere in `evals/` — the four `eval_set*.json` golden/
regression sets plus `shoutbox_redteam.jsonl` — against the shape derived from
reading every consumer (see `evals/eval_shapes.py`'s module docstring).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from evals.eval_shapes import validate_query_set, validate_redteam_set

EVALS_DIR = Path(__file__).resolve().parents[1] / "evals"

QUERY_SET_FILES = [
    "eval_set.json",
    "eval_set_fi.json",
    "eval_set_fi_quality.json",
    "eval_set_live_regressions.json",
    "eval_set_unnamed_project.json",
]


@pytest.mark.parametrize("filename", QUERY_SET_FILES)
def test_query_set_shape(filename: str) -> None:
    errors = validate_query_set(EVALS_DIR / filename)
    assert not errors, "\n".join(str(e) for e in errors)


def test_shoutbox_redteam_shape() -> None:
    errors = validate_redteam_set(EVALS_DIR / "shoutbox_redteam.jsonl")
    assert not errors, "\n".join(str(e) for e in errors)
