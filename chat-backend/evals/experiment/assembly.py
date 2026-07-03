"""The single assembly core behind both ways a run becomes results: `runner.run`
(automated, live Arm) and `report.assemble` (runbook, from disk eval_arm JSON) are
feeders that hand per-cell measurements to `assemble` here. Everything identity-
bearing — the fingerprint fields, the lock guard, the pair generation, the rendered
results — is computed in exactly one place, so the two paths cannot drift apart:
a divergence would have to be introduced in this module, where it is visible to
both, not in one path while the other silently keeps the old behavior.

Identity comes from the config + manifest, never from a measurement: a feeder
cannot stamp an arm with an `options`/`runs`/lock value the config does not
declare. Feeders that read executed values from disk must ASSERT agreement with
the config (loudly, like the lock guard) before handing the measurement in.
"""

from __future__ import annotations

from typing import Any

from . import config as config_mod
from . import delta as delta_mod
from . import lock as lock_mod
from . import tables as tables_mod
from .fingerprint import arm_fingerprint, assert_comparable, instrument_fingerprint

# One per-cell measurement: the cell (axis values) + the measured payload
# {observed_lock, vram_mb, retrieval, synthesis, containment}.
Measurement = tuple[dict[str, str], dict[str, Any]]


def manifest_shas(
    manifest: dict[str, Any], eval_set_path: str
) -> tuple[str, str | None]:
    """The two manifest-sourced identity inputs: the prompt-template sha (a lock
    param) and the eval-set content sha (instrument-defining). The manifest is the
    source of truth for both — a disk arm's own recorded sha never overrides it."""
    prompt_sha: str = manifest["instrument"]["static_lock_params"][
        "prompt_template_sha"
    ]["value"]
    eval_sha = next(
        (
            e["content_sha"]
            for e in manifest["eval_sets"]
            if e["path"] == eval_set_path
        ),
        None,
    )
    return prompt_sha, eval_sha


def instrument_fp_for(
    cfg: config_mod.ExperimentConfig, prompt_sha: str, eval_sha: str | None
) -> str:
    """The instrument fingerprint (lock + eval set + runs; axes excluded) built from
    the config + manifest — the ONE construction, so the automated and runbook paths
    cannot hash different views of the same instrument."""
    declared_lock = lock_mod.lock_fields(cfg.lock, prompt_sha)
    return instrument_fingerprint(
        {**declared_lock, "eval_set_sha": eval_sha, "runs": cfg.runs}
    )


def comparable_pairs(
    arms: list[dict[str, Any]], sweep_axes: list[str]
) -> list[tuple[int, int, str]]:
    """Every (i, j, axis) such that arms i and j form a valid single-axis delta on
    `axis`. The guard does the selecting: a pair differing on >1 axis raises on every
    axis (excluded); a pair differing on exactly one swept axis passes for that axis
    only. Confounded/diagonal pairs can never appear in the output."""
    pairs = []
    for i in range(len(arms)):
        for j in range(i + 1, len(arms)):
            for axis in sweep_axes:
                try:
                    assert_comparable(arms[i]["fp_fields"], arms[j]["fp_fields"], axis)
                    pairs.append((i, j, axis))
                except AssertionError:
                    continue
    return pairs


def build_arm(
    cfg: config_mod.ExperimentConfig,
    declared_lock: dict[str, Any],
    eval_sha: str | None,
    cell: dict[str, str],
    m: dict[str, Any],
) -> dict[str, Any]:
    """One assembled arm from one per-cell measurement. The fingerprint fields are
    derived from the config + manifest (lock, eval set, runs, per-cell options) plus
    the cell — never copied from the measurement — so an arm's identity always means
    what the config declares."""
    lock_mod.assert_effective(declared_lock, m["observed_lock"])
    fp_fields = {
        **declared_lock,
        "eval_set_sha": eval_sha,
        "runs": cfg.runs,
        **cell,
        "options": cfg.cell_options(cell),
    }
    return {
        "cell": cell,
        "fp_fields": fp_fields,
        "arm_fp": arm_fingerprint(fp_fields),
        "vram_mb": m.get("vram_mb"),
        "retrieval": m["retrieval"],
        "synthesis": m.get("synthesis", {}),
        "containment": m.get("containment", {}),
    }


def assemble(
    cfg: config_mod.ExperimentConfig,
    manifest: dict[str, Any],
    measurements: list[Measurement],
) -> dict[str, Any]:
    """The shared run assembly: per-cell measurements in; arms, guarded single-axis
    pairs, deltas, the instrument fingerprint and the rendered results.md out."""
    prompt_sha, eval_sha = manifest_shas(manifest, cfg.eval_set_path)
    declared_lock = lock_mod.lock_fields(cfg.lock, prompt_sha)
    arms = [
        build_arm(cfg, declared_lock, eval_sha, cell, m) for cell, m in measurements
    ]
    pairs = comparable_pairs(arms, cfg.sweep_axes())
    deltas = [
        delta_mod.parallel_delta(
            arms[i]["retrieval"],
            arms[j]["retrieval"],
            label_a=arms[i]["cell"][axis],
            label_b=arms[j]["cell"][axis],
            axis=axis,
        )
        for i, j, axis in pairs
    ]
    instr_fp = instrument_fp_for(cfg, prompt_sha, eval_sha)
    return {
        "arms": arms,
        "pairs": pairs,
        "deltas": deltas,
        "instrument_fingerprint": instr_fp,
        "results_md": tables_mod.render_results_md(
            cfg.name, instr_fp, cfg.runs, arms, deltas
        ),
    }
