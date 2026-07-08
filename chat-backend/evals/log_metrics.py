"""Aggregate the request log's answer-quality fields into rates — zero tokens.

The backend computes `answer_lang` and `invented_years` per answered request
(see request_log.format_log_record); this turns those per-request facts into
the two numbers the 2026-07 live failures made necessary:

  answer_lang_rates : of answered requests, what fraction came out in each
                      language — Poro's mid-answer drift as a rate, not an
                      anecdote (a Finnish-routed question answered in English
                      shows up here).
  invented_year_rate: fraction of answered requests stating at least one year
                      absent from both the retrieved context and the question
                      (the Kasvulabs 2019-2021-vs-2022-2024 class). The
                      log-only precursor to any enforcement decision.

Also tallies routes (gated/answered/small-talk) for context. Pure stdlib —
runnable anywhere the JSONL is readable:

  python -m evals.log_metrics /srv/rag-logs/requests.jsonl [--since ISO8601]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any


def aggregate(lines: list[str], since: str | None = None) -> dict[str, Any]:
    """Metrics over parsed log lines; malformed lines are counted, not fatal."""
    routes: Counter[str] = Counter()
    langs: Counter[str] = Counter()
    invented_requests = 0
    invented_examples: list[dict[str, Any]] = []
    answered = 0
    malformed = 0

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            malformed += 1
            continue
        if since and str(rec.get("ts", "")) < since:
            continue
        route = str(rec.get("route", "unknown"))
        routes[route] += 1
        if route != "answered":
            continue
        answered += 1
        langs[str(rec.get("answer_lang") or "unknown")] += 1
        years = rec.get("invented_years") or []
        if years:
            invented_requests += 1
            if len(invented_examples) < 10:
                invented_examples.append(
                    {"ts": rec.get("ts"), "invented_years": years,
                     "query": rec.get("query")}
                )

    return {
        "requests": sum(routes.values()),
        "routes": dict(routes),
        "answered": answered,
        "answer_lang_rates": {
            lang: round(n / answered, 3) for lang, n in sorted(langs.items())
        }
        if answered
        else {},
        "invented_year_requests": invented_requests,
        "invented_year_rate": round(invented_requests / answered, 3)
        if answered
        else 0.0,
        "invented_examples": invented_examples,
        "malformed_lines": malformed,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m evals.log_metrics")
    ap.add_argument("log_file", help="path to requests.jsonl")
    ap.add_argument(
        "--since",
        default=None,
        help="ISO-8601 timestamp; only records at/after this are counted",
    )
    args = ap.parse_args(argv)
    path = Path(args.log_file)
    if not path.is_file():
        print(f"no such log file: {path}", file=sys.stderr)
        return 1
    lines = path.read_text(encoding="utf-8").splitlines()
    json.dump(aggregate(lines, since=args.since), sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
