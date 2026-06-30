"""Tests for the pure chat-usage payload shaping (no DB / HTTP).

`usage.py` is deliberately dependency-light so the JSON shape `GET /usage`
returns is covered by the fast suite, the same way `test_health` covers
`health.health_payload`. The DB aggregation (`db.usage_summary`) is exercised
live, not here, since it needs a real Postgres.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.usage import UsageByModel, UsageSummary, usage_payload


def test_usage_payload_with_data() -> None:
    summary = UsageSummary(
        window_hours=24,
        since=datetime(2026, 6, 25, 3, 0, tzinfo=UTC),
        total_requests=3,
        total_tokens=776,
        by_model=[
            UsageByModel("qwen2.5:7b", 2, 500),
            UsageByModel("gemma4:e4b", 1, 276),
        ],
    )
    assert usage_payload(summary) == {
        "window_hours": 24,
        "since": "2026-06-25T03:00:00+00:00",
        "total_requests": 3,
        "total_tokens": 776,
        "by_model": [
            {"model": "qwen2.5:7b", "requests": 2, "tokens": 500},
            {"model": "gemma4:e4b", "requests": 1, "tokens": 276},
        ],
    }


def test_usage_payload_empty_window_has_null_since() -> None:
    # No requests in the window: `since` must serialise to null (not now()), and
    # the breakdown is empty — lets a caller distinguish "0 in 24h" from "idle".
    payload = usage_payload(
        UsageSummary(
            window_hours=24,
            since=None,
            total_requests=0,
            total_tokens=0,
            by_model=[],
        )
    )
    assert payload["since"] is None
    assert payload["total_requests"] == 0
    assert payload["by_model"] == []
