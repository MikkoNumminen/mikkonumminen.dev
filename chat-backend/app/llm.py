"""Chat LLM client — local model via Ollama's OpenAI-compatible endpoint.

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


def _decode_data_line(line: str) -> dict[str, object] | None:
    """The JSON object in one OpenAI-style streaming `data:` line, or None.

    Every parser below needs the same four guards: the `data:` prefix, the
    `[DONE]` sentinel, keep-alive blanks, and a payload that may not be JSON at
    all. Three copies of that preamble is how a wire-format fix lands in two
    places and gets forgotten in the third, so it lives here once.

    Returning None rather than raising is the contract the callers rely on: a
    malformed chunk must never crash an in-flight stream.
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
    return obj if isinstance(obj, dict) else None


def _first_choice(obj: dict[str, object]) -> dict[str, object] | None:
    """`choices[0]` when it is a dict, else None.

    A non-dict choice entry (a malformed or keep-alive chunk) is skipped like any
    other non-content line, never raised over.
    """
    choices = obj.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    return first if isinstance(first, dict) else None


def parse_stream_line(line: str) -> str | None:
    """Extract the token delta from one OpenAI-style streaming `data:` line.

    Returns the delta text, or None for lines that carry no content: the
    `[DONE]` sentinel, keep-alives, blank lines, and empty deltas (e.g. the
    role-only first chunk). Pure — unit-tested.
    """
    obj = _decode_data_line(line)
    if obj is None:
        return None
    first = _first_choice(obj)
    if first is None:
        return None
    delta = first.get("delta") or {}
    if not isinstance(delta, dict):
        return None
    content = delta.get("content")
    return content if isinstance(content, str) and content else None


def parse_finish_reason(line: str) -> str | None:
    """Extract `finish_reason` from one streaming `data:` line, or None.

    "stop" means the model chose to end. "length" means it was cut off at
    `max_tokens` mid-sentence. Without reading this the two are
    indistinguishable downstream: the SSE stream simply ends either way, so a
    truncated answer looks exactly like a finished one to the terminal and to
    anyone reading the request log. Pure — unit-tested.
    """
    obj = _decode_data_line(line)
    if obj is None:
        return None
    first = _first_choice(obj)
    if first is None:
        return None
    reason = first.get("finish_reason")
    return reason if isinstance(reason, str) and reason else None


def parse_usage_line(line: str) -> dict[str, int] | None:
    """Extract {prompt, completion} REAL token counts from a streaming `data:` line.

    With `stream_options.include_usage`, the OpenAI-compatible endpoint emits one
    final chunk carrying `usage` (and an empty `choices`). These are the true
    prompt_eval_count / eval_count Ollama reports — what the context bar measures,
    never a char estimate. Returns None for every other line. Pure — unit-tested.
    """
    obj = _decode_data_line(line)
    if obj is None:
        return None
    usage = obj.get("usage")
    if not isinstance(usage, dict):
        return None
    prompt = usage.get("prompt_tokens")
    completion = usage.get("completion_tokens")
    if not isinstance(prompt, int) or not isinstance(completion, int):
        return None
    return {"prompt": prompt, "completion": completion}


class LLMClient:
    """Thin async client over the Ollama OpenAI-compatible chat endpoint."""

    def __init__(
        self,
        base_url: str,
        model: str,
        timeout_seconds: int,
        *,
        temperature: float = 0.4,
        num_predict: int = 0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout_seconds
        self._temperature = temperature
        self._num_predict = num_predict

    def _chat_payload(
        self,
        messages: Sequence[dict[str, str]],
        temperature: float | None = None,
    ) -> dict[str, object]:
        """The OpenAI-compatible request body with the effort knobs applied.

        `temperature` is always sent (a per-call override wins over the
        configured default — the retrieval translation runs at 0 so the whole
        downstream chain stops inheriting sampling variance); `max_tokens`
        (Ollama maps it to num_predict) only when a positive cap is configured,
        so 0 keeps the model's default.
        """
        payload: dict[str, object] = {
            "model": self._model,
            "messages": list(messages),
            "stream": True,
            # Emit a final usage chunk (prompt_tokens + completion_tokens) so the
            # context bar measures REAL token counts, not a char estimate.
            "stream_options": {"include_usage": True},
            "temperature": self._temperature if temperature is None else temperature,
        }
        if self._num_predict > 0:
            payload["max_tokens"] = self._num_predict
        return payload

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

    async def stream_chat(
        self,
        messages: Sequence[dict[str, str]],
        *,
        usage_out: dict[str, int] | None = None,
        finish_out: dict[str, str] | None = None,
        temperature: float | None = None,
    ) -> AsyncIterator[str]:
        """Yield answer tokens as the model generates them.

        When `usage_out` is given, the final usage chunk's real token counts
        (prompt + completion) are written into it — the context bar's true numbers.
        """
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{self._base}/chat/completions",
                json=self._chat_payload(messages, temperature=temperature),
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    # Checked FIRST, on every line, including lines that also
                    # carry a token. The OpenAI wire format permits a chunk to
                    # hold both the last content delta and finish_reason, and
                    # some servers do exactly that. Reading it only on empty
                    # chunks would miss truncation entirely against those, which
                    # is the very bug this exists to catch, reintroduced
                    # invisibly. Ollama happens to send them separately today;
                    # depending on that is what made the original bug invisible.
                    if finish_out is not None:
                        reason = parse_finish_reason(line)
                        if reason is not None:
                            finish_out["reason"] = reason
                    token = parse_stream_line(line)
                    if token is not None:
                        yield token
                        continue
                    if usage_out is not None:
                        usage = parse_usage_line(line)
                        if usage is not None:
                            usage_out.update(usage)
