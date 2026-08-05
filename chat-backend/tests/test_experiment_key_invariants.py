"""Cross-module invariants that used to be runtime asserts.

`runner.py` asserted `set(AXIS_KEYS) >= {"model", "embedder"}` at import, and
`lock.py` recomputed a `missing` list against a dict literal built five lines
above it. Both were flagged as unreachable guards, and both are real invariants
expressed in the wrong place: an `assert` is stripped under `python -O`, so the
check that is supposed to catch a bad edit disappears in exactly the build where
you would least want it gone.

They belong here. The invariant is preserved, it cannot be optimised away, and a
failure names what broke instead of raising an AssertionError with no message.
"""

from __future__ import annotations

import inspect

from evals.experiment import lock
from evals.experiment.fingerprint import ALL_KEYS, AXIS_KEYS, LOCK_KEYS


def test_axis_keys_still_carry_the_two_the_runner_sweeps() -> None:
    """`runner.py` only ever knows generic axis names, never a value, so dropping
    one from `fingerprint.AXIS_KEYS` would silently stop that axis being swept
    rather than fail loudly."""
    assert set(AXIS_KEYS) >= {"model", "embedder"}


def test_lock_fields_builds_every_lock_key() -> None:
    """`lock_fields` constructs its dict by hand. Adding a key to
    `fingerprint.LOCK_KEYS` and forgetting it here would produce a fingerprint
    missing part of the configuration it is supposed to pin, which is how an
    apples-to-oranges comparison passes the lock assert."""
    built = inspect.getsource(lock.lock_fields)
    missing = [key for key in LOCK_KEYS if f'"{key}"' not in built]
    assert not missing, (
        f"lock_fields does not set {missing}, so the fingerprint would not pin "
        "the whole locked configuration"
    )


def test_all_keys_is_the_union_without_duplicates() -> None:
    """A key appearing in two groups would be written twice into the fingerprint
    and compared twice, which reads as agreement it did not earn."""
    assert len(ALL_KEYS) == len(set(ALL_KEYS))
