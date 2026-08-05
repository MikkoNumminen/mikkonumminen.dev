"""The duplicate gate and the queue cap under CONCURRENT submissions.

The original handler read the queue facts (pending count, duplicate-in-window)
and inserted afterwards with nothing serialising the two, so two identical
submissions arriving together could both see "no duplicate" and both land, and
two distinct ones could both see pending below the cap at the brim and overshoot
it. `db.enqueue_shout_gated` moves the facts and the insert into one transaction
that first takes the shoutbox advisory lock.

That fix shipped with NO regression test. It was verified by a probe run by hand
against live Postgres, which proved it worked once and protects nothing
afterwards: swapping the advisory lock for something that merely looks
equivalent would not fail anything. This closes that.

HONEST SCOPE. No Postgres runs in the fast suite, so the race is exercised
against a fake pool that emulates exactly the two semantics the fix depends on:

  * `pg_advisory_xact_lock` blocks until the holding TRANSACTION ends, not until
    the statement returns
  * reads observe only committed rows

The fake FORCES the racy interleaving rather than hoping the scheduler finds it:
every fact read yields to the event loop before answering, so without the lock
both tasks deterministically read a world missing the other's row. Remove the
lock from `enqueue_shout_gated` and these tests go red every time, not flakily.

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
from types import TracebackType

import pytest

# app.db imports the driver at module load; a machine without it skips locally.
# CI installs the full stack via `pip install -e ".[dev]"`, so a skip is never a
# CI outcome.
pytest.importorskip("asyncpg")
pytest.importorskip("pgvector")

from app.db import Database  # noqa: E402
from app.shoutbox import QUEUE_MAX_PENDING  # noqa: E402

WINDOW = 86_400


class FakePool:
    """Just enough asyncpg to host enqueue_shout_gated: committed rows + a lock."""

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
        assert "pg_advisory_xact_lock" in sql, f"unexpected execute: {sql}"
        # Real semantics: blocks until granted, released at transaction end.
        await self._pool.advisory_lock.acquire()
        self._holds_lock = True
        return "SELECT 1"

    async def fetchval(self, sql: str, *args: object) -> object:
        # Force the interleaving the race needs: yield so the OTHER task reaches
        # its own reads before this one inserts. With the lock held that is
        # harmless, because the other task is parked acquiring it.
        await asyncio.sleep(0)
        if "EXISTS" in sql:
            target = args[0]
            return target in self._pool.rows or target in self._txn_rows
        if "count(*)" in sql:
            return len(self._pool.rows) + len(self._txn_rows)
        if "INSERT INTO shout_queue" in sql:
            self._txn_rows.append(str(args[1]))  # ($1 body, $2 body_hash)
            return len(self._pool.rows) + len(self._txn_rows)
        raise AssertionError(f"unexpected fetchval: {sql}")


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


def test_concurrent_identical_submissions_land_exactly_once() -> None:
    """The high finding: two identical posts arriving together both passed the
    duplicate gate and both inserted."""

    async def run() -> tuple[FakePool, list[tuple[int | None, str | None]]]:
        pool = FakePool()
        db = Database(pool)  # type: ignore[arg-type]
        results = await asyncio.gather(
            db.enqueue_shout_gated(
                "same text",
                "hash-A",
                window_seconds=WINDOW,
                max_pending=QUEUE_MAX_PENDING,
            ),
            db.enqueue_shout_gated(
                "same text",
                "hash-A",
                window_seconds=WINDOW,
                max_pending=QUEUE_MAX_PENDING,
            ),
        )
        return pool, list(results)

    pool, results = asyncio.run(run())
    inserted = [r for r in results if r[0] is not None]
    refused = [r for r in results if r[0] is None]

    assert len(inserted) == 1, f"expected exactly one insert, got {results}"
    assert len(refused) == 1 and refused[0][1] == "duplicate"
    assert pool.rows == ["hash-A"], "the duplicate reached the queue"


def test_concurrent_distinct_submissions_cannot_overshoot_the_cap() -> None:
    """The medium finding riding the same window: at the brim, two distinct
    submissions both saw pending < cap before either insert landed."""

    async def run() -> FakePool:
        pool = FakePool(committed=QUEUE_MAX_PENDING - 1)  # one slot left
        db = Database(pool)  # type: ignore[arg-type]
        await asyncio.gather(
            db.enqueue_shout_gated(
                "first", "hash-B", window_seconds=WINDOW, max_pending=QUEUE_MAX_PENDING
            ),
            db.enqueue_shout_gated(
                "second", "hash-C", window_seconds=WINDOW, max_pending=QUEUE_MAX_PENDING
            ),
        )
        return pool

    pool = asyncio.run(run())
    assert len(pool.rows) == QUEUE_MAX_PENDING, (
        f"queue holds {len(pool.rows)}, cap is {QUEUE_MAX_PENDING}: the backpressure "
        "limit was overshot"
    )


def test_distinct_submissions_below_the_cap_both_land() -> None:
    """The control. A gate that refused everything would pass both tests above
    while breaking the feature, so assert the ordinary path still works."""

    async def run() -> FakePool:
        pool = FakePool()
        db = Database(pool)  # type: ignore[arg-type]
        await asyncio.gather(
            db.enqueue_shout_gated(
                "one", "hash-D", window_seconds=WINDOW, max_pending=QUEUE_MAX_PENDING
            ),
            db.enqueue_shout_gated(
                "two", "hash-E", window_seconds=WINDOW, max_pending=QUEUE_MAX_PENDING
            ),
        )
        return pool

    pool = asyncio.run(run())
    assert sorted(pool.rows) == ["hash-D", "hash-E"]
