"""Tests for the funnel watchdog's decision logic and its guarded actions.

The watchdog auto-recovers the 2026-07-20 failure mode — a stale funnel ingress
after a network change, where the visitor path 502s while every local check
stays green. The decision function is pure; the escalation ladder, the two
stand-down guards, and the reconnect CAP that stops it churning the SHARED node
are pinned here without touching tailscale or the network.
"""

from __future__ import annotations

import urllib.request

import pytest

import ragctl
from ragctl import _healthy_http, _watchdog_reconnect, watchdog_action

CAP = 3


def action(
    *,
    external_ok: bool = False,
    local_ok: bool = True,
    uplink_ok: bool = True,
    failures: int = 2,
    threshold: int = 2,
    reasserted: bool = False,
    reconnects: int = 0,
    cap: int = CAP,
) -> str:
    """The confirmed-outage baseline (down, at threshold, backend + uplink fine),
    with keyword overrides — robust to the signature's parameter count."""
    return watchdog_action(
        external_ok, local_ok, uplink_ok, failures, threshold, reasserted, reconnects, cap
    )


# --- pure decision ladder --------------------------------------------------


def test_external_ok_is_always_ok() -> None:
    assert action(external_ok=True, reasserted=True, reconnects=9) == "ok"


def test_below_threshold_is_treated_as_transient() -> None:
    assert action(failures=1) == "wait"


def test_confirmed_outage_reasserts_first() -> None:
    assert action() == "reassert"


def test_reassert_already_tried_escalates_to_reconnect() -> None:
    assert action(reasserted=True, reconnects=0) == "reconnect"
    assert action(reasserted=True, reconnects=CAP - 1) == "reconnect"


def test_reconnect_cap_gives_up_instead_of_flapping() -> None:
    # The shared-node safety: once the cap is hit, stop down/up-ing, only alert.
    assert action(reasserted=True, reconnects=CAP) == "give-up"
    assert action(reasserted=True, reconnects=CAP + 5) == "give-up"


def test_no_uplink_stands_down() -> None:
    # A dead uplink or a Vercel-side outage is not ours to fix — never reconnect.
    assert action(uplink_ok=False) == "skip-uplink"
    assert action(uplink_ok=False, reasserted=True, reconnects=1) == "skip-uplink"


def test_backend_down_defers_to_the_operator() -> None:
    assert action(local_ok=False) == "skip-backend-down"


def test_uplink_takes_priority_over_backend_down() -> None:
    assert action(uplink_ok=False, local_ok=False) == "skip-uplink"


@pytest.mark.parametrize("threshold", [1, 3, 5])
def test_threshold_boundary(threshold: int) -> None:
    assert action(failures=threshold - 1, threshold=threshold) == "wait"
    assert action(failures=threshold, threshold=threshold) == "reassert"


# --- guarded reconnect (side-effecting; run() + check_tailscale stubbed) ----


def test_reconnect_reports_true_when_the_node_comes_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ragctl, "run", lambda *a, **k: (0, ""))
    monkeypatch.setattr(ragctl, "check_tailscale", lambda: ("ok", "up"))
    assert _watchdog_reconnect("tailscale.exe") is True


def test_reconnect_reports_false_when_up_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # `tailscale up` times out / needs reauth — the node is left down, which must
    # be detected and surfaced, not swallowed.
    monkeypatch.setattr(ragctl, "run", lambda *a, **k: (124, ""))
    monkeypatch.setattr(ragctl, "check_tailscale", lambda: ("down", "daemon down"))
    assert _watchdog_reconnect("tailscale.exe") is False


def test_reconnect_reports_false_when_up_ok_but_node_not_online(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ragctl, "run", lambda *a, **k: (0, ""))
    monkeypatch.setattr(ragctl, "check_tailscale", lambda: ("down", "logged out"))
    assert _watchdog_reconnect("tailscale.exe") is False


# --- uplink canary ----------------------------------------------------------


class _FakeResp:
    def __init__(self, status: int) -> None:
        self.status = status

    def __enter__(self) -> _FakeResp:
        return self

    def __exit__(self, *exc: object) -> bool:
        return False


def test_healthy_http_true_on_2xx(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: _FakeResp(200))
    assert _healthy_http("https://x") is True


def test_healthy_http_false_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    # A 5xx (urllib raises) or any connection failure must read as NOT healthy,
    # so a Vercel-side outage can't be mistaken for 'uplink up' and trigger a
    # needless reconnect.
    def boom(*a: object, **k: object) -> None:
        raise OSError("connection refused")

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    assert _healthy_http("https://x") is False
