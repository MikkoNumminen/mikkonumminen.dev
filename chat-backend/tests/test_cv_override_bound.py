"""
The CV-intent override, and how far a visitor can push it.

`pipeline` skips the relevance gate when the CV route fires and cv.md is in
context. The comment above it used to say "off-corpus questions never trip the CV
route, so they keep full gate protection". That is false, and measurably so:
`wants_cv` matches the bare token "cv", so inserting three characters into any
question trips the route and drags cv.md into the context. All five off-corpus
questions probed against the live corpus did exactly that.

WHAT THE PROBE ACTUALLY SHOWED, which is not what I first assumed. Two questions
flipped from a deterministic refusal to an answer when the token was inserted:

    question                          wants_cv  prose    gate
    who won the world cup in 1998     False     0.4519   refuse
    who won the cv world cup in 1998  True      0.4406   pass
    what time is it in New York       False     0.4871   refuse
    what time is it in cv New York    True      0.4434   pass

The gate PASSED on both laced questions, so the override was never consulted.
The flips are caused by retrieval: pulling cv.md into context lowers the prose
anchor below the threshold, and the gate then passes by its own rule. In all ten
probes the override was reachable and never load-bearing.

So this bound closes a hole that is REACHABLE BUT UNEXERCISED: any visitor can
trip the CV route on any question, and an unbounded override would then skip the
gate at any distance. It does NOT close the flips above, which have a different
cause and are filed with the live containment failures.

The override exists to rescue a question that STRADDLES the threshold: a
second-person phrasing ("what work experience do YOU have?") embeds around 0.47
against a 0.45 gate. The slack is sized to cover that and no more.

Pure-function tests on the bound. The retrieval numbers came from a probe run
against the live stack through `evals.production_retrieval`, so they are the
production call rather than a replica.
"""

from __future__ import annotations

from app.guardrails import prose_anchor
from app.pipeline import CV_OVERRIDE_SLACK, _within_cv_override_slack
from app.retrieval import RetrievedChunk

THRESHOLD = 0.45


def _chunk(
    distance: float, chunk_type: str = "prose", source: str = "cv.md"
) -> RetrievedChunk:
    return RetrievedChunk(
        source=source,
        title="t",
        project=None,
        content="c",
        distance=distance,
        chunk_type=chunk_type,
    )


class TestTheOverrideStillRescuesAStraddle:
    """The case it was built for must keep working, or this is a regression
    dressed as a security fix."""

    def test_the_second_person_phrasing_that_prompted_it(self) -> None:
        """MEASURED, and the margin is thin enough to be worth pinning.

        "what work experience do you have?" has a prose anchor of 0.4849 against
        the live corpus, with the gate at 0.45. The code comment used to say
        "~0.47", which is wrong in the dangerous direction: a slack of 0.03 reads
        as conservative and would refuse the exact question the override exists
        to answer. Of ten CV phrasings probed, this is the ONLY one the gate
        refuses on its own, so it is also the only one this bound can break.

        Tightening CV_OVERRIDE_SLACK below 0.035 fails here rather than silently
        turning a real question into a refusal.
        """
        assert _within_cv_override_slack([_chunk(0.4849)], THRESHOLD)

    def test_exactly_at_the_edge_of_the_slack(self) -> None:
        assert _within_cv_override_slack(
            [_chunk(THRESHOLD + CV_OVERRIDE_SLACK)], THRESHOLD
        )

    def test_a_comfortably_relevant_question(self) -> None:
        assert _within_cv_override_slack([_chunk(0.20)], THRESHOLD)


class TestTheOverrideCannotDisableTheGate:
    def test_just_past_the_slack(self) -> None:
        assert not _within_cv_override_slack(
            [_chunk(THRESHOLD + CV_OVERRIDE_SLACK + 0.001)], THRESHOLD
        )

    def test_a_genuinely_distant_question_is_refused(self) -> None:
        assert not _within_cv_override_slack([_chunk(0.60)], THRESHOLD)

    def test_the_bound_does_not_reach_the_plain_off_corpus_distances(self) -> None:
        """HONEST SCOPE. 0.4871 is what "what time is it in New York" produced,
        and it sits INSIDE the slack: this bound would not have refused it. Said
        out loud because the tempting claim is that bounding the override fixes
        the flips the probe found, and it does not. Those come from retrieval
        moving the anchor, not from the override firing."""
        assert _within_cv_override_slack([_chunk(0.4871)], THRESHOLD)

    def test_no_chunks_is_never_a_rescue(self) -> None:
        """An empty retrieval is the strongest possible signal that nothing was
        found. CV intent must not turn it into an answer."""
        assert not _within_cv_override_slack([], THRESHOLD)


class TestItAnchorsOnTheSameThingTheGateDoes:
    """They cannot disagree, because there is now ONE definition:
    `guardrails.prose_anchor`, used by the gate, by this slack check, and by the
    request log. It was three separate copies for a while, which is how the log
    ended up reporting a distance the gate never looked at."""

    def test_prose_wins_over_a_closer_code_chunk(self) -> None:
        chunks = [_chunk(0.30, chunk_type="code", source="code/x.py"), _chunk(0.47)]
        assert prose_anchor(chunks) == 0.47

    def test_falls_back_to_all_chunks_when_no_prose_was_retrieved(self) -> None:
        chunks = [_chunk(0.30, chunk_type="code", source="code/x.py")]
        assert prose_anchor(chunks) == 0.30

    def test_the_slack_check_uses_theprose_anchor(self) -> None:
        """A close code chunk must not smuggle an off-corpus question inside the
        slack, which is the same reason the gate itself anchors on prose."""
        chunks = [_chunk(0.10, chunk_type="code", source="code/x.py"), _chunk(0.90)]
        assert not _within_cv_override_slack(chunks, THRESHOLD)

    def test_empty_retrieval_has_no_anchor(self) -> None:
        assert prose_anchor([]) is None
