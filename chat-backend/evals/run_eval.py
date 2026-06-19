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
from app.db import SQL_PATH, Database, apply_schema
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


async def run(settings: Settings) -> list[QueryResult]:
    await apply_schema(settings.database_url, SQL_PATH)
    db = await Database.connect(settings.database_url)
    embedder = Embedder(settings.embedding_model, settings.embedding_dim)
    results: list[QueryResult] = []
    try:
        for query in load_queries(EVAL_SET_PATH):
            question = str(query["question"])
            raw_expected = query.get("expected_sources", [])
            expected = (
                [str(s) for s in raw_expected] if isinstance(raw_expected, list) else []
            )
            chunks = await retrieve(embedder, db, question, settings.retrieval_top_k)
            retrieved = [c.source for c in chunks]
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
    finally:
        await db.close()
    return results


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
    results = asyncio.run(run(settings))
    print(format_table(results))

    rate = hit_rate(results)
    if rate < args.min_hit_rate:
        print(
            f"\n[eval] hit-rate {rate:.3f} below threshold {args.min_hit_rate}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
