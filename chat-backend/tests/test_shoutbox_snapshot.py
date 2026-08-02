"""Tests for the published shoutbox snapshot shape.

This shape is a contract with three consumers: the contact-page component, the
prebuild schema gate, and git history (an approved message is committed and
therefore permanent). Pinning it here is cheaper than discovering a mismatch as a
render crash on the live site.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.shoutbox_snapshot import SNAPSHOT_VERSION, Reply, Thread, snapshot_payload

AT = datetime(2026, 8, 1, 12, 30, tzinfo=UTC)
GEN = datetime(2026, 8, 2, 9, 0, tzinfo=UTC)


def test_empty_snapshot_is_still_a_valid_document() -> None:
    # The file exists before the first approval; the box must render an empty
    # state from it rather than treating absence of threads as a broken file.
    assert snapshot_payload([], GEN) == {
        "version": SNAPSHOT_VERSION,
        "generated_at": "2026-08-02T09:00:00+00:00",
        "count": 0,
        "threads": [],
    }


def test_message_without_a_reply_carries_an_explicit_null() -> None:
    payload = snapshot_payload([Thread(id=7, body="nice site", at=AT)], GEN)
    assert payload["threads"] == [
        {
            "id": 7,
            "body": "nice site",
            "at": "2026-08-01T12:30:00+00:00",
            "reply": None,
        }
    ]


def test_message_with_a_reply_nests_it() -> None:
    replied_at = datetime(2026, 8, 1, 18, 0, tzinfo=UTC)
    reply = Reply(body="thanks", at=replied_at)
    payload = snapshot_payload([Thread(id=7, body="nice site", at=AT, reply=reply)], GEN)
    threads = payload["threads"]
    assert isinstance(threads, list)
    assert threads[0]["reply"] == {
        "body": "thanks",
        "at": "2026-08-01T18:00:00+00:00",
    }


def test_count_matches_the_thread_list() -> None:
    threads = [Thread(id=i, body=f"m{i}", at=AT) for i in range(5)]
    payload = snapshot_payload(threads, GEN)
    assert payload["count"] == 5
    assert isinstance(payload["threads"], list)
    assert len(payload["threads"]) == 5


def test_order_is_preserved_so_the_caller_owns_sorting() -> None:
    threads = [Thread(id=3, body="c", at=AT), Thread(id=1, body="a", at=AT)]
    payload = snapshot_payload(threads, GEN)
    assert isinstance(payload["threads"], list)
    assert [t["id"] for t in payload["threads"]] == [3, 1]


def test_snapshot_leaks_no_queue_or_identity_fields() -> None:
    # The generator reads rows that also carry status and timestamps the public
    # file must never contain. Asserting the exact key set is what catches a
    # future `SELECT *` shortcut.
    payload = snapshot_payload(
        [Thread(id=7, body="hi", at=AT, reply=Reply(body="yo", at=AT))], GEN
    )
    assert set(payload) == {"version", "generated_at", "count", "threads"}
    threads = payload["threads"]
    assert isinstance(threads, list)
    assert set(threads[0]) == {"id", "body", "at", "reply"}
    reply = threads[0]["reply"]
    assert isinstance(reply, dict)
    assert set(reply) == {"body", "at"}
    for forbidden in ("ip", "author", "name", "status", "body_hash", "approved_at"):
        assert forbidden not in threads[0]
