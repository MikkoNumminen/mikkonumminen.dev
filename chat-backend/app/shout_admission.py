"""The shoutbox admission path: gate, then insert, as one shared composition.

Why this is a module rather than a helper inside `main.py`: the fast test suite
runs without the API stack installed (fastapi, fastembed, httpx), and the
concurrency tests must race the REAL production composition rather than a
replica. The audit that prompted the original fix found exactly that failure
mode one layer up, with the handler re-composing the gate by hand while the
red-team suite drove a parallel path. Importing this costs only `shoutbox`,
which is pure stdlib; `Database` appears as a type alone.

It is not in `shoutbox.py` because that module is deliberately I/O-free: pure
verdicts in, pure verdicts out, which is what lets the red-team suite drive it
directly.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from . import shoutbox

if TYPE_CHECKING:
    from .db import Database


async def gate_shout(
    db: Database, raw: str, *, spend_rate: Callable[[], bool]
) -> shoutbox.Refusal | None:
    """The whole admission path for one submission. None means the row landed.

    Every decision here is `shoutbox.evaluate`, the same pure function the
    red-team suite drives, so an attack that suite proves refused is refused on
    THIS path rather than in a hand-rolled composition free to drift from it.
    This function only supplies the facts and sequences the I/O.

    SHAPE FIRST, with nothing else touched until it passes. The first evaluate
    call runs against benign state facts, so any refusal it returns is a shape
    refusal, reached before the rate limiter or the database is consulted. Junk
    must stay free of both: the state phase costs a database transaction and a
    slot of rate budget, and letting an empty submission spend those is the free
    flood the limits exist to prevent. `spend_rate` is a callback for the same
    reason, since only this function knows the moment the shape screen has
    passed, and the limiter records the attempt as it answers.

    The state phase runs INSIDE `db.admit_shout`'s locked transaction: the queue
    facts are read, judged, and acted on before any concurrent submission can
    insert. Reading them out here and inserting afterwards was a race that two
    identical concurrent submissions could both win.
    """
    # `spend_rate` is handed to evaluate rather than called here, because evaluate
    # is what knows the shape screen has passed. Benign queue facts, so the only
    # refusals this call can produce are shape ones and the rate limit — both
    # decided before the database is opened at all.
    screen = shoutbox.evaluate(
        raw, rate_exceeded=spend_rate, pending_total=0, duplicate_exists=False
    )
    if screen.refusal is not None:
        return screen.refusal
    body, digest = screen.body, screen.body_hash
    if body is None or digest is None:
        # evaluate sets both on every accepted verdict, so a None is a bug in the
        # gate rather than a visitor error. Raise rather than assert: asserts
        # vanish under `python -O`, and this is a request path.
        raise RuntimeError("shoutbox gate accepted without a normalised body")

    def decide(pending_total: int, duplicate_exists: bool) -> shoutbox.Refusal | None:
        # Rate is settled above and within budget, so this reports "not
        # exceeded" rather than asking again. Passing `spend_rate` here would
        # charge the same submission a second time.
        return shoutbox.evaluate(
            raw,
            rate_exceeded=lambda: False,
            pending_total=pending_total,
            duplicate_exists=duplicate_exists,
        ).refusal

    return await db.admit_shout(
        body,
        digest,
        window_seconds=shoutbox.DUPLICATE_WINDOW_SECONDS,
        decide=decide,
    )
