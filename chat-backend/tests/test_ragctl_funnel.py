"""Tests for ragctl's funnel-route detection.

The tailnet node runs funnels for several projects. The regression pinned here:
`tailscale funnel status` saying "Funnel on" for ANOTHER project's port must not
read as "the rag's route is up" — that misreading let `ragctl up` skip enabling
the rag's :443 route and left the chat publicly dead with every local check
green.
"""

from __future__ import annotations

from ragctl import funnel_serves_port

_BOTH_ROUTES = """\
# Funnel on:
#     - https://paskamyrsky.tail6ed53b.ts.net
#     - https://paskamyrsky.tail6ed53b.ts.net:8443

https://paskamyrsky.tail6ed53b.ts.net (Funnel on)
|-- / proxy http://127.0.0.1:8000

https://paskamyrsky.tail6ed53b.ts.net:8443 (Funnel on)
|-- / proxy http://127.0.0.1:4180
"""

_OTHER_PROJECT_ONLY = """\
# Funnel on:
#     - https://paskamyrsky.tail6ed53b.ts.net:8443

https://paskamyrsky.tail6ed53b.ts.net:8443 (Funnel on)
|-- / proxy http://127.0.0.1:4180
"""

_NO_FUNNEL = "No serve config\n"


def test_detects_rag_route_on_default_port() -> None:
    assert funnel_serves_port(_BOTH_ROUTES, "8000")


def test_other_projects_funnel_is_not_ours() -> None:
    # The live outage: only :8443 (another project) was on. "Funnel on" appears
    # in the output, but the rag route is absent and must read as down.
    assert not funnel_serves_port(_OTHER_PROJECT_ONLY, "8000")


def test_no_funnel_at_all() -> None:
    assert not funnel_serves_port(_NO_FUNNEL, "8000")


def test_other_ports_proxy_target_does_not_count() -> None:
    # A proxy to some other local port inside the default block is not the rag.
    swapped = _BOTH_ROUTES.replace("127.0.0.1:8000", "127.0.0.1:9999")
    assert not funnel_serves_port(swapped, "8000")
