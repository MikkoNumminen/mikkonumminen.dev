"""Instrument fingerprint + the non-bypassable comparability guard.

THREE classes of fingerprint field, each handled differently by `assert_comparable`:

  LOCK params  — top_k, temperature, num_ctx, prompt_template_sha. Must ALWAYS match
                 across any two compared arms; differ => the methodological lock is
                 broken => not comparable at all (abort).
  SWEEPABLE axes — model, embedder. The things an experiment varies. Two arms may
                 differ on EXACTLY ONE declared sweep axis (every other axis matching)
                 => a comparable single-axis delta (A<->B on embedder; the 3-model run
                 on model).
  INSTRUMENT-defining — eval_set_sha. Differs => a DIFFERENT measuring apparatus =>
                 its numbers go in a SEPARATE block and are NEVER numerically compared
                 against another instrument's (A/B on the Finnish-parallel set vs C/D
                 on the native set).

Two derived ids:
  instrument_fingerprint = hash(LOCK + INSTRUMENT)            — groups all arms of one
      sweep; names runs/<exp>/<instrument-fp>/, so different instruments can't collide.
  arm_fingerprint        = hash(LOCK + INSTRUMENT + SWEEPABLE) — the full identity of
      one executed arm; stamps that arm's result artifact, so two arms differing only
      on the embedder (A/B) get distinct files instead of overwriting each other.

The values fed here are the AS-EXECUTED runtime values, which the runner finalizes
from the effective environment (the real num_ctx from OLLAMA_CONTEXT_LENGTH, the
chosen model/embedder/eval-set) — NOT static code defaults. `inspect`'s static lock
fingerprint is provenance only; it never stamps a result. This module is the single
source for both the values' identity and the guard, so config and guard can't drift.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any

# LOCK: must always match across compared arms (the methodological lock).
LOCK_KEYS = ("top_k", "temperature", "num_ctx", "prompt_template_sha")
# SWEEPABLE: the experiment's variables; <=1 may differ for a comparable delta.
AXIS_KEYS = ("model", "embedder")
# INSTRUMENT-defining: differs => a different apparatus => a separate block.
INSTRUMENT_KEYS = ("eval_set_sha",)
ALL_KEYS = (*LOCK_KEYS, *INSTRUMENT_KEYS, *AXIS_KEYS)


def _require(fp: Mapping[str, Any], keys: tuple[str, ...]) -> None:
    missing = [k for k in keys if k not in fp]
    if missing:
        raise ValueError(f"fingerprint is missing required keys: {missing}")


def _hash(fp: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    canonical = {k: fp[k] for k in sorted(keys)}
    blob = json.dumps(canonical, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def lock_fingerprint(fp: Mapping[str, Any]) -> str:
    """Hash of the LOCK params only. `inspect` emits this from code defaults as
    static provenance; it is never used to stamp a result artifact."""
    _require(fp, LOCK_KEYS)
    return _hash(fp, LOCK_KEYS)


def instrument_fingerprint(fp: Mapping[str, Any]) -> str:
    """The instrument identity (lock + eval set; axes excluded). Shared across a
    sweep; differs between instruments. Names runs/<exp>/<instrument-fp>/."""
    _require(fp, LOCK_KEYS + INSTRUMENT_KEYS)
    return _hash(fp, LOCK_KEYS + INSTRUMENT_KEYS)


def arm_fingerprint(fp: Mapping[str, Any]) -> str:
    """The full identity of one executed arm (lock + eval set + axes). Stamps the
    arm's result artifact so arms differing on any axis never collide."""
    _require(fp, ALL_KEYS)
    return _hash(fp, ALL_KEYS)


def assert_comparable(a: Mapping[str, Any], b: Mapping[str, Any], axis: str) -> None:
    """Abort unless arms `a` and `b` form a valid single-axis delta on `axis`. The
    runner MUST call this on the DATA path, before any delta/result is written:

    - LOCK params must match, else a lock violation (not comparable at all);
    - eval_set_sha must match, else a DIFFERENT instrument (a separate block, never a
      numeric delta);
    - the declared `axis` may differ; every OTHER sweepable axis must match, else more
      than one axis varies (the delta would be confounded).
    """
    if axis not in AXIS_KEYS:
        raise ValueError(f"axis must be one of {AXIS_KEYS}, got {axis!r}")
    _require(a, ALL_KEYS)
    _require(b, ALL_KEYS)
    lock_diff = {k: [a[k], b[k]] for k in LOCK_KEYS if a[k] != b[k]}
    if lock_diff:
        raise AssertionError(f"LOCK violation — not comparable at all: {lock_diff}")
    if a["eval_set_sha"] != b["eval_set_sha"]:
        raise AssertionError(
            "DIFFERENT instrument (eval_set_sha differs) — a separate block, never a "
            f"numeric delta: {a['eval_set_sha']} vs {b['eval_set_sha']}"
        )
    confound = {
        k: [a[k], b[k]] for k in AXIS_KEYS if k != axis and a[k] != b[k]
    }
    if confound:
        raise AssertionError(
            f"more than the declared axis '{axis}' varies (confounded): {confound}"
        )
    # a[axis] may differ — that IS the single-axis delta. Comparable.
