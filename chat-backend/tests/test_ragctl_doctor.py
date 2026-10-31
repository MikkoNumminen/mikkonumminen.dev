"""`ragctl test`, the one-query doctor probe against the live backend.

Its job is to expose backend faults, so a stream it could not fully read must
not end on the normal success line with exit 0. Driven without a backend by
monkeypatching `urllib.request.urlopen`, as test_ragctl_watchdog.py does.
"""

from __future__ import annotations

import urllib.request
from collections.abc import Iterator

import pytest

import ragctl


class _FakeStream:
    def __init__(self, lines: list[str]) -> None:
        self._lines = [line.encode() + b"\n" for line in lines]

    def __enter__(self) -> _FakeStream:
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def __iter__(self) -> Iterator[bytes]:
        return iter(self._lines)


def _serve(monkeypatch: pytest.MonkeyPatch, lines: list[str]) -> None:
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: _FakeStream(lines))
    monkeypatch.setattr(ragctl, "_c", lambda s, *a: s)


def test_a_clean_stream_passes(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    _serve(
        monkeypatch,
        [
            "event: token",
            'data: {"text": "Hello"}',
            "event: sources",
            'data: {"sources": [{"source": "hrm"}]}',
        ],
    )
    assert ragctl.cmd_test("q") == 0
    out = capsys.readouterr().out
    assert "Hello" in out
    assert "hrm" in out


@pytest.mark.parametrize(
    "bad",
    [
        "data: {not json",
        'data: "x"',
        "data: {}",
        'data: {"text": null}',
        'data: {"text": 3}',
    ],
)
def test_a_malformed_token_frame_fails_the_probe(
    monkeypatch: pytest.MonkeyPatch, capsys, bad: str
) -> None:
    _serve(
        monkeypatch,
        [
            "event: token",
            'data: {"text": "Hel"}',
            "event: token",
            bad,
            "event: token",
            'data: {"text": "lo"}',
        ],
    )
    assert ragctl.cmd_test("q") == 1
    out = capsys.readouterr().out
    assert "Hello" in out  # the rest of the answer is still shown
    assert "1 malformed frame(s) dropped" in out


@pytest.mark.parametrize(
    "bad",
    [
        "data: [1]",
        'data: {"sources": null}',
        'data: {"sources": [1]}',
        'data: {"sources": [{"source": 5}]}',
    ],
)
def test_a_malformed_sources_frame_fails_the_probe(
    monkeypatch: pytest.MonkeyPatch, capsys, bad: str
) -> None:
    _serve(
        monkeypatch,
        ["event: token", 'data: {"text": "ok"}', "event: sources", bad],
    )
    assert ragctl.cmd_test("q") == 1
    assert "malformed frame(s) dropped" in capsys.readouterr().out
