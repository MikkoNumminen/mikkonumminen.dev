"""Opt-in local request log for tuning the gate and reviewing the chat.

OFF by default (RAG_LOG_FILE=""). When a path is configured, every /chat request
appends one JSON line: the query, the model's answer, the retrieved chunks'
cosine distances, the gate decision (was a guardrail refusal fired?), and the
answer length. This tunes WEAK_RETRIEVAL_DISTANCE, spots out-of-scope probes
after the fact, AND is a readable record of what was asked and how it answered.

It is the ONLY place the question text and the answer are written down — usage
telemetry stores counts only — so the feature stays opt-in and the file is local:
never shipped, never returned by an endpoint. The record formatting
(`format_log_record`) is pure/stdlib and unit-tested; the file handler is wired
in `main`.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Sequence

# (query, distances, gated, response) -> None. `distances` are the cosine
# distances of the retrieved chunks; `gated` is True when a guardrail refused
# without calling the model (the canned refusal is then the `response`).
RequestLogger = Callable[[str, Sequence[float], bool, str], None]

# The question text is truncated (privacy: don't retain every question up to
# INPUT_MAX_CHARS verbatim). The answer is the model's own output, already bounded
# by the LLM_NUM_PREDICT cap and the point of the log, so it gets a far more
# generous bound.
_MAX_LOGGED_QUERY_CHARS = 200
_MAX_LOGGED_RESPONSE_CHARS = 4000

_internal = logging.getLogger("chat")


def format_log_record(
    query: str, distances: Sequence[float], gated: bool, response: str
) -> str:
    """One compact JSON line for the request log.

    The query is truncated to the leading `_MAX_LOGGED_QUERY_CHARS` (privacy);
    the answer to `_MAX_LOGGED_RESPONSE_CHARS`. Distances are sorted ascending
    (closest first) and rounded so a glance shows retrieval strength;
    `best_distance` surfaces the single closest match, the value the
    weak-retrieval threshold is compared against. `ensure_ascii` is off so a
    non-ASCII query/answer is stored readably rather than escaped.
    """
    ordered = sorted(distances)
    return json.dumps(
        {
            "query": query[:_MAX_LOGGED_QUERY_CHARS],
            "distances": [round(d, 4) for d in ordered],
            "best_distance": round(ordered[0], 4) if ordered else None,
            "gated": gated,
            "response": response[:_MAX_LOGGED_RESPONSE_CHARS],
            "response_chars": len(response),
        },
        ensure_ascii=False,
    )


def build_request_logger(log_file: str) -> RequestLogger | None:
    """A callable that appends `format_log_record` lines to `log_file`.

    Returns None when logging is disabled (empty path), so the pipeline skips the
    work entirely. A path that can't be opened (missing/unwritable dir) ALSO
    returns None with a warning rather than raising — a debug log must never take
    the backend down at startup. Per-write failures are likewise swallowed.
    """
    if not log_file:
        return None

    logger = logging.getLogger("chat.requests")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    # Rebuilding the logger (e.g. app re-creation in a test) must not stack
    # duplicate handlers that double-write every line — and the old handler must
    # be CLOSED, not just dropped, or its open file descriptor leaks.
    for old in list(logger.handlers):
        old.close()
        logger.removeHandler(old)
    try:
        handler = logging.FileHandler(log_file, encoding="utf-8")
    except OSError as exc:
        # A bad path / unwritable mount degrades to no-logging, never a crash of
        # the lifespan startup that builds this logger.
        _internal.warning("request log disabled: cannot open %s (%s)", log_file, exc)
        return None
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    logger.addHandler(handler)

    def log(
        query: str, distances: Sequence[float], gated: bool, response: str
    ) -> None:
        try:
            logger.info(format_log_record(query, distances, gated, response))
        except Exception:
            pass

    return log
