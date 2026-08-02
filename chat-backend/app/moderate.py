"""Moderation commands, run INSIDE the backend container. Not an HTTP route.

WHY THIS IS A MODULE AND NOT AN ENDPOINT: the Tailscale Funnel proxies `/` — the
whole origin — to this app, and no route here carries authentication. An
`/admin/approve` endpoint would therefore be a publicly reachable way to publish
to the site, however carefully it was left out of `vercel.json`. Invoked instead
as `docker compose exec -T backend python -m app.moderate ...`, which requires a
shell on the machine and is reachable from nowhere else.

`ragctl` wraps this; a human never types the compose command. The split exists so
the SQL stays in `db.py` next to every other query, rather than being duplicated
into shell-quoted `psql` inside an ops CLI.

OUTPUT IS JSON ON STDOUT, always, including for failures. ragctl parses it and
does the rendering — keeping the presentation on the host side means the snapshot
this emits can be written straight to the repo working tree without the container
needing a writable mount into `public/`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime

from .config import Settings
from .db import Database
from .shoutbox_snapshot import Reply, Thread, snapshot_payload

SNAPSHOT_LIMIT = 200
"""How many approved threads the published file carries. The box shows a recent
conversation, not an archive; the queue keeps everything either way."""


async def _with_db(
    settings: Settings, action: str, shout_id: int, text: str
) -> dict[str, object]:
    db = await Database.connect(settings.database_url)
    try:
        if action == "queue":
            rows = await db.list_pending_shouts()
            return {
                "ok": True,
                "pending": [
                    {
                        "id": r["id"],
                        "body": r["body"],
                        "created_at": r["created_at"].isoformat(),
                    }
                    for r in rows
                ],
            }
        if action == "approve":
            return {"ok": await db.approve_shout(shout_id), "id": shout_id}
        if action == "reject":
            return {"ok": await db.reject_shout(shout_id), "id": shout_id}
        if action == "reply":
            return {"ok": await db.reply_to_shout(shout_id, text), "id": shout_id}
        if action == "publish":
            rows = await db.list_approved_shouts(SNAPSHOT_LIMIT)
            threads = [
                Thread(
                    id=r["id"],
                    body=r["body"],
                    at=r["approved_at"],
                    reply=(
                        None
                        if r["reply"] is None
                        else Reply(body=r["reply"], at=r["replied_at"])
                    ),
                )
                for r in rows
            ]
            # generated_at is read here rather than passed in because this is the
            # one place that actually publishes; the shaping function stays pure.
            return {
                "ok": True,
                "snapshot": snapshot_payload(threads, datetime.now(UTC)),
            }
        return {"ok": False, "error": f"unknown action {action!r}"}
    finally:
        await db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.moderate")
    parser.add_argument(
        "action", choices=["queue", "approve", "reject", "reply", "publish"]
    )
    parser.add_argument("id", nargs="?", type=int, default=0)
    parser.add_argument("text", nargs="?", default="")
    args = parser.parse_args(argv)

    if args.action in {"approve", "reject", "reply"} and args.id <= 0:
        json.dump({"ok": False, "error": "a positive id is required"}, sys.stdout)
        return 2
    if args.action == "reply" and not args.text.strip():
        json.dump({"ok": False, "error": "reply text is required"}, sys.stdout)
        return 2

    settings = Settings.from_env()
    result = asyncio.run(_with_db(settings, args.action, args.id, args.text))
    json.dump(result, sys.stdout, ensure_ascii=False)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
