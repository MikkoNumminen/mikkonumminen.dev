"""A tiny TTL memo for the one expensive thing /health does.

/health proves the model is alive by asking it for a 1-token completion — a real
GPU generation, not a cheap version ping (see LLMClient.check_health). The
frontend polls /health on an interval, and several viewers (or several open
tabs) poll independently, so without a cache a busy moment fans out into one LLM
completion per probe. This memoises the boolean for a short window so a burst
collapses to a single generation.

Deliberately lock-free: two probes racing at the exact expiry may both refresh,
which costs one extra completion and never returns a wrong answer — not worth an
asyncio.Lock on a liveness check. Set the TTL just above the poll interval so a
single viewer's consecutive probes reuse the result; a TTL <= 0 disables caching
(every call refreshes), which is what the unit tests pin.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable


class CachedFlag:
    """Caches the result of an async boolean check for `ttl_seconds`."""

    def __init__(
        self,
        ttl_seconds: float,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_seconds
        self._clock = clock
        self._value: bool | None = None
        self._expires = 0.0

    async def get(self, refresh: Callable[[], Awaitable[bool]]) -> bool:
        """Return the cached value, or await `refresh()` when it has expired."""
        now = self._clock()
        if self._value is None or now >= self._expires:
            self._value = await refresh()
            self._expires = now + self._ttl
        return self._value
