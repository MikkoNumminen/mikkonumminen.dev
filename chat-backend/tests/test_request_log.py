"""Tests for the request log (operational by default, raw text behind a flag)."""

from __future__ import annotations

import json
from pathlib import Path

from app.request_log import build_request_logger, format_log_record


def _record(**over: object) -> dict[str, object]:
    """A representative record, overridable per test. Defaults to an answered turn."""
    kwargs: dict[str, object] = dict(
        route="answered",
        response="HRM is a system.",
        model="qwen2.5:7b",
        latency_ms=1280,
        prompt_eval_count=3607,
        eval_count=40,
    )
    kwargs.update(over)
    return json.loads(format_log_record("what is hrm", [0.42135, 0.1, 0.31119], **kwargs))


def test_operational_fields_and_no_text_by_default() -> None:
    r = _record()
    assert r["route"] == "answered"
    assert r["gated"] is False
    assert r["model"] == "qwen2.5:7b"
    assert r["latency_ms"] == 1280
    assert r["prompt_eval_count"] == 3607
    assert r["eval_count"] == 40
    assert r["distances"] == [0.1, 0.3112, 0.4214]  # ascending + rounded
    assert r["best_distance"] == 0.1
    assert r["response_chars"] == len("HRM is a system.")
    assert isinstance(r["ts"], str) and r["ts"].endswith("+00:00")  # UTC ISO 8601
    # No PII by default.
    assert "query" not in r
    assert "response" not in r


def test_text_mode_includes_query_and_response() -> None:
    r = _record(log_text=True)
    assert r["query"] == "what is hrm"
    assert r["response"] == "HRM is a system."


def test_gated_is_derived_from_route() -> None:
    for route in ("generative", "translation", "weak_retrieval", "busy"):
        assert _record(route=route, model=None)["gated"] is True
    for route in ("answered", "greeting", "courtesy"):
        assert _record(route=route)["gated"] is False


def test_nulls_on_non_answered_routes() -> None:
    r = json.loads(
        format_log_record(
            "obscure q",
            [],
            route="weak_retrieval",
            response="I don't have anything on that.",
            model=None,
            latency_ms=120,
        )
    )
    assert r["model"] is None
    assert r["prompt_eval_count"] is None
    assert r["eval_count"] is None
    assert r["best_distance"] is None
    assert r["distances"] == []
    assert r["response_chars"] == len("I don't have anything on that.")
    assert "query" not in r


def test_role_and_classifications_in_operational_log() -> None:
    r = _record(role="internal", classifications={"public": 2, "internal": 1})
    assert r["role"] == "internal"
    assert r["classifications"] == {"public": 2, "internal": 1}


def test_defaults_role_public_and_empty_classifications() -> None:
    r = _record()
    assert r["role"] == "public"
    assert r["classifications"] == {}


def test_ts_can_be_overridden() -> None:
    assert _record(ts="2026-01-01T00:00:00+00:00")["ts"] == "2026-01-01T00:00:00+00:00"


def test_text_mode_preserves_non_ascii() -> None:
    r = json.loads(
        format_log_record(
            "Mikä on HRM?",
            [0.2],
            route="answered",
            response="vastaus",
            model="m",
            latency_ms=1,
            log_text=True,
        )
    )
    assert r["query"] == "Mikä on HRM?"


def test_text_mode_truncates_query_and_response() -> None:
    r = json.loads(
        format_log_record(
            "x" * 5000,
            [0.2],
            route="answered",
            response="a" * 5000,
            model="m",
            latency_ms=1,
            log_text=True,
        )
    )
    # The marker distinguishes a cut string from one that was exactly the cap.
    assert r["query"] == "x" * 200 + "…[truncated]"
    assert r["response"] == "a" * 4000 + "…[truncated]"
    assert r["response_chars"] == 5000  # true length, even when the text is truncated


def test_text_exactly_at_the_cap_gets_no_marker() -> None:
    r = json.loads(
        format_log_record(
            "x" * 200,
            [0.2],
            route="answered",
            response="a" * 4000,
            model="m",
            latency_ms=1,
            log_text=True,
        )
    )
    assert r["query"] == "x" * 200
    assert r["response"] == "a" * 4000


def test_build_returns_none_when_disabled() -> None:
    assert build_request_logger("") is None


def test_build_returns_none_for_bad_path(tmp_path: Path) -> None:
    # The path is placed UNDER a regular file, so `os.makedirs` raises
    # NotADirectoryError. That holds for every user, including root — an
    # absolute path like /nonexistent/... is merely unwritable, and root
    # creates it happily, which made this assertion pass locally only for
    # unprivileged users and fail inside a root container.
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("", encoding="utf-8")
    assert build_request_logger(str(blocker / "sub" / "rag.log")) is None


def test_build_writes_one_json_line_per_call(tmp_path: Path) -> None:
    log = build_request_logger(str(tmp_path / "rag.log"), log_text=True)
    assert log is not None
    log(
        "first query",
        [0.2, 0.5],
        "answered",
        "The answer is 42.",
        "admin",
        {"public": 2},
        model="qwen2.5:7b",
        latency_ms=900,
        prompt_eval_count=10,
        eval_count=5,
    )
    log("second query", [], "weak_retrieval", "no", model=None, latency_ms=50)

    lines = (tmp_path / "rag.log").read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    assert lines[0].startswith("{")  # pure JSONL — no log prefix, so jq parses it
    first = json.loads(lines[0])
    assert first["query"] == "first query"  # text mode on
    assert first["route"] == "answered" and first["gated"] is False
    assert first["model"] == "qwen2.5:7b" and first["prompt_eval_count"] == 10
    assert first["role"] == "admin" and first["classifications"] == {"public": 2}
    second = json.loads(lines[1])
    assert second["route"] == "weak_retrieval" and second["gated"] is True
    assert second["model"] is None and second["best_distance"] is None
    assert second["role"] == "public" and second["classifications"] == {}


def test_default_logger_omits_text(tmp_path: Path) -> None:
    # log_text defaults False: the operational line carries no query/response.
    log = build_request_logger(str(tmp_path / "rag.log"))
    assert log is not None
    log(
        "secret question",
        [0.2],
        "answered",
        "secret answer",
        model="m",
        latency_ms=10,
        prompt_eval_count=1,
        eval_count=1,
    )
    line = (tmp_path / "rag.log").read_text(encoding="utf-8").strip()
    rec = json.loads(line)
    assert "query" not in rec and "response" not in rec
    assert rec["response_chars"] == len("secret answer")
