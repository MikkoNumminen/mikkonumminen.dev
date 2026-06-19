"""Tests for the ASGI body-size limit middleware (fake ASGI harness)."""

from __future__ import annotations

import asyncio
from typing import Any

from app.middleware import BodySizeLimitMiddleware


def _run(
    max_bytes: int, chunks: list[bytes], content_length: int | None = None
) -> tuple[list[dict[str, Any]], dict[str, bytes]]:
    headers = (
        [(b"content-length", str(content_length).encode())]
        if content_length is not None
        else []
    )
    scope = {"type": "http", "headers": headers}
    messages = [
        {"type": "http.request", "body": c, "more_body": i < len(chunks) - 1}
        for i, c in enumerate(chunks)
    ]
    pending = iter(messages)

    async def receive() -> dict[str, Any]:
        return next(pending)

    sent: list[dict[str, Any]] = []

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    seen: dict[str, bytes] = {}

    async def app(scope: Any, receive: Any, send: Any) -> None:
        body = b""
        while True:
            message = await receive()
            body += message.get("body", b"")
            if not message.get("more_body", False):
                break
        seen["body"] = body
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    mw = BodySizeLimitMiddleware(app, max_bytes=max_bytes)
    asyncio.run(mw(scope, receive, send))
    return sent, seen


def _status(sent: list[dict[str, Any]]) -> int | None:
    for message in sent:
        if message["type"] == "http.response.start":
            return int(message["status"])
    return None


def test_small_body_passes_through_intact() -> None:
    sent, seen = _run(100, [b"hello"])
    assert _status(sent) == 200
    assert seen["body"] == b"hello"  # the app received the replayed body


def test_over_declared_content_length_rejected_early() -> None:
    sent, seen = _run(10, [b"x" * 50], content_length=50)
    assert _status(sent) == 413
    assert "body" not in seen  # the downstream app never ran


def test_chunked_body_over_limit_rejected() -> None:
    # No Content-Length (chunked): the running cap must still fire.
    sent, seen = _run(10, [b"x" * 6, b"x" * 6])
    assert _status(sent) == 413
    assert "body" not in seen


def test_chunked_body_under_limit_passes() -> None:
    sent, seen = _run(100, [b"ab", b"cd", b"ef"])
    assert _status(sent) == 200
    assert seen["body"] == b"abcdef"


def test_non_http_scope_passes_through() -> None:
    # A websocket/lifespan scope must not be touched by the body cap.
    ran = {"v": False}

    async def app(scope: Any, receive: Any, send: Any) -> None:
        ran["v"] = True

    async def receive() -> dict[str, Any]:
        return {"type": "noop"}

    async def send(message: dict[str, Any]) -> None:
        return None

    mw = BodySizeLimitMiddleware(app, max_bytes=10)
    asyncio.run(mw({"type": "lifespan"}, receive, send))
    assert ran["v"] is True
