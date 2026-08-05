"""The duplicate gate and the queue cap under CONCURRENT submissions.

The original handler read the queue facts (pending count, duplicate-in-window)
and inserted afterwards with nothing serialising the two, so two identical
submissions arriving together could both see "no duplicate" and both land, and
two distinct ones could both see pending below the cap at the brim and overshoot
it. `shout_admission.gate_shout` moves the facts, the judgement and the insert
into one transaction that first takes the shoutbox advisory lock.

That fix shipped with NO regression test. It was verified by a probe run by hand
against live Postgres, which proved it worked once and protects nothing
afterwards: swapping the advisory lock for something that merely looks
equivalent would not fail anything. This closes that.

These drive `gate_shout`, the composition the endpoint itself calls, rather than
the database method underneath it. That is deliberate, and it is the same lesson
the audit taught one layer up: a test that races a hand-assembled replica of the
production path can stay green while the production path drifts.

HONEST SCOPE. No Postgres runs in the fast suite, so the race is exercised
against a fake pool that emulates exactly the two semantics the fix depends on:

  * `pg_advisory_xact_lock` blocks until the holding TRANSACTION ends, not until
    the statement returns
  * reads observe only committed rows

The fake FORCES the racy interleaving rather than hoping the scheduler finds it:
every fact read yields to the event loop before answering, so without the lock
both tasks deterministically read a world missing the other's row. Remove the
lock from `db.admit_shout` and these tests go red every time, not flakily.

An in-memory emulation is weaker evidence than a real database. What it proves is
that the composition serialises check-then-insert, which is the property the audit
found missing. It cannot prove Postgres honours the lock; that is what the manual
probe against live Postgres showed, and its numbers are in PR #516.

The design of this fake comes from an implementation agent whose run died on a
session limit before it opened a PR. The work was found in an abandoned worktree
during cleanup and is better than what shipped, so it is salvaged here rather
than discarded.
"""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from types import TracebackType
from typing import Any

import pytest

# app.db imports the driver at module load; a machine without it skips locally.
# CI installs the full stack via `pip install -e ".[dev]"`, so a skip is never a
# CI outcome.
pytest.importorskip("asyncpg")
pytest.importorskip("pgvector")

from app import shout_admission  # noqa: E402
from app.db import Database  # noqa: E402
from app.shoutbox import QUEUE_MAX_PENDING, Refusal  # noqa: E402


class FakePool:
    """Just enough asyncpg to host admit_shout: committed rows + a lock."""

    def __init__(self, committed: int = 0) -> None:
        # Every committed row counts as pending AND inside the duplicate window,
        # which is the worst case for both races at once.
        self.rows: list[str] = [f"filler-{i}" for i in range(committed)]
        self.advisory_lock = asyncio.Lock()

    def acquire(self) -> _FakeAcquire:
        return _FakeAcquire(self)


class _FakeAcquire:
    def __init__(self, pool: FakePool) -> None:
        self._pool = pool

    async def __aenter__(self) -> _FakeConnection:
        return _FakeConnection(self._pool)

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> bool:
        return False


class _FakeConnection:
    def __init__(self, pool: FakePool) -> None:
        self._pool = pool
        self._txn_rows: list[str] = []
        self._holds_lock = False

    def transaction(self) -> _FakeTransaction:
        return _FakeTransaction(self)

    async def execute(self, sql: str, *args: object) -> str:
        if "pg_advisory_xact_lock" in sql:
            # Real semantics: blocks until granted, released at transaction end.
            await self._pool.advisory_lock.acquire()
            self._holds_lock = True
            return "SELECT 1"
        if "INSERT INTO shout_queue" in sql:
            self._txn_rows.append(str(args[1]))  # ($1 body, $2 body_hash)
            return "INSERT 0 1"
        raise AssertionError(f"unexpected execute: {sql}")

    async def fetchval(self, sql: str, *args: object) -> object:
        # SNAPSHOT FIRST, then yield. Under READ COMMITTED a statement sees the
        # world as of the moment it began, so answering from state observed after
        # the await would model a read that cannot happen — and it silently
        # rescues the cap race, because the second task would see the first one's
        # committed row without any lock forcing it to wait.
        if "EXISTS" in sql:
            target = args[0]
            answer: object = target in self._pool.rows or target in self._txn_rows
        elif "count(*)" in sql:
            answer = len(self._pool.rows) + len(self._txn_rows)
        else:
            raise AssertionError(f"unexpected fetchval: {sql}")
        # Force the interleaving the race needs: yield so the OTHER task reaches
        # its own reads before this one inserts. With the lock held that is
        # harmless, because the other task is parked acquiring it.
        await asyncio.sleep(0)
        return answer


class _FakeTransaction:
    def __init__(self, conn: _FakeConnection) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeTransaction:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> bool:
        if exc_type is None:
            self._conn._pool.rows.extend(self._conn._txn_rows)
        self._conn._txn_rows.clear()
        if self._conn._holds_lock:
            self._conn._pool.advisory_lock.release()
            self._conn._holds_lock = False
        return False


def _submit(db: Database, body: str) -> Coroutine[Any, Any, Refusal | None]:
    # Rate budget is never the thing under test here, so the limiter always says
    # there is room; one that refused would mask the races below.
    return shout_admission.gate_shout(db, body, spend_rate=lambda: False)


async def _race(pool: FakePool, first: str, second: str) -> list[Refusal | None]:
    db = Database(pool)  # type: ignore[arg-type]
    return list(await asyncio.gather(_submit(db, first), _submit(db, second)))


def test_concurrent_identical_submissions_land_exactly_once() -> None:
    """The high finding: two identical posts arriving together both passed the
    duplicate gate and both inserted."""
    pool = FakePool()
    results = asyncio.run(_race(pool, "same text", "same text"))

    assert results.count(None) == 1, f"expected exactly one insert, got {results}"
    assert Refusal.DUPLICATE in results
    assert len(pool.rows) == 1, "the duplicate reached the queue"


def test_concurrent_distinct_submissions_cannot_overshoot_the_cap() -> None:
    """The medium finding riding the same window: at the brim, two distinct
    submissions both saw pending < cap before either insert landed."""
    pool = FakePool(committed=QUEUE_MAX_PENDING - 1)  # one slot left
    results = asyncio.run(_race(pool, "first", "second"))

    assert len(pool.rows) == QUEUE_MAX_PENDING, (
        f"queue holds {len(pool.rows)}, cap is {QUEUE_MAX_PENDING}: the backpressure "
        "limit was overshot"
    )
    assert Refusal.QUEUE_FULL in results


def test_distinct_submissions_below_the_cap_both_land() -> None:
    """The control. A gate that refused everything would pass both tests above
    while breaking the feature, so assert the ordinary path still works."""
    pool = FakePool()
    results = asyncio.run(_race(pool, "one", "two"))

    assert results == [None, None], f"an ordinary submission was refused: {results}"
    assert len(pool.rows) == 2


class ExplodingPool:
    """A pool that fails the test if the admission path opens the database."""

    def acquire(self) -> object:
        raise AssertionError("the database was consulted for a pre-state refusal")


def test_a_malformed_submission_touches_neither_the_limiter_nor_the_database() -> None:
    """Shape first, and nothing else. The state phase costs a database
    transaction and a slot of rate budget, so letting an empty submission spend
    either is the free flood the limits exist to prevent."""
    spent = False

    def spend_rate() -> bool:
        nonlocal spent
        spent = True
        return False

    async def run() -> Refusal | None:
        db = Database(ExplodingPool())  # type: ignore[arg-type]
        return await shout_admission.gate_shout(db, "   ", spend_rate=spend_rate)

    assert asyncio.run(run()) is Refusal.EMPTY
    assert not spent, "a malformed submission spent rate budget"


def test_a_rate_limited_submission_never_reaches_the_database() -> None:
    """A well-formed submission from a sender over its limit is refused on the
    limiter alone. It is otherwise valid, so nothing about its shape stops it —
    only the ordering does, and rate-limited traffic is exactly the traffic that
    must not be able to make the backend work."""

    async def run() -> Refusal | None:
        db = Database(ExplodingPool())  # type: ignore[arg-type]
        return await shout_admission.gate_shout(
            db, "a perfectly ordinary message", spend_rate=lambda: True
        )

    assert asyncio.run(run()) is Refusal.RATE
