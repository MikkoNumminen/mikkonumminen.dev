# ADR 0017 — A public write endpoint that cannot publish: the shoutbox moderation queue

**Status:** accepted
**Date:** 2026-08-03
**Decided by:** repo owner

## Context

The shoutbox shipped across PRs #492–#499: `POST /shout` on the chat backend
(`chat-backend/app/main.py`), a deterministic gate in front of it
(`chat-backend/app/shoutbox.py`), moderation verbs run out-of-band
(`chat-backend/app/moderate.py`), a Telegram digest for the owner
(`chat-backend/app/notify.py`), and a committed-JSON publication path
(`chat-backend/app/shoutbox_snapshot.py`, `src/lib/shoutbox/snapshot.ts`) fed
by the write path (`src/lib/shoutbox/submit.ts`).

Every one of those files carries an unusually explicit doc-block explaining its
own piece of the threat model, but nothing tied them together or recorded the
alternatives that were considered and rejected along the way. As ADR 0012
already established, the Tailscale Funnel proxies `/` — the whole origin — to
the backend, with no route carrying authentication, and `X-Forwarded-For` is
overwritten by Tailscale's serve proxy so per-IP attribution is lost on the
path most visitors take. `POST /shout` therefore inherits both properties: it
is reachable by anyone who reads the site's published config (`vercel.json`,
the CSP), and its rate limiter is a courtesy check rather than a real bound.
Shipping a public *write* endpoint under those constraints is a materially
different risk than the read-only chat proxy ADR 0012 covers, and it needed
its own record.

## Decision

The shoutbox is shaped so that accepting a submission can never, by itself,
put text on the site.

1. **`POST /shout` only enqueues.** The handler in `main.py` runs
   `shoutbox.evaluate` and, on acceptance, calls `db.enqueue_shout` — nothing
   in the request path writes to `public/data/shoutbox.json` or any other
   published surface. The public `/contact` page renders that committed
   snapshot (`src/lib/shoutbox/snapshot.ts`), which changes only when the
   owner runs `app.moderate publish` and commits the result. This is the
   property that makes the endpoint safe to expose on an unauthenticated
   funnel: a flood, a probe, or a malicious payload can fill the queue, but
   nothing it does moves text onto the page without a separate, human,
   out-of-band action.

2. **The gate is a deterministic, pure function — no LLM.** `shoutbox.py`
   states the reasoning directly: "traffic does not justify it, and a model
   that can be argued with is the wrong shape for a rule that must be
   explainable to the person whose message was refused." `evaluate()` takes
   `(text, now, queue facts)` and returns a `Verdict` with a named `Refusal`
   member per rule (`EMPTY`, `TOO_LONG`, `TOO_MANY_LINES`, `LINK`, `MARKUP`,
   `DUPLICATE`, `RATE`, `QUEUE_FULL`), each mapped to a specific,
   actionable, visitor-facing string in `REFUSAL_TEXT`. A visitor who is
   refused is told why, in words they can act on.

3. **Moderation verbs live on the CLI, not as HTTP routes.**
   `moderate.py`'s module docstring gives the reason plainly: an
   `/admin/approve` endpoint would be "a publicly reachable way to publish to
   the site, however carefully it was left out of `vercel.json`," because the
   funnel proxies the whole origin regardless of what any router registers.
   `queue` / `approve` / `reject` / `reply` / `publish` are instead invoked as
   `docker compose exec -T backend python -m app.moderate ...` — reachable
   only from a shell on the machine — wrapped by `ragctl` so a human never
   types the compose command directly.

4. **Telegram over email for queue notification.** `notify.py`'s docstring
   gives the concrete reasons: `httpx` is already a dependency so this costs
   one POST and no new package, there is no SMTP/mail/webhook infrastructure
   anywhere in the repo, and the notification is deliberately informational
   only — "you have 3 pending," no action links — which removes the
   signed-link forgery problem entirely, since the only thing the message can
   tell the owner to do is open `ragctl`, a local surface nobody else can
   reach. Sending is best-effort and swallows every error: a Telegram outage
   must never surface to the visitor whose submission has already been
   accepted.

5. **Per-IP rate limiting is a courtesy check; queue backpressure is the real
   bound.** `RATE_MAX = 3` per `RATE_WINDOW_SECONDS = 600` is stricter than
   the chat path's limit because this path writes, but per ADR 0012's finding
   about `X-Forwarded-For`, ordinary visitors arriving via Vercel share one
   egress bucket while a direct-to-funnel caller gets a real per-IP bucket —
   the identity the limiter keys on is not trustworthy on the path that
   matters. `QUEUE_MAX_PENDING = 200` depends on no identity at all, and the
   module states outright that it "is what actually bounds a flood." The
   `rate_exceeded` argument to `evaluate()` is deliberately a boolean, not a
   count, so that no per-address tally is ever written to disk — the count
   lives only in the in-memory `RateLimiter`, the same structure the chat
   path already uses.

## Considered alternatives

- **Quarantine links instead of refusing them outright (`MAX_LINKS = 0`).**
  Rejected in `shoutbox.py` with a stated reason: quarantine "would mean a
  second queue and a second decision from the owner, to preserve links that
  would almost certainly not be published." Refusing outright is also the
  reversible choice — "Easy to loosen later; hard to un-ship" — where
  quarantine infrastructure, once built, is not something a later tightening
  can cleanly undo.

- **Trust the renderer's `textContent` alone and skip the markup check at the
  gate.** Rejected. The gate's `_TAG_RE` doc-block calls out directly that the
  correct fix for stored markup is that the renderer uses `textContent` and
  never `innerHTML`, "but that renderer is a different commit in a different
  language, and 'the gate is the whole defence' is the sentence this feature
  is built on. A stored `<script>` that is only ever inert because one
  component got one property right is a single-layer bet." The gate rejects
  markup as a second, independent layer, priced at one regex.

- **Count links precisely rather than only asking "any?".** The `_LINK_RE`
  pattern is written so each branch consumes the whole matched token (so
  `http://a.com` counts once, not as scheme plus bare domain), even though
  `MAX_LINKS = 0` only ever asks whether any link exists today. The comment
  in the code frames this as deliberate: "a lying count is a trap for whoever
  loosens `MAX_LINKS` later" — the accuracy is paid for now so a future
  change doesn't inherit a silently wrong count.

- **A broader bare-domain link pattern (any `word.word`) instead of a
  known-ish TLD list.** Not taken, and the red-team suite pins the resulting
  gap on purpose (`test_the_known_gap_is_still_a_gap`, case `rt-18`,
  `freestuff.zip`): "a whitelist can never be complete, and broadening the
  pattern to any word-dot-word would start refusing `node.js` and `U.S.A` in
  a box people write prose into — a worse trade." The gap is closed by
  pre-moderation instead: nothing an uncaught link matches ever reaches the
  site without the owner reading it in the queue first.

- **Key duplicate detection or rate limiting on sender identity.** Not done.
  `body_hash()` is explicit that it "carries no sender information by
  construction — this is the whole reason duplicate detection keys on text
  rather than on an address," consistent with the funnel's `X-Forwarded-For`
  problem making identity an unreliable signal on this path anyway.

## Consequences

- The public site cannot be defaced through `POST /shout` no matter what the
  gate lets through, because the write path and the publish path are
  disjoint: one enqueues, the other — `app.moderate publish`, run manually —
  commits a JSON file. This is also the honest cost: the shoutbox is not
  real-time. A visitor's accepted message sits in the queue until the owner
  opens `ragctl`, reads it, and chooses to publish; there is no path from
  submission to a public reply that doesn't pass through a human at a
  keyboard.
- An approved message becomes a line in a git-committed file
  (`public/data/shoutbox.json`). `shoutbox_snapshot.py`'s docstring records
  the resulting permanence directly: "Removing it later takes it off the
  site but not out of git history, where it stays in every clone. That is a
  property of the architecture, not a bug in it" — a property this record
  inherits from ADR 0006's committed-artifact model for the skills registry,
  and one the owner accepts each time `publish` is run.
- The deterministic gate is fully covered by
  `chat-backend/tests/test_shoutbox_redteam.py`, which asserts the *named*
  rule catches each attack (not merely that something refused it), carries
  both attack and control cases so an over-eager gate would fail the suite
  too, and pins the one known gap so it can't silently reopen or silently
  close without the fixture being updated. Because the gate is pure, the
  suite drives `evaluate()` directly with no backend, no database, and no
  network.
- The rate limiter's weakness on the proxied path is accepted, not treated as
  a bug to fix here — it is the same trade ADR 0012 already made for the
  chat path, and `QUEUE_MAX_PENDING` is deliberately the layer that does not
  depend on the identity the funnel makes untrustworthy.
- Notification is a politeness with in-memory-only throttle state
  (`_last_sent_at` in `QueueNotifier`). A backend restart can cost one missed
  digest; the next accepted submission re-evaluates and sends, so nothing is
  silently lost for longer than one submission's worth of time.
- The snapshot's version guard (`SNAPSHOT_VERSION` / `SUPPORTED_VERSION`) and
  `parseSnapshot`'s strict shape check mean a partially-written or
  differently-shaped file degrades to the empty box on the frontend rather
  than a render crash — the same contract `skills.ts` already uses for the
  skills registry.
