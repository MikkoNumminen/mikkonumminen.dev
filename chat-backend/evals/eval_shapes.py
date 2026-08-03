"""Structural validation for the eval fixtures — evals/eval_set*.json and
evals/shoutbox_redteam.jsonl.

No fixture shape was declared anywhere before this: `evals/run_eval.py`'s
`load_queries` only checked that `data["queries"]` is a list of dicts, and every
per-entry field was then read with untyped `dict.get`/`dict[...]` deep inside
`scoring.py` / `acceptance.py` / `run_regressions.py` — a malformed fixture
surfaced as a bare `KeyError` mid-run instead of a clear "this file, this entry,
this field" message.

The shape below was derived by reading every consumer (`run_eval.py::_eval_mode`
and `_score_one`, `acceptance.py::golden_refusal_cases` and
`finnish_eval_cases`, `run_regressions.py::score_case`,
`tests/test_unnamed_project_eval_set.py`, `tests/test_shoutbox_redteam.py`, and
`app/shoutbox.py::Refusal`) plus every fixture file — not invented.

Deliberately dependency-free: no `jsonschema`, no `pydantic` (neither is a
runtime dependency of `chat-backend/pyproject.toml`, and this module must stay
importable by the fast, DB-free pytest suite alongside `evals.acceptance`,
which is pure-stdlib for the same reason). Do not import `evals.run_eval` from
here or from a test that uses this module — that module imports `app.db`,
which pulls in asyncpg.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, TypeGuard

# Every `expectation` value that actually appears in the fixtures today, and
# the only ones any consumer knows how to score. `run_eval.py::_score_one` and
# `acceptance.py::finnish_eval_cases` both `raise ValueError` on anything
# outside this set rather than silently mis-scoring it — this mirrors that
# contract at fixture-validation time instead of at eval-run time.
KNOWN_EXPECTATIONS = frozenset(
    {
        "must_retrieve",
        "must_refuse_offcorpus",
        "must_refuse_injection",
        "must_refuse_generative",
        "must_refuse_translation",
    }
)

# expectation == must_retrieve implies a non-empty `expected_sources` list
# EVERYWHERE except this one frozen live-regression case. Verified against
# every fixture: it is the sole violation. `run_regressions.py::score_case` and
# `run_eval.py::_eval_mode` both read the field as `query.get("expected_sources",
# [])`, so a missing key is tolerated at runtime (it just means "don't check
# sources", not "broken fixture") — encoding the rule as an absolute would be
# false, so the one exception is recorded rather than silently dropping the
# check for every other fixture.
_MUST_RETRIEVE_SOURCES_EXEMPT: frozenset[tuple[str, str]] = frozenset(
    {("eval_set_live_regressions.json", "code-token-fi")}
)

# Fields any consumer reads, unioned across every fixture (they do not all
# share one shape — eval_set_fi_quality.json and eval_set_live_regressions.json
# carry `facts` instead of `expected_points`/`note`/`depth`; only
# eval_set_live_regressions.json carries `expected_lang`/`_note`). Anything
# outside this set on a query entry is very likely a typo'd field name.
_KNOWN_QUERY_FIELDS = frozenset(
    {
        "id",
        "question",
        "expectation",
        "category",
        "depth",
        "expected_sources",
        "expected_points",
        "facts",
        "note",
        "_note",
        "expected_lang",
    }
)


class ShapeError:
    """One fixture-shape violation: which file, which entry, which field."""

    def __init__(self, path: Path, entry: str, field: str, message: str) -> None:
        self.path = path
        self.entry = entry
        self.field = field
        self.message = message

    def __repr__(self) -> str:
        return (
            f"ShapeError({self.path.name!r}, {self.entry!r}, "
            f"{self.field!r}, {self.message!r})"
        )

    def __str__(self) -> str:
        return f"{self.path.name}[{self.entry}].{self.field}: {self.message}"


def _is_nonempty_str(value: Any) -> TypeGuard[str]:
    return isinstance(value, str) and bool(value.strip())


def _is_str_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(v, str) for v in value)


# --- eval_set*.json ----------------------------------------------------------


def validate_query_entry(path: Path, index: int, entry: Any) -> list[ShapeError]:
    """Validate one entry of a fixture's `queries` array.

    Collects every violation on the entry (not just the first) so one run
    reports the whole picture rather than requiring a fix-rerun-fix loop.
    """
    label = f"#{index}"
    if not isinstance(entry, dict):
        return [
            ShapeError(
                path, label, "<entry>", f"expected an object, got {type(entry).__name__}"
            )
        ]

    if _is_nonempty_str(entry.get("id")):
        label = entry["id"]

    errors: list[ShapeError] = []

    def fail(field: str, message: str) -> None:
        errors.append(ShapeError(path, label, field, message))

    if not _is_nonempty_str(entry.get("id")):
        fail("id", f"required non-empty string, got {entry.get('id')!r}")

    if not _is_nonempty_str(entry.get("question")):
        fail("question", f"required non-empty string, got {entry.get('question')!r}")

    expectation = entry.get("expectation")
    if expectation not in KNOWN_EXPECTATIONS:
        fail(
            "expectation",
            f"must be one of {sorted(KNOWN_EXPECTATIONS)}, got {expectation!r}",
        )

    if "expected_sources" in entry and entry["expected_sources"] is not None:
        if not _is_str_list(entry["expected_sources"]):
            fail(
                "expected_sources",
                f"must be a list of strings, got {entry['expected_sources']!r}",
            )

    if "expected_points" in entry and not _is_str_list(entry["expected_points"]):
        fail(
            "expected_points",
            f"must be a list of strings, got {entry['expected_points']!r}",
        )

    if "facts" in entry and not _is_str_list(entry["facts"]):
        fail("facts", f"must be a list of strings, got {entry['facts']!r}")

    for str_field in ("category", "depth", "note", "_note"):
        if str_field in entry and not isinstance(entry[str_field], str):
            fail(str_field, f"must be a string, got {entry[str_field]!r}")

    if "expected_lang" in entry and entry["expected_lang"] is not None:
        if not isinstance(entry["expected_lang"], str):
            fail(
                "expected_lang", f"must be a string, got {entry['expected_lang']!r}"
            )

    unknown = set(entry.keys()) - _KNOWN_QUERY_FIELDS
    if unknown:
        fail("<entry>", f"unknown field(s): {sorted(unknown)}")

    if expectation == "must_retrieve":
        exempt = (path.name, label) in _MUST_RETRIEVE_SOURCES_EXEMPT
        if not exempt and not entry.get("expected_sources"):
            fail(
                "expected_sources",
                "required (non-empty) when expectation is must_retrieve",
            )
    elif expectation in KNOWN_EXPECTATIONS and entry.get("expected_sources"):
        fail(
            "expected_sources",
            f"must be empty for expectation {expectation!r}, "
            f"got {entry['expected_sources']!r}",
        )

    return errors


def validate_query_set(path: Path) -> list[ShapeError]:
    """Validate an `eval_set*.json` file: a top-level object with a `queries`
    list. Other top-level keys (`_comment`, `description`, ...) are ignored —
    nothing consumes them."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("queries"), list):
        return [
            ShapeError(
                path, "<file>", "queries", "top-level 'queries' must be a list"
            )
        ]

    errors: list[ShapeError] = []
    seen_ids: dict[str, int] = {}
    for index, entry in enumerate(data["queries"]):
        errors.extend(validate_query_entry(path, index, entry))
        if isinstance(entry, dict):
            entry_id = entry.get("id")
            if _is_nonempty_str(entry_id):
                if entry_id in seen_ids:
                    errors.append(
                        ShapeError(
                            path,
                            entry_id,
                            "id",
                            f"duplicate id (also entry #{seen_ids[entry_id]})",
                        )
                    )
                else:
                    seen_ids[entry_id] = index
    return errors


# --- shoutbox_redteam.jsonl ---------------------------------------------------

KNOWN_REDTEAM_EXPECT = frozenset({"accepted", "refused"})
# app.shoutbox.Refusal's full value space. The fixture only exercises a subset
# today (empty/too_long/too_many_lines/link/markup); `duplicate`, `rate`, and
# `queue_full` are state-dependent (need a live queue) so they are not — and
# likely never will be — pure-fixture cases, but a new case must still name a
# real rule.
KNOWN_REDTEAM_REFUSAL = frozenset(
    {
        "empty",
        "too_long",
        "too_many_lines",
        "link",
        "markup",
        "duplicate",
        "rate",
        "queue_full",
    }
)


def validate_redteam_entry(path: Path, index: int, entry: Any) -> list[ShapeError]:
    label = f"line {index + 1}"
    if not isinstance(entry, dict):
        return [
            ShapeError(
                path, label, "<entry>", f"expected an object, got {type(entry).__name__}"
            )
        ]

    if _is_nonempty_str(entry.get("id")):
        label = entry["id"]

    errors: list[ShapeError] = []

    def fail(field: str, message: str) -> None:
        errors.append(ShapeError(path, label, field, message))

    for field in ("id", "attack", "note"):
        if not _is_nonempty_str(entry.get(field)):
            fail(field, f"required non-empty string, got {entry.get(field)!r}")

    # `text` is deliberately NOT required-non-empty: rt-12 ("whitespace-only")
    # is a real case exercising the empty-after-normalisation rule, so its
    # payload is whitespace by design. It only has to be a string at all.
    if not isinstance(entry.get("text"), str):
        fail("text", f"required string, got {entry.get('text')!r}")

    expect = entry.get("expect")
    if expect not in KNOWN_REDTEAM_EXPECT:
        fail(
            "expect", f"must be one of {sorted(KNOWN_REDTEAM_EXPECT)}, got {expect!r}"
        )

    refusal = entry.get("refusal")
    if expect == "refused":
        # `tests/test_shoutbox_redteam.py::test_redteam_case` asserts
        # `verdict.refusal.value == case["refusal"]` for every refused case, so
        # a missing/unknown refusal name here would only surface as that
        # assertion failing mid-parametrize run.
        if refusal not in KNOWN_REDTEAM_REFUSAL:
            fail(
                "refusal",
                f"required, must be one of {sorted(KNOWN_REDTEAM_REFUSAL)}, "
                f"got {refusal!r}",
            )
    elif "refusal" in entry and refusal is not None:
        fail(
            "refusal",
            f"must be null (or absent) for expect='accepted', got {refusal!r}",
        )

    return errors


def validate_redteam_set(path: Path) -> list[ShapeError]:
    """Validate `shoutbox_redteam.jsonl`: one JSON object per non-blank line."""
    errors: list[ShapeError] = []
    seen_ids: dict[str, int] = {}
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    for index, line in enumerate(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(
                ShapeError(path, f"line {index + 1}", "<line>", f"invalid JSON: {exc}")
            )
            continue
        errors.extend(validate_redteam_entry(path, index, entry))
        if isinstance(entry, dict):
            entry_id = entry.get("id")
            if _is_nonempty_str(entry_id):
                if entry_id in seen_ids:
                    errors.append(
                        ShapeError(
                            path,
                            entry_id,
                            "id",
                            f"duplicate id (also line {seen_ids[entry_id] + 1})",
                        )
                    )
                else:
                    seen_ids[entry_id] = index
    return errors
