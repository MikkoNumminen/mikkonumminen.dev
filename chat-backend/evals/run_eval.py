"""Retrieval eval runner — `python -m evals.run_eval`.

Embeds each eval question, retrieves the top-k corpus chunks from pgvector, and
scores whether the expected source(s) were retrieved (or, for out-of-corpus
questions, whether the guardrail would refuse). Prints a PASS/FAIL table and the
aggregate hit-rate — the credibility metric for the RAG layer, and the tool for
tuning `WEAK_RETRIEVAL_DISTANCE`.

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
from app.retrieval import retrieve

from .scoring import QueryResult, format_table, hit_rate, score_query

EVAL_SET_PATH = Path(__file__).resolve().parent / "eval_set.json"


def load_queries(path: Path) -> list[dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    queries = data.get("queries") if isinstance(data, dict) else None
    if not isinstance(queries, list):
        raise ValueError(f"{path}: 'queries' must be a list")
    return [q for q in queries if isinstance(q, dict)]


async def _eval_mode(
    db: Database, embedder: Embedder, settings: Settings, *, hybrid: bool
) -> list[QueryResult]:
    """Score every eval question under one retrieval mode (dense or hybrid)."""
    results: list[QueryResult] = []
    for query in load_queries(EVAL_SET_PATH):
        question = str(query["question"])
        raw_expected = query.get("expected_sources", [])
        expected = (
            [str(s) for s in raw_expected] if isinstance(raw_expected, list) else []
        )
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
        # The weak-retrieval gate keys on the best DENSE distance, which hybrid
        # preserves, so the same scoring applies to both modes.
        best = min((c.distance for c in chunks), default=None)
        hit = score_query(expected, retrieved, best, settings.weak_retrieval_distance)
        results.append(
            QueryResult(
                question=question,
                expected=expected,
                retrieved=retrieved,
                best_distance=best,
                hit=hit,
            )
        )
    return results


async def run(settings: Settings) -> tuple[list[QueryResult], list[QueryResult]]:
    """Score the eval set under dense-only AND hybrid retrieval for comparison.

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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m evals.run_eval",
        description="Retrieval hit-rate eval over the fixed question set.",
    )
    parser.add_argument(
        "--min-hit-rate",
        type=float,
        default=0.0,
        help="Exit non-zero if the hit-rate falls below this (0.0-1.0).",
    )
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    dense, hybrid = asyncio.run(run(settings))

    dense_rate, hybrid_rate = hit_rate(dense), hit_rate(hybrid)
    print("=== DENSE-ONLY ===")
    print(format_table(dense))
    print(f"dense hit-rate: {dense_rate:.3f}\n")
    print("=== HYBRID (BM25 + dense, reciprocal rank fusion) ===")
    print(format_table(hybrid))
    print(f"hybrid hit-rate: {hybrid_rate:.3f}\n")
    print(
        f"[eval] dense {dense_rate:.3f} -> hybrid {hybrid_rate:.3f} "
        f"(delta {hybrid_rate - dense_rate:+.3f})"
    )

    # Gate on the live (hybrid) configuration — that is what serves traffic.
    if hybrid_rate < args.min_hit_rate:
        print(
            f"\n[eval] hybrid hit-rate {hybrid_rate:.3f} below threshold "
            f"{args.min_hit_rate}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
