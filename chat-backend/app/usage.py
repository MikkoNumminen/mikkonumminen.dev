"""Chat-usage value types + JSON shaping (pure — no DB / HTTP imports).

Kept out of `db.py` on purpose: `db.py` imports asyncpg/pgvector at module load,
so the JSON shaping would only be testable against a real database. Here the
`usage_payload` serialiser is pure stdlib and unit-tests in the fast suite, just
like `health.health_payload`. `db.usage_summary` builds these dataclasses and
`main` serialises them for `GET /usage`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class UsageByModel:
    """Request + token totals for one model within a usage window."""

    model: str
    requests: int
    tokens: int


@dataclass(frozen=True)
class UsageSummary:
    """Aggregate chat usage over the last `window_hours`.

    `since` is the earliest request timestamp inside the window (None when there
    were no requests), so a caller can tell "0 in the last 24h" from "the oldest
    of these N is 3h old".
    """

    window_hours: int
    since: datetime | None
    total_requests: int
    total_tokens: int
    by_model: list[UsageByModel]


def usage_payload(summary: UsageSummary) -> dict:
    """The JSON body `GET /usage` returns — totals plus a per-model breakdown.

    `since` is rendered ISO-8601 (or null); counts only, never any question text.
    """
    return {
        "window_hours": summary.window_hours,
        "since": summary.since.isoformat() if summary.since else None,
        "total_requests": summary.total_requests,
        "total_tokens": summary.total_tokens,
        "by_model": [
            {"model": m.model, "requests": m.requests, "tokens": m.tokens}
            for m in summary.by_model
        ],
    }
