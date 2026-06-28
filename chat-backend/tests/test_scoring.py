"""Tests for eval scoring (retrieval hit-rate, MRR, coverage)."""

from __future__ import annotations

from evals.scoring import (
    MUST_REFUSE_OFFCORPUS,
    MUST_RETRIEVE,
    QueryResult,
    format_table,
    hit_rate,
    mean_reciprocal_rank,
    reciprocal_rank,
    retrieval_hit_rate,
    score_query,
    source_coverage,
)


def test_in_corpus_hit_when_expected_source_retrieved() -> None:
    assert score_query(["projects/hrm.md"], ["projects/hrm.md", "cv.md"], 0.2, 0.7)


def test_in_corpus_miss_when_expected_source_absent() -> None:
    assert not score_query(["projects/hrm.md"], ["cv.md"], 0.2, 0.7)


def test_in_corpus_requires_all_expected() -> None:
    assert not score_query(
        ["projects/hrm.md", "projects/platform.md"], ["projects/hrm.md"], 0.2, 0.7
    )


def test_in_corpus_miss_when_best_distance_beyond_threshold() -> None:
    # Expected source IS retrieved, but the closest chunk is too far — the
    # pipeline would refuse without answering, so this is NOT a hit (regression
    # for the scorer mirroring the guardrail gate).
    assert not score_query(["projects/hrm.md"], ["projects/hrm.md"], 0.95, 0.7)


def test_in_corpus_hit_at_threshold_boundary() -> None:
    # best == threshold is relevant (guardrail refuses only strictly beyond).
    assert score_query(["projects/hrm.md"], ["projects/hrm.md"], 0.7, 0.7)


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


# --- reciprocal rank / MRR / coverage (golden-set retrieval metrics) ---


def test_reciprocal_rank_first_source_is_one() -> None:
    assert reciprocal_rank(["a"], ["a", "b"], 0.2, 0.7) == 1.0


def test_reciprocal_rank_uses_earliest_retrieved_expected() -> None:
    # The earliest RETRIEVED chunk whose source is expected ("b" at rank 3) gives
    # 1/3 — the rank keys on retrieved order, not on which `expected` entry it is
    # ("x", expected[0], appears later at rank 4).
    assert reciprocal_rank(["x", "b"], ["a", "c", "b", "x"], 0.2, 0.7) == 1 / 3


def test_reciprocal_rank_zero_when_no_expected_source_retrieved() -> None:
    assert reciprocal_rank(["a"], ["b", "c"], 0.2, 0.7) == 0.0


def test_reciprocal_rank_zero_when_gate_would_refuse() -> None:
    # Expected source IS retrieved, but the closest chunk is beyond the threshold:
    # the pipeline refuses, so the rank is moot.
    assert reciprocal_rank(["a"], ["a"], 0.9, 0.7) == 0.0


def test_reciprocal_rank_zero_for_out_of_corpus() -> None:
    assert reciprocal_rank([], ["a"], 0.2, 0.7) == 0.0


def test_retrieval_hit_rate_ignores_refuse_questions() -> None:
    results = [
        QueryResult("r1", ["a"], ["a"], 0.2, True, expectation=MUST_RETRIEVE, rr=1.0),
        QueryResult("r2", ["b"], ["c"], 0.2, False, expectation=MUST_RETRIEVE, rr=0.0),
        # A refusal question has no expected source; it must not dilute the
        # retrieval hit-rate.
        QueryResult("o1", [], [], None, True, expectation=MUST_REFUSE_OFFCORPUS),
    ]
    assert retrieval_hit_rate(results) == 0.5
    assert retrieval_hit_rate([]) == 0.0


def test_mean_reciprocal_rank_over_retrieve_subset() -> None:
    results = [
        QueryResult("r1", ["a"], ["a"], 0.2, True, expectation=MUST_RETRIEVE, rr=1.0),
        QueryResult(
            "r2", ["b"], ["x", "b"], 0.2, True, expectation=MUST_RETRIEVE, rr=0.5
        ),
        QueryResult("o1", [], [], None, True, expectation=MUST_REFUSE_OFFCORPUS, rr=0.0),
    ]
    assert mean_reciprocal_rank(results) == 0.75
    assert mean_reciprocal_rank([]) == 0.0


def test_source_coverage_counts_any_expected_source() -> None:
    results = [
        QueryResult("r1", ["a"], ["a"], 0.2, True, expectation=MUST_RETRIEVE, rr=1.0),
        # All-source MISS (hit False) but one expected source surfaced (rr>0).
        QueryResult(
            "r2", ["b", "c"], ["b"], 0.2, False, expectation=MUST_RETRIEVE, rr=1.0
        ),
        QueryResult("r3", ["d"], ["e"], 0.2, False, expectation=MUST_RETRIEVE, rr=0.0),
    ]
    assert source_coverage(results) == 2 / 3
    assert source_coverage([]) == 0.0


def test_format_table_marks_non_scorable_na() -> None:
    results = [
        QueryResult(
            "inj",
            [],
            [],
            0.3,
            False,
            category="injection",
            expectation="must_refuse_injection",
            scorable=False,
        ),
    ]
    table = format_table(results)
    assert "NA" in table
    # A non-scorable row is excluded from the pass-rate denominator.
    assert "0/0" in table
