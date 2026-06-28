"""Golden-set eval runner — `python -m evals.run_eval`.

Embeds each golden-set question, retrieves the top-k corpus chunks from pgvector,
and scores it against its declared `expectation`:

  * must_retrieve            -> the expected source(s) must surface (hit-rate + MRR)
  * must_refuse_offcorpus    -> the weak-retrieval gate must refuse (no LLM)
  * must_refuse_generative   -> the generative-intent gate must fire (deterministic)
  * must_refuse_translation  -> the translation gate must fire (deterministic)
  * must_refuse_injection    -> NOT scored here (prompt + live LLM) -> evals/acceptance.py

Prints a PASS/FAIL table and the retrieval-quality metrics (hit-rate + MRR over
the expected source chunks) under both dense-only and the live hybrid config — the
credibility metric for the RAG layer, the instrument every later phase reports a
before/after delta against, and the tool for tuning `WEAK_RETRIEVAL_DISTANCE`.

Run against the live stack (index the corpus first):
    docker compose run --rm backend python -m app.indexer
    docker compose run --rm backend python -m evals.run_eval
    docker compose run --rm backend python -m evals.run_eval --min-hit-rate 0.8
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from app.config import Settings
from app.db import Database, apply_schema
from app.embeddings import Embedder
from app.guardrails import is_generative_request, is_translation_request
from app.retrieval import retrieve

from .scoring import (
    MUST_REFUSE_GENERATIVE,
    MUST_REFUSE_INJECTION,
    MUST_REFUSE_OFFCORPUS,
    MUST_REFUSE_TRANSLATION,
    MUST_RETRIEVE,
    QueryResult,
    format_table,
    mean_reciprocal_rank,
    reciprocal_rank,
    retrieval_hit_rate,
    score_query,
    source_coverage,
)

EVAL_SET_PATH = Path(__file__).resolve().parent / "eval_set.json"


def load_queries(path: Path) -> list[dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    queries = data.get("queries") if isinstance(data, dict) else None
    if not isinstance(queries, list):
        raise ValueError(f"{path}: 'queries' must be a list")
    return [q for q in queries if isinstance(q, dict)]


def _score_one(
    *,
    question: str,
    expectation: str,
    expected: list[str],
    retrieved: list[str],
    best: float | None,
    weak_threshold: float,
) -> tuple[bool, float, bool]:
    """Judge one question against its expectation -> (hit, reciprocal_rank, scorable).

    Retrieval expectations key on the retrieved sources + gate distance; the
    generative/translation refusals key on the deterministic guardrail functions
    (mode-independent); the injection cases are deferred to the acceptance harness
    and reported as non-scorable so they neither pass nor fail here.
    """
    if expectation == MUST_REFUSE_OFFCORPUS:
        return score_query([], retrieved, best, weak_threshold), 0.0, True
    if expectation == MUST_REFUSE_GENERATIVE:
        return is_generative_request(question), 0.0, True
    if expectation == MUST_REFUSE_TRANSLATION:
        return is_translation_request(question), 0.0, True
    if expectation == MUST_REFUSE_INJECTION:
        # Prompt-level + live-LLM containment — run_eval has no model. Covered by
        # `python -m evals.acceptance` against a running, indexed backend.
        return False, 0.0, False
    # must_retrieve (and any unknown expectation defaults to it).
    hit = score_query(expected, retrieved, best, weak_threshold)
    rr = reciprocal_rank(expected, retrieved, best, weak_threshold)
    return hit, rr, True


async def _eval_mode(
    db: Database, embedder: Embedder, settings: Settings, *, hybrid: bool
) -> list[QueryResult]:
    """Score every golden-set question under one retrieval mode (dense or hybrid)."""
    results: list[QueryResult] = []
    for query in load_queries(EVAL_SET_PATH):
        question = str(query["question"])
        raw_expected = query.get("expected_sources", [])
        expected = (
            [str(s) for s in raw_expected] if isinstance(raw_expected, list) else []
        )
        expectation = str(query.get("expectation", MUST_RETRIEVE))
        category = str(query.get("category", ""))

        chunks = await retrieve(
            embedder,
            db,
            question,
            settings.retrieval_top_k,
            hybrid=hybrid,
            rrf_k=settings.rrf_k,
            dense_weight=settings.retrieval_dense_weight,
            lexical_weight=settings.retrieval_lexical_weight,
            project_filter_strict=settings.project_filter_strict,
        )
        retrieved = [c.source for c in chunks]
        # Mirror the live weak-retrieval gate, which keys on the closest PROSE
        # chunk (a stray near code chunk must not make an off-topic query look
        # relevant). retrieve() appends a prose anchor when the top-k is all code,
        # so prose is present whenever the gate would have a signal; fall back to
        # all chunks for a code-only corpus, exactly as is_weak_retrieval does.
        # Keying on min-over-all here instead would under-report off-corpus
        # refusals the live stack actually makes (e.g. a near code chunk).
        prose = [c for c in chunks if c.chunk_type == "prose"]
        best = min((c.distance for c in (prose or chunks)), default=None)
        hit, rr, scorable = _score_one(
            question=question,
            expectation=expectation,
            expected=expected,
            retrieved=retrieved,
            best=best,
            weak_threshold=settings.weak_retrieval_distance,
        )
        results.append(
            QueryResult(
                question=question,
                expected=expected,
                retrieved=retrieved,
                best_distance=best,
                hit=hit,
                category=category,
                expectation=expectation,
                rr=rr,
                scorable=scorable,
            )
        )
    return results


async def run(settings: Settings) -> tuple[list[QueryResult], list[QueryResult]]:
    """Score the golden set under dense-only AND hybrid retrieval for comparison.

    Connects once and runs both modes over the same db/embedder, so the only
    variable is the retrieval strategy — the measurable case for hybrid.
    """
    await apply_schema(settings.database_url)
    db = await Database.connect(settings.database_url)
    embedder = Embedder(settings.embedding_model, settings.embedding_dim)
    try:
        dense = await _eval_mode(db, embedder, settings, hybrid=False)
        hybrid = await _eval_mode(db, embedder, settings, hybrid=True)
    finally:
        await db.close()
    return dense, hybrid


def _print_mode(label: str, results: list[QueryResult]) -> None:
    print(f"=== {label} ===")
    print(format_table(results))
    print(
        f"retrieval hit-rate: {retrieval_hit_rate(results):.3f}   "
        f"coverage: {source_coverage(results):.3f}   "
        f"MRR: {mean_reciprocal_rank(results):.3f}\n"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m evals.run_eval",
        description="Golden-set retrieval eval (hit-rate + MRR) over the question set.",
    )
    parser.add_argument(
        "--min-hit-rate",
        type=float,
        default=0.0,
        help="Exit non-zero if the hybrid retrieval hit-rate falls below this (0.0-1.0).",
    )
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    dense, hybrid = asyncio.run(run(settings))

    _print_mode("DENSE-ONLY", dense)
    _print_mode("HYBRID (BM25 + dense, reciprocal rank fusion)", hybrid)

    dense_rate = retrieval_hit_rate(dense)
    hybrid_rate = retrieval_hit_rate(hybrid)
    dense_mrr = mean_reciprocal_rank(dense)
    hybrid_mrr = mean_reciprocal_rank(hybrid)
    deferred = sum(
        1 for r in hybrid if r.expectation == MUST_REFUSE_INJECTION
    )
    print(
        f"[eval] retrieval hit-rate  dense {dense_rate:.3f} -> hybrid {hybrid_rate:.3f} "
        f"(delta {hybrid_rate - dense_rate:+.3f})"
    )
    print(
        f"[eval] MRR                 dense {dense_mrr:.3f} -> hybrid {hybrid_mrr:.3f} "
        f"(delta {hybrid_mrr - dense_mrr:+.3f})"
    )
    dense_cov = source_coverage(dense)
    hybrid_cov = source_coverage(hybrid)
    print(
        f"[eval] source coverage     dense {dense_cov:.3f} -> hybrid {hybrid_cov:.3f} "
        f"(delta {hybrid_cov - dense_cov:+.3f})"
    )
    if deferred:
        print(
            f"[eval] {deferred} injection case(s) not scored here "
            "(prompt + live LLM) — run `python -m evals.acceptance`."
        )

    # Gate on the live (hybrid) configuration's retrieval hit-rate — that is what
    # serves traffic.
    if hybrid_rate < args.min_hit_rate:
        print(
            f"\n[eval] hybrid retrieval hit-rate {hybrid_rate:.3f} below threshold "
            f"{args.min_hit_rate}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
