"""Per-IP rate limiting — protects the machine while the tunnel is open.

A sliding-window request log per key (client IP). `allow` is given the current
time so it is fully deterministic and unit-tested without sleeping. `allow`
re-stores a drained key rather than removing it, so memory is bounded only by
calling `prune()` periodically — the guard middleware does this on a request
cadence, which keeps `_hits` to recently-active IPs. For a personal portfolio
behind an on-demand tunnel that is plenty — this is a machine-protection guard,
not a distributed quota.
"""

from __future__ import annotations


def client_ip(forwarded_for: str | None, peer: str | None) -> str:
    """The visitor's IP for rate-limiting, preferring X-Forwarded-For.

    The ingress is a Tailscale Funnel (ADR 0012), not the Cloudflare Tunnel this
    docstring used to describe. That is not a cosmetic correction: the two
    proxies make opposite trust guarantees, and an injection audit reasoning from
    the stale text concluded a visitor could rotate this header to escape the
    limiter.

    Tailscale's serve proxy REPLACES X-Forwarded-For with the connection source
    it observes (`Header.Set` in `ipn/ipnlocal/serve.go`). Two consequences, both
    deliberate and both recorded in ADR 0012:

    - A direct-to-funnel caller CANNOT spoof the first hop, so the per-IP limiter
      fully protects that path. This is the path an attacker would use.
    - Requests proxied through Vercel arrive keyed on Vercel egress IPs, so
      ordinary visitors share a bucket and per-client attribution is lost there.
      Accepted, not a contingency: what actually bounds GPU work is the ADR 0010
      layer (shed-not-queue concurrency, output and input caps), and for the
      write path it is QUEUE_MAX_PENDING, which depends on no identity at all.

    A direct-to-host run with no proxy falls back to the socket peer. Pure, so it
    is unit-tested.
    """
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    return peer or "unknown"


_LOOPBACK = frozenset({"127.0.0.1", "::1"})


def is_exempt_local(forwarded_for: str | None, peer: str | None) -> bool:
    """A genuine direct-to-loopback request (the trusted ops/eval path) — exempt from
    rate-limiting.

    STRICTLY: a loopback socket peer AND no X-Forwarded-For. The tunnel (the only public
    ingress) ALWAYS sets X-Forwarded-For, so a proxied/Funnel visitor can never satisfy
    this — even though its socket peer may itself be loopback. This is deliberately NOT a
    CIDR / "internal network" exemption (which could accidentally cover Tailscale
    addresses and open the public path); it is the single loopback address with no proxy
    header. See ADR 0010. Pure, so it is unit-tested.
    """
    return forwarded_for is None and peer in _LOOPBACK


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
