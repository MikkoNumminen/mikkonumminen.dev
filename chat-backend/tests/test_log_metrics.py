"""Tests for the request-log metrics aggregator (pure, no I/O beyond strings)."""

from __future__ import annotations

import json

from evals.log_metrics import aggregate


def _line(**kw: object) -> str:
    base: dict[str, object] = {
        "ts": "2026-07-08T00:00:00+00:00",
        "route": "answered",
        "answer_lang": "fi",
        "invented_years": [],
    }
    base.update(kw)
    return json.dumps(base)


def test_aggregate_language_rates_and_invented_year_rate() -> None:
    lines = [
        _line(answer_lang="fi"),
        _line(answer_lang="fi", invented_years=["2019", "2021"], query="q"),
        _line(answer_lang="en"),
        _line(route="weak_retrieval", answer_lang=None),
        _line(route="greeting", answer_lang=None),
    ]
    out = aggregate(lines)
    assert out["requests"] == 5
    assert out["answered"] == 3
    assert out["answer_lang_rates"] == {"en": 0.333, "fi": 0.667}
    assert out["invented_year_requests"] == 1
    assert out["invented_year_rate"] == 0.333
    assert out["invented_examples"][0]["invented_years"] == ["2019", "2021"]


def test_aggregate_since_filters_older_records() -> None:
    lines = [
        _line(ts="2026-07-01T00:00:00+00:00"),
        _line(ts="2026-07-08T12:00:00+00:00"),
    ]
    out = aggregate(lines, since="2026-07-08T00:00:00+00:00")
    assert out["answered"] == 1


def test_aggregate_survives_malformed_lines() -> None:
    out = aggregate(["not json", "", _line()])
    assert out["malformed_lines"] == 1
    assert out["answered"] == 1
