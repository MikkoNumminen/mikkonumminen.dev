"""The shoutbox submission gate — deterministic, pure, and the only thing in
front of the moderation queue.

WHY THIS IS WRITTEN AS IF DIRECTLY ADDRESSABLE, BECAUSE IT IS: the Tailscale
Funnel proxies `/` — the whole origin — to the backend, and no route here carries
authentication. The funnel hostname is published in `vercel.json` and again in the
CSP. So `POST /shout` is reachable by anyone who reads the site's config, not only
through the site's own `/api/...` rewrite. Nothing upstream filters for us.

That also means the per-IP rate limit is weaker than it looks on the path that
matters. Per ADR 0012, Tailscale's proxy overwrites `X-Forwarded-For`, so ordinary
visitors arriving via Vercel share one egress bucket while a direct-to-funnel
caller gets a real per-IP bucket. The limit is therefore a courtesy check, and
`QUEUE_MAX_PENDING` — which depends on no identity at all — is what actually
bounds a flood.

The whole gate is a pure function of (text, now, queue facts). No I/O, no clock
read, no DB. That is what lets the red-team suite drive it directly, the way
feedback-intelligence drives its detector: each adversarial case declares which
rule must catch it, so deleting one rule cannot be masked by another firing.

NOT AN LLM DECISION. There is deliberately no model in this path: traffic does not
justify it, and a model that can be argued with is the wrong shape for a rule that
must be explainable to the person whose message was refused.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum

# --- limits -----------------------------------------------------------------
# One block, so the numbers are reviewable without reading the logic. For scale:
# the chat path allows 30 requests/60s, a 16 KB body and an 800-char question.

MIN_CHARS = 2
"""After normalisation. Rejects '' and whitespace-only."""

MAX_CHARS = 500
"""Platform's shoutbox used 280; the chat input cap is 800. A shoutbox message
should hold a thought, not an essay."""

MAX_LINES = 12
"""A wall of newlines fits inside MAX_CHARS and still wrecks the layout."""

MAX_LINKS = 0
"""Any URL is refused outright rather than quarantined. Quarantine would mean a
second queue and a second decision from the owner, to preserve links that would
almost certainly not be published. Easy to loosen later; hard to un-ship."""

DUPLICATE_WINDOW_SECONDS = 86_400
"""Identical normalised text inside 24h is a resubmission, not a new message."""

RATE_MAX = 3
RATE_WINDOW_SECONDS = 600
"""Stricter than the chat limit because this path writes. See the module note on
why this is a courtesy check rather than the real bound."""

QUEUE_MAX_PENDING = 200
"""Backpressure. The one limit that does not depend on visitor identity, and so
the one that actually holds under a flood from many addresses."""

NOTIFY_MIN_INTERVAL_SECONDS = 900
"""At most one notification per 15 minutes, digest-style ('N pending'). Kept
independent of the submit path on purpose: a burst that clears the gate must not
become a burst of notifications."""


class Refusal(StrEnum):
    """Why a submission was refused.

    A named member per rule, so the red-team suite can assert that a given attack
    is caught by the rule intended to catch it. Asserting merely "refused" would
    let one rule silently cover for another's removal.
    """

    EMPTY = "empty"
    TOO_LONG = "too_long"
    TOO_MANY_LINES = "too_many_lines"
    LINK = "link"
    MARKUP = "markup"
    DUPLICATE = "duplicate"
    RATE = "rate"
    QUEUE_FULL = "queue_full"


# Visitor-facing text. Deliberately specific: a refusal a visitor cannot act on
# reads as a broken box. These are the ONLY strings this module exposes; the
# frontend renders them inline, never as a popup.
REFUSAL_TEXT: dict[Refusal, str] = {
    Refusal.EMPTY: "Write something first.",
    Refusal.TOO_LONG: f"That is over {MAX_CHARS} characters. Trim it a little.",
    Refusal.TOO_MANY_LINES: f"That is more than {MAX_LINES} lines. Tighten it up.",
    Refusal.LINK: "Links are not accepted here. Say it in words instead.",
    Refusal.MARKUP: "That looks like HTML. Write it as plain text instead.",
    Refusal.DUPLICATE: "That message is already waiting for review.",
    Refusal.RATE: "That is a few too many at once. Try again in a few minutes.",
    Refusal.QUEUE_FULL: "The queue is full right now. Try again later.",
}


@dataclass(frozen=True)
class Verdict:
    """The gate's answer. `body` is the normalised text to store, set only when
    `accepted` — so a caller cannot accidentally persist raw input."""

    accepted: bool
    refusal: Refusal | None = None
    body: str | None = None
    body_hash: str | None = None

    @property
    def message(self) -> str | None:
        """The visitor-facing reason, or None when accepted."""
        return None if self.refusal is None else REFUSAL_TEXT[self.refusal]


# Matches a URL-ish token. Deliberately broad: `example.com`, `www.x.io`,
# `http://x`, and `x . com` with spaces around the dot all count. A narrow
# scheme-only pattern would miss the bare-domain spam that is the actual traffic.
# Each branch consumes the WHOLE token it matches, not just its marker, so
# `http://a.com` counts once rather than twice (scheme + bare domain). The gate
# only asks "any?" today, but a lying count is a trap for whoever loosens
# MAX_LINKS later.
_LINK_RE = re.compile(
    r"""(?ix)
    (?: \[ [^\]]* \] \s* \( [^)]* \) )      # markdown [text](target) — first, it
                                            # contains a URL and must match once
    | (?: [a-z][a-z0-9+.\-]* : / / \S* )    # scheme://rest
    | (?: www \s* \. \s* \S* )              # www.rest
    | (?: \w+ \s* \. \s*                    # bare domain with a known-ish TLD
          (?: com|net|org|io|dev|fi|se|co|me|app|xyz|ru|cn|info|biz|link|click )
          \b )
    """
)

# A tag-open, defined the way an HTML parser defines one: `<` or `</` IMMEDIATELY
# followed by a letter, no whitespace. That is not pedantry — `< script >` is not
# a tag to any browser, it is text, so rejecting it would refuse safe writing
# while modelling the threat wrongly. `a < b`, `5 > 3` and `x <- y` all pass for
# the same reason.
#
# WHY THE GATE REJECTS MARKUP AT ALL, when the renderer is the real defence:
# this text is stored, published into a committed JSON file, and rendered on a
# page. The correct fix is that the renderer uses textContent and never
# innerHTML — but that renderer is a different commit in a different language,
# and "the gate is the whole defence" is the sentence this feature is built on.
# A stored `<script>` that is only ever inert because one component got one
# property right is a single-layer bet. This is the second layer, and it costs a
# regex.
_TAG_RE = re.compile(r"</?[a-zA-Z]")

# Zero-width and bidi controls. Stripped before every other check: they let one
# visual string carry a different byte sequence, which would otherwise defeat the
# duplicate hash and hide a link inside an innocent-looking message.
_INVISIBLE_RE = re.compile(r"[­​-‏‪-‮⁠-⁤﻿]")


def normalise(raw: str) -> str:
    """Canonical form used for storage, hashing and every rule below.

    NFKC first, so homoglyph and full-width variants collapse to one form before
    anything inspects the text. Then invisible characters go, then each line is
    stripped at BOTH ends, then runs of blank lines collapse to one. The result is
    what gets stored: normalising at the gate and storing the raw text would mean
    the rules ran against a string the site never displays.

    Leading whitespace goes too, not just trailing. A shoutbox has no meaningful
    indentation, and leaving it in allows ASCII-art and pseudo-layout that the
    character and line caps do not otherwise bound.
    """
    text = unicodedata.normalize("NFKC", raw)
    text = _INVISIBLE_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.strip() for line in text.split("\n")]
    # Collapse 3+ newlines to a paragraph break so a spacer wall cannot pass the
    # line count by being mostly empty.
    out: list[str] = []
    blanks = 0
    for line in lines:
        if line:
            blanks = 0
            out.append(line)
        else:
            blanks += 1
            if blanks == 1:
                out.append(line)
    return "\n".join(out).strip()


def body_hash(normalised: str) -> str:
    """Duplicate key. Casefolded so shouting the same thing again is still the
    same thing. Carries no sender information by construction — this is the whole
    reason duplicate detection keys on text rather than on an address."""
    return hashlib.sha256(normalised.casefold().encode("utf-8")).hexdigest()


def count_links(normalised: str) -> int:
    return len(_LINK_RE.findall(normalised))


def shape_refusal(body: str) -> Refusal | None:
    """Refuse on the text alone. Takes an ALREADY-NORMALISED body.

    Split out from `evaluate` so a caller can run it BEFORE spending anything on
    the state checks. That is not a micro-optimisation: the state facts cost two
    database round-trips and a slot of rate budget, and letting an empty
    submission consume those is exactly the free-flood the limits exist to stop.
    The handler therefore runs this first and only queries if it passes.
    """
    if len(body) < MIN_CHARS:
        return Refusal.EMPTY
    if len(body) > MAX_CHARS:
        return Refusal.TOO_LONG
    if body.count("\n") + 1 > MAX_LINES:
        return Refusal.TOO_MANY_LINES
    if count_links(body) > MAX_LINKS:
        return Refusal.LINK
    if _TAG_RE.search(body):
        return Refusal.MARKUP
    return None


def state_refusal(
    *, rate_exceeded: bool, pending_total: int, duplicate_exists: bool
) -> Refusal | None:
    """Refuse on facts about the world. Only meaningful once the shape passed."""
    if duplicate_exists:
        return Refusal.DUPLICATE
    if rate_exceeded:
        return Refusal.RATE
    if pending_total >= QUEUE_MAX_PENDING:
        return Refusal.QUEUE_FULL
    return None


def evaluate(
    raw: str,
    *,
    rate_exceeded: Callable[[], bool],
    pending_total: int,
    duplicate_exists: bool,
) -> Verdict:
    """Decide whether a submission may enter the queue.

    Pure: every fact about the world arrives as an argument. The caller does all
    the I/O and all the counting.

    `rate_exceeded` is a CALLABLE returning a boolean, not a count, and both
    halves of that are deliberate. Callable, because the limiter records the
    attempt as it answers: it must not run until the shape checks have passed.
    Boolean rather than a count, The count
    lives in the in-memory `RateLimiter` — the same structure the chat path uses —
    because no IP is ever written to disk here. Taking an `int` would imply a
    stored per-address tally and invite someone to add the column that would make
    it easy. `duplicate_exists` is the body-hash lookup inside
    DUPLICATE_WINDOW_SECONDS, which keys on text and so says nothing about who
    sent it.

    Order matters and is chosen so the cheapest and most actionable refusals come
    first: a visitor who typed nothing should be told that, not told the queue is
    full. Shape checks precede state checks throughout, so an empty submission
    never consumes rate budget.
    """
    body = normalise(raw)

    shape = shape_refusal(body)
    if shape is not None:
        # Return BEFORE touching the rate check. `rate_exceeded` is a callable so
        # that ordering is enforced here rather than trusted to each caller: the
        # limiter records the attempt as it answers, so calling it for an empty or
        # oversized submission would hand an attacker the free flood the limit
        # exists to prevent. Taking a bool would make "only well-formed
        # submissions spend budget" a property of the call site, which is exactly
        # how the endpoint and this function drifted apart.
        return Verdict(accepted=False, refusal=shape)

    refusal = state_refusal(
        rate_exceeded=rate_exceeded(),
        pending_total=pending_total,
        duplicate_exists=duplicate_exists,
    )
    if refusal is not None:
        return Verdict(accepted=False, refusal=refusal)

    return Verdict(accepted=True, body=body, body_hash=body_hash(body))


def should_notify(pending_total: int, last_notified_at: float | None, now: float) -> bool:
    """Whether to send a queue notification now.

    Throttled independently of the submit path, so a burst that clears the gate
    arrives as one digest rather than one ping per message. `last_notified_at` is
    the caller's state (in-memory is fine — a missed ping after a restart costs
    nothing, since the next submission re-triggers it).
    """
    if pending_total <= 0:
        return False
    if last_notified_at is None:
        return True
    return (now - last_notified_at) >= NOTIFY_MIN_INTERVAL_SECONDS
