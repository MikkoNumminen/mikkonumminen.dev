"""Tests for the opt-in local request log."""

from __future__ import annotations

import json
from pathlib import Path

from app.request_log import build_request_logger, format_log_record


def test_format_sorts_and_rounds_distances() -> None:
    line = format_log_record("what is hrm", [0.42135, 0.1, 0.31119], False, "HRM is a system.")
    record = json.loads(line)
    assert record["query"] == "what is hrm"
    assert record["distances"] == [0.1, 0.3112, 0.4214]  # ascending + rounded
    assert record["best_distance"] == 0.1
    assert record["gated"] is False
    assert record["response"] == "HRM is a system."
    assert record["response_chars"] == len("HRM is a system.")


def test_format_handles_empty_retrieval() -> None:
    record = json.loads(format_log_record("obscure q", [], True, "Sorry, I can't help."))
    assert record["distances"] == []
    assert record["best_distance"] is None
    assert record["gated"] is True
    assert record["response"] == "Sorry, I can't help."
    assert record["response_chars"] == len("Sorry, I can't help.")


def test_format_preserves_non_ascii_query() -> None:
    # ensure_ascii is off: a Finnish question is stored readably, not escaped.
    record = json.loads(format_log_record("Mikä on HRM-järjestelmä?", [0.2], False, "vastaus"))
    assert record["query"] == "Mikä on HRM-järjestelmä?"


def test_format_truncates_long_query() -> None:
    # Privacy: the full (up to INPUT_MAX_CHARS) question text is not retained.
    record = json.loads(format_log_record("x" * 5000, [0.2], False, "short answer"))
    assert len(record["query"]) == 200


def test_format_truncates_long_response() -> None:
    # The answer is bounded at _MAX_LOGGED_RESPONSE_CHARS (4000) but response_chars
    # reflects the true full length.
    long_answer = "a" * 5000
    record = json.loads(format_log_record("q", [0.2], False, long_answer))
    assert len(record["response"]) == 4000
    assert record["response_chars"] == 5000


def test_build_returns_none_when_disabled() -> None:
    assert build_request_logger("") is None


def test_build_returns_none_for_bad_path() -> None:
    # A non-existent directory degrades to no-logging instead of crashing startup.
    result = build_request_logger("/nonexistent/path/that/cannot/exist/rag.log")
    assert result is None


def test_build_writes_one_json_line_per_call(tmp_path: Path) -> None:
    log_file = tmp_path / "rag.log"
    log = build_request_logger(str(log_file))
    assert log is not None
    log("first query", [0.2, 0.5], False, "The answer is 42.")
    log("second query", [], True, "I cannot answer that.")

    lines = log_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    # The asctime prefix precedes the JSON object; parse from the first brace.
    first = json.loads(lines[0][lines[0].index("{") :])
    assert first["query"] == "first query"
    assert first["gated"] is False
    assert first["response"] == "The answer is 42."
    second = json.loads(lines[1][lines[1].index("{") :])
    assert second["query"] == "second query"
    assert second["gated"] is True
    assert second["response"] == "I cannot answer that."
