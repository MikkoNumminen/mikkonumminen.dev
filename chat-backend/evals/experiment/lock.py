"""The methodological lock: build the lock fingerprint fields, and assert the running
stack's EFFECTIVE values honor the config's declared lock before any arm runs.

The config declares the lock (top_k, temperature, the effective num_ctx); the manifest
supplies the prompt-template sha. The runner OBSERVES the live runtime values (the real
num_ctx the model loaded at, the served top-k) and calls `assert_effective` — a
mismatch aborts, because a result recorded under a lock the stack did not actually
honor would lie about the instrument.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .fingerprint import LOCK_KEYS


def lock_fields(
    config_lock: Mapping[str, Any], prompt_template_sha: str
) -> dict[str, Any]:
    """The lock dict for the fingerprint: the config's declared lock (its num_ctx is
    the EFFECTIVE value the runner resolved, not a code default) plus the prompt-
    template sha from the manifest."""
    fields = {
        "top_k": config_lock["top_k"],
        "temperature": config_lock["temperature"],
        "num_ctx": config_lock["num_ctx"],
        "prompt_template_sha": prompt_template_sha,
    }
    return fields


def assert_effective(declared: Mapping[str, Any], observed: Mapping[str, Any]) -> None:
    """Abort if the running stack's observed lock differs from the config's declared
    lock, for every lock key the runner could observe. Called per arm, before it runs,
    so no result is ever recorded under a lock the stack did not honor."""
    drift = {
        k: {"declared": declared.get(k), "observed": observed.get(k)}
        for k in LOCK_KEYS
        if k in observed and declared.get(k) != observed.get(k)
    }
    if drift:
        raise AssertionError(f"LOCK drift — the stack does not honor the config: {drift}")
