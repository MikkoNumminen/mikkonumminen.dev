"""The single experiment config — the canonical source of the lock params and the
axes. TOML, validated so it cannot lie: every known axis is declared exactly once,
either swept (needs `arms`) or fixed (needs `value`), never both — so "what varies"
is explicit and machine-checked, not an implicit interaction between blocks.

`fingerprint.py` reads the lock from here; the runner reads the axes/cells from here.
Nothing experiment-specific (Finnish, Poro, a model name) lives in this module — it
only knows the axis NAMES (the pipeline's swap points), not their values.
"""

from __future__ import annotations

import itertools
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .fingerprint import AXIS_KEYS


@dataclass(frozen=True)
class ExperimentConfig:
    name: str
    lock: dict[str, Any]  # top_k, temperature, num_ctx — the EFFECTIVE run values
    eval_set_path: str
    axes: dict[str, dict[str, Any]]  # {axis: {"mode": sweep|fixed, "arms"|"value": …}}
    flags: dict[str, Any]
    raw_path: str

    def sweep_axes(self) -> list[str]:
        return [a for a in AXIS_KEYS if self.axes[a]["mode"] == "sweep"]

    def cells(self) -> list[dict[str, str]]:
        """The arm matrix: the cartesian product of each axis's value(s). A fixed axis
        contributes one value; a swept axis contributes each of its arms."""
        per_axis = []
        for a in AXIS_KEYS:
            spec = self.axes[a]
            vals = spec["arms"] if spec["mode"] == "sweep" else [spec["value"]]
            per_axis.append([(a, v) for v in vals])
        return [dict(combo) for combo in itertools.product(*per_axis)]

    def budget(self, n_questions: int) -> int:
        """Generations = questions x arms — the ONLY token cost. Stated before any run."""
        return n_questions * len(self.cells())


def load(path: str | Path) -> ExperimentConfig:
    p = Path(path)
    data = tomllib.loads(p.read_text(encoding="utf-8"))

    lock = data.get("lock", {})
    missing = [k for k in ("top_k", "temperature", "num_ctx") if k not in lock]
    if missing:
        raise ValueError(f"[lock] missing required keys: {missing}")

    # FIX A: every known axis declared exactly once; mode in {sweep, fixed}; not both.
    axes_raw = data.get("axes", {})
    unknown = [a for a in axes_raw if a not in AXIS_KEYS]
    if unknown:
        raise ValueError(f"unknown axes {unknown}; known axes are {list(AXIS_KEYS)}")
    not_declared = [a for a in AXIS_KEYS if a not in axes_raw]
    if not_declared:
        raise ValueError(
            f"every axis must be declared exactly once; missing {not_declared}"
        )
    axes: dict[str, dict[str, Any]] = {}
    for a in AXIS_KEYS:
        spec = axes_raw[a]
        mode = spec.get("mode")
        if mode == "sweep":
            arms = spec.get("arms")
            if "value" in spec:
                raise ValueError(f"[axes.{a}] is sweep — it must not also set `value`")
            if not isinstance(arms, list) or not arms:
                raise ValueError(f"[axes.{a}] mode=sweep needs a non-empty `arms` list")
            axes[a] = {"mode": "sweep", "arms": [str(x) for x in arms]}
        elif mode == "fixed":
            if "arms" in spec:
                raise ValueError(f"[axes.{a}] is fixed — it must not also set `arms`")
            if "value" not in spec:
                raise ValueError(f"[axes.{a}] mode=fixed needs a `value`")
            axes[a] = {"mode": "fixed", "value": str(spec["value"])}
        else:
            raise ValueError(f"[axes.{a}] mode must be 'sweep' or 'fixed', got {mode!r}")

    eval_set = data.get("eval_set", {}).get("path")
    if not eval_set:
        raise ValueError("[eval_set] path is required")

    return ExperimentConfig(
        name=str(data.get("name") or p.stem),
        lock={
            "top_k": int(lock["top_k"]),
            "temperature": float(lock["temperature"]),
            "num_ctx": int(lock["num_ctx"]),
        },
        eval_set_path=str(eval_set),
        axes=axes,
        flags=dict(data.get("flags", {})),
        raw_path=str(p),
    )
