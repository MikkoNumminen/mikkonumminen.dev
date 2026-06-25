"""Tests for detecting the project(s) a question names."""

from __future__ import annotations

from app.query_projects import detect_projects


def test_readlog_dotnet_wins_over_bare_readlog() -> None:
    # The specific alias claims the span, so the contained "readlog" is not also
    # counted — only readlog-dotnet.
    assert detect_projects("How did ReadLog .NET handle the race?") == {"readlog-dotnet"}


def test_bare_readlog() -> None:
    assert detect_projects("tell me about readlog") == {"readlog"}


def test_spacepotatis_with_tech() -> None:
    got = detect_projects("how did spacepotatis bridge phaser and three.js")
    assert got == {"spacepotatis"}


def test_multiple_projects() -> None:
    assert detect_projects("compare readlog and hrm") == {"readlog", "hrm"}


def test_no_project_named() -> None:
    assert detect_projects("what projects are there") == set()


def test_alias_not_matched_inside_a_word() -> None:
    # The "platform" project must not fire on the generic plural "platforms".
    assert "platform" not in detect_projects("which platforms does it run on")


def test_strudel_short_alias() -> None:
    assert detect_projects("the strudel music thing") == {"strudel-patterns"}


def test_two_readlogs_both_detected_when_distinct() -> None:
    # A bare "readlog" elsewhere is still its own project even when a ".net"
    # variant also appears — span consumption is per-occurrence, not global.
    assert detect_projects("compare readlog and readlog .net") == {
        "readlog",
        "readlog-dotnet",
    }


def test_detects_tech_ecosystem_aliases() -> None:
    # Ecosystem terms point at the project that uses them, so a question worded in
    # the user's vocabulary ("the microsoft stack") still retrieves the right
    # project even when the docs say ".NET"/"C#" rather than "Microsoft".
    assert detect_projects("tell me about the microsoft stack projects") == {
        "readlog-dotnet"
    }
    assert detect_projects("is anything deployed on Azure?") == {"readlog-dotnet"}
    assert detect_projects("which project does text-to-speech?") == {"audiobookmaker"}
