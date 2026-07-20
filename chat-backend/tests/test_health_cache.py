"""Tests for the /health LLM-liveness TTL memo."""

from __future__ import annotations

import pytest

from app.health_cache import CachedFlag


class _Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


def _counter(value: bool = True):
    calls = {"n": 0}

    async def refresh() -> bool:
        calls["n"] += 1
        return value

    return refresh, calls


@pytest.mark.asyncio
async def test_first_call_refreshes() -> None:
    flag = CachedFlag(30.0, clock=_Clock())
    refresh, calls = _counter(True)
    assert await flag.get(refresh) is True
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_repeated_calls_within_ttl_reuse_the_value() -> None:
    clock = _Clock()
    flag = CachedFlag(30.0, clock=clock)
    refresh, calls = _counter(True)
    await flag.get(refresh)
    clock.t = 25.0  # inside the 30s window (one poll interval later)
    await flag.get(refresh)
    clock.t = 29.999
    await flag.get(refresh)
    assert calls["n"] == 1  # only the first probe hit the model


@pytest.mark.asyncio
async def test_refreshes_after_ttl_expires() -> None:
    clock = _Clock()
    flag = CachedFlag(30.0, clock=clock)
    refresh, calls = _counter(True)
    await flag.get(refresh)
    clock.t = 30.0  # exactly at expiry re-probes
    await flag.get(refresh)
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_a_changed_result_is_picked_up_after_expiry() -> None:
    clock = _Clock()
    flag = CachedFlag(30.0, clock=clock)
    state = {"up": True}

    async def refresh() -> bool:
        return state["up"]

    assert await flag.get(refresh) is True
    state["up"] = False
    clock.t = 15.0  # still cached: reports the old value
    assert await flag.get(refresh) is True
    clock.t = 31.0  # past the window: the model going down is now visible
    assert await flag.get(refresh) is False


@pytest.mark.asyncio
async def test_zero_ttl_disables_caching() -> None:
    flag = CachedFlag(0.0, clock=_Clock())
    refresh, calls = _counter(True)
    await flag.get(refresh)
    await flag.get(refresh)
    await flag.get(refresh)
    assert calls["n"] == 3  # every call re-probes
