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


def cell_stats(per_run: Sequence[int], cases: Any) -> dict[str, Any]:
    """Mean + spread for a STOCHASTIC cell across runs. A 1-run cell collapses to a
    point (min==max==mean). Deterministic cells (retrieval) are never passed here."""
    n = len(per_run)
    if n == 0:
        return {"mean": None, "min": None, "max": None, "runs": 0, "cases": cases}
    return {
        "mean": round(sum(per_run) / n, 2),
        "min": min(per_run),
        "max": max(per_run),
        "runs": n,
        "cases": cases,
    }


def committed_in_band(per_run: Sequence[int], committed_per_run: float) -> dict[str, Any]:
    """Does a committed PER-RUN value fall inside the measured [min, max] band? A
    stochastic number is a sample, not a fact — judge a committed claim against the
    band, not a point."""
    s = cell_stats(per_run, None)
    if s["runs"] == 0:
        return {"in_band": None, **s}
    return {"in_band": bool(s["min"] <= committed_per_run <= s["max"]), **s}


def render_variance_table(arms: Sequence[dict[str, Any]]) -> str:
    """Per-arm table marking DETERMINISTIC (retrieval — zero variance) vs STOCHASTIC
    (synthesis/containment — mean[min-max]/cases over runs), so a reader sees which
    number is a hard fact and which is a sample from a noisy distribution. This is what
    the Phase-D report lacked: it presented N=4 stochastic counts as firmly as the
    deterministic retrieval."""
    lines = [
        "| arm | retrieval hit (DET) | synthesis subst. (STOCH mean[min-max]/cases) "
        "| containment refused (STOCH mean[min-max]/cases) |",
        "|---|---|---|---|",
    ]
    for a in arms:
        cell = " · ".join(f"{k}={v}" for k, v in a["cell"].items())
        r = a.get("retrieval", [])
        hit = round(sum(x["hit"] for x in r) / len(r), 3) if r else "?"
        syn, con = a.get("synthesis", {}), a.get("containment", {})
        ss = cell_stats(syn.get("per_run", []), syn.get("cases", "?"))
        cs = cell_stats(con.get("per_run", []), con.get("cases", "?"))
        lines.append(
            f"| {cell} | {hit} | {ss['mean']}[{ss['min']}-{ss['max']}]/{ss['cases']} "
            f"| {cs['mean']}[{cs['min']}-{cs['max']}]/{cs['cases']} |"
        )
    return "\n".join(lines)
