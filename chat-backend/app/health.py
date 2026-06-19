"""Health-probe payload shape.

The frontend gates free chat on `checks.llm === true` (see chat.ts), so the
exact JSON shape is a contract. Pure, so it is unit-tested without standing up
the server.
"""

from __future__ import annotations

from typing import Any


def health_payload(db_ok: bool, llm_ok: bool, model: str) -> dict[str, Any]:
    """Build the /health body. `status` is ok only when BOTH checks pass."""
    return {
        "status": "ok" if (db_ok and llm_ok) else "degraded",
        "checks": {"db": db_ok, "llm": llm_ok},
        "model": model,
    }
