"""The recency CLAIM must not be made about research the corpus never did.

`is_research_coverage_request` stays deliberately topic-permissive (it fires on
"latest research on quantum computing" too — see
test_query_projects.test_research_coverage_is_deliberately_topic_permissive), so
the newest posts are still injected on an off-corpus ask. What must NOT survive is
the deterministic note asserting "Mikko's most recent research is <post>": with it,
an 8B model welded a bridge to the asked-about topic (measured live — the Poro post
"mentions AI-native development including quantum computing"; it does not). Without
it, the same query hedged correctly. These tests pin the claim gate, not the intent.
"""

from __future__ import annotations

import pytest

from app.query_projects import (
    is_research_coverage_request,
    names_offcorpus_research_topic,
)

# --- MUST CLAIM: genuine topic-less sweeps (EN) ---
_GENUINE_EN = [
    "what is Mikko's latest research",
    "tell me about the newest findings",
    "what research has Mikko published",
    "show me his experiments",
    "any recent benchmarks?",
    "what are his latest measurements",
]

# --- MUST CLAIM: genuine sweeps carrying ORDINARY FRAMING VOCABULARY ---
# The load-bearing set. A veto that reasons about whether it RECOGNISES words like
# "key"/"shown"/"interesting"/"learn" collapses here, because English framing
# vocabulary is unbounded. This rule never consults them: no preposition binds a
# subject, so it never engages at all.
_GENUINE_FRAMING = [
    "what are the key findings",
    "what has your research shown",
    "any interesting findings?",
    "what did you learn from the research",
    "what are the main takeaways from your research",
    "tell me your most important findings",
    "what research stands out",
    "walk me through your experiments",
    "what research are you most proud of",
    "how did the experiments turn out",
    "what were your biggest findings",
    "can you summarise the research briefly",
]

# --- MUST CLAIM: genuine, on-corpus ---
# tests/test_pipeline.py::test_coverage_footer_fires_and_offer_stands_down depends
# on this one end-to-end.
_GENUINE_ON_CORPUS = [
    "what research has gone into the rag chat",
    "what research is in your portfolio",
]

# --- MUST CLAIM: Finnish / Swedish, single-line (no translation happened) ---
# Finnish carries no marker the veto can read, so the rule cannot engage — which is
# exactly how the copula trap is avoided. "mitkä tutkimukset on julkaistu" is a
# GENUINE sweep whose "on" means "have been", and it survives because the rule never
# looks at a Finnish line, not because a language flag happened to be right.
_GENUINE_NORDIC = [
    "kerro jotain mikon viimeisimmista tutkimuksista",
    "mita tutkimuksia mikko on tehnyt",
    "mitka tutkimukset on julkaistu",
    "mikon uusimmat tutkimukset",
    "vad ar Mikkos senaste forskning",
    # Accented forms, as a live browser actually sends them.
    "kerro jotain mikon viimeisimmistä tutkimuksista",
    "mitkä tutkimukset on julkaistu",
    "mitä tutkimuksia mikko on tehnyt",
]

# --- MUST CLAIM: translated pairs (the real retrieval input shape) ---
# "<english translation>\n<finnish original>". The Finnish copula sits on line 2 and
# must never bind a marker on line 1.
_GENUINE_PAIRS = [
    "what is Mikko's latest research\nkerro jotain mikon viimeisimmista tutkimuksista",
    "which studies have been published\nmitka tutkimukset on julkaistu",
]

# --- MUST NOT CLAIM: an off-corpus subject is named ---
_OFFCORPUS = [
    "what is the latest research on quantum computing",
    "latest research on CRISPR gene editing",
    "latest research on climate change",
    "recent findings on dark matter",
    "what's the newest research about protein folding",
]

# --- MUST NOT CLAIM: off-corpus subjects that are ordinary English words ---
# Regression guards. A rule that vetoes on "is this token unknown vocabulary?" lets
# every one of these through, because 'love'/'running'/'news'/'work' are perfectly
# well-known words. Only the subject slot is looked up, and only against Mikko's own
# closed alias set, so 'love' and 'climate' are treated identically.
_OFFCORPUS_ORDINARY_WORDS = [
    "latest research on love",
    "recent research on running",
    "what is the latest research on the news",
    "latest research on work",
    "latest research on IQ",
]

# --- MUST NOT CLAIM: off-corpus translated pairs ---
# Containment for Finnish input rides ENTIRELY on the English line: English grammar
# REQUIRES a preposition where Finnish uses a case ending ("...ilmastonmuutoksesta"
# -> "research about climate change"), so the translation reliably materialises the
# structure this rule reads.
_OFFCORPUS_PAIRS = [
    "what is the latest research on climate change"
    "\nviimeisin tutkimus ilmastonmuutoksesta",
    "latest research on quantum computers"
    "\nmita tuoreinta tutkimusta on kvanttitietokoneista",
]

# --- MUST NOT CLAIM: the reported bug with a longer verb phrase ---
# The live bug's own class, with the preposition pushed out to marker+4. A tighter
# scan window leaks exactly these.
_OFFCORPUS_LONG_VERB = [
    "what research have you done on quantum computing",
    "what research has Mikko published on climate change",
    "what research has been done on quantum computing",
    "what research did Mikko do on dark matter",
    "vilken forskning har du gjort om klimatförändringar",
]

# --- MUST CLAIM: recency framing, which is what this feature exists to serve ---
# "in"/"for" are excluded from the preposition set precisely so these survive; there
# is no research marker inside "2026" for the genre exemption to catch.
_GENUINE_RECENCY_FRAMING = [
    "any findings in 2026",
    "any benchmarks in the last month",
    "what research came out in 2025",
    "any interesting findings in the last year",
    "what are the key findings in your work",
    "what research stands out for you",
    "can you summarise the research briefly for me",
]

# --- MUST CLAIM: the subject slot names no outside subject ---
_GENUINE_EXEMPT_SLOTS = [
    "any findings on this",  # deictic: names no subject
    "what are your findings on the experiments",  # genre self-reference
    "what research went into building the chat",  # subject IS a corpus project
    "what research has Mikko done on RAG",  # a topic the corpus covers
]


@pytest.mark.parametrize(
    "query",
    _GENUINE_EN
    + _GENUINE_FRAMING
    + _GENUINE_ON_CORPUS
    + _GENUINE_NORDIC
    + _GENUINE_PAIRS
    + _GENUINE_RECENCY_FRAMING
    + _GENUINE_EXEMPT_SLOTS,
)
def test_genuine_sweep_may_claim_recency(query: str) -> None:
    assert not names_offcorpus_research_topic(query)


@pytest.mark.parametrize(
    "query",
    _OFFCORPUS + _OFFCORPUS_ORDINARY_WORDS + _OFFCORPUS_PAIRS + _OFFCORPUS_LONG_VERB,
)
def test_offcorpus_subject_may_not_claim_recency(query: str) -> None:
    assert names_offcorpus_research_topic(query)


@pytest.mark.parametrize(
    "query",
    _GENUINE_EN
    + _GENUINE_FRAMING
    + _GENUINE_ON_CORPUS
    + _GENUINE_NORDIC
    + _GENUINE_PAIRS,
)
def test_genuine_sweep_still_fires_the_coverage_intent(query: str) -> None:
    # The claim gate must not have quietly narrowed the intent it gates.
    assert is_research_coverage_request(query)


@pytest.mark.parametrize(
    "query", _OFFCORPUS + _OFFCORPUS_ORDINARY_WORDS + _OFFCORPUS_PAIRS
)
def test_offcorpus_query_still_injects_the_posts(query: str) -> None:
    # The intent stays permissive ON PURPOSE: injection alone was measured harmless
    # (the model hedged correctly), and the posts keep the retrieval gate anchored.
    # Only the claim is withheld.
    assert is_research_coverage_request(query)


@pytest.mark.parametrize(
    "query",
    [
        "how did you research the HRM domain model?",  # names another project
        "where did Mikko study?",  # CV/bio, not research
        "tell me about the projects",  # no research marker at all
    ],
)
def test_non_sweep_queries_never_reach_the_claim(query: str) -> None:
    assert not is_research_coverage_request(query)


def test_finnish_copula_after_the_marker_is_never_read_as_a_preposition() -> None:
    # "mitkä tutkimukset ON julkaistu" = "which studies HAVE BEEN published" — a
    # GENUINE sweep whose "on" sits immediately after the research marker. This is
    # structural, not luck: the veto's marker list carries no Finnish stem, so the
    # scan never enters and the copula is unreachable. Pinned directly, with no
    # language argument in sight — there is nothing to pass, and that is the point.
    assert not names_offcorpus_research_topic("mitkä tutkimukset on julkaistu")
    assert not names_offcorpus_research_topic(
        "which studies have been published\nmitkä tutkimukset on julkaistu"
    )


def test_untranslated_finnish_offcorpus_falls_back_to_todays_behaviour() -> None:
    # Documented, accepted asymmetry. Finnish marks its topic by case ending, so
    # with no English line there is no preposition to bind and the veto disengages:
    # the off-corpus ask claims, exactly as it does today. Failing toward today's
    # behaviour is acceptable here; false-vetoing a genuine Finnish sweep is not,
    # and that is the trade this direction buys.
    assert not names_offcorpus_research_topic("viimeisin tutkimus ilmastonmuutoksesta")


def test_premodified_topic_is_a_known_open_hole() -> None:
    # "latest quantum computing research" binds its topic with no preposition, so
    # the rule cannot see it and the claim stands (= today's behaviour, not a
    # regression). The obvious guard — veto on any word between "latest" and the
    # marker — was measured to destroy the genuine sweeps above, which is the whole
    # reason this design reads grammar instead of vocabulary. Pinned so a future
    # change to this verdict is a deliberate decision rather than a surprise.
    assert not names_offcorpus_research_topic("latest quantum computing research")


@pytest.mark.parametrize(
    "text",
    [
        "recent findings on dark matter experiments",
        "latest research on quantum computing experiments",
        "latest research on fusion experiments",
        "what is the latest research on LHC experiments",
        "latest research on CRISPR experiments",
        "latest research on climate measurements",
        "recent research on GPU benchmarks",
    ],
)
def test_a_genre_noun_in_the_tail_does_not_disarm_the_veto(text: str) -> None:
    # An off-corpus subject trailed by ONE research-genre noun ("...quantum computing
    # EXPERIMENTS") used to escape: the genre check scanned the whole subject and any
    # single hit disarmed it, so detect_projects was never consulted. This is the live
    # bug's own class, rescued by a trailing noun — natural phrasing in every science
    # domain. The subject earns the genre reading only if EVERY token qualifies.
    assert names_offcorpus_research_topic(text)


@pytest.mark.parametrize(
    "text",
    [
        "what research have you been working on lately",
        "what research have you worked on recently",
        "what research are you working on now",
        "what experiments have you been working on lately",
        "what findings have you landed on so far",
        "what research did you settle on in the end",
        "what research have you been working on this year",
        "what experiments are you working on currently",
        "what research is on your blog",
        "what research have you published on your site",
        "what findings have you written up on the blog",
        "what research have you been working on lately\n"
        "mita tutkimuksia olet tehnyt viime aikoina",
    ],
)
def test_a_stranded_preposition_binds_no_subject(text: str) -> None:
    # English fronts the object ("WHAT RESEARCH have you been working ON lately"),
    # leaving the preposition bound to the verb and to nothing else. Reading its tail
    # as a subject vetoed these genuine sweeps — the recall collapse that killed the
    # previous design, arriving by a different route. The tail decides, not the
    # distance: an adverbial or a pointer at Mikko's own site names no outside subject.
    assert not names_offcorpus_research_topic(text)
