"""Tests for the per-IP sliding-window rate limiter."""

from __future__ import annotations

import pytest

from app.ratelimit import RateLimiter, client_ip, is_exempt_local


def test_allows_up_to_the_limit_then_blocks() -> None:
    limiter = RateLimiter(max_requests=3, window_seconds=60)
    assert limiter.allow("ip", now=0.0) is True
    assert limiter.allow("ip", now=1.0) is True
    assert limiter.allow("ip", now=2.0) is True
    assert limiter.allow("ip", now=3.0) is False  # 4th in the window


def test_window_slides() -> None:
    limiter = RateLimiter(max_requests=2, window_seconds=10)
    assert limiter.allow("ip", now=0.0) is True
    assert limiter.allow("ip", now=1.0) is True
    assert limiter.allow("ip", now=2.0) is False
    # After the first two age out of the window, requests are allowed again.
    assert limiter.allow("ip", now=12.0) is True


def test_keys_are_independent() -> None:
    limiter = RateLimiter(max_requests=1, window_seconds=60)
    assert limiter.allow("a", now=0.0) is True
    assert limiter.allow("b", now=0.0) is True  # different IP, own budget
    assert limiter.allow("a", now=1.0) is False


def test_prune_drops_drained_keys() -> None:
    limiter = RateLimiter(max_requests=5, window_seconds=10)
    limiter.allow("ip", now=0.0)
    limiter.prune(now=100.0)  # everything aged out
    # A fresh key budget is available after pruning.
    assert limiter.allow("ip", now=100.0) is True


def test_invalid_config_raises() -> None:
    with pytest.raises(ValueError):
        RateLimiter(max_requests=0, window_seconds=60)
    with pytest.raises(ValueError):
        RateLimiter(max_requests=5, window_seconds=0)


def test_client_ip_prefers_first_forwarded_hop() -> None:
    # Behind the tunnel the visitor IP is the first X-Forwarded-For hop.
    assert client_ip("203.0.113.7, 70.0.0.1", "127.0.0.1") == "203.0.113.7"


def test_client_ip_falls_back_to_peer() -> None:
    assert client_ip(None, "198.51.100.3") == "198.51.100.3"
    assert client_ip("", "198.51.100.3") == "198.51.100.3"


def test_client_ip_unknown_when_nothing_available() -> None:
    assert client_ip(None, None) == "unknown"


def test_loopback_exempt_only_without_forwarded_header() -> None:
    # Genuine direct-to-loopback (the eval/ops path): exempt.
    assert is_exempt_local(None, "127.0.0.1") is True
    assert is_exempt_local(None, "::1") is True
    # CRITICAL: a proxied/Funnel request ALWAYS carries X-Forwarded-For, so even with a
    # loopback socket peer it is NEVER exempt — the public path keeps its protection.
    assert is_exempt_local("203.0.113.7", "127.0.0.1") is False
    assert is_exempt_local("203.0.113.7", "::1") is False
    # A direct non-loopback peer is not exempt; nor is an unknown peer.
    assert is_exempt_local(None, "198.51.100.3") is False
    assert is_exempt_local(None, None) is False


def test_non_loopback_peer_never_exempt_even_without_xff() -> None:
    # Regression guard: any NON-loopback peer must never reach the exempt branch, even
    # with X-Forwarded-For absent. This pins the property that keeps external traffic
    # (which arrives with a docker-bridge / cloudflared / public peer) rate-limited.
    # If a future refactor adds --proxy-headers or an nginx sidecar — making the peer
    # spoofable or always-loopback — these assertions break and flag the regression.
    for peer in ("172.17.0.1", "172.18.0.5", "203.0.113.7", "10.0.0.5", "::ffff:127.0.0.1"):
        assert is_exempt_local(None, peer) is False, peer
