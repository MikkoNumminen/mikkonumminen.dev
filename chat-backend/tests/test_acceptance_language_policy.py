"""The acceptance harness must assert the language policy the backend RUNS.

WHAT WENT WRONG. `--allow-finnish` was an opt-in flag defaulting to off. Nothing
passed it, `ragctl verify` included, so the deploy gate asserted English-only
against a backend running FORCE_ENGLISH=0 and RAG_ALLOW_FINNISH=1 for the whole
Poro deployment. Two contract cases failed permanently on correct behaviour.

A permanently-red case is worse than a missing one. It cannot go red for a real
reason, and these two sat next to a third failure that was real, which made the
whole battery easy to wave away.

These tests are about the harness, not the backend. They need no stack.
"""

from __future__ import annotations

import pytest

from evals import acceptance


@pytest.fixture(autouse=True)
def _restore_policy():
    """Every case here mutates module-level policy state; put it back."""
    yield
    acceptance.set_language_policy(None)


def _result(text: str) -> acceptance.Result:
    return acceptance.Result(status=200, text=text, sources=["projects/portfolio.md"])


FINNISH_ANSWER = (
    "Mikko on rakentanut portfolio-sivuston Astro-kehyksellä ja Three.js-grafiikalla, "
    "ja se sisältää useita projekteja sekä paikallisen RAG-haun."
)
ENGLISH_ANSWER = (
    "Mikko has built a portfolio site with Astro and Three.js, and it hosts several "
    "projects alongside a local RAG search."
)


class TestPolicyDetection:
    def test_force_english_on_means_english(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("FORCE_ENGLISH", "true")
        monkeypatch.setenv("RAG_ALLOW_FINNISH", "true")
        assert acceptance.deployed_answers_finnish() is False

    def test_allow_finnish_off_means_english(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("FORCE_ENGLISH", "false")
        monkeypatch.setenv("RAG_ALLOW_FINNISH", "false")
        assert acceptance.deployed_answers_finnish() is False

    def test_the_deployed_combination_means_finnish(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The live config since the Poro deployment, and the one the old default
        # got wrong.
        monkeypatch.setenv("FORCE_ENGLISH", "false")
        monkeypatch.setenv("RAG_ALLOW_FINNISH", "true")
        assert acceptance.deployed_answers_finnish() is True

    def test_an_explicit_override_beats_detection(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("FORCE_ENGLISH", "true")
        monkeypatch.setenv("RAG_ALLOW_FINNISH", "false")
        acceptance.set_language_policy(True)
        assert acceptance.answers_finnish() is True
        acceptance.set_language_policy(None)
        assert acceptance.answers_finnish() is False


class TestTheCaseFollowsThePolicy:
    """The regression itself: the same answer, graded against both policies."""

    def test_a_finnish_answer_passes_when_the_deployment_answers_finnish(self) -> None:
        acceptance.set_language_policy(True)
        check = acceptance._language_matched_check("portfolio", "astro", "three")
        ok, note = check(_result(FINNISH_ANSWER))
        assert ok, note

    def test_the_same_finnish_answer_fails_under_force_english(self) -> None:
        # Guards the guard. If this passed too, the case would be asserting
        # nothing about language at all and the fix would be cosmetic.
        acceptance.set_language_policy(False)
        check = acceptance._language_matched_check("portfolio", "astro", "three")
        ok, note = check(_result(FINNISH_ANSWER))
        assert not ok
        assert "not in Finnish" in note or "must be English" in note

    def test_an_english_answer_passes_under_force_english(self) -> None:
        acceptance.set_language_policy(False)
        check = acceptance._language_matched_check("portfolio", "astro", "three")
        ok, note = check(_result(ENGLISH_ANSWER))
        assert ok, note

    def test_an_english_answer_fails_when_finnish_is_expected(self) -> None:
        acceptance.set_language_policy(True)
        check = acceptance._language_matched_check("portfolio", "astro", "three")
        ok, _ = check(_result(ENGLISH_ANSWER))
        assert not ok


class TestVagueGrounding:
    """The second permanently-red case, stale in a way language alone does not
    explain: its grounding terms were auth-token vocabulary from before this
    corpus grew token-COST research."""

    # Quoted from a live answer that the old check failed. It names the real
    # paper, the real finding and its date, which is precisely groundedness.
    REAL_GROUNDED_FINNISH = (
        "Kysymyksesi koskee token-tutkimusta, joka liittyy työhöni Claude Code "
        "-projektissa. Tutkin, miten halpa agentti maksaa itsensä takaisin. Tein "
        "seitsemän delegaation mittauksen ja julkaisin tutkimuksen heinäkuussa 2026."
    )

    def test_a_grounded_finnish_answer_passes(self) -> None:
        ok, note = acceptance._check_vague_grounded(_result(self.REAL_GROUNDED_FINNISH))
        assert ok, note

    def test_a_general_knowledge_blurb_still_fails(self) -> None:
        # The property the case exists for, kept intact. Fluent, on-topic, and
        # grounded in nothing this corpus contains.
        blurb = (
            "Tokens are the units a language model reads and writes. Most models "
            "split text into subwords, and pricing is usually quoted per million "
            "tokens. Shorter prompts therefore cost less to run than longer ones, "
            "and context windows are measured the same way."
        )
        ok, note = acceptance._check_vague_grounded(_result(blurb))
        assert not ok, note

    def test_an_english_grounded_answer_still_passes(self) -> None:
        english = (
            "Mikko measured seven delegations to the cheap agents and published the "
            "result; three of seven caught something he had missed."
        )
        ok, note = acceptance._check_vague_grounded(_result(english))
        assert ok, note
