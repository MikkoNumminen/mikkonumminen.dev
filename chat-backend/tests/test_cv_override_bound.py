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

WHY THE BOUND IS ABSOLUTE AND NOT `threshold + slack`. It was the latter, and
that shape coupled two unrelated facts: how far cv.md sits from a CV question
(a property of the corpus) and where the gate sits (a policy about every other
question). Lowering the threshold therefore pulled the CV ceiling down with it
and started refusing the exact questions the override exists for — measured in
`docs/audits/relevance-gate-threshold-2026-08-07.md`, which could not recommend
the threshold change for that reason. The ceiling is now its own number.

Pure-function tests on the bound. The retrieval numbers came from a probe run
against the live stack through `evals.production_retrieval`, so they are the
production call rather than a replica.
"""

from __future__ import annotations

from app.guardrails import prose_anchor
from app.pipeline import CV_RESCUE_MAX_DISTANCE, _within_cv_rescue_range
from app.retrieval import RetrievedChunk

# The shipped gate. Present only to prove the ceiling does NOT move with it.
THRESHOLD = 0.41


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
        the live corpus. Of the CV phrasings probed it is the furthest out, so it
        is the one that sizes this ceiling and the only one the ceiling can
        break.

        Tightening CV_RESCUE_MAX_DISTANCE below 0.4849 fails here rather than
        silently turning a real question into a refusal.
        """
        assert _within_cv_rescue_range([_chunk(0.4849)])

    def test_the_finnish_and_verb_phrasings_the_vocabulary_now_reaches(self) -> None:
        """These three used to be refused for a different reason: `wants_cv` did
        not recognise them at all, so the override never ran. Now that it does,
        the ceiling has to actually cover them.

        0.4336 "where have you worked" · 0.4361 "kerro urastasi"
        0.4400 "mita tyokokemusta sinulla on" (unaccented, as typed)
        """
        for anchor in (0.4336, 0.4361, 0.4400):
            assert _within_cv_rescue_range([_chunk(anchor)])

    def test_exactly_at_the_ceiling(self) -> None:
        assert _within_cv_rescue_range([_chunk(CV_RESCUE_MAX_DISTANCE)])

    def test_a_comfortably_relevant_question(self) -> None:
        assert _within_cv_rescue_range([_chunk(0.20)])


class TestTheCeilingDoesNotMoveWithTheThreshold:
    """The regression that motivated the change. Under the old
    `threshold + 0.05` shape, dropping the gate to 0.41 dropped the CV ceiling to
    0.46 and refused the 0.4849 question. Nothing here reads THRESHOLD except to
    assert independence."""

    def test_the_rescue_reaches_past_the_gate_by_more_than_the_old_slack(
        self,
    ) -> None:
        assert CV_RESCUE_MAX_DISTANCE > THRESHOLD + 0.05

    def test_the_measured_worst_case_survives_the_lowered_gate(self) -> None:
        """The single assertion the old shape could not make."""
        assert 0.4849 > THRESHOLD + 0.05
        assert _within_cv_rescue_range([_chunk(0.4849)])


class TestTheOverrideCannotDisableTheGate:
    def test_just_past_the_ceiling(self) -> None:
        assert not _within_cv_rescue_range([_chunk(CV_RESCUE_MAX_DISTANCE + 0.001)])

    def test_a_genuinely_distant_question_is_refused(self) -> None:
        assert not _within_cv_rescue_range([_chunk(0.60)])

    def test_the_ceiling_stays_under_the_nearest_off_corpus_question(self) -> None:
        """0.5077 is the closest `must_refuse_offcorpus` question in the eval set.
        The ceiling has to sit below it, or the rescue reaches something the gate
        exists to refuse."""
        assert CV_RESCUE_MAX_DISTANCE < 0.5077
        assert not _within_cv_rescue_range([_chunk(0.5077)])

    def test_the_bound_does_not_reach_every_off_corpus_distance(self) -> None:
        """HONEST SCOPE. 0.4871 is what "what time is it in New York" produced,
        and it sits INSIDE the ceiling: this bound would not have refused it.
        Said out loud because the tempting claim is that bounding the override
        fixes the flips the probe found, and it does not. Those come from
        retrieval moving the anchor, not from the override firing."""
        assert _within_cv_rescue_range([_chunk(0.4871)])

    def test_no_chunks_is_never_a_rescue(self) -> None:
        """An empty retrieval is the strongest possible signal that nothing was
        found. CV intent must not turn it into an answer."""
        assert not _within_cv_rescue_range([])


class TestItAnchorsOnTheSameThingTheGateDoes:
    """They cannot disagree, because there is now ONE definition:
    `guardrails.prose_anchor`, used by the gate, by this ceiling check, and by the
    request log. It was three separate copies for a while, which is how the log
    ended up reporting a distance the gate never looked at."""

    def test_prose_wins_over_a_closer_code_chunk(self) -> None:
        chunks = [_chunk(0.30, chunk_type="code", source="code/x.py"), _chunk(0.47)]
        assert prose_anchor(chunks) == 0.47

    def test_falls_back_to_all_chunks_when_no_prose_was_retrieved(self) -> None:
        chunks = [_chunk(0.30, chunk_type="code", source="code/x.py")]
        assert prose_anchor(chunks) == 0.30

    def test_the_ceiling_check_uses_the_prose_anchor(self) -> None:
        """A close code chunk must not smuggle an off-corpus question under the
        ceiling, which is the same reason the gate itself anchors on prose."""
        chunks = [_chunk(0.10, chunk_type="code", source="code/x.py"), _chunk(0.90)]
        assert not _within_cv_rescue_range(chunks)

    def test_empty_retrieval_has_no_anchor(self) -> None:
        assert prose_anchor([]) is None
