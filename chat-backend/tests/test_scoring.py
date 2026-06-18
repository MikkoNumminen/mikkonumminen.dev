"""Tests for eval scoring (retrieval hit-rate)."""

from __future__ import annotations

from evals.scoring import QueryResult, format_table, hit_rate, score_query


def test_in_corpus_hit_when_expected_source_retrieved() -> None:
    assert score_query(["projects/hrm.md"], ["projects/hrm.md", "cv.md"], 0.2, 0.7)


def test_in_corpus_miss_when_expected_source_absent() -> None:
    assert not score_query(["projects/hrm.md"], ["cv.md"], 0.2, 0.7)


def test_in_corpus_requires_all_expected() -> None:
    assert not score_query(
        ["projects/hrm.md", "projects/platform.md"], ["projects/hrm.md"], 0.2, 0.7
    )


def test_out_of_corpus_passes_when_best_is_beyond_threshold() -> None:
    # No expected source; the closest chunk is far, so the guardrail refuses.
    assert score_query([], ["projects/hrm.md"], best_distance=0.9, weak_threshold=0.7)


def test_out_of_corpus_fails_when_a_chunk_is_close() -> None:
    # A close chunk for an out-of-corpus question means it would NOT refuse.
    assert not score_query([], ["projects/hrm.md"], best_distance=0.3, weak_threshold=0.7)


def test_out_of_corpus_passes_when_no_chunks() -> None:
    assert score_query([], [], best_distance=None, weak_threshold=0.7)


def test_hit_rate() -> None:
    results = [
        QueryResult("q1", ["a"], ["a"], 0.2, True),
        QueryResult("q2", ["b"], ["c"], 0.2, False),
        QueryResult("q3", [], [], None, True),
    ]
    assert hit_rate(results) == 2 / 3
    assert hit_rate([]) == 0.0


def test_format_table_marks_pass_and_fail_and_rate() -> None:
    results = [
        QueryResult("good", ["a"], ["a"], 0.2, True),
        QueryResult("bad", ["b"], ["c"], 0.5, False),
    ]
    table = format_table(results)
    assert "PASS" in table and "FAIL" in table
    assert "good" in table and "bad" in table
    assert "1/2" in table and "50.0%" in table
