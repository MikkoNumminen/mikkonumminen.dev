"""Eval scoring — retrieval hit-rate + MRR over the golden question set.

The credibility piece: does the right source actually get retrieved for a known
question, and does an out-of-corpus question get refused? The scoring maths are
separated from the I/O runner (run_eval.py) so they are unit-tested without a DB
or model.

A golden-set question carries an `expectation` (see the constants below). The
retrieval-scorable expectations (`must_retrieve`, `must_refuse_offcorpus`) are
judged here from the retrieved sources and the weak-retrieval gate distance. The
gate-only refusals (`must_refuse_generative` / `_translation`, scored by the
deterministic guardrail functions) and the live-LLM `must_refuse_injection`
cases (scored by evals/acceptance.py against a running backend) are NOT judged
here — the runner owns those, because they need the guardrail module or a model.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

# Expectation classes a golden-set question can carry. Kept as plain strings (no
# enum) so the JSON set, the runner, and these helpers share one vocabulary
# without this pure-stdlib module importing anything heavier.
MUST_RETRIEVE = "must_retrieve"
MUST_REFUSE_OFFCORPUS = "must_refuse_offcorpus"
MUST_REFUSE_GENERATIVE = "must_refuse_generative"
MUST_REFUSE_TRANSLATION = "must_refuse_translation"
MUST_REFUSE_INJECTION = "must_refuse_injection"


@dataclass(frozen=True)
class QueryResult:
    """One scored question.

    The first five fields are the original retrieval-scoring shape (kept so the
    scorer's unit tests construct it positionally); the rest carry the golden-set
    metadata the richer runner reports on. `rr` is the reciprocal rank of the
    first expected source (0 for non-retrieve questions); `scorable` is False for
    a question this layer can't judge (the injection cases, deferred to the
    acceptance harness), so it is excluded from the pass-rate rather than counted
    as a failure.
    """

    question: str
    expected: list[str]
    retrieved: list[str]
    best_distance: float | None
    hit: bool
    category: str = ""
    expectation: str = MUST_RETRIEVE
    rr: float = 0.0
    scorable: bool = True


def score_query(
    expected: Sequence[str],
    retrieved_sources: Sequence[str],
    best_distance: float | None,
    weak_threshold: float,
) -> bool:
    """Whether a query's retrieval is correct.

    In-corpus (`expected` non-empty): pass when every expected source appears in
    the retrieved set. Out-of-corpus (`expected` empty): pass when the guardrail
    would refuse — no chunks at all, or the closest chunk is beyond
    `weak_threshold` (so generation is never reached).
    """
    if not expected:
        return best_distance is None or best_distance > weak_threshold
    # In-corpus: mirror the pipeline's guardrail. If the closest chunk is beyond
    # the weak threshold the pipeline refuses without answering, so an expected
    # source that was "retrieved" but gated out is NOT a real hit — counting it
    # would inflate the hit-rate this eval exists to measure.
    if best_distance is None or best_distance > weak_threshold:
        return False
    found = set(retrieved_sources)
    return all(source in found for source in expected)


def reciprocal_rank(
    expected: Sequence[str],
    retrieved_sources: Sequence[str],
    best_distance: float | None,
    weak_threshold: float,
) -> float:
    """Reciprocal rank of the earliest RETRIEVED source that is an expected one.

    `1/rank` (rank counted from 1) of the first chunk in the retrieved ranking
    whose source is one of `expected` (standard MRR semantics — it keys on the
    retrieved order, not on which `expected` entry it is). Averaged across
    questions this gives MRR — a sharper retrieval signal than
    hit-rate because it rewards ranking the right chunk near the top, not merely
    somewhere in the top-k. Returns 0.0 when no expected source surfaced, or when
    the weak-retrieval gate would refuse (best distance beyond the threshold): the
    pipeline then answers nothing, so the rank is moot. Out-of-corpus questions
    (no expected source) have no defined rank and return 0.0 — they are judged by
    the refusal gate, not by rank, and are excluded from the MRR denominator by
    the runner.
    """
    if not expected:
        return 0.0
    if best_distance is None or best_distance > weak_threshold:
        return 0.0
    for rank, source in enumerate(retrieved_sources, start=1):
        if source in expected:
            return 1.0 / rank
    return 0.0


def _retrieve_subset(results: Sequence[QueryResult]) -> list[QueryResult]:
    return [r for r in results if r.expectation == MUST_RETRIEVE]


def retrieval_hit_rate(results: Sequence[QueryResult]) -> float:
    """Hit-rate over the must-retrieve questions only (0.0 when there are none).

    The spec's headline retrieval metric: of the questions that SHOULD surface a
    known source, what fraction did. Refusal questions are excluded — they have no
    expected source to hit and would otherwise dilute the number.
    """
    retrieve = _retrieve_subset(results)
    if not retrieve:
        return 0.0
    return sum(1 for r in retrieve if r.hit) / len(retrieve)


def mean_reciprocal_rank(results: Sequence[QueryResult]) -> float:
    """MRR over the must-retrieve questions only (0.0 when there are none)."""
    retrieve = _retrieve_subset(results)
    if not retrieve:
        return 0.0
    return sum(r.rr for r in retrieve) / len(retrieve)


def source_coverage(results: Sequence[QueryResult]) -> float:
    """Fraction of must-retrieve questions where AT LEAST ONE expected source
    surfaced and the gate would not refuse (rr > 0 marks exactly that).

    Complements the strict hit-rate (which needs EVERY expected source): the gap
    between coverage and hit-rate is the multi-source-assembly shortfall — how
    often retrieval finds a relevant source but not the whole set a deep or
    cross-project answer needs. 0.0 when there are no must-retrieve questions.
    """
    retrieve = _retrieve_subset(results)
    if not retrieve:
        return 0.0
    return sum(1 for r in retrieve if r.rr > 0) / len(retrieve)


def format_table(results: Sequence[QueryResult]) -> str:
    """An aligned PASS/FAIL/NA table plus the aggregate pass-rate.

    A non-scorable question (the injection cases this layer can't judge) shows
    `NA` and is left out of the pass-rate denominator, so deferring a check to the
    acceptance harness never reads as a failure here.
    """
    lines = [f"{'result':<6}  {'dist':>5}  {'category':<22}  question"]
    lines.append("-" * 78)
    for r in results:
        mark = "NA" if not r.scorable else ("PASS" if r.hit else "FAIL")
        dist = "  -  " if r.best_distance is None else f"{r.best_distance:.3f}"
        lines.append(f"{mark:<6}  {dist:>5}  {r.category:<22}  {r.question}")
    scorable = [r for r in results if r.scorable]
    passed = sum(1 for r in scorable if r.hit)
    lines.append("-" * 78)
    rate = (passed / len(scorable) * 100) if scorable else 0.0
    # This denominator mixes must_retrieve with the refusal classes — it is NOT
    # the retrieval hit-rate (which the runner prints separately over the
    # must_retrieve subset only). Label it so the two percentages aren't read as
    # sharing a denominator.
    lines.append(
        f"pass-rate (retrieve + refuse, {len(scorable)} scorable): "
        f"{passed}/{len(scorable)} = {rate:.1f}%"
    )
    return "\n".join(lines)
