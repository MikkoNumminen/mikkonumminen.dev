"""Tests for the shoutbox moderation verbs in ragctl.

The pure half — queue rendering, the outcome line, the publish reminder — is
pinned here without touching docker, matching how `test_ragctl_watchdog.py` pins
the escalation ladder. The imperative half is three lines of subprocess and file
write around these.

The outcome line matters more than it looks: `approve` is guarded on
status='pending' and `reply` on status='approved' in SQL, so a false result means
the row was not in the state the verb requires. Reporting that as success would
leave the operator believing a message is published when it is not.
"""

from __future__ import annotations

import re

import ragctl


def _plain(text: str) -> str:
    """Strip ANSI colour so assertions read the words, not the escape codes."""
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


# --- queue rendering --------------------------------------------------------


def test_empty_queue_says_so_rather_than_printing_a_bare_header() -> None:
    assert _plain(ragctl.format_queue([])) == "  ○ queue empty"


def test_queue_lists_id_timestamp_and_body() -> None:
    out = _plain(
        ragctl.format_queue(
            [{"id": 7, "body": "nice site", "created_at": "2026-08-02T09:15:00+00:00"}]
        )
    )
    assert "1 pending" in out
    assert "7" in out
    assert "2026-08-02 09:15" in out
    assert "nice site" in out


def test_queue_count_is_pluralised_by_the_number_not_by_guesswork() -> None:
    one = _plain(ragctl.format_queue([{"id": 1, "body": "a", "created_at": ""}]))
    two = _plain(
        ragctl.format_queue(
            [
                {"id": 1, "body": "a", "created_at": ""},
                {"id": 2, "body": "b", "created_at": ""},
            ]
        )
    )
    assert "1 pending" in one
    assert "2 pending" in two


def test_long_bodies_are_truncated_for_the_listing_only() -> None:
    body = "x" * 200
    out = _plain(ragctl.format_queue([{"id": 1, "body": body, "created_at": ""}]))
    assert "..." in out
    assert len(out) < 200


def test_newlines_are_flattened_so_one_message_is_one_row() -> None:
    # A multi-line message must not break the alignment of the listing.
    out = _plain(
        ragctl.format_queue([{"id": 1, "body": "top\n\nbottom", "created_at": ""}])
    )
    assert "top bottom" in out
    assert len(out.splitlines()) == 2  # header + one row


def test_missing_fields_do_not_crash_the_listing() -> None:
    # The payload comes from another process; a malformed row should degrade to a
    # visible placeholder rather than taking the whole queue view down.
    out = _plain(ragctl.format_queue([{}]))
    assert "?" in out


# --- the outcome line -------------------------------------------------------


def test_success_names_what_actually_happened() -> None:
    assert "approved" in _plain(ragctl.moderation_message("approve", True, 7))
    assert "rejected and deleted" in _plain(ragctl.moderation_message("reject", True, 7))
    assert "reply attached" in _plain(ragctl.moderation_message("reply", True, 7))


def test_a_miss_is_reported_as_nothing_to_do_not_as_success() -> None:
    # The SQL guards mean False = "wrong state", e.g. approving an already
    # approved row or replying to one that was never approved.
    for action in ("approve", "reject", "reply"):
        out = _plain(ragctl.moderation_message(action, False, 7))
        assert "nothing to do" in out
        assert "approved" not in out


def test_the_id_is_always_in_the_line() -> None:
    for ok in (True, False):
        assert "#7" in _plain(ragctl.moderation_message("approve", ok, 7))


# --- the publish reminder ---------------------------------------------------


def test_publish_reminder_says_the_snapshot_is_staged_not_live() -> None:
    # The site serves the COMMITTED file from the CDN and never reads this
    # machine, so writing it changes nothing publicly until it is pushed. Saying
    # so is the difference between "it is live" and "it is staged".
    out = _plain(ragctl.publish_reminder(3))
    assert "public/data/shoutbox.json" in out
    assert "3 threads" in out
    assert "commit" in out


def test_publish_reminder_pluralises_one_thread() -> None:
    assert "(1 thread)" in _plain(ragctl.publish_reminder(1))
    assert "(0 threads)" in _plain(ragctl.publish_reminder(0))
    assert "(2 threads)" in _plain(ragctl.publish_reminder(2))


def test_publish_reminder_is_two_lines() -> None:
    # The second line is the "commit it" instruction; collapsing them onto one
    # line is how the staged-vs-live distinction stops being noticeable.
    assert len(_plain(ragctl.publish_reminder(1)).splitlines()) == 2


# --- the snapshot path ------------------------------------------------------


def test_snapshot_is_written_where_the_site_reads_it() -> None:
    # public/data/ is what Astro copies verbatim into dist/, and the contact page
    # fetches /data/shoutbox.json at runtime. A path anywhere else would publish
    # nothing while appearing to work.
    assert ragctl.SHOUT_SNAPSHOT.parts[-3:] == ("public", "data", "shoutbox.json")
    assert ragctl.SHOUT_SNAPSHOT.is_absolute()
