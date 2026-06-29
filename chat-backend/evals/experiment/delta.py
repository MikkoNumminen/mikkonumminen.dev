"""The baseline<->variant parallel-delta on identical expected_sources — generalized
from the Phase-D EN/FI retrieval comparison to any two retrieval-axis arms.

Both arms score the SAME questions against the SAME expected_sources, so the per-
question hit / MRR / best-distance shift between them isolates the retrieval-axis
change (e.g. English embedder vs multilingual embedder), with no "asked a different
question" confound. Pure, deterministic, zero-token: it consumes two arms' already-
recorded retrieval rows and emits the delta. It never SELECTS which two arms to
compare — the runner hands it a single-axis-comparable pair (the guard's job).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

# Each retrieval row: {"id": str, "hit": bool, "rr": float, "best_distance": float|None}
RetrievalRows = Sequence[dict[str, Any]]


def _mean(xs: list[float]) -> float:
    return round(sum(xs) / len(xs), 3) if xs else 0.0


def parallel_delta(
    a: RetrievalRows, b: RetrievalRows, *, label_a: str, label_b: str, axis: str
) -> dict[str, Any]:
    """Per-question + aggregate retrieval delta from arm `a` to arm `b` (b - a)."""
    by_id_b = {r["id"]: r for r in b}
    rows = []
    for ra in a:
        rb = by_id_b.get(ra["id"], {})
        da, db = ra.get("best_distance"), rb.get("best_distance")
        rows.append(
            {
                "id": ra["id"],
                "hit_a": bool(ra.get("hit")),
                "hit_b": bool(rb.get("hit")),
                "dist_a": da,
                "dist_b": db,
                "dist_delta": (
                    round(db - da, 3) if da is not None and db is not None else None
                ),
                "flip": (bool(ra.get("hit")) != bool(rb.get("hit"))),
            }
        )
    n = len(rows)
    hit_a = sum(1 for r in rows if r["hit_a"])
    hit_b = sum(1 for r in rows if r["hit_b"])
    shifts = [r["dist_delta"] for r in rows if r["dist_delta"] is not None]
    return {
        "axis": axis,
        "label_a": label_a,
        "label_b": label_b,
        "n": n,
        "hit_rate_a": round(hit_a / n, 3) if n else 0.0,
        "hit_rate_b": round(hit_b / n, 3) if n else 0.0,
        "mrr_a": _mean([float(r.get("rr", 0.0)) for r in a]),
        "mrr_b": _mean([float(by_id_b.get(r["id"], {}).get("rr", 0.0)) for r in a]),
        "mean_dist_delta": _mean(shifts),
        "flips": [r["id"] for r in rows if r["flip"]],
        "rows": rows,
    }
