"""Assemble a run from per-arm `eval_arm` JSON outputs — the runbook path (the operator
swaps the stack, runs eval_arm per arm, then this). It converts each disk arm into the
same per-cell measurement the in-process runner produces and feeds the SAME shared
`assembly` core (fingerprints, lock guard, pair generation, rendering all live there),
so the two paths cannot drift. Deterministic, zero-token — the generations were
already spent by eval_arm.

The disk arm records AS-EXECUTED identity values (options, runs); the config declares
them. The assembly derives identity from the config only, so this feeder must ASSERT
the two agree — a mismatch means the arm on disk is not the arm the config describes,
and re-stamping it would mislabel the comparison. Abort loudly, like the lock guard.

    python -m evals.experiment.report --config C.toml --manifest M.json --arms a*.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from . import assembly as assembly_mod
from .assembly import Measurement
from .config import ExperimentConfig, load
from .fingerprint import AXIS_KEYS


def _measurement_from_disk(a: dict[str, Any], cfg: ExperimentConfig) -> Measurement:
    fp = a.get("fp_fields", {})
    missing = [k for k in AXIS_KEYS if k not in fp]
    if missing:
        raise ValueError(f"disk arm fp_fields is missing axis values: {missing}")
    # Generic over AXIS_KEYS: a new sweepable axis extends the cell here without a
    # report change, same as the runner's config-driven cells.
    cell = {axis: str(fp[axis]) for axis in AXIS_KEYS}

    # The recorded lock triple must be checked HERE, against fp_fields: the assembly
    # re-derives lock values from the config, and its observed_lock guard skips keys
    # absent from observed_lock — so an arm recorded at a different num_ctx with a
    # truncated observed_lock would otherwise be silently re-stamped as the config's.
    lock_drift = {
        k: {"recorded": fp.get(k), "declared": cfg.lock[k]}
        for k in cfg.lock
        if fp.get(k) != cfg.lock[k]
    }
    if lock_drift:
        raise AssertionError(
            f"LOCK drift — the disk arm recorded lock values differing from the "
            f"config: {lock_drift}. Re-run eval_arm or fix the config."
        )

    disk_runs = int(fp.get("runs", 1) or 1)
    if disk_runs != cfg.runs:
        raise AssertionError(
            f"runs drift — the disk arm executed runs={disk_runs} but the config "
            f"declares runs={cfg.runs}; a re-stamped aggregate would lie about its "
            "scale. Re-run eval_arm or fix the config."
        )
    declared_options = cfg.cell_options(cell)
    disk_options = str(fp.get("options", "") or "")
    if disk_options != declared_options:
        raise AssertionError(
            f"options drift — the disk arm executed options={disk_options!r} but the "
            f"config declares {declared_options!r} for cell {cell}; a re-stamped arm "
            "would hide a run-param change from the guard. Re-run eval_arm or fix "
            "the config."
        )
    # The measured payload is the disk arm itself: observed_lock (asserted by the
    # assembly — MISSING must stay a loud KeyError, a {} default would no-op the lock
    # guard), retrieval, tallies, vram.
    return cell, a


def assemble(
    arm_jsons: list[dict[str, Any]], cfg: ExperimentConfig, manifest: dict[str, Any]
) -> dict[str, Any]:
    measurements = [_measurement_from_disk(a, cfg) for a in arm_jsons]
    return assembly_mod.assemble(cfg, manifest, measurements)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m evals.experiment.report")
    ap.add_argument("--config", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--arms", nargs="+", required=True, help="eval_arm JSON outputs")
    args = ap.parse_args(argv)
    cfg = load(args.config)
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    arm_jsons = [json.loads(Path(p).read_text(encoding="utf-8")) for p in args.arms]
    print(assemble(arm_jsons, cfg, manifest)["results_md"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
