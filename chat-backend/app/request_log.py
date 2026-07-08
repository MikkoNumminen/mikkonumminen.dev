"""Local request log — operational telemetry by default, raw text behind a flag.

ON by default (RAG_LOG_FILE has a path): every /chat request appends one JSON line
of OPERATIONAL fields — timestamp, route, latency, model + real token counts (set
only when the model actually ran), the retrieved chunks' cosine distances /
best_distance, and the role + classification counts. It carries NO question or
answer TEXT, so it has no PII and is safe for the public deployment; it is enough
to answer "p95 latency" and "which queries retrieved nothing".

The raw query/answer TEXT is written only when RAG_LOG_TEXT is on (off by default,
for local dev) — this stays the one place both are recorded, so it stays opt-in.

The record formatting (`format_log_record`) is pure/stdlib and unit-tested; the
file handler is wired in `main`.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Protocol

# Routes whose `gated` is True (a guardrail refused). `gated` is DERIVED from
# `route` in format_log_record so the two fields can never drift. "answered" (the
# LLM ran), "greeting" and "courtesy" (templated, no model) are NOT gated.
_GATED_ROUTES = frozenset({"generative", "translation", "weak_retrieval", "busy"})


class RequestLogger(Protocol):
    """The per-request log callable. `route` names the path taken; `model` and the
    token counts are None on every non-`answered` route (no inference ran)."""

    def __call__(
        self,
        query: str,
        distances: Sequence[float],
        route: str,
        response: str,
        role: str = "public",
        classifications: Mapping[str, int] | None = None,
        *,
        model: str | None,
        latency_ms: int,
        prompt_eval_count: int | None = None,
        eval_count: int | None = None,
        answer_lang: str | None = None,
        invented_years: Sequence[str] | None = None,
    ) -> None: ...


# The query/answer text (written only when log_text) is truncated — privacy, and
# the answer is already LLM_NUM_PREDICT-bounded.
_MAX_LOGGED_QUERY_CHARS = 200
_MAX_LOGGED_RESPONSE_CHARS = 4000

_internal = logging.getLogger("chat")


def format_log_record(
    query: str,
    distances: Sequence[float],
    *,
    route: str,
    response: str,
    role: str = "public",
    classifications: Mapping[str, int] | None = None,
    model: str | None,
    latency_ms: int,
    prompt_eval_count: int | None = None,
    eval_count: int | None = None,
    answer_lang: str | None = None,
    invented_years: Sequence[str] | None = None,
    log_text: bool = False,
    ts: str | None = None,
) -> str:
    """One compact JSON line for the request log.

    `gated` is DERIVED from `route` (never passed in), so the two stay consistent.
    Distances are sorted ascending (closest first); `best_distance` is the value
    the weak-retrieval threshold compares against, and is None when retrieval did
    not run (greeting/courtesy/generative). `model` and the token counts are None
    on every non-`answered` route. The raw `query`/`response` are written ONLY when
    `log_text` is True — otherwise just `response_chars` (a non-PII length). `ts`
    defaults to the current UTC time (ISO 8601). `ensure_ascii` is off so non-ASCII
    text (when logged) is stored readably.
    """
    ordered = sorted(distances)
    record: dict[str, object] = {
        "ts": ts or datetime.now(UTC).isoformat(),
        "route": route,
        "gated": route in _GATED_ROUTES,
        "model": model,
        "latency_ms": latency_ms,
        "prompt_eval_count": prompt_eval_count,
        "eval_count": eval_count,
        "best_distance": round(ordered[0], 4) if ordered else None,
        "distances": [round(d, 4) for d in ordered],
        "role": role,
        "classifications": dict(classifications or {}),
        "response_chars": len(response),
        # Answer-quality observability (answered route only; None/[] elsewhere):
        # the generated answer's detected language, and years it states that
        # appear nowhere in the retrieved context or the question - the
        # deterministic invented-fact signal (see guardrails.unsupported_years).
        "answer_lang": answer_lang,
        "invented_years": list(invented_years or []),
    }
    if log_text:
        record["query"] = query[:_MAX_LOGGED_QUERY_CHARS]
        record["response"] = response[:_MAX_LOGGED_RESPONSE_CHARS]
    return json.dumps(record, ensure_ascii=False)


def build_request_logger(
    log_file: str, *, log_text: bool = False
) -> RequestLogger | None:
    """A callable that appends `format_log_record` lines to `log_file`.

    Returns None when logging is disabled (empty path), so the pipeline skips the
    work. A path that can't be opened degrades to no-logging with a warning rather
    than raising — a debug log must never take the backend down at startup.
    `log_text` controls whether the raw query/answer text is written (off by
    default). Per-write failures are swallowed.
    """
    if not log_file:
        return None

    logger = logging.getLogger("chat.requests")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    # Rebuilding the logger (e.g. app re-creation in a test) must not stack
    # duplicate handlers that double-write every line — and the old handler must be
    # CLOSED, not just dropped, or its open file descriptor leaks.
    for old in list(logger.handlers):
        old.close()
        logger.removeHandler(old)
    try:
        # The default path is relative (rag-logs/requests.jsonl) and gitignored, so
        # its parent does not exist in a fresh checkout; FileHandler won't create it.
        # Make it so the "on by default" log actually materializes on a bare host
        # run, without the operator pre-creating the dir. Still inside the try, so a
        # permission error degrades gracefully rather than crashing startup.
        parent = os.path.dirname(log_file)
        if parent:
            os.makedirs(parent, exist_ok=True)
        handler = logging.FileHandler(log_file, encoding="utf-8")
    except OSError as exc:
        # A bad path / unwritable mount degrades to no-logging, never a crash of
        # the lifespan startup that builds this logger.
        _internal.warning("request log disabled: cannot open %s (%s)", log_file, exc)
        return None
    # Pure JSONL — the record already carries its own `ts`, so no asctime prefix.
    # This keeps every line directly parseable by `jq`/SQL ("p95 latency",
    # "which queries retrieved nothing") without stripping a log prefix first.
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

    def log(
        query: str,
        distances: Sequence[float],
        route: str,
        response: str,
        role: str = "public",
        classifications: Mapping[str, int] | None = None,
        *,
        model: str | None,
        latency_ms: int,
        prompt_eval_count: int | None = None,
        eval_count: int | None = None,
        answer_lang: str | None = None,
        invented_years: Sequence[str] | None = None,
    ) -> None:
        try:
            logger.info(
                format_log_record(
                    query,
                    distances,
                    route=route,
                    response=response,
                    role=role,
                    classifications=classifications,
                    model=model,
                    latency_ms=latency_ms,
                    prompt_eval_count=prompt_eval_count,
                    eval_count=eval_count,
                    answer_lang=answer_lang,
                    invented_years=invented_years,
                    log_text=log_text,
                )
            )
        except Exception:
            pass

    return log
