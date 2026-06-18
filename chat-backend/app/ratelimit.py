"""Per-IP rate limiting — protects the machine while the tunnel is open.

A sliding-window request log per key (client IP). `allow` is given the current
time so it is fully deterministic and unit-tested without sleeping. Memory is
bounded by the number of distinct recently-active IPs; a key whose window has
fully drained is dropped on its next check. For a personal portfolio behind an
on-demand tunnel that is plenty — this is a machine-protection guard, not a
distributed quota.
"""

from __future__ import annotations


class RateLimiter:
    """Sliding-window limiter: at most `max_requests` per `window_seconds`/key."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        if max_requests <= 0 or window_seconds <= 0:
            raise ValueError("max_requests and window_seconds must be positive")
        self._max = max_requests
        self._window = window_seconds
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, now: float) -> bool:
        """Record a request from `key` at `now`; return False if over the limit.

        Timestamps older than the window are discarded first, so the window
        slides continuously rather than resetting on a fixed boundary.
        """
        window_start = now - self._window
        recent = [t for t in self._hits.get(key, ()) if t > window_start]
        if len(recent) >= self._max:
            self._hits[key] = recent
            return False
        recent.append(now)
        self._hits[key] = recent
        return True

    def prune(self, now: float) -> None:
        """Drop keys with no requests left in the window (bounds memory)."""
        window_start = now - self._window
        self._hits = {
            key: recent
            for key, hits in self._hits.items()
            if (recent := [t for t in hits if t > window_start])
        }
