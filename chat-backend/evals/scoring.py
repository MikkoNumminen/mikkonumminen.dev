"""Eval scoring — retrieval hit-rate over a fixed question set.

The credibility piece: does the right source actually get retrieved for a known
question, and does an out-of-corpus question get refused? The scoring maths are
separated from the I/O runner (run_eval.py) so they are unit-tested without a DB
or model.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class QueryResult:
    question: str
    expected: list[str]
    retrieved: list[str]
    best_distance: float | None
    hit: bool


def score_query(
    expected: Sequence[str],
    retrieved_sources: Sequence[str],
    best_distance: float | None,
    weak_threshold: float,
) -> bool:
    """Whether a query's retrieval is correct.

    In-corpus (`expected` non-empty): pass when every expected source appears in
    the retrieved set. Out-of-corpus (`expected` empty): pass when the guardrail
    would refuse — no chunks at all, or the closest chunk is beyond
    `weak_threshold` (so generation is never reached).
    """
    if not expected:
        return best_distance is None or best_distance > weak_threshold
    # In-corpus: mirror the pipeline's guardrail. If the closest chunk is beyond
    # the weak threshold the pipeline refuses without answering, so an expected
    # source that was "retrieved" but gated out is NOT a real hit — counting it
    # would inflate the hit-rate this eval exists to measure.
    if best_distance is None or best_distance > weak_threshold:
        return False
    found = set(retrieved_sources)
    return all(source in found for source in expected)


def hit_rate(results: Sequence[QueryResult]) -> float:
    """Fraction of queries that passed (0.0 for an empty set)."""
    if not results:
        return 0.0
    return sum(1 for r in results if r.hit) / len(results)


def format_table(results: Sequence[QueryResult]) -> str:
    """A simple aligned PASS/FAIL table plus the aggregate hit-rate."""
    lines = [f"{'result':<6}  {'dist':>5}  question"]
    lines.append("-" * 60)
    for r in results:
        mark = "PASS" if r.hit else "FAIL"
        dist = "  -  " if r.best_distance is None else f"{r.best_distance:.3f}"
        lines.append(f"{mark:<6}  {dist:>5}  {r.question}")
    passed = sum(1 for r in results if r.hit)
    lines.append("-" * 60)
    lines.append(f"hit-rate: {passed}/{len(results)} = {hit_rate(results) * 100:.1f}%")
    return "\n".join(lines)
