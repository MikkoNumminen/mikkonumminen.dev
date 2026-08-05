"""Tests for the shoutbox submission gate.

The gate is the only thing between an anonymous stranger and the moderation
queue, and it sits on an endpoint that is publicly addressable through the
Tailscale Funnel regardless of what `vercel.json` proxies. So these pin the rules
themselves, the ORDER they fire in, and the normalisation that every rule reads
through — because an attack that survives normalisation defeats all of them at
once.

Each refusal asserts the specific `Refusal` member, never merely "refused". If
one rule were deleted, another firing must not be able to mask it.
"""

from __future__ import annotations

from app.shoutbox import (
    DUPLICATE_WINDOW_SECONDS,
    MAX_CHARS,
    MAX_LINES,
    NOTIFY_MIN_INTERVAL_SECONDS,
    QUEUE_MAX_PENDING,
    Refusal,
    body_hash,
    count_links,
    evaluate,
    normalise,
    shape_refusal,
    should_notify,
    state_refusal,
)

# rate_exceeded is a callable: evaluate() must not consult the limiter until the
# shape checks pass, so the ordering is enforced by the signature.
CLEAN = {
    "rate_exceeded": lambda: False,
    "pending_total": 0,
    "duplicate_exists": False,
}


# --- the happy path ---------------------------------------------------------


def test_accepts_an_ordinary_message() -> None:
    v = evaluate("Nice site, the terminal is a good touch.", **CLEAN)
    assert v.accepted
    assert v.refusal is None
    assert v.message is None
    assert v.body == "Nice site, the terminal is a good touch."
    assert v.body_hash is not None


def test_accepted_verdict_carries_the_normalised_body_not_the_raw_input() -> None:
    # Storing the raw text would mean the rules ran against a string the site
    # never displays.
    v = evaluate("  padded   \n\n\n\n  and spaced  ", **CLEAN)
    assert v.accepted
    assert v.body == "padded\n\nand spaced"


def test_refused_verdict_carries_no_body() -> None:
    # A caller cannot accidentally persist something the gate rejected.
    v = evaluate("", **CLEAN)
    assert not v.accepted
    assert v.body is None
    assert v.body_hash is None


# --- shape rules ------------------------------------------------------------


def test_empty_and_whitespace_only_are_refused_as_empty() -> None:
    for raw in ("", "   ", "\n\n\n", "\t"):
        assert evaluate(raw, **CLEAN).refusal is Refusal.EMPTY


def test_length_boundary_is_inclusive() -> None:
    assert evaluate("a" * MAX_CHARS, **CLEAN).accepted
    assert evaluate("a" * (MAX_CHARS + 1), **CLEAN).refusal is Refusal.TOO_LONG


def test_line_boundary_is_inclusive() -> None:
    assert evaluate("\n".join("x" for _ in range(MAX_LINES)), **CLEAN).accepted
    too_many = "\n".join("x" for _ in range(MAX_LINES + 1))
    assert evaluate(too_many, **CLEAN).refusal is Refusal.TOO_MANY_LINES


def test_blank_line_wall_cannot_pass_the_line_count_by_being_mostly_empty() -> None:
    # 40 newlines collapse to paragraph breaks, so this is a short message, not a
    # layout-wrecking wall. It should be accepted, having been flattened.
    v = evaluate("top" + "\n" * 40 + "bottom", **CLEAN)
    assert v.accepted
    assert v.body == "top\n\nbottom"


# --- links ------------------------------------------------------------------


def test_link_shapes_are_all_caught() -> None:
    for raw in (
        "visit http://example.com",
        "https://example.com/path",
        "see www.example.com",
        "just example.com then",
        "[click here](http://evil.tld)",
        "spaced out: example . com",
        "WWW.EXAMPLE.COM",
    ):
        assert evaluate(raw, **CLEAN).refusal is Refusal.LINK, raw


def test_ordinary_prose_with_punctuation_is_not_mistaken_for_a_link() -> None:
    for raw in (
        "Good work. Really nice.",
        "I liked it...a lot",
        "e.g. the terminal",
        "version 2.5 is better",
        "Mikko, hi.",
    ):
        v = evaluate(raw, **CLEAN)
        assert v.accepted, f"{raw} -> {v.refusal}"


def test_count_links_is_exposed_for_the_redteam_suite() -> None:
    assert count_links("http://a.com and www.b.com") == 2
    assert count_links("nothing here") == 0


# --- normalisation, which every other rule reads through --------------------


def test_invisible_characters_are_stripped_before_any_rule_runs() -> None:
    # A zero-width space inside a domain would otherwise hide it from the link
    # rule while still rendering as a working link.
    assert evaluate("exa​mple.com", **CLEAN).refusal is Refusal.LINK


def test_nfkc_collapses_fullwidth_forms_before_the_link_rule() -> None:
    # Full-width characters render like ASCII but are different bytes.
    assert evaluate("ｈｔｔｐ：／／ｅｖｉｌ．ｃｏｍ", **CLEAN).refusal is Refusal.LINK


def test_normalise_is_idempotent() -> None:
    once = normalise("  A\r\n\r\n\r\nB  ")
    assert normalise(once) == once


def test_hash_ignores_case_so_shouting_it_again_is_the_same_message() -> None:
    assert body_hash(normalise("Hello There")) == body_hash(normalise("HELLO THERE"))


def test_hash_distinguishes_genuinely_different_text() -> None:
    assert body_hash(normalise("one")) != body_hash(normalise("two"))


# --- state rules, and the order they fire in --------------------------------


def test_duplicate_is_refused() -> None:
    v = evaluate("same words", **{**CLEAN, "duplicate_exists": True})
    assert v.refusal is Refusal.DUPLICATE


def test_rate_exceeded_is_refused() -> None:
    # The COUNT lives in the in-memory RateLimiter (already tested in
    # test_ratelimit.py); the gate only consumes its verdict. Taking a boolean
    # here is what keeps "no IP is ever persisted" structurally true.
    assert evaluate("hi there", **{**CLEAN, "rate_exceeded": lambda: False}).accepted
    over = evaluate("hi there", **{**CLEAN, "rate_exceeded": lambda: True})
    assert over.refusal is Refusal.RATE


def test_queue_backpressure_boundary() -> None:
    ok = evaluate("hi there", **{**CLEAN, "pending_total": QUEUE_MAX_PENDING - 1})
    assert ok.accepted
    full = evaluate("hi there", **{**CLEAN, "pending_total": QUEUE_MAX_PENDING})
    assert full.refusal is Refusal.QUEUE_FULL


def test_shape_is_checked_before_state_so_junk_never_consumes_rate_budget() -> None:
    # An empty submission from a rate-limited address reports EMPTY, not RATE:
    # the visitor gets the reason they can act on, and a flood of empties cannot
    # be used to probe the rate limiter's state.
    #
    # The handler enforces the same order structurally via shape_refusal() —
    # before this split it did NOT, and spent both database queries and a slot of
    # rate budget on junk despite this test's name.
    v = evaluate("", rate_exceeded=lambda: True, pending_total=999, duplicate_exists=True)
    assert v.refusal is Refusal.EMPTY


def test_duplicate_outranks_rate_and_queue() -> None:
    v = evaluate(
        "same words",
        rate_exceeded=lambda: True,
        pending_total=QUEUE_MAX_PENDING,
        duplicate_exists=True,
    )
    assert v.refusal is Refusal.DUPLICATE


# --- visitor-facing text ----------------------------------------------------


def test_every_refusal_has_actionable_text() -> None:
    # A refusal a visitor cannot act on reads as a broken box.
    for member in Refusal:
        v = evaluate("", **CLEAN)
        text = v.message
        assert text is not None
        # every member is reachable and mapped
        from app.shoutbox import REFUSAL_TEXT

        assert member in REFUSAL_TEXT
        assert REFUSAL_TEXT[member].strip()
        assert REFUSAL_TEXT[member][0].isupper()
        assert REFUSAL_TEXT[member].endswith(".")


# --- notification throttle --------------------------------------------------


def test_no_notification_when_the_queue_is_empty() -> None:
    assert should_notify(0, None, 1000.0) is False


def test_first_pending_message_notifies_immediately() -> None:
    assert should_notify(1, None, 1000.0) is True


def test_notification_is_throttled_then_allowed_again() -> None:
    last = 1000.0
    assert should_notify(5, last, last + NOTIFY_MIN_INTERVAL_SECONDS - 1) is False
    assert should_notify(5, last, last + NOTIFY_MIN_INTERVAL_SECONDS) is True


def test_a_burst_that_clears_the_gate_does_not_become_a_burst_of_pings() -> None:
    last = 0.0
    # ten submissions land within a minute; only the state at each moment matters
    assert [should_notify(n, last, float(n * 6)) for n in range(1, 11)] == [False] * 10


# --- the constants block ----------------------------------------------------


def test_windows_are_the_documented_durations() -> None:
    assert DUPLICATE_WINDOW_SECONDS == 86_400
    assert NOTIFY_MIN_INTERVAL_SECONDS == 900


# --- the two phases, split so the handler can avoid paying for state ---------


def test_shape_refusal_needs_no_state_at_all() -> None:
    # The point of the split: the handler can refuse junk before spending two
    # database round-trips and a slot of rate budget on it.
    assert shape_refusal(normalise("")) is Refusal.EMPTY
    assert shape_refusal(normalise("a" * (MAX_CHARS + 1))) is Refusal.TOO_LONG
    assert shape_refusal(normalise("http://x.com")) is Refusal.LINK
    assert shape_refusal(normalise("perfectly fine")) is None


def test_state_refusal_ordering_matches_the_composed_gate() -> None:
    assert (
        state_refusal(rate_exceeded=True, pending_total=0, duplicate_exists=True)
        is Refusal.DUPLICATE
    )
    assert (
        state_refusal(rate_exceeded=True, pending_total=0, duplicate_exists=False)
        is Refusal.RATE
    )
    assert (
        state_refusal(
            rate_exceeded=False,
            pending_total=QUEUE_MAX_PENDING,
            duplicate_exists=False,
        )
        is Refusal.QUEUE_FULL
    )
    assert (
        state_refusal(rate_exceeded=False, pending_total=0, duplicate_exists=False)
        is None
    )


def test_evaluate_is_exactly_the_two_phases_composed() -> None:
    # Guards against the split drifting from the single entry point the rest of
    # the suite exercises: shape must still win over state for the same input.
    raw = ""
    composed = evaluate(
        raw,
        rate_exceeded=lambda: True,
        pending_total=QUEUE_MAX_PENDING,
        duplicate_exists=True,
    )
    assert composed.refusal is shape_refusal(normalise(raw))


def test_shape_phase_reads_normalised_text_not_raw() -> None:
    # Passing raw text to shape_refusal would let a full-width or zero-width
    # variant through, since only normalise collapses those.
    raw = "ｈｔｔｐ：／／ｅｖｉｌ．ｃｏｍ"
    assert shape_refusal(normalise(raw)) is Refusal.LINK


# --- markup, the second layer under the renderer ----------------------------


def test_tag_shaped_markup_is_refused() -> None:
    # This text is stored, committed into a public JSON file, and rendered on a
    # page. The renderer using textContent is the real defence; this is the layer
    # that does not depend on a component in another language getting one
    # property right.
    for raw in (
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        "<b>bold</b>",
        "</div>",
        "<SVG onload=alert(1)>",
    ):
        assert evaluate(raw, **CLEAN).refusal is Refusal.MARKUP, raw


def test_ordinary_comparisons_and_arrows_are_not_markup() -> None:
    # The rule is "< followed by a letter", not "contains an angle bracket", so
    # normal writing survives.
    for raw in (
        "a < b and c > d",
        "5 > 3",
        "x <- y",
        "1 <= 2",
        "he said <-- that way",
        "cost < 100 euros",
        "< script >",  # not a tag to any parser: whitespace after <
    ):
        v = evaluate(raw, **CLEAN)
        assert v.accepted, f"{raw} -> {v.refusal}"


def test_markup_is_caught_after_normalisation_not_before() -> None:
    # A full-width or zero-width-padded tag renders as a tag but is different
    # bytes, so the check must run on the normalised text.
    assert evaluate("＜script＞", **CLEAN).refusal is Refusal.MARKUP
    assert evaluate("<scr\u200bipt>", **CLEAN).refusal is Refusal.MARKUP
