"""Assemble a run from per-arm `eval_arm` JSON outputs — the runbook path (the operator
swaps the stack, runs eval_arm per arm, then this). It merges the prompt-template sha
from the manifest into each arm's fingerprint fields, computes each arm_fingerprint,
asks the runner to generate the single-axis comparable pairs (the guard, on the data
path), and renders the tables. Deterministic, zero-token — the generations were already
spent by eval_arm. Same assembly the in-process runner uses, fed from disk instead of a
live Arm.

    python -m evals.experiment.report --config C.toml --manifest M.json --arms a*.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from . import delta as delta_mod
from . import lock as lock_mod
from . import tables as tables_mod
from .config import ExperimentConfig, load
from .fingerprint import arm_fingerprint, instrument_fingerprint
from .runner import comparable_pairs


def assemble(
    arm_jsons: list[dict[str, Any]], cfg: ExperimentConfig, manifest: dict[str, Any]
) -> dict[str, Any]:
    prompt_sha = manifest["instrument"]["static_lock_params"]["prompt_template_sha"][
        "value"
    ]
    eval_sha = next(
        (
            e["content_sha"]
            for e in manifest["eval_sets"]
            if e["path"] == cfg.eval_set_path
        ),
        None,
    )
    declared_lock = lock_mod.lock_fields(cfg.lock, prompt_sha)
    arms = []
    for a in arm_jsons:
        # The same lock guard the in-process runner applies on its data path: a
        # runbook arm whose eval_arm ran at a num_ctx (etc.) differing from the
        # config must abort here, not be silently stamped as comparable.
        lock_mod.assert_effective(declared_lock, a.get("observed_lock", {}))
        fp = {
            **a["fp_fields"],
            "prompt_template_sha": prompt_sha,
            "eval_set_sha": eval_sha,
        }
        arms.append(
            {
                "cell": {"model": fp["model"], "embedder": fp["embedder"]},
                "fp_fields": fp,
                "arm_fp": arm_fingerprint(fp),
                "vram_mb": a.get("vram_mb"),
                "retrieval": a["retrieval"],
                "synthesis": a.get("synthesis", {}),
                "containment": a.get("containment", {}),
            }
        )
    pairs = comparable_pairs(arms, cfg.sweep_axes())
    deltas = [
        delta_mod.parallel_delta(
            arms[i]["retrieval"],
            arms[j]["retrieval"],
            label_a=arms[i]["cell"][ax],
            label_b=arms[j]["cell"][ax],
            axis=ax,
        )
        for i, j, ax in pairs
    ]
    instr_fp = instrument_fingerprint(
        {**cfg.lock, "prompt_template_sha": prompt_sha, "eval_set_sha": eval_sha}
    )
    md = (
        f"# {cfg.name}  (instrument {instr_fp})\n\n"
        + tables_mod.render_arm_table(arms)
        + "\n\n## single-axis deltas\n\n"
        + (tables_mod.render_delta_table(deltas) or "(no comparable pairs)")
        + "\n"
    )
    return {
        "arms": arms,
        "pairs": pairs,
        "deltas": deltas,
        "instrument_fingerprint": instr_fp,
        "results_md": md,
    }


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
