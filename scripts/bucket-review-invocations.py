#!/usr/bin/env python3
"""
Walk the local Claude Code JSONLs, find every /review-attributed assistant
chain, resolve each chain to its originating user message via parentUuid,
extract the PR number from EITHER the user message text (`PR number: <N>`)
OR the subsequent `gh pr view N` / `gh pr diff N` tool call, then bucket
the invocations by line count (queried once per unique PR via gh CLI).

Outputs the distribution table that drives BUCKET_WEIGHTS in
scripts/build-review-stats.mjs. Re-run this script whenever the
production /review usage pattern shifts meaningfully (new long-running
workflow, much-larger-PRs phase, etc.) and update the constants in
build-review-stats.mjs to match.

Usage:  python scripts/bucket-review-invocations.py
        python scripts/bucket-review-invocations.py --window-days 30

The script reads ~/.claude/projects/ on the local machine — no remote
API calls except `gh pr view` lookups for PR sizes (cached at
.cache/pr-size-cache.json so re-runs are fast).
"""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / ".cache"
CACHE_DIR.mkdir(exist_ok=True)
PR_SIZE_CACHE_PATH = CACHE_DIR / "pr-size-cache.json"

HOME = Path.home()
PROJECTS = HOME / ".claude" / "projects"
REPO = "MikkoNumminen/mikkonumminen.dev"

PR_NUM_RE = re.compile(r"PR\s*number:\s*(\d+)")
GH_PR_RE = re.compile(r"gh pr (?:view|diff|review|checks)\s+(\d+)")


def walk_jsonls(root):
    if not root.exists():
        return
    for proj in root.iterdir():
        if not proj.is_dir():
            continue
        for f in proj.iterdir():
            if f.is_file() and f.suffix == ".jsonl":
                yield f
        for d in proj.iterdir():
            sub = d / "subagents"
            if sub.is_dir():
                for sf in sub.iterdir():
                    if sf.suffix == ".jsonl":
                        yield sf


def flatten_content(content):
    """Flatten message content (string or list of blocks) to plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict):
                if c.get("type") == "text":
                    parts.append(c.get("text", ""))
                elif c.get("type") == "tool_use":
                    inp = c.get("input", {})
                    cmd = inp.get("command", "")
                    if cmd:
                        parts.append(cmd)
                elif c.get("type") == "tool_result":
                    parts.append(str(c.get("content", "")))
            elif isinstance(c, str):
                parts.append(c)
        return "\n".join(parts)
    return ""


def extract_pr_from_text(text):
    if not text:
        return None
    m = PR_NUM_RE.search(text)
    if m:
        return int(m.group(1))
    m = GH_PR_RE.search(text)
    if m:
        return int(m.group(1))
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--window-days", type=int, default=90)
    args = parser.parse_args()
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.window_days)

    # ---- Scan JSONLs ----
    per_invocation = {}  # (sessionId, promptId) -> dict

    for f in walk_jsonls(PROJECTS):
        try:
            with f.open("r", encoding="utf-8", errors="ignore") as h:
                lines = h.readlines()
        except OSError:
            continue
        msgs = []
        by_uuid = {}
        for line in lines:
            try:
                o = json.loads(line.strip())
            except json.JSONDecodeError:
                continue
            if o.get("uuid"):
                by_uuid[o["uuid"]] = o
            msgs.append(o)

        seen_req = set()

        for o in msgs:
            if o.get("type") != "assistant":
                continue
            if o.get("attributionSkill") != "review":
                continue
            sid = o.get("sessionId")
            rid = o.get("requestId")
            if not sid or not rid:
                continue
            if (sid, rid) in seen_req:
                continue
            seen_req.add((sid, rid))

            t = o.get("timestamp", "")
            try:
                ts = datetime.fromisoformat(t.replace("Z", "+00:00"))
            except ValueError:
                continue
            if ts < cutoff:
                continue

            # Walk parent chain for invocation id + user message text.
            invocation_id = None
            user_text = ""
            node = o
            depth = 0
            while node and depth < 200:
                pu = node.get("parentUuid")
                if not pu:
                    break
                parent = by_uuid.get(pu)
                if not parent:
                    break
                if parent.get("type") == "user" and parent.get("promptId"):
                    invocation_id = parent["promptId"]
                    user_text = flatten_content(
                        parent.get("message", {}).get("content", "")
                    )
                    break
                node = parent
                depth += 1

            if not invocation_id:
                invocation_id = f"fallback-{sid}-{rid}"

            key = (sid, invocation_id)
            usage = (o.get("message", {}) or {}).get("usage", {}) or {}
            cost = (
                (usage.get("input_tokens", 0) or 0)
                + (usage.get("output_tokens", 0) or 0)
                + (usage.get("cache_creation_input_tokens", 0) or 0)
            )

            if key not in per_invocation:
                per_invocation[key] = {
                    "tokens": 0,
                    "session": sid,
                    "first_ts": ts,
                    "last_ts": ts,
                    "user_text": user_text,
                    "tool_text": [],
                    "pr_from_user": extract_pr_from_text(user_text),
                }
            bucket = per_invocation[key]
            bucket["tokens"] += cost
            if ts < bucket["first_ts"]:
                bucket["first_ts"] = ts
            if ts > bucket["last_ts"]:
                bucket["last_ts"] = ts
            msg_content = (o.get("message", {}) or {}).get("content", [])
            bucket["tool_text"].append(flatten_content(msg_content))

    # Resolve PR number per invocation: user-message first, then earliest gh pr view.
    for inv in per_invocation.values():
        pr = inv["pr_from_user"]
        if pr is None:
            combined = "\n".join(inv["tool_text"])
            pr = extract_pr_from_text(combined)
        inv["pr_number"] = pr

    print(f"Total /review invocations: {len(per_invocation)}")
    with_pr = [i for i in per_invocation.values() if i["pr_number"]]
    without_pr = [i for i in per_invocation.values() if not i["pr_number"]]
    print(f"  with PR number (user msg + tool calls): {len(with_pr)}")
    print(f"  no PR number at all:                    {len(without_pr)}")

    # ---- PR size lookup (cached) ----
    if PR_SIZE_CACHE_PATH.exists():
        with PR_SIZE_CACHE_PATH.open("r", encoding="utf-8") as h:
            cache = json.load(h)
    else:
        cache = {}

    unique_prs = sorted({inv["pr_number"] for inv in with_pr})
    new_prs = [pr for pr in unique_prs if str(pr) not in cache]
    print(
        f"\nUnique PR numbers seen: {len(unique_prs)} ({len(new_prs)} new to look up)"
    )

    for pr in new_prs:
        try:
            out = subprocess.check_output(
                [
                    "gh", "pr", "view", str(pr), "--repo", REPO,
                    "--json", "additions,deletions,changedFiles,title,state",
                ],
                stderr=subprocess.STDOUT,
                text=True,
                timeout=30,
            )
            data = json.loads(out)
            cache[str(pr)] = {
                "lines": (data.get("additions") or 0) + (data.get("deletions") or 0),
                "additions": data.get("additions") or 0,
                "deletions": data.get("deletions") or 0,
                "files": data.get("changedFiles") or 0,
                "title": data.get("title") or "",
                "state": data.get("state") or "",
            }
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError):
            cache[str(pr)] = None  # PR doesn't exist or gh failed

    with PR_SIZE_CACHE_PATH.open("w", encoding="utf-8") as h:
        json.dump(cache, h, indent=2)

    # ---- Bucket ----
    bucket_defs = [
        ("small",  0,    200),
        ("med",    200,  800),
        ("large",  800,  2500),
        ("xlarge", 2500, 10**9),
    ]

    def bucket_for(lines):
        for name, lo, hi in bucket_defs:
            if lo <= lines < hi:
                return name
        return "unknown"

    bucket_invs = defaultdict(list)
    unmapped = 0
    for inv in with_pr:
        pr_info = cache.get(str(inv["pr_number"]))
        if not pr_info:
            unmapped += 1
            continue
        lines = pr_info["lines"]
        b = bucket_for(lines)
        bucket_invs[b].append((inv["pr_number"], inv["tokens"], lines))

    print(f"\nPR-lookup failures: {unmapped}")
    print(f"Invocations with no PR identified at all: {len(without_pr)}")

    print("\n=== BUCKET DISTRIBUTION (mapped invocations) ===")
    total_mapped = sum(len(v) for v in bucket_invs.values())
    for name, lo, hi in bucket_defs:
        invs = bucket_invs.get(name, [])
        if not invs:
            continue
        tokens = [t for _, t, _ in invs]
        unique_prs_in_bucket = sorted({pr for pr, _, _ in invs})
        line_counts_in_bucket = sorted({lin for _, _, lin in invs})
        pct = 100.0 * len(invs) / total_mapped if total_mapped else 0
        pct_of_total = 100.0 * len(invs) / len(per_invocation)
        hi_label = "∞" if hi >= 10**9 else str(hi - 1)
        print(
            f"\n{name:8s} ({lo}-{hi_label} lines): {len(invs)} invocations "
            f"({pct:.0f}% of mapped, {pct_of_total:.0f}% of all {len(per_invocation)})"
        )
        print(
            f"  unique PRs ({len(unique_prs_in_bucket)}): {unique_prs_in_bucket}"
        )
        print(
            f"  line counts: {line_counts_in_bucket[:30]}"
            f"{'...' if len(line_counts_in_bucket) > 30 else ''}"
        )
        tokens_sorted = sorted(tokens)
        print(
            f"  cost: min={tokens_sorted[0]:,}  "
            f"median={tokens_sorted[len(tokens_sorted) // 2]:,}  "
            f"max={tokens_sorted[-1]:,}  sum={sum(tokens):,}"
        )

    # Suggest candidate PRs per bucket — pick the most-frequently-reviewed
    # ones first since they best represent production usage.
    print("\n=== A/B PR CANDIDATES per bucket ===")
    for name, _, _ in bucket_defs:
        invs = bucket_invs.get(name, [])
        if not invs:
            continue
        pr_freq = defaultdict(int)
        for pr, _, _ in invs:
            pr_freq[pr] += 1
        top = sorted(pr_freq.items(), key=lambda kv: (-kv[1], kv[0]))
        print(f"  {name}: candidates (PR, times-reviewed) = {top[:5]}")


if __name__ == "__main__":
    main()
