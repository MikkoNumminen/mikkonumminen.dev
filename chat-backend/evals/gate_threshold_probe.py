"""Regenerate the relevance-threshold measurement. Read-only, no model.

    docker compose exec -T backend python -m evals.gate_threshold_probe

WHY THIS IS COMMITTED RATHER THAN A SCRATCH SCRIPT. It produced
`docs/audits/relevance-gate-threshold-2026-08-07.md`, which argues against a
one-line change that looks obviously correct. An argument like that is only worth
anything if the next person can re-run it: the corpus grows, the embedder could
change, and a conclusion that cannot be re-derived becomes folklore. The first
version of this lived in a temp directory and would have been gone by morning.

Retrieval only. No LLM call, so it is deterministic and the numbers reproduce
exactly unless the corpus or the embedder moved. If they moved, that is the
finding.

Goes through `evals.production_retrieval`, the call `pipeline` makes. Three
harnesses had each drifted to a different retrieval configuration before that
helper existed, and a measurement of a configuration nobody runs is worth nothing.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterable, Sequence
from pathlib import Path

from app.config import Settings
from app.db import Database
from app.embeddings import Embedder
from app.guardrails import is_weak_retrieval, prose_anchor
from app.query_projects import wants_cv_intent
from app.retrieval import RetrievedChunk
from evals.production_retrieval import retrieve_as_production

EVAL_SET = Path(__file__).resolve().parent / "eval_set.json"

# Thresholds worth reporting: the shipped one, and the band around the gap
# between the worst answerable question and the nearest off-corpus one.
CANDIDATE_THRESHOLDS = (0.45, 0.42, 0.41, 0.40, 0.35)

# CV phrasings, none of which are in the eval set. That absence is the whole
# reason this list is hard-coded here: the eval set cannot see the regression
# that lowering the threshold causes, because nothing in it trips the CV route.
CV_QUESTIONS = (
    "what work experience do you have?",
    "what is your work experience",
    "what work experience does Mikko have",
    "tell me about your career",
    "what is in your CV",
    "what does your CV say",
    "mita tyokokemusta sinulla on",
    "kerro urastasi",
    "where have you worked",
    "what jobs has Mikko had",
)


async def _anchors(
    emb: Embedder,
    db: Database,
    settings: Settings,
    questions: Iterable[str],
) -> list[tuple[float | None, str, Sequence[RetrievedChunk]]]:
    out: list[tuple[float | None, str, Sequence[RetrievedChunk]]] = []
    for question in questions:
        chunks = await retrieve_as_production(emb, db, question, settings)
        out.append((prose_anchor(chunks), question, chunks))
    return out


async def main() -> None:
    raw = json.loads(EVAL_SET.read_text(encoding="utf-8"))
    queries = raw["queries"] if isinstance(raw, dict) else raw
    by_expectation: dict[str, list[str]] = {}
    for q in queries:
        by_expectation.setdefault(str(q.get("expectation", "")), []).append(
            str(q["question"])
        )

    settings = Settings.from_env()
    db = await Database.connect(settings.database_url)
    emb = Embedder(settings.embedding_model, settings.embedding_dim)

    answerable = [
        a
        for a, _, _ in await _anchors(emb, db, settings, by_expectation["must_retrieve"])
        if a
    ]
    offcorpus = [
        (a, q)
        for a, q, _ in await _anchors(
            emb, db, settings, by_expectation["must_refuse_offcorpus"]
        )
        if a
    ]
    injection = [
        (a, q)
        for a, q, _ in await _anchors(
            emb, db, settings, by_expectation["must_refuse_injection"]
        )
        if a
    ]

    worst_ok = max(answerable)
    print(
        f"must_retrieve          n={len(answerable):3d}  "
        f"{min(answerable):.4f} .. {worst_ok:.4f}"
    )
    print(
        f"must_refuse_offcorpus  n={len(offcorpus):3d}  "
        f"{min(a for a, _ in offcorpus):.4f} .. {max(a for a, _ in offcorpus):.4f}"
    )
    print(f"shipped threshold            {settings.weak_retrieval_distance}")
    print()

    print("threshold  real refused  off-corpus answered  injection gated")
    for t in CANDIDATE_THRESHOLDS:
        print(
            f"   {t:.2f}     {sum(1 for a in answerable if a > t):>4d} "
            f"of {len(answerable):<3d}"
            f"  {sum(1 for a, _ in offcorpus if a <= t):>6d} of {len(offcorpus):<3d}"
            f"       {sum(1 for a, _ in injection if a > t):>3d} of {len(injection)}"
        )
    print()

    print("injection payloads (three sit below the worst answerable question):")
    for a, q in sorted(injection):
        mark = "unreachable" if a < worst_ok else "gatable"
        print(f"  {a:.4f}  {mark:<12} {q[:52]}")
    print()

    # The regression the eval set cannot see.
    print("CV questions at each candidate threshold (refusals are the cost):")
    cv = await _anchors(emb, db, settings, CV_QUESTIONS)
    for t in CANDIDATE_THRESHOLDS:
        refused = []
        for anchor, question, chunks in cv:
            if anchor is None:
                continue
            rescued = (
                wants_cv_intent(question, question)
                and any(c.source == "cv.md" for c in chunks)
                and anchor <= t + 0.05
            )
            if is_weak_retrieval(chunks, t) and not rescued:
                refused.append((anchor, question))
        print(f"  threshold {t:.2f}: {len(refused)} of {len(cv)} refused")
        for anchor, question in sorted(refused):
            print(f"      {anchor:.4f}  {question}")

    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
