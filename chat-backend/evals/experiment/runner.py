"""The multi-arm runner — the ONLY place generations (the token cost) are spent.

For each cell of the config's matrix it: swaps the one resident model/embedder
(re-embedding the corpus, deterministically, if the embedder axis moved), observes
and asserts the effective lock, records VRAM + real token counts, runs retrieval
(zero-token) + the synthesis generations — then hands the measurements to the shared
`assembly` core, which computes the AS-EXECUTED fingerprints, generates ONLY the
guarded single-axis comparable pairs (FIX B: a confounded/diagonal pair can never be
produced — the guard rejects it on the data path, before any delta is built), and
renders the results. delta.py / tables.py render what the assembly hands them; they
do not select comparisons.

The runbook path (`report.assemble`, fed from disk eval_arm JSON) feeds the SAME
assembly core, so the two paths cannot drift.

The swap + per-arm eval are injected via the `Arm` protocol, so the deterministic
orchestration (budget, cell loop, lock-assert) is unit-testable without a GPU. The
live implementation is wired for Phase 3's reproduction run.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol

from . import assembly as assembly_mod
from . import config as config_mod
from . import lock as lock_mod
from .assembly import Measurement, comparable_pairs

__all__ = ["Arm", "comparable_pairs", "run"]


class Arm(Protocol):
    """One executed cell. The runner drives these; a live impl swaps the stack, a fake
    impl returns canned data for tests. All methods are per-cell."""

    def swap(self, cell: dict[str, str]) -> None: ...
    def measure(self, eval_set_path: str) -> dict[str, Any]:
        """One per-arm measurement: {observed_lock, vram_mb, retrieval (rows),
        synthesis (tallies), containment (tallies)}."""
        ...


def run(
    cfg: config_mod.ExperimentConfig,
    manifest: dict[str, Any],
    arm: Arm,
    *,
    runs_dir: Path,
    n_questions: int,
) -> dict[str, Any]:
    prompt_sha, eval_sha = assembly_mod.manifest_shas(manifest, cfg.eval_set_path)
    declared_lock = lock_mod.lock_fields(cfg.lock, prompt_sha)

    cells = cfg.cells()
    budget = cfg.budget(n_questions)
    print(
        f"[runner] {cfg.name}: {len(cells)} arm(s) x {n_questions} questions "
        f"= {budget} generations (the ONLY token cost). sweep={cfg.sweep_axes()}"
    )

    measurements: list[Measurement] = []
    for cell in cells:
        arm.swap(cell)
        m = arm.measure(cfg.eval_set_path)
        # LOCK fail-fast on the live path: a drifted stack must abort BEFORE the next
        # arm's generations are spent, not after the whole matrix has run. The shared
        # assembly re-asserts the same guard when it builds the arms.
        lock_mod.assert_effective(declared_lock, m["observed_lock"])
        measurements.append((cell, m))

    assembled = assembly_mod.assemble(cfg, manifest, measurements)
    arms = assembled["arms"]
    pairs = assembled["pairs"]

    out_dir = runs_dir / cfg.name / assembled["instrument_fingerprint"]
    out_dir.mkdir(parents=True, exist_ok=True)

    # persist each arm by its arm_fingerprint (so cells differing on any axis can't
    # overwrite), plus the resolved config + budget + the rendered tables.
    for a in arms:
        (out_dir / f"arm-{a['arm_fp']}.json").write_text(
            json.dumps(a, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    (out_dir / "run-config.json").write_text(
        json.dumps(
            {
                "name": cfg.name,
                "instrument_fingerprint": assembled["instrument_fingerprint"],
                "eval_set": cfg.eval_set_path,
                "eval_set_sha": eval_sha,
                "lock": declared_lock,
                "axes": cfg.axes,
                "flags": cfg.flags,
                "n_questions": n_questions,
                "n_arms": len(cells),
                "generation_budget": budget,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (out_dir / "results.md").write_text(assembled["results_md"], encoding="utf-8")
    print(f"[runner] -> {out_dir.as_posix()}  ({len(pairs)} single-axis pair(s))")
    return {
        "out_dir": str(out_dir),
        "arms": arms,
        "pairs": pairs,
        "deltas": assembled["deltas"],
    }


