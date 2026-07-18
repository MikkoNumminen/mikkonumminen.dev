"""Tests for ragctl's funnel-route detection.

The tailnet node funnels several projects at once. The regression pinned here:
another project's funnel being on must never read as "the rag's route is up" —
that misreading let `ragctl up` skip enabling the rag's :443 route and left the
chat publicly dead with every local check green.

The JSON fixtures below are the real shapes `tailscale funnel status --json`
emitted on the live node during that outage and after the fix.
"""

from __future__ import annotations

import json

import pytest

import ragctl
from ragctl import check_funnel, funnel_routes, funnel_serves_port

_HOST = "paskamyrsky.tail6ed53b.ts.net"

# Both routes up: this project on :443, another project's oauth2-proxy on :8443.
_BOTH_ROUTES = json.dumps(
    {
        "TCP": {"443": {"HTTPS": True}, "8443": {"HTTPS": True}},
        "Web": {
            f"{_HOST}:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8000"}}},
            f"{_HOST}:8443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:4180"}}},
        },
        "AllowFunnel": {f"{_HOST}:443": True, f"{_HOST}:8443": True},
    }
)

# The outage: only the other project's :8443 route survived.
_OTHER_PROJECT_ONLY = json.dumps(
    {
        "TCP": {"8443": {"HTTPS": True}},
        "Web": {f"{_HOST}:8443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:4180"}}}},
        "AllowFunnel": {f"{_HOST}:8443": True},
    }
)

# Mounted on :443 but NOT funnel-enabled — reachable inside the tailnet only.
_PRIVATE_SERVE_ONLY = json.dumps(
    {
        "Web": {f"{_HOST}:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:8000"}}}},
        "AllowFunnel": {f"{_HOST}:443": False},
    }
)

_NOTHING_CONFIGURED = "{}"


def test_detects_this_projects_route() -> None:
    routes = funnel_routes(_BOTH_ROUTES)
    assert routes is not None
    assert funnel_serves_port(routes, "8000")


def test_other_projects_funnel_is_not_ours() -> None:
    # The live outage. The route map is non-empty (so the status line can say
    # "other funnels on"), but ours is absent and must read as down.
    routes = funnel_routes(_OTHER_PROJECT_ONLY)
    assert routes == {f"{_HOST}:8443": "http://127.0.0.1:4180"}
    assert not funnel_serves_port(routes, "8000")


def test_private_serve_mount_is_not_public_exposure() -> None:
    # AllowFunnel false: the port is mounted but nothing is published, so the
    # public path is dead even though a route exists on :443.
    assert funnel_routes(_PRIVATE_SERVE_ONLY) == {}


def test_nothing_configured_reads_as_empty_not_unreadable() -> None:
    # Distinct from None: we read the config fine, there is simply no funnel.
    assert funnel_routes(_NOTHING_CONFIGURED) == {}


@pytest.mark.parametrize("bad", ["", "command failed", "not json {", "[]", "null"])
def test_unparseable_output_is_unreadable_not_off(bad: str) -> None:
    assert funnel_routes(bad) is None


def test_short_port_does_not_prefix_match_a_longer_one() -> None:
    # ":80" must not match ":8000" — a substring test would report another
    # project's route as this one's, which is the whole bug class here.
    routes = funnel_routes(_BOTH_ROUTES)
    assert routes is not None
    assert not funnel_serves_port(routes, "80")


def test_wrong_proxy_target_on_our_port_does_not_count() -> None:
    swapped = _BOTH_ROUTES.replace("127.0.0.1:8000", "127.0.0.1:9999")
    routes = funnel_routes(swapped)
    assert routes is not None
    assert not funnel_serves_port(routes, "8000")


def _stub_tailscale(monkeypatch: pytest.MonkeyPatch, rc: int, out: str) -> None:
    monkeypatch.setattr(ragctl, "tailscale_exe", lambda: "tailscale.exe")
    monkeypatch.setattr(ragctl, "run", lambda *a, **k: (rc, out))


def test_check_funnel_ok_when_our_route_is_up(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_tailscale(monkeypatch, 0, _BOTH_ROUTES)
    assert check_funnel("https://example.ts.net") == ("ok", "https://example.ts.net")


def test_check_funnel_down_when_only_others_are_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_tailscale(monkeypatch, 0, _OTHER_PROJECT_ONLY)
    state, detail = check_funnel()
    assert state == "down"
    assert "other funnels on" in detail


def test_check_funnel_down_when_nothing_is_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_tailscale(monkeypatch, 0, _NOTHING_CONFIGURED)
    state, detail = check_funnel()
    assert state == "down"
    assert "other funnels" not in detail


def test_check_funnel_warns_rather_than_claiming_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A failed/timed-out call must not be reported as a definite "off" — an
    # unknown state asserted as known is how the last outage stayed hidden.
    _stub_tailscale(monkeypatch, 124, "")
    state, _ = check_funnel()
    assert state == "warn"
