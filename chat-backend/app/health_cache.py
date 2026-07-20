"""A tiny TTL memo for the one expensive thing /health does.

/health proves the model is alive by asking it for a 1-token completion — a real
GPU generation, not a cheap version ping (see LLMClient.check_health). The
frontend polls /health on an interval, and several viewers (or several open
tabs) poll independently, so without a cache a busy moment fans out into one LLM
completion per probe. This memoises the *alive* result for a short window so a
burst collapses to a single generation.

Only the ALIVE (True) result is cached. A not-ready result (model still loading
on boot, or a real outage) is never held: it is returned and immediately
forgotten, so the very next probe re-checks. That is deliberate — the operator
board (`ragctl`) and the frontend chat-reveal both read this over HTTP, and
caching a False would keep them showing "down" for up to the TTL after the model
is actually back, turning a fast boot into a laggy one.

Deliberately lock-free: two probes racing at the exact expiry may both refresh,
which costs one extra completion and never returns a wrong answer — not worth an
asyncio.Lock on a liveness check. Set the TTL just above the poll interval so a
single viewer's consecutive probes reuse the result; a TTL <= 0 disables caching
(every call refreshes), which the unit tests pin.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable


class CachedFlag:
    """Caches an alive (True) async check result for `ttl_seconds`; never a False."""

    def __init__(
        self,
        ttl_seconds: float,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_seconds
        self._clock = clock
        # Monotonic time up to which a cached True may be returned without
        # re-probing. Starts in the past, so the first call always probes.
        self._alive_until = 0.0

    async def get(self, refresh: Callable[[], Awaitable[bool]]) -> bool:
        """Return a cached True inside the window, else await `refresh()`."""
        now = self._clock()
        if now < self._alive_until:
            return True
        alive = await refresh()
        if alive:
            self._alive_until = now + self._ttl
        return alive
