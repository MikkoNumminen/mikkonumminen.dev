"""Tests for ragctl's "docker is unreachable from here" diagnosis.

The failure pinned here: after a Docker Desktop update, `docker` inside the WSL
distro stops working while the engine is fine on Windows, and `ragctl up` used
to answer that by starting Docker Desktop (already running) and waiting 180 s
before giving up with the wrong message. The Windows CLI answering over interop
while the distro's own socket does not is what tells the two apart.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import ragctl

_WIN_CLI = "/mnt/c/x/docker.exe"
_SETTINGS_OFF = '{"EnableIntegrationWithDefaultWslDistro": false, "AutoStart": false}'
_SETTINGS_ON = '{"EnableIntegrationWithDefaultWslDistro": true}'


def _windows_cli_answers(monkeypatch: pytest.MonkeyPatch, rc: int) -> None:
    """The Windows docker CLI is present, and `docker.exe info` exits with rc."""
    monkeypatch.setattr(ragctl, "_win_exe", lambda name, *fallbacks: _WIN_CLI)

    def run(
        cmd: list[str], timeout: int = 30, cwd: Path | None = None
    ) -> tuple[int, str]:
        if cmd and cmd[0] == _WIN_CLI:
            return (rc, "")
        raise AssertionError(f"unexpected command {cmd}")

    monkeypatch.setattr(ragctl, "run", run)


def test_engine_down_everywhere_is_not_integration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Windows CLI cannot reach the engine either: Docker Desktop is simply not
    # running, and the caller should start it, as before.
    _windows_cli_answers(monkeypatch, rc=1)
    assert ragctl.diagnose_docker_unreachable() == []


def test_no_windows_cli_means_no_diagnosis(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ragctl, "_win_exe", lambda name, *fallbacks: None)
    assert ragctl.diagnose_docker_unreachable() == []


def test_windows_up_but_distro_not_is_integration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _windows_cli_answers(monkeypatch, rc=0)
    monkeypatch.setattr(ragctl, "wsl_integration_off_in_settings", lambda: False)
    lines = ragctl.diagnose_docker_unreachable()
    text = " ".join(lines)
    assert lines, "the Windows CLI reached the engine, so this must be diagnosed"
    assert "WSL integration" in text
    assert "docker desktop restart" in text
    assert "Skip WSL distro integration" not in text


def test_names_the_skip_button_when_setting_is_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _windows_cli_answers(monkeypatch, rc=0)
    monkeypatch.setattr(ragctl, "wsl_integration_off_in_settings", lambda: True)
    assert "Skip WSL distro integration" in " ".join(ragctl.diagnose_docker_unreachable())


def test_settings_path_maps_appdata_into_mnt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ragctl, "powershell_exe", lambda: "/mnt/c/x/powershell.exe")
    monkeypatch.setattr(
        ragctl,
        "run",
        lambda cmd, timeout=30, cwd=None: (0, "C:\\Users\\m\\AppData\\Roaming\r\n"),
    )
    assert ragctl.docker_desktop_settings_path() == Path(
        "/mnt/c/Users/m/AppData/Roaming/Docker/settings-store.json"
    )


def test_settings_path_is_none_without_powershell(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ragctl, "powershell_exe", lambda: None)
    assert ragctl.docker_desktop_settings_path() is None


def test_settings_path_is_none_without_appdata(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ragctl, "powershell_exe", lambda: "/mnt/c/x/powershell.exe")
    monkeypatch.setattr(ragctl, "run", lambda cmd, timeout=30, cwd=None: (1, ""))
    assert ragctl.docker_desktop_settings_path() is None


@pytest.mark.parametrize(
    ("content", "expected"),
    [(_SETTINGS_OFF, True), (_SETTINGS_ON, False), ("{}", None), ("not json", None)],
)
def test_reads_the_integration_flag(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, content: str, expected: bool | None
) -> None:
    f = tmp_path / "settings-store.json"
    f.write_text(content, encoding="utf-8")
    monkeypatch.setattr(ragctl, "docker_desktop_settings_path", lambda: f)
    assert ragctl.wsl_integration_off_in_settings() is expected


def test_unreadable_settings_file_is_none(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(
        ragctl, "docker_desktop_settings_path", lambda: tmp_path / "missing.json"
    )
    assert ragctl.wsl_integration_off_in_settings() is None
