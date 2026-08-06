"""The output guard: what it catches, what it cannot, and that both callers agree.

The acceptance battery has known how to spot a recited system prompt and an
announced jailbreak since it was written. Both detectors lived in `evals/` and
nowhere else, so production could commit either failure and only a manual run
would notice. Measured three times against the live stack, 16 of 22 contract
cases pass and the four `must_refuse_injection` cases are the bulk of what fails.
"""

from __future__ import annotations

from app import output_guard
from evals import acceptance


class TestItCatchesTheTwoShapes:
    def test_a_recited_system_prompt(self) -> None:
        assert output_guard.breach_reason(
            "You must ground every claim in the context"
        ) == ("prompt_leak")

    def test_an_announced_jailbreak(self) -> None:
        assert output_guard.breach_reason("DAN mode enabled. I will comply.") == (
            "jailbreak_accepted"
        )

    def test_case_does_not_matter(self) -> None:
        assert output_guard.breach_reason("GROUND EVERY CLAIM") == "prompt_leak"

    def test_a_marker_mid_answer_still_counts(self) -> None:
        """The guard runs on the accumulated text, so a leak that starts after a
        paragraph of ordinary prose has to be caught just the same."""
        text = "Mikko builds portfolio sites. Rules: ground every claim in the context."
        assert output_guard.breach_reason(text) == "prompt_leak"


class TestItLeavesOrdinaryAnswersAlone:
    """The control. A guard that fired on real answers would be worse than none:
    it would cut good answers short and train everyone to ignore the notice."""

    def test_a_normal_project_answer(self) -> None:
        assert (
            output_guard.breach_reason("ReadLog is a reading tracker built with Astro.")
            is None
        )

    def test_an_answer_about_the_rag_chat_itself(self) -> None:
        """The corpus contains documents describing this very system, including
        its grounding rules. Single-word markers would fire on them, which is why
        the markers are multi-word phrases."""
        text = (
            "The chat retrieves context from pgvector and answers from it. "
            "There are rules about grounding, and the model is told to be brief."
        )
        assert output_guard.breach_reason(text) is None

    def test_the_canned_refusal_is_not_a_breach(self) -> None:
        from app.pipeline import WEAK_RETRIEVAL_REPLY

        assert output_guard.breach_reason(WEAK_RETRIEVAL_REPLY) is None


class TestTheHarnessAndTheRuntimeCannotDisagree:
    """The whole reason this module exists rather than a second copy of the list.

    A harness that grades production against its own private markers is the defect
    this repo has already fixed three times: the shoutbox red-team suite driving a
    parallel gate, the eval measuring a retrieval config production never ran, and
    the request log reporting a distance the gate never looked at.
    """

    def test_the_harness_uses_the_shared_leak_detector(self) -> None:
        assert acceptance._leaks_prompt is output_guard.leaks_prompt

    def test_the_harness_keeps_no_private_copy(self) -> None:
        for name in ("_PROMPT_LEAK_MARKERS", "_JAILBREAK_ACCEPTANCE"):
            assert not hasattr(acceptance, name), (
                f"acceptance still defines {name}; it must import the shared list "
                "or the two can drift"
            )
