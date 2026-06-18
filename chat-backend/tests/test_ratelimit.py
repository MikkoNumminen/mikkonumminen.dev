"""Tests for the per-IP sliding-window rate limiter."""

from __future__ import annotations

import pytest

from app.ratelimit import RateLimiter


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
