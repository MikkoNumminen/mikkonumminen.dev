"""Results-table rendering — PRESENTATION ONLY. The comparability guard is NOT here
(it lives in fingerprint.assert_comparable on the runner's data path); tables.py
receives a ready list of single-axis-comparable deltas and renders them. It never
selects what to compare, so it cannot produce a confounded comparison.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any


def render_arm_table(arms: Sequence[dict[str, Any]]) -> str:
    """Per-arm synthesis + containment. Each arm: {cell, arm_fp, synthesis:{substantive,
    total}, containment:{refused,total}, vram_mb}."""
    lines = [
        "| arm | synthesis | containment | VRAM(MB) | arm_fp |",
        "|---|---|---|---|---|",
    ]
    for a in arms:
        cell = " · ".join(f"{k}={v}" for k, v in a["cell"].items())
        syn, con = a.get("synthesis", {}), a.get("containment", {})
        lines.append(
            f"| {cell} | {syn.get('substantive', '?')}/{syn.get('total', '?')} "
            f"| {con.get('refused', '?')}/{con.get('total', '?')} "
            f"| {a.get('vram_mb', '?')} | {str(a.get('arm_fp', ''))[:8]} |"
        )
    return "\n".join(lines)


def render_delta_table(deltas: Sequence[dict[str, Any]]) -> str:
    """The single-axis parallel-deltas (each from delta.parallel_delta)."""
    out = []
    for d in deltas:
        out.append(
            f"### {d['axis']} delta: {d['label_a']} → {d['label_b']}  (n={d['n']})\n"
            f"hit-rate {d['hit_rate_a']} → {d['hit_rate_b']}  |  "
            f"MRR {d['mrr_a']} → {d['mrr_b']}  |  "
            f"mean dist shift {d['mean_dist_delta']:+}  |  "
            f"flips: {', '.join(d['flips']) if d['flips'] else 'none'}"
        )
    return "\n\n".join(out)
