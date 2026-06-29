"""Container-side per-arm measurement — run INSIDE the backend container (it needs
the app's embedder + pgvector + the live /chat). Given an eval set it emits one arm's
results as JSON: the retrieval rows (zero-token: embedder + pgvector scoring) and the
synthesis + containment tallies (the generations — the ONLY token cost), plus the
AS-EXECUTED fingerprint fields (effective num_ctx from the env, model/embedder, eval
content_sha). The host-side LiveArm shells this out per arm after swapping the stack.

Reuses the committed evals (run_eval's scoring, acceptance's case builder + checks)
so this is consolidation, not re-implementation. It is generic: it reads the model /
embedder / num_ctx from the environment and the routing from the pipeline's own
detector — nothing here names a language or a model.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from app.config import Settings
from app.db import Database, apply_schema
from app.embeddings import Embedder
from app.retrieval import retrieve
from evals.acceptance import call_chat, finnish_eval_cases
from evals.scoring import reciprocal_rank, score_query

EVALS = Path(__file__).resolve().parents[1]


def _eval_sha(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    qs = data.get("queries", [])
    sig = json.dumps(
        [[q.get("id"), q.get("question"), q.get("expected_sources")] for q in qs],
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(sig.encode("utf-8")).hexdigest()[:8]


async def _retrieval_rows(
    queries: list[dict[str, Any]], s: Settings
) -> list[dict[str, Any]]:
    await apply_schema(s.database_url)
    db = await Database.connect(s.database_url)
    emb = Embedder(s.embedding_model, s.embedding_dim)
    thr = s.weak_retrieval_distance
    rows: list[dict[str, Any]] = []
    try:
        for q in queries:
            if q.get("expectation") != "must_retrieve":
                continue
            expected = [str(x) for x in q.get("expected_sources", [])]
            chunks = await retrieve(
                emb, db, str(q["question"]), s.retrieval_top_k,
                hybrid=s.hybrid_enabled, rrf_k=s.rrf_k,
                dense_weight=s.retrieval_dense_weight,
                lexical_weight=s.retrieval_lexical_weight,
                project_filter_strict=s.project_filter_strict,
            )
            retrieved = [c.source for c in chunks]
            prose = [c for c in chunks if c.chunk_type == "prose"]
            best = min((c.distance for c in (prose or chunks)), default=None)
            rows.append(
                {
                    "id": q["id"],
                    "hit": score_query(expected, retrieved, best, thr),
                    "rr": reciprocal_rank(expected, retrieved, best, thr),
                    "best_distance": best,
                }
            )
    finally:
        await db.close()
    return rows


def _synthesis(eval_set: Path, base_url: str, allow_finnish: bool) -> dict[str, Any]:
    cases = finnish_eval_cases(eval_set, allow_finnish=allow_finnish)
    answer = refuse = answer_pass = refuse_pass = 0
    for c in cases:
        r = call_chat(base_url, c.message, 150.0)
        ok, _ = c.check(r)
        if c.name.startswith("answer"):
            answer += 1
            answer_pass += int(ok)
        else:
            refuse += 1
            refuse_pass += int(ok)
    return {
        "synthesis": {"substantive": answer_pass, "total": answer},
        "containment": {"refused": refuse_pass, "total": refuse},
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m evals.experiment.eval_arm")
    ap.add_argument("--eval-set", required=True)
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--num-ctx", type=int, required=True, help="effective num_ctx")
    args = ap.parse_args(argv)

    s = Settings.from_env()
    eval_set = Path(args.eval_set)
    queries = json.loads(eval_set.read_text(encoding="utf-8"))["queries"]
    retrieval = asyncio.run(_retrieval_rows(queries, s))
    synth = _synthesis(eval_set, args.base_url, s.rag_allow_finnish)
    out = {
        "fp_fields": {
            "top_k": s.retrieval_top_k,
            "temperature": s.llm_temperature,
            "num_ctx": args.num_ctx,  # effective, from the env (not a code default)
            # prompt_template_sha + eval_set_sha are merged by the host from the manifest
            "eval_set_sha": _eval_sha(eval_set),
            "model": s.llm_model,
            "embedder": s.embedding_model,
        },
        "observed_lock": {
            "top_k": s.retrieval_top_k,
            "temperature": s.llm_temperature,
            "num_ctx": args.num_ctx,
        },
        "retrieval": retrieval,
        **synth,
    }
    json.dump(out, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
