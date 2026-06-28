"""Server-Sent-Events framing for the streamed /chat response.

Matches the contract the terminal frontend parses (chat.ts createSSEParser):
named events `sources` / `token` / `done` / `error`, each carrying a single
JSON `data:` line. Pure/stdlib, so the wire format is unit-tested.
"""

from __future__ import annotations

import json
from typing import Any


def sse(event: str, data: Any) -> str:
    """One SSE frame: an `event:` line, a JSON `data:` line, and a blank line.

    `ensure_ascii=False` keeps non-ASCII content (the corpus has them) intact;
    `json.dumps` still escapes any newline inside the payload, so a token
    containing a newline cannot break the single-line `data:` framing.
    """
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def sse_sources(sources: list[dict[str, Any]]) -> str:
    return sse("sources", {"sources": sources})


def sse_token(text: str) -> str:
    return sse("token", {"text": text})


def sse_done() -> str:
    return sse("done", {})


def sse_error(message: str) -> str:
    return sse("error", {"message": message})


def sse_context(used: int, limit: int) -> str:
    """The session's REAL context fill (Phase 6): used = prompt_eval_count +
    eval_count from Ollama's response, limit = the model's context window
    (num_ctx). The terminal's donut renders used/limit — a true measurement, not a
    char estimate."""
    return sse("context", {"used": used, "limit": limit})
