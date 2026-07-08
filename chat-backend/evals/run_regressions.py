"""Run the live-regression set END-TO-END through /chat — deployed truth.

The raw-retrieval scoring in eval_arm/run_eval deliberately bypasses the
pipeline (no translate-for-retrieval, no CV route, no templates), which is
exactly where the 2026-07 live failures lived. This runner scores each frozen
regression case against the same surface a visitor hits:

  must_retrieve         : answered (no refusal marker), every expected source
                          cited, every checklist fact present in the answer,
                          AND the answer's language matches the question's.
  must_refuse_offcorpus : the answer contains a refusal marker (gate template
                          or model-level decline, either language).

Token cost: ONE generation per case (12 for the frozen set) — state it before
running. Usage (inside the backend container):

  python -m evals.run_regressions [--eval-set evals/eval_set_live_regressions.json]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.guardrails import answer_language, looks_finnish
from evals.acceptance import _REFUSAL_MARKERS, call_chat


def _refused(text: str) -> bool:
    low = text.lower()
    return any(marker in low for marker in _REFUSAL_MARKERS)


def score_case(
    case: dict[str, Any], answer: str, sources: list[str]
) -> dict[str, Any]:
    """Pure per-case scoring — unit-tested without a backend."""
    expectation = case.get("expectation")
    if expectation == "must_refuse_offcorpus":
        ok = _refused(answer)
        return {"id": case["id"], "ok": ok, "why": "" if ok else "did not refuse"}

    problems: list[str] = []
    if _refused(answer):
        problems.append("refused")
    missing_sources = [e for e in case.get("expected_sources", []) if e not in sources]
    if missing_sources:
        problems.append(f"missing sources {missing_sources}")
    low = answer.lower()
    missing_facts = [f for f in case.get("facts", []) if f.lower() not in low]
    if missing_facts:
        problems.append(f"missing facts {missing_facts}")
    want_fi = looks_finnish(case["question"])
    got_lang = answer_language(answer)
    # only hard-fail on a clear cross: a Finnish question answered in English
    # or vice versa; 'und' (very short) stays informational.
    if want_fi and got_lang == "en":
        problems.append("answered in English to a Finnish question")
    if not want_fi and got_lang == "fi":
        problems.append("answered in Finnish to an English question")
    return {
        "id": case["id"],
        "ok": not problems,
        "why": "; ".join(problems),
        "answer_lang": got_lang,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m evals.run_regressions")
    ap.add_argument("--eval-set", default="evals/eval_set_live_regressions.json")
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--timeout", type=float, default=150.0)
    ap.add_argument("--out", default="", help="optional JSON results path")
    args = ap.parse_args(argv)

    queries = json.loads(Path(args.eval_set).read_text(encoding="utf-8"))["queries"]
    print(f"[regressions] {len(queries)} cases = {len(queries)} generations")
    results = []
    for case in queries:
        r = call_chat(args.base_url, case["question"], args.timeout)
        sources = [str(s.get("source", "")) for s in r.sources]
        row = score_case(case, r.text, sources)
        row["answer"] = r.text[:300]
        results.append(row)
        mark = "PASS" if row["ok"] else "FAIL"
        print(f"{mark} {row['id']}" + (f" - {row['why']}" if row["why"] else ""))

    passed = sum(1 for r in results if r["ok"])
    print(f"[regressions] {passed}/{len(results)} passed")
    if args.out:
        Path(args.out).write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
