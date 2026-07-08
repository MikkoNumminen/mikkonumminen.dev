"""Tests for the regression runner's pure scoring (no backend needed)."""

from __future__ import annotations

from evals.run_regressions import score_case

_CASE = {
    "id": "employer-fused-fi",
    "question": "mitä mikko teki kasvulabsissa?",
    "expectation": "must_retrieve",
    "expected_sources": ["cv.md"],
    "facts": ["Kasvu Labs", "2022", "2024"],
}


def test_grounded_finnish_answer_passes() -> None:
    row = score_case(
        _CASE,
        "Mikko työskenteli Kasvu Labs Oy:ssä vuosina 2022–2024 kehittäjänä.",
        ["cv.md", "projects/portfolio.md"],
    )
    assert row["ok"], row["why"]


def test_missing_fact_and_source_fail() -> None:
    row = score_case(
        _CASE,
        "Mikko työskenteli siellä jonkin aikaa kehittäjänä ja teki paljon töitä.",
        ["projects/portfolio.md"],
    )
    assert not row["ok"]
    assert "missing sources" in row["why"] and "missing facts" in row["why"]


def test_english_answer_to_finnish_question_fails() -> None:
    row = score_case(
        _CASE,
        "Mikko worked at Kasvu Labs from 2022 to 2024 as a developer there.",
        ["cv.md"],
    )
    assert not row["ok"]
    assert "answered in English" in row["why"]


def test_refusal_case_passes_on_finnish_template() -> None:
    case = {
        "id": "offcorpus-terse-fi",
        "question": "Mikä on Mikon lempiväri?",
        "expectation": "must_refuse_offcorpus",
    }
    row = score_case(
        case, "Minulla ei ole tietoa tuosta. Kokeile `help`-komentoa.", []
    )
    assert row["ok"]


def test_refusal_case_fails_when_answered() -> None:
    case = {
        "id": "offcorpus-terse-en",
        "question": "What is Mikko's favourite colour?",
        "expectation": "must_refuse_offcorpus",
    }
    row = score_case(case, "Mikko's favourite colour is blue, obviously.", [])
    assert not row["ok"]
