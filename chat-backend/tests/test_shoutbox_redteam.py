"""Adversarial coverage for the shoutbox gate.

The design is lifted from feedback-intelligence's `RedTeamCoverageTests`: every
case declares WHICH RULE must handle it, not merely that something refused it.
Asserting "refused" would let one rule silently cover for another's deletion —
remove the markup rule and a `<script>` payload might still be caught by the
link rule, and the suite would stay green while the hole opened.

One case is pinned as a KNOWN GAP. That is deliberate too, and copied from the
same source: a red-team suite that only contains wins implies a safety it has not
demonstrated. Its class doc there is worth restating — this does not prove the
gate is safe, it proves the closed holes stay closed and names the one that is
not.

The fixture is `evals/shoutbox_redteam.jsonl`, one JSON object per line, so a new
attack is a line rather than a function.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.shoutbox import evaluate

FIXTURE = Path(__file__).resolve().parent.parent / "evals" / "shoutbox_redteam.jsonl"

CLEAN = {"rate_exceeded": False, "pending_total": 0, "duplicate_exists": False}


def _expand(text: str) -> str:
    """`REPEAT:a:501` -> 'a' * 501. Keeps a 500-character payload out of a JSONL
    line that a human has to read."""
    if not text.startswith("REPEAT:"):
        return text
    _, char, count = text.split(":", 2)
    return char * int(count)


def load_cases() -> list[dict]:
    cases = [
        json.loads(line)
        for line in FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert cases, "fixture is empty — the suite would pass vacuously"
    return cases


CASES = load_cases()


def test_fixture_has_both_attacks_and_controls() -> None:
    """A suite of only-attacks cannot tell over-blocking from working."""
    accepted = [c for c in CASES if c["expect"] == "accepted"]
    refused = [c for c in CASES if c["expect"] == "refused"]
    assert len(refused) >= 10, "too few attacks to be worth running"
    assert len(accepted) >= 4, "no controls: an over-eager gate would look perfect"


def test_case_ids_are_unique() -> None:
    ids = [c["id"] for c in CASES]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_redteam_case(case: dict) -> None:
    verdict = evaluate(_expand(case["text"]), **CLEAN)

    if case["expect"] == "accepted":
        assert verdict.accepted, (
            f"{case['id']} ({case['attack']}) was refused as "
            f"{verdict.refusal}: {case['note']}"
        )
        return

    assert not verdict.accepted, f"{case['id']} ({case['attack']}) was ACCEPTED"
    # The named rule, not merely "something refused it".
    expected = case["refusal"]
    assert verdict.refusal is not None
    assert verdict.refusal.value == expected, (
        f"{case['id']} ({case['attack']}) was caught by {verdict.refusal.value}, "
        f"expected {expected} — another rule is covering for it"
    )


def test_the_known_gap_is_still_a_gap() -> None:
    """Pinned so the suite documents its own hole.

    The link rule matches a bare domain only against a FINITE TLD list, so
    `freestuff.zip` passes. A whitelist can never be complete, and broadening the
    pattern to any word-dot-word would start refusing `node.js` and `U.S.A` in a
    box people write prose into — a worse trade.

    I originally pinned a Cyrillic homoglyph domain here and was wrong: it IS
    caught, because those letters still match a word-character run before an
    ASCII TLD. It now sits in the fixture as rt-19, a win rather than a gap.

    If this test starts failing, the gate got better and the fixture should be
    updated to expect a refusal — a good failure, and one worth noticing rather
    than silently absorbing.

    What actually stops this reaching the site is pre-moderation: nothing
    publishes without an explicit approval, so an uncaught link costs one line in
    a queue the owner reads.
    """
    gap = next(c for c in CASES if c["id"] == "rt-18")
    assert evaluate(gap["text"], **CLEAN).accepted, (
        "rt-18 is now refused — the gate improved. Update the fixture to expect "
        "a refusal and move it out of the known-gap slot."
    )
