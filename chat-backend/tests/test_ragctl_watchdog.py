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


# --- daemon lifecycle (autostart on up / stop on down) ----------------------


def test_cmdline_is_watchdog_matches_only_our_invocation() -> None:
    assert ragctl._cmdline_is_watchdog(
        ["/usr/bin/python3", "-u", "/srv/chat-backend/ragctl.py", "watchdog"]
    )
    # A recycled pid now owned by a stranger must NOT match.
    assert not ragctl._cmdline_is_watchdog(["/usr/bin/vim", "notes.txt"])
    # ragctl running some OTHER subcommand is not the watchdog either.
    assert not ragctl._cmdline_is_watchdog(["python3", "ragctl.py", "status"])
    assert not ragctl._cmdline_is_watchdog(None)  # not alive / unreadable
    assert not ragctl._cmdline_is_watchdog([])  # zombie: empty cmdline


def test_watchdog_pid_missing_stale_recycled_and_live(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    pidfile = tmp_path / "watchdog.pid"
    monkeypatch.setattr(ragctl, "WATCHDOG_PID_FILE", pidfile)
    assert ragctl.watchdog_pid() is None  # no file yet

    pidfile.write_text("4242")
    monkeypatch.setattr(ragctl, "_proc_argv", lambda pid: None)
    assert ragctl.watchdog_pid() is None  # process gone

    # Recycled pid: alive, but it's a DIFFERENT program — must read as not ours.
    monkeypatch.setattr(ragctl, "_proc_argv", lambda pid: ["/usr/bin/vim", "x"])
    assert ragctl.watchdog_pid() is None

    monkeypatch.setattr(
        ragctl, "_proc_argv", lambda pid: ["python3", "ragctl.py", "watchdog"]
    )
    assert ragctl.watchdog_pid() == 4242  # our live watchdog

    pidfile.write_text("not-a-number")
    assert ragctl.watchdog_pid() is None  # unparseable reads as not running


def test_start_is_idempotent_when_already_running(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: 777)

    def no_spawn(*a: object, **k: object) -> None:
        raise AssertionError("must not spawn a second watchdog")

    monkeypatch.setattr(ragctl.subprocess, "Popen", no_spawn)
    assert ragctl.start_watchdog_daemon() == 777


def test_stop_kills_running_watchdog(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    pidfile = tmp_path / "watchdog.pid"
    pidfile.write_text("555")
    monkeypatch.setattr(ragctl, "WATCHDOG_PID_FILE", pidfile)
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: 555)
    killed: list[tuple[int, int]] = []
    monkeypatch.setattr(ragctl.os, "kill", lambda pid, sig: killed.append((pid, sig)))
    monkeypatch.setattr(ragctl, "_proc_argv", lambda pid: None)  # exits at once
    assert ragctl.stop_watchdog_daemon() == "stopped"
    assert killed == [(555, ragctl.signal.SIGTERM)]
    assert not pidfile.exists()  # pid file cleaned up


def test_stop_waits_for_the_watchdog_to_finish_its_step(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    # SIGTERM only sets the stop flag; a reassert finishing after `down`'s
    # funnel-off would re-publish the route, so stop must outlast it.
    pidfile = tmp_path / "watchdog.pid"
    pidfile.write_text("555")
    monkeypatch.setattr(ragctl, "WATCHDOG_PID_FILE", pidfile)
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: 555)
    monkeypatch.setattr(ragctl.os, "kill", lambda pid, sig: None)
    alive = iter([True, True, False])
    monkeypatch.setattr(ragctl, "_cmdline_is_watchdog", lambda argv: next(alive))
    monkeypatch.setattr(ragctl, "_proc_argv", lambda pid: ["x"])
    monkeypatch.setattr(ragctl.time, "sleep", lambda s: None)
    assert ragctl.stop_watchdog_daemon() == "stopped"
    assert not pidfile.exists()


def test_stop_reports_a_watchdog_that_outlives_the_timeout(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    pidfile = tmp_path / "watchdog.pid"
    pidfile.write_text("555")
    monkeypatch.setattr(ragctl, "WATCHDOG_PID_FILE", pidfile)
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: 555)
    monkeypatch.setattr(ragctl.os, "kill", lambda pid, sig: None)
    monkeypatch.setattr(ragctl, "_cmdline_is_watchdog", lambda argv: True)
    monkeypatch.setattr(ragctl, "_proc_argv", lambda pid: ["x"])
    monkeypatch.setattr(ragctl, "WATCHDOG_STOP_TIMEOUT_S", 0)
    assert ragctl.stop_watchdog_daemon() == "busy"
    assert pidfile.read_text() == "555"  # still names the live watchdog


def test_ctrl_c_during_the_wait_gives_up_on_the_wait_not_on_down(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ragctl, "_cmdline_is_watchdog", lambda argv: True)
    monkeypatch.setattr(ragctl, "_proc_argv", lambda pid: ["x"])

    def interrupted(s: float) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(ragctl.time, "sleep", interrupted)
    assert ragctl._wait_for_watchdog_exit(555, 120) is False


def test_down_reports_a_watchdog_still_finishing_a_step(
    monkeypatch: pytest.MonkeyPatch, capsys
) -> None:
    monkeypatch.setattr(ragctl, "stop_watchdog_daemon", lambda: "busy")
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: 555)
    monkeypatch.setattr(ragctl, "tailscale_exe", lambda: "tailscale.exe")
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)
    monkeypatch.setattr(ragctl, "run", lambda cmd, **k: (0, ""))
    assert ragctl.cmd_down() == 1
    out = capsys.readouterr().out
    assert "took SIGTERM but is still finishing a step" in out
    assert "re-open the funnel as soon as" not in out  # it polls no more
    assert "● done" not in out


def test_down_reports_a_funnel_exe_that_cannot_execute(
    monkeypatch: pytest.MonkeyPatch, capsys
) -> None:
    # ENOEXEC on the /mnt/c exe when WSL interop's binfmt entry is gone.
    def fake_run(cmd: list[str], **k: object) -> tuple[int, str]:
        if cmd[0] == "tailscale.exe":
            raise OSError(8, "Exec format error")
        return (0, "")

    monkeypatch.setattr(ragctl, "stop_watchdog_daemon", lambda: "none")
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: None)
    monkeypatch.setattr(ragctl, "tailscale_exe", lambda: "tailscale.exe")
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)
    monkeypatch.setattr(ragctl, "run", fake_run)
    assert ragctl.cmd_down() == 1
    out = capsys.readouterr().out
    assert "failed: funnel off" in out
    assert "Exec format error" in out


def test_stop_treats_an_already_exited_watchdog_as_stopped(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    pidfile = tmp_path / "watchdog.pid"
    pidfile.write_text("555")
    monkeypatch.setattr(ragctl, "WATCHDOG_PID_FILE", pidfile)
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: 555)

    def gone(pid: int, sig: int) -> None:
        raise ProcessLookupError

    monkeypatch.setattr(ragctl.os, "kill", gone)
    assert ragctl.stop_watchdog_daemon() == "stopped"
    assert not pidfile.exists()


def test_stop_keeps_the_pid_file_when_the_watchdog_cannot_be_signalled(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    pidfile = tmp_path / "watchdog.pid"
    pidfile.write_text("555")
    monkeypatch.setattr(ragctl, "WATCHDOG_PID_FILE", pidfile)
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: 555)

    def denied(pid: int, sig: int) -> None:
        raise PermissionError

    monkeypatch.setattr(ragctl.os, "kill", denied)
    assert ragctl.stop_watchdog_daemon() == "denied"
    assert pidfile.read_text() == "555"


def test_stop_is_a_noop_when_not_running(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setattr(ragctl, "WATCHDOG_PID_FILE", tmp_path / "watchdog.pid")
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: None)
    assert ragctl.stop_watchdog_daemon() == "none"


def test_down_stops_watchdog_before_cutting_the_funnel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Critical ordering: if the funnel were cut first, the still-live watchdog
    # would see the public path drop and race to 'recover' the funnel we are
    # deliberately turning off.
    calls: list[str] = []
    monkeypatch.setattr(
        ragctl, "stop_watchdog_daemon", lambda: calls.append("stop-watchdog") or "stopped"
    )
    monkeypatch.setattr(ragctl, "tailscale_exe", lambda: "tailscale.exe")
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)

    def fake_run(cmd: list[str], **k: object) -> tuple[int, str]:
        calls.append(" ".join(str(c) for c in cmd))
        return (0, "")

    monkeypatch.setattr(ragctl, "run", fake_run)
    ragctl.cmd_down()
    assert calls[0] == "stop-watchdog"
    funnel_off = next(i for i, c in enumerate(calls) if "funnel" in c and "off" in c)
    assert calls.index("stop-watchdog") < funnel_off


def test_down_still_takes_the_endpoint_offline_when_the_watchdog_survives(
    monkeypatch: pytest.MonkeyPatch, capsys
) -> None:
    # `down` is the off switch for the public endpoint, so a watchdog it could
    # not signal must not stop the shutdown; it only stops the success claim.
    calls: list[str] = []
    monkeypatch.setattr(ragctl, "stop_watchdog_daemon", lambda: "denied")
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: 555)
    monkeypatch.setattr(ragctl, "tailscale_exe", lambda: "tailscale.exe")
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)
    monkeypatch.setattr(
        ragctl, "run", lambda cmd, **k: calls.append(" ".join(cmd)) or (0, "")
    )
    assert ragctl.cmd_down() == 1
    assert "docker compose down" in calls
    assert any("funnel" in c and "off" in c for c in calls)
    out = capsys.readouterr().out
    assert "watchdog (pid 555) is still running" in out
    assert "re-open the funnel" in out
    assert "● done" not in out


def test_down_reports_a_failed_shutdown_step(
    monkeypatch: pytest.MonkeyPatch, capsys
) -> None:
    calls: list[str] = []
    monkeypatch.setattr(ragctl, "stop_watchdog_daemon", lambda: "stopped")
    monkeypatch.setattr(ragctl, "tailscale_exe", lambda: "tailscale.exe")
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)

    def fake_run(cmd: list[str], **k: object) -> tuple[int, str]:
        calls.append(" ".join(cmd))
        return (1, "boom") if cmd[-1] == "down" else (0, "")

    monkeypatch.setattr(ragctl, "run", fake_run)
    assert ragctl.cmd_down() == 1
    assert any("funnel" in c and "off" in c for c in calls)  # still attempted
    out = capsys.readouterr().out
    assert "failed: docker compose down" in out
    assert "● done" not in out


def _watchdog_after_two_failed_polls(local_ok: bool) -> str:
    return ragctl.watchdog_action(
        external_ok=False,
        local_ok=local_ok,
        uplink_ok=True,
        consecutive_failures=2,
        fail_threshold=2,
        reasserted_this_outage=False,
        reconnects_this_outage=0,
        reconnect_cap=3,
    )


def test_a_surviving_watchdog_cannot_restore_the_funnel_while_the_backend_is_down() -> (
    None
):
    # Why `down` still runs the shutdown past a watchdog it could not stop.
    assert _watchdog_after_two_failed_polls(local_ok=False) == "skip-backend-down"


def test_a_surviving_watchdog_re_publishes_the_funnel_once_the_backend_is_back() -> None:
    # Why `down` warns about it: the off switch is not sticky while it lives.
    assert _watchdog_after_two_failed_polls(local_ok=True) == "reassert"


def test_down_proceeds_when_no_watchdog_was_running(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    monkeypatch.setattr(ragctl, "stop_watchdog_daemon", lambda: "none")
    monkeypatch.setattr(ragctl, "watchdog_pid", lambda: None)
    monkeypatch.setattr(ragctl, "tailscale_exe", lambda: "tailscale.exe")
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)
    monkeypatch.setattr(
        ragctl, "run", lambda cmd, **k: calls.append(" ".join(cmd)) or (0, "")
    )
    assert ragctl.cmd_down() == 0
    assert any("funnel" in c and "off" in c for c in calls)


def test_up_autostarts_the_watchdog_unless_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Stub out everything that touches docker/funnel; assert only the autostart
    # wiring, both with and without --no-watchdog.
    monkeypatch.setattr(ragctl, "ensure_docker", lambda: True)
    monkeypatch.setattr(ragctl, "ensure_request_log", lambda: None)
    monkeypatch.setattr(ragctl, "ensure_funnel", lambda: None)
    monkeypatch.setattr(ragctl, "run", lambda *a, **k: (0, ""))
    monkeypatch.setattr(ragctl, "gather", lambda: [])
    monkeypatch.setattr(ragctl, "render", lambda rows: "")
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)
    started: list[bool] = []
    monkeypatch.setattr(ragctl, "start_watchdog_daemon", lambda: started.append(True))

    ragctl.cmd_up(keep=True, watchdog=True)
    assert started == [True]

    started.clear()
    ragctl.cmd_up(keep=True, watchdog=False)
    assert started == []
