"""The multi-arm runner — the ONLY place generations (the token cost) are spent.

For each cell of the config's matrix it: swaps the one resident model/embedder
(re-embedding the corpus, deterministically, if the embedder axis moved), observes
and asserts the effective lock, records VRAM + real token counts, runs retrieval
(zero-token) + the synthesis generations, computes the AS-EXECUTED arm_fingerprint,
and persists the arm by that fingerprint.

THEN it generates the comparable pairs itself (FIX B): it calls
fingerprint.assert_comparable across cells and emits ONLY single-axis pairs (an
embedder delta at fixed model; a model delta at fixed embedder). Diagonal/confounded
pairs are never produced — the guard rejects them here, on the data path, before any
delta is built. delta.py / tables.py render what the runner hands them; they do not
select comparisons.

The swap + per-arm eval are injected via the `Arm` protocol, so the deterministic
orchestration (budget, cell loop, lock-assert, pair generation) is unit-testable
without a GPU. The live implementation is wired for Phase 3's reproduction run.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol

from . import config as config_mod
from . import delta as delta_mod
from . import lock as lock_mod
from . import tables as tables_mod
from .fingerprint import (
    AXIS_KEYS,
    arm_fingerprint,
    assert_comparable,
    instrument_fingerprint,
)


class Arm(Protocol):
    """One executed cell. The runner drives these; a live impl swaps the stack, a fake
    impl returns canned data for tests. All methods are per-cell."""

    def swap(self, cell: dict[str, str]) -> None: ...
    def measure(self, eval_set_path: str) -> dict[str, Any]:
        """One per-arm measurement: {observed_lock, vram_mb, retrieval (rows),
        synthesis (tallies), containment (tallies)}."""
        ...


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


def run(
    cfg: config_mod.ExperimentConfig,
    manifest: dict[str, Any],
    arm: Arm,
    *,
    runs_dir: Path,
    n_questions: int,
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

    cells = cfg.cells()
    budget = cfg.budget(n_questions)
    print(
        f"[runner] {cfg.name}: {len(cells)} arm(s) x {n_questions} questions "
        f"= {budget} generations (the ONLY token cost). sweep={cfg.sweep_axes()}"
    )

    arms: list[dict[str, Any]] = []
    for cell in cells:
        arm.swap(cell)
        m = arm.measure(cfg.eval_set_path)
        # LOCK on the data path: abort before recording if the stack drifted.
        lock_mod.assert_effective(declared_lock, m["observed_lock"])
        fp_fields = {
            **declared_lock,
            "eval_set_sha": eval_sha,
            "runs": cfg.runs,
            **cell,
            "options": cfg.cell_options(cell),
        }
        arms.append(
            {
                "cell": cell,
                "fp_fields": fp_fields,
                "arm_fp": arm_fingerprint(fp_fields),
                "vram_mb": m.get("vram_mb"),
                "retrieval": m["retrieval"],
                "synthesis": m.get("synthesis", {}),
                "containment": m.get("containment", {}),
            }
        )

    instr_fp = instrument_fingerprint({**declared_lock, "eval_set_sha": eval_sha})
    out_dir = runs_dir / cfg.name / instr_fp
    out_dir.mkdir(parents=True, exist_ok=True)

    # FIX B: the runner generates the single-axis comparable pairs (guarded).
    pairs = comparable_pairs(arms, cfg.sweep_axes())
    deltas = []
    for i, j, axis in pairs:
        a_lbl = arms[i]["cell"][axis]
        b_lbl = arms[j]["cell"][axis]
        deltas.append(
            delta_mod.parallel_delta(
                arms[i]["retrieval"],
                arms[j]["retrieval"],
                label_a=a_lbl,
                label_b=b_lbl,
                axis=axis,
            )
        )

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
                "instrument_fingerprint": instr_fp,
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
    results_md = (
        f"# {cfg.name}  (instrument {instr_fp})\n\n"
        + tables_mod.render_arm_table(arms)
        + "\n\n## single-axis deltas\n\n"
        + (tables_mod.render_delta_table(deltas) or "(no comparable pairs)")
        + "\n"
    )
    (out_dir / "results.md").write_text(results_md, encoding="utf-8")
    print(f"[runner] -> {out_dir.as_posix()}  ({len(pairs)} single-axis pair(s))")
    return {"out_dir": str(out_dir), "arms": arms, "pairs": pairs, "deltas": deltas}


# Sweepable-axis sanity: the runner only knows the generic axis names, never a value.
assert set(AXIS_KEYS) >= {"model", "embedder"}
