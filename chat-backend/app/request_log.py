"""Opt-in local request log for tuning the containment gate.

OFF by default (RAG_LOG_FILE=""). When a path is configured, every /chat
request appends one JSON line: the query, the retrieved chunks' cosine
distances, the gate decision (was the weak-retrieval refusal fired?), and the
response length. This is the signal for tuning WEAK_RETRIEVAL_DISTANCE and for
spotting out-of-scope probes after the fact.

It is the ONLY place the question text is written down — usage telemetry stores
counts only — so the feature stays opt-in and the file is local: never shipped,
never returned by an endpoint. The record formatting (`format_log_record`) is
pure/stdlib and unit-tested; the file handler is wired in `main`.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Sequence

# (query, distances, gated, response_chars) -> None. `distances` are the cosine
# distances of the retrieved chunks; `gated` is True when the weak-retrieval
# guardrail refused without calling the model.
RequestLogger = Callable[[str, Sequence[float], bool, int], None]


def format_log_record(
    query: str, distances: Sequence[float], gated: bool, response_chars: int
) -> str:
    """One compact JSON line for the request log.

    Distances are sorted ascending (closest match first) and rounded so a glance
    shows retrieval strength; `best_distance` surfaces the single closest match,
    the value the weak-retrieval threshold is compared against. `ensure_ascii`
    is off so a non-ASCII query is stored readably rather than escaped.
    """
    ordered = sorted(distances)
    return json.dumps(
        {
            "query": query,
            "distances": [round(d, 4) for d in ordered],
            "best_distance": round(ordered[0], 4) if ordered else None,
            "gated": gated,
            "response_chars": response_chars,
        },
        ensure_ascii=False,
    )


def build_request_logger(log_file: str) -> RequestLogger | None:
    """A callable that appends `format_log_record` lines to `log_file`.

    Returns None when logging is disabled (empty path), so the pipeline skips
    the work entirely. Write failures are swallowed — a debug log must never
    break a delivered answer.
    """
    if not log_file:
        return None

    logger = logging.getLogger("chat.requests")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    # Rebuilding the logger (e.g. app re-creation in a test) must not stack
    # duplicate handlers that double-write every line.
    logger.handlers.clear()
    handler = logging.FileHandler(log_file, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    logger.addHandler(handler)

    def log(
        query: str, distances: Sequence[float], gated: bool, response_chars: int
    ) -> None:
        try:
            logger.info(format_log_record(query, distances, gated, response_chars))
        except Exception:
            pass

    return log
