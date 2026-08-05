"""Chunk-level retrieval probe for questions that name no project.

`run_eval.py` scores `must_retrieve` at FILE level: a hit means some chunk of
the expected document came back. That is too coarse for this failure mode. The
document can rank #1 while the retrieved chunk is the NEIGHBOUR of the one
holding the answer — which is what happened here: `portfolio-deepdive.md`
ranked first for "how many shapes does the home page star field cycle through",
scoring a clean hit, while the sentence naming the four shapes sat in the
adjacent chunk and never reached the model.

So this measures two finer things over `eval_set_unnamed_project.json`:

  share    fraction of the returned top_k belonging to the expected document
  answer   whether the retrieved TEXT actually contains the answering phrase

`answer` is the one that matters. It is the difference between the model having
the fact and inventing it.

Run against the live stack, after indexing:

    docker compose run --rm backend python -m evals.unnamed_project_probe
    docker compose run --rm -e PROBE_CAP=1 backend python -m evals.unnamed_project_probe

`PROBE_CAP` overrides RETRIEVAL_DIVERSITY_MAX_PER_PROJECT for one run, so the
cap can be swept without touching config. The trade it exists to measure is
recorded next to the setting in `app/config.py`.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from app.config import Settings
from app.db import Database
from app.embeddings import Embedder

from .production_retrieval import retrieve_as_production

EVAL_SET_PATH = Path(__file__).resolve().parent / "eval_set_unnamed_project.json"

# The literal phrase whose presence in the retrieved text means the model was
# actually given the answer. Deliberately short and distinctive: a longer
# phrase would fail on chunk boundaries and measure tokenisation, not recall.
ANCHORS: dict[str, str] = {
    "unnamed-field-shape-count": "cycling through four shapes",
    "unnamed-dpr-cap": "default cap is 1.5",
    "unnamed-footer-chrome": "footer-lift",
    "unnamed-webgl-context-budget": "context-budget invariant",
    "unnamed-save-wipe": "save wipe",
    "unnamed-date-serialization": "unstable_cache",
    "unnamed-invisible-characters": "invisible",
    "unnamed-waiter-thread": "waiter thread",
    "unnamed-single-schema-tenancy": "single schema",
    "unnamed-ratelimit-no-redis": "without redis",
    "unnamed-cpm-bpm": "cpm",
    "unnamed-masking-arrangement": "masking",
}


async def run() -> tuple[float, float]:
    settings = Settings.from_env()
    override = os.environ.get("PROBE_CAP")
    cap = int(override) if override else settings.retrieval_diversity_max_per_project

    db = await Database.connect(settings.database_url)
    embedder = Embedder(settings.embedding_model, settings.embedding_dim)
    cases = json.loads(EVAL_SET_PATH.read_text(encoding="utf-8"))["queries"]

    print(f"top_k={settings.retrieval_top_k}  diversity_max_per_project={cap}\n")

    shares: list[float] = []
    answered: list[bool] = []
    try:
        for case in cases:
            expected = case["expected_sources"][0]
            # `cap` is this probe's axis: it sweeps the diversity limit. Every
            # other argument comes from production via the shared helper.
            chunks = await retrieve_as_production(
                embedder, db, case["question"], settings, diversify_max_per_project=cap
            )
            matching = sum(1 for c in chunks if c.source == expected)
            share = matching / len(chunks) if chunks else 0.0
            blob = " ".join(" ".join(c.content.split()) for c in chunks).lower()
            hit = ANCHORS[case["id"]].lower() in blob

            shares.append(share)
            answered.append(hit)
            mark = "ANSWER" if hit else "  --  "
            print(
                f"{mark}  share={share:.2f} ({matching}/{len(chunks)})  {case['id']}"
            )
    finally:
        await db.close()

    n = len(shares)
    mean_share = sum(shares) / n
    answer_rate = sum(answered) / n
    print()
    print(f"mean expected-source share : {mean_share:.3f}")
    print(f"answer-phrase present      : {sum(answered)}/{n} = {answer_rate:.1%}")
    return mean_share, answer_rate


def main() -> int:
    asyncio.run(run())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
