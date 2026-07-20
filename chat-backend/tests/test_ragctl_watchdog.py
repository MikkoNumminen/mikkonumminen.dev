"""Tests for the funnel watchdog's decision logic.

The watchdog auto-recovers the 2026-07-20 failure mode — a stale funnel ingress
after a network change, where the visitor path 502s while every local check
stays green. The decision function is pure, so the escalation ladder (and the
two 'don't act' guards) are pinned here without touching tailscale or the net.
"""

from __future__ import annotations

import pytest

from ragctl import watchdog_action

# Convenience: the confirmed-outage baseline (failures at threshold, uplink and
# backend healthy, no re-assert tried yet).
THRESHOLD = 2


def test_external_ok_is_always_ok() -> None:
    # A healthy public path clears everything else, even mid-outage bookkeeping.
    assert watchdog_action(True, False, False, 9, THRESHOLD, True) == "ok"


def test_below_threshold_is_treated_as_transient() -> None:
    assert watchdog_action(False, True, True, 1, THRESHOLD, False) == "wait"


def test_confirmed_outage_reasserts_first() -> None:
    assert watchdog_action(False, True, True, 2, THRESHOLD, False) == "reassert"


def test_reassert_already_tried_escalates_to_reconnect() -> None:
    assert watchdog_action(False, True, True, 3, THRESHOLD, True) == "reconnect"


def test_no_internet_never_flaps_tailscale() -> None:
    # A dead uplink is not something a funnel reconnect can fix — must not act.
    assert watchdog_action(False, True, False, 5, THRESHOLD, False) == "skip-no-internet"
    assert watchdog_action(False, True, False, 5, THRESHOLD, True) == "skip-no-internet"


def test_backend_down_defers_to_the_operator() -> None:
    # Public down because the stack is down: reconnecting the funnel won't help.
    assert watchdog_action(False, False, True, 5, THRESHOLD, False) == "skip-backend-down"


def test_no_internet_takes_priority_over_backend_down() -> None:
    # If the uplink is dead we can't even tell the backend's real state remotely;
    # the no-internet guard is checked first and wins.
    assert (
        watchdog_action(False, False, False, 5, THRESHOLD, False) == "skip-no-internet"
    )


@pytest.mark.parametrize("threshold", [1, 3, 5])
def test_threshold_boundary(threshold: int) -> None:
    # One below the threshold waits; exactly at it acts.
    assert watchdog_action(False, True, True, threshold - 1, threshold, False) == "wait"
    assert (
        watchdog_action(False, True, True, threshold, threshold, False) == "reassert"
    )
