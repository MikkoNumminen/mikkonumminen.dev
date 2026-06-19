"""Chat LLM client — local Gemma via Ollama's OpenAI-compatible endpoint.

Streams tokens from `POST {base}/chat/completions` (stream=true) and exposes a
health check that confirms the model actually *generates* (a 1-token completion),
not merely that the server is up — the frontend relies on this to decide whether
free chat is available. No API key: there is no hosted model and no paid API.

httpx is imported at module load; the streaming-chunk parser is pure and
unit-tested.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence

import httpx


def parse_stream_line(line: str) -> str | None:
    """Extract the token delta from one OpenAI-style streaming `data:` line.

    Returns the delta text, or None for lines that carry no content: the
    `[DONE]` sentinel, keep-alives, blank lines, and empty deltas (e.g. the
    role-only first chunk). Pure — unit-tested.
    """
    if not line.startswith("data:"):
        return None
    payload = line[len("data:") :].strip()
    if not payload or payload == "[DONE]":
        return None
    try:
        obj = json.loads(payload)
    except json.JSONDecodeError:
        return None
    choices = obj.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        # A non-dict choice entry (a malformed/keepalive chunk) is skipped like
        # any other non-content line — never crash an in-flight stream over it.
        return None
    delta = first.get("delta") or {}
    content = delta.get("content")
    return content if isinstance(content, str) and content else None


class LLMClient:
    """Thin async client over the Ollama OpenAI-compatible chat endpoint."""

    def __init__(self, base_url: str, model: str, timeout_seconds: int) -> None:
        self._base = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout_seconds

    async def check_health(self) -> bool:
        """True iff the model returns a 1-token completion within the timeout.

        A tiny real completion (not just a `/models` listing) is what proves the
        model is loaded and generating — the guarantee the frontend gate needs.
        Any error (connection refused, timeout, model still pulling) is False.
        """
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._base}/chat/completions",
                    json={
                        "model": self._model,
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 1,
                        "stream": False,
                    },
                )
                return resp.status_code == 200
        except (httpx.HTTPError, OSError):
            return False

    async def stream_chat(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]:
        """Yield answer tokens as the model generates them."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{self._base}/chat/completions",
                json={"model": self._model, "messages": list(messages), "stream": True},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    token = parse_stream_line(line)
                    if token is not None:
                        yield token
