"""ASGI middleware: cap the request body size.

The brief's "request size cap to protect the machine while the tunnel is open"
must hold for *actual* bytes, not just a declared `Content-Length` — a chunked
(no-length) request would otherwise stream an arbitrarily large body straight
into the JSON parser. This rejects an over-declared body up front (cheap) and
otherwise reads the body under a running cap, aborting with 413 the moment the
limit is crossed. Request bodies here are small JSON (a question), so reading
then replaying is negligible and keeps the downstream `await request.json()`
working.

A pure ASGI middleware (not a `BaseHTTPMiddleware`) so it can wrap `receive`
directly; exercised with a fake ASGI harness in the unit tests.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_TOO_LARGE_BODY = b'{"detail":"request too large"}'


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Cheap early reject when the declared length already exceeds the cap.
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(value) > self.max_bytes:
                        await self._reject(send)
                        return
                except ValueError:
                    pass
                break

        # Read the body under a running cap. Aborts as soon as a chunk pushes the
        # total over the limit, so at most max_bytes + one chunk is ever buffered
        # — a chunked client cannot stream past it.
        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break  # disconnect / unexpected — stop reading the body
            total += len(message.get("body", b""))
            if total > self.max_bytes:
                await self._reject(send)
                return
            chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            # Later receives (e.g. http.disconnect) come from the real stream.
            return await receive()

        await self.app(scope, replay, send)

    async def _reject(self, send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": _TOO_LARGE_BODY})
