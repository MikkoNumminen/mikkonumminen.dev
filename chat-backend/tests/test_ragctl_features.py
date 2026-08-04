"""The RAG feature dials exposed by `ragctl features` / `ragctl feature`.

The registry is the risky part, not the printing: every entry names an env var
AND a `Settings` attribute, and a typo in either is invisible until someone runs
the command against a live stack and gets `?` or a crash. These assert the
registry against the real `Settings` fields, so a rename in config.py fails here
instead of in an operator's terminal.

Everything is exercised without Docker by monkeypatching the two impure calls
(`live_feature_values`, `run`), the same way test_ragctl_watchdog.py drives
`_watchdog_reconnect`.
"""

from __future__ import annotations

import dataclasses

import pytest

import ragctl
from app.config import Settings


def test_every_feature_names_a_real_settings_field() -> None:
    """A typo'd `attr` would silently render as `?` forever."""
    fields = {f.name for f in dataclasses.fields(Settings)}
    for feature in ragctl.FEATURES:
        assert feature.attr in fields, f"{feature.name}: no Settings.{feature.attr}"


def test_context_attrs_are_real_settings_fields() -> None:
    fields = {f.name for f in dataclasses.fields(Settings)}
    for attr in ragctl._CONTEXT_ATTRS:
        assert attr in fields


def test_feature_names_and_env_vars_are_unique() -> None:
    names = [f.name for f in ragctl.FEATURES]
    envs = [f.env for f in ragctl.FEATURES]
    assert len(names) == len(set(names))
    assert len(envs) == len(set(envs))


def test_every_feature_kind_is_supported() -> None:
    # cmd_feature branches on exactly these two; a third would fall through the
    # int branch and accept nonsense.
    for feature in ragctl.FEATURES:
        assert feature.kind in {"bool", "int"}


@pytest.mark.parametrize("raw", ["1", "true", "TRUE", "on", "yes", "True"])
def test_is_on_accepts_env_and_python_spellings(raw: str) -> None:
    # Values arrive both as env words and as str(True) from the container dump.
    assert ragctl._is_on(raw)


@pytest.mark.parametrize("raw", ["0", "false", "False", "off", "no", "", "maybe"])
def test_is_on_rejects_everything_else(raw: str) -> None:
    assert not ragctl._is_on(raw)


def test_unknown_feature_is_refused_and_lists_the_known_ones(capsys) -> None:
    assert ragctl.cmd_feature("nope", "on") == 2
    out = capsys.readouterr().out
    assert "unknown feature" in out
    assert "disclosure" in out  # the message names what IS available


@pytest.mark.parametrize("value", ["maybe", "2", ""])
def test_a_toggle_refuses_a_non_boolean_value(capsys, value: str) -> None:
    assert ragctl.cmd_feature("disclosure", value) == 2
    assert "on/off" in capsys.readouterr().out


def test_a_count_refuses_a_non_number(capsys) -> None:
    assert ragctl.cmd_feature("diversity", "abc") == 2
    assert "takes a number" in capsys.readouterr().out


def test_out_of_range_count_is_refused_before_env_is_touched(
    capsys, monkeypatch: pytest.MonkeyPatch
) -> None:
    """config.Settings.validate() requires diversity >= 1. Accepting 0 would
    write .env, recreate the backend, and leave it crash-looping on a value the
    tool itself chose to allow."""
    wrote: list[dict[str, str]] = []
    monkeypatch.setattr(ragctl, "set_env_vars", lambda u: wrote.append(u) or True)
    assert ragctl.cmd_feature("diversity", "0") == 2
    assert "must be >=" in capsys.readouterr().out
    assert wrote == []


def test_ceiling_is_read_from_the_live_backend(
    capsys, monkeypatch: pytest.MonkeyPatch
) -> None:
    """research-top-n must be <= TOP_K, and TOP_K is whatever the running
    backend resolved — not a number copied into ragctl that could drift."""
    wrote: list[dict[str, str]] = []
    monkeypatch.setattr(ragctl, "set_env_vars", lambda u: wrote.append(u) or True)
    monkeypatch.setattr(
        ragctl,
        "live_feature_values",
        lambda: {"research_coverage_top_n": "3", "retrieval_top_k": "6"},
    )
    assert ragctl.cmd_feature("research-top-n", "99") == 2
    assert "must be <= 6" in capsys.readouterr().out
    assert wrote == []


def test_setting_the_current_value_skips_the_rebuild(
    capsys, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        ragctl, "live_feature_values", lambda: {"progressive_disclosure_enabled": "True"}
    )
    monkeypatch.setattr(ragctl, "run", lambda *a, **k: calls.append(a) or (0, ""))
    monkeypatch.setattr(ragctl, "set_env_vars", lambda u: True)
    assert ragctl.cmd_feature("disclosure", "on") == 0
    assert "already" in capsys.readouterr().out
    assert calls == []  # no rebuild spent reaching the state we were in


def test_a_value_that_does_not_take_is_reported_as_failure(
    capsys, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The whole point of verifying inside the container: if the knob is missing
    from docker-compose, .env changes and behaviour does not."""
    monkeypatch.setattr(ragctl, "set_env_vars", lambda u: True)
    monkeypatch.setattr(ragctl, "run", lambda *a, **k: (0, ""))
    # Don't spend the retry backoff in a unit test.
    monkeypatch.setattr(ragctl.time, "sleep", lambda _s: None)
    # Reports ON both before and after, though OFF was requested.
    monkeypatch.setattr(
        ragctl, "live_feature_values", lambda: {"progressive_disclosure_enabled": "True"}
    )
    assert ragctl.cmd_feature("disclosure", "off") == 1
    out = capsys.readouterr().out
    assert "still" in out
    assert "docker-compose" in out  # names where to look
