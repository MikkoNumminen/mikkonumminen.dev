"""The published shoutbox snapshot — pure shaping, no I/O.

Separate from `db.py` for the same reason `usage.py` is: `db.py` imports asyncpg
and pgvector at module load, so anything living there cannot run in the fast test
suite. The snapshot's shape is a CONTRACT with the frontend and with the prebuild
schema gate, so it is exactly the thing that should be unit-tested cheaply.

WHERE THIS GOES: `public/data/shoutbox.json`, committed to git, served by the CDN,
fetched at runtime by the contact page. Reads therefore never touch the home
machine — the thread list is up whenever the site is up, not whenever the PC is.
That mirrors `public/data/skills-registry.json` exactly, including the deliberate
choice NOT to generate it during a build (ADR 0006 removed that for the registry
after a build-time sync silently overwrote enriched data).

PERMANENCE, which the visitor-facing copy has to be honest about: an approved
message enters a git-committed file. Removing it later takes it off the site but
not out of git history, where it stays in every clone. That is a property of the
architecture, not a bug in it, and ADR 0017 records it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

SNAPSHOT_VERSION = 1
"""Bumped only on a breaking shape change. The frontend guard checks it, so an
old cached bundle meeting a new file degrades to an empty box rather than
rendering a half-understood structure."""


@dataclass(frozen=True)
class Reply:
    body: str
    at: datetime


@dataclass(frozen=True)
class Thread:
    """One approved message and, at most, one owner reply."""

    id: int
    body: str
    at: datetime
    reply: Reply | None = None


def snapshot_payload(threads: list[Thread], generated_at: datetime) -> dict[str, object]:
    """Shape the committed JSON.

    Newest first: the box shows the most recent conversation without the
    frontend having to sort, and a truncated read still yields the useful end.

    `generated_at` is passed in rather than read from the clock so the output is
    deterministic under test — the same reason `usage_payload` takes its window.

    Note what is NOT here: no author, no IP, no session id, no moderation
    metadata, no status field. The snapshot contains only what is published, so a
    mistake in the generator cannot leak queue state into a public file.
    """
    return {
        "version": SNAPSHOT_VERSION,
        "generated_at": generated_at.isoformat(),
        "count": len(threads),
        "threads": [
            {
                "id": t.id,
                "body": t.body,
                "at": t.at.isoformat(),
                "reply": (
                    None
                    if t.reply is None
                    else {"body": t.reply.body, "at": t.reply.at.isoformat()}
                ),
            }
            for t in threads
        ],
    }
