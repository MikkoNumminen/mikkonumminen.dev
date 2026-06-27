"""Tests for the /health payload shape and status logic."""

from __future__ import annotations

import pytest

from app.health import health_payload


@pytest.mark.parametrize(
    ("db_ok", "llm_ok", "status"),
    [
        (True, True, "ok"),
        (True, False, "degraded"),
        (False, True, "degraded"),
        (False, False, "degraded"),
    ],
)
def test_status_requires_both_checks(db_ok: bool, llm_ok: bool, status: str) -> None:
    payload = health_payload(db_ok, llm_ok, "qwen2.5:7b")
    assert payload["status"] == status
    assert payload["checks"] == {"db": db_ok, "llm": llm_ok}
    assert payload["model"] == "qwen2.5:7b"
