"""Tests for the retrieval-strength guardrail."""

from __future__ import annotations

import unicodedata

import pytest

from app.guardrails import (
    EXPANSION_OFFER,
    GENERATIVE_REPLY,
    WEAK_RETRIEVAL_REPLY,
    answer_language,
    is_expansion_request,
    is_generative_request,
    is_personal_trivia,
    is_translation_request,
    is_weak_retrieval,
    looks_finnish,
    looks_non_english,
    research_coverage_footer,
    smalltalk_route,
    unsupported_years,
)
from app.retrieval import RetrievedChunk


@pytest.mark.parametrize(
    "query",
    [
        "hi",
        "Hello!",
        "hey there",
        "moi",
        "Good Morning",
        "huomenta",
        "what can you do",
        "kuka olet",
        "help",
    ],
)
def test_smalltalk_route_greeting(query: str) -> None:
    assert smalltalk_route(query) == "greeting"


@pytest.mark.parametrize("query", ["thanks", "Thanks!", "thank you", "kiitos", "cheers"])
def test_smalltalk_route_courtesy(query: str) -> None:
    assert smalltalk_route(query) == "courtesy"


@pytest.mark.parametrize(
    "query",
    [
        "what is HRM",
        "hi, how does your retrieval work",  # opens with a greeting, real question
        "hi how does retrieval work",  # no comma — whole-message match, not prefix
        "thanks, but how do I run the indexer",  # opens with thanks, real question
        "tell me about hrm",
        "moikka, mitä kuuluu projekteille",  # FI greeting + real question
    ],
)
def test_smalltalk_route_none_for_real_questions(query: str) -> None:
    assert smalltalk_route(query) is None


@pytest.mark.parametrize("query", ["kerro lisää", "entä muut projektit", "berätta mer"])
def test_looks_non_english_true_for_finnish_swedish(query: str) -> None:
    assert looks_non_english(query)


@pytest.mark.parametrize(
    "query", ["tell me more", "what is HRM?", "how does ReadLog .NET work"]
)
def test_looks_non_english_false_for_ascii_english(query: str) -> None:
    assert not looks_non_english(query)


@pytest.mark.parametrize(
    "text",
    [
        # regression fixtures carried over from the hand-tuned heuristic era —
        # every case some earlier router version routed to English
        "Miten HRM pitää käyttöoikeudet ajan tasalla, ja mikä on kompromissi?",
        "Mitkä projektit käyttävät PostgreSQL:ää, ja onko jokin joka valitsi toisin?",
        "kerro jotain projekteista",
        "Kerro projekteista tarkemmin.",
        "Miten HRM:n nopeudenrajoitin estää kahden samanaikaisen pyynnön race "
        "conditionin ilman Redistä?",
        "Kysymys tiedostossa mainituista projekteista",
        "Miten tämä chat toimii?",
        "Onko projekteja?",
        "Onko demoja?",
        "onko esimerkkejä",
        # the terse live-query class the heuristic couldn't reach at all (1/12) —
        # the reason it was replaced with statistical language ID
        "Työkokemus?",
        "Listaa projektit",
        "Kirjoita runo.",
        "Mitä osaat?",
        "Kuka olet?",
        "Koulutus?",
        "Yhteystiedot?",
        "Kerro itsestäsi",
        # code-shaped tokens are language-neutral, but their n-grams drag
        # statistical ID off Finnish (measured live 2026-07-10: the first of
        # these read as SWEDISH and was answered in English) — detection
        # retries with identifiers stripped
        "kerro exportMyData funktiosta",
        "kerro chunk_markdown funktiosta",
        "mita exportMyData tekee",
        "kerro AudiobookMakerista",
        "kerro scripts/export.js tiedostosta",
        "kerro gdpr-actions.ts tiedostosta",
        "kerro login-streak.ts logiikasta",
        # bare kebab ("chat-backend") is NOT stripped — prose in all three
        # languages hyphenates — so this must hold via raw detection
        "kerro chat-backend arkkitehtuurista",
        # identifier segments must not feed the English function-word override
        # ("not" + "from" here are identifier parts, not words)
        "kerro mission_not_completed ja from_dict funktioista",
    ],
)
def test_looks_finnish_true_for_finnish(text: str) -> None:
    assert looks_finnish(text)


@pytest.mark.parametrize(
    "text",
    [
        "How does HRM keep JWT permissions fresh without a database round-trip?",
        "What TTS engines does AudiobookMaker use, and does it clone voices?",
        # English with Finnish-looking word tails must not read as Finnish
        "does the vanilla installer work offline?",
        "that umbrella fella again",
        "is the demo based on a margarita recipe",
        # Swedish is a detector candidate precisely so it lands on SWEDISH,
        # never on its look-alike neighbour Finnish
        "berätta mer om projekten",
        # terse English stays English
        "Projects?",
        "Skills?",
        "Any demos?",
        "Work experience?",
        # name-dense English: Finnish proper nouns tip the statistical detector
        # to Finnish; the English function-word override settles it (the
        # measured employer-en baseline case)
        "What did Mikko do at Kasvu Labs?",
        "How did Mikko build Spacepotatis and AudiobookMaker?",
        # English questions about the same identifiers must stay English,
        # whichever layer decides them (function-word override or detection
        # on the stripped text)
        "explain the exportMyData function",
        "does exportMyData work offline?",
        "how does chunk_markdown work",
        # bare hyphenated compounds are ordinary English prose, never stripped
        "does real-time sync work offline?",
        # the override still fires when the function words are real words, not
        # identifier segments
        "what is mission_not_completed and from_dict",
    ],
)
def test_looks_finnish_false_for_english(text: str) -> None:
    assert not looks_finnish(text)


def test_looks_finnish_bare_identifier_defaults_to_english() -> None:
    # A lone identifier carries no natural language — stripping leaves nothing
    # to identify, so the English default stands.
    assert looks_finnish("exportMyData?") is False


def test_english_override_needs_two_function_words() -> None:
    # one incidental English word inside Finnish must not flip the language
    assert looks_finnish("Mitä teknologioita the HRM käyttää?")


def test_looks_finnish_too_short_to_identify_defaults_to_english() -> None:
    # Below 4 letters language ID is guesswork ("ok" reads as Finnish to the
    # detector) — such messages are small-talk, answered in English by the
    # fast path, so routing must agree and default to English.
    assert looks_finnish("ok") is False
    assert looks_finnish("np!") is False


@pytest.mark.parametrize(
    "query",
    [
        "yes",
        "yes please",
        "tell me more",
        "more",
        "go deeper",
        "go on",
        "go ahead",
        "keep going",
        "deeper",
        "the rest",
        "continue",
        "elaborate",
        "Tell me more.",
        "and?",
    ],
)
def test_is_expansion_request_matches_topic_less_followups(query: str) -> None:
    assert is_expansion_request(query)


@pytest.mark.parametrize(
    "query",
    [
        "tell me more about HRM",  # carries a NEW topic -> a normal question
        "what is HRM",
        "how does the Finnish normalizer work",
        "more tests in HRM",
        "explain the SERIALIZABLE transaction",
    ],
)
def test_is_expansion_request_ignores_topic_bearing_questions(query: str) -> None:
    assert not is_expansion_request(query)


@pytest.mark.parametrize(
    "query",
    [
        # The exact messages a visitor sent on 2026-07-30 and got refused, from
        # rag-logs/requests.jsonl. The backend had just offered, in Finnish,
        # "Haluatko, että kerron lisää?" — and then could not read the answer.
        "Kerro lisää",
        "kerro lisää",
        "Joo",
        # Natural variants of the same intent.
        "juu",
        "kyllä",
        "jatka",
        "lisää",
        "enemmän",
        "kerro",
        "kerro enemmän",
        "kerro lisää siitä",
        "joo kiitos",
        "jatka vielä",
        "loput",
        "haluan kuulla lisää",
        "Kerro lisää.",
    ],
)
def test_is_expansion_request_matches_finnish_followups(query: str) -> None:
    assert is_expansion_request(query)


@pytest.mark.parametrize(
    "query",
    [
        # A Finnish message that CARRIES a topic is a normal question, not an
        # expansion — the topic comes from the message, not from memory. These
        # are the false positives that would hijack a real question and answer it
        # from the previous turn's narrative instead.
        "kerro projekteista",
        "kerro hrm:stä",
        "kerro lisää audiobookmakerista",
        "kerro space potatiksesta",
        "mitä kieliä projekteissa käytetään",
        "jatka HRM:n kuvausta",
        "lisää tietoa Spacepotatiksesta",
        "mikä projekti on monimutkaisin",
    ],
)
def test_is_expansion_request_ignores_finnish_topic_bearing_questions(query: str) -> None:
    assert not is_expansion_request(query)


@pytest.mark.parametrize(
    "query",
    [
        # Each language pairs with its OWN filler. A merged filler group let an
        # English trigger take a Finnish one — a sentence in neither language,
        # matched purely by construction.
        "sure lisää",
        "yes enemmän",
        "okay lisää",
        "tell lisää",
        "more lisää",
        "kerro more about it",
        "joo please",
    ],
)
def test_is_expansion_request_does_not_mix_languages(query: str) -> None:
    assert not is_expansion_request(query)


@pytest.mark.parametrize("query", ["selvä", "Selvä.", "selvä kiitos"])
def test_selva_is_not_an_expansion_request(query: str) -> None:
    """`selvä` reads as "right / understood" — someone signing off, not asking
    for more. English "ok" answering an offer reads as consent; this does not.
    Honouring it would re-dump a whole narrative at a visitor who was done, and
    an unwanted wall of text is a worse failure than missing one phrasing."""
    assert not is_expansion_request(query)


def test_expansion_matches_regardless_of_unicode_normalisation() -> None:
    """`ä` arrives precomposed (U+00E4) or as a + combining diaeresis (U+0308),
    depending on the input path. They look identical on screen, so an unnormalised
    match would refuse a legitimate Finnish reply with nothing in the log to
    explain why — the exact failure this pattern exists to prevent."""
    for text in ("kyllä", "kerro lisää", "lisää"):
        nfc = unicodedata.normalize("NFC", text)
        nfd = unicodedata.normalize("NFD", text)
        assert nfc != nfd, f"{text!r} must differ between NFC and NFD to be a real test"
        assert is_expansion_request(nfc)
        assert is_expansion_request(nfd)


@pytest.mark.parametrize(
    "query", ["kerro tästä", "kerro siitä lisää", "tell me about it"]
)
def test_demonstrative_filler_is_intentionally_an_expansion(query: str) -> None:
    """ "tell me about it" / "kerro tästä" carry a PRONOUN, not a topic — the
    referent is the previous turn, which is exactly what an expansion resolves.
    Pinned so the behaviour reads as deliberate rather than accidental."""
    assert is_expansion_request(query)


def test_expansion_offer_is_a_nonempty_string() -> None:
    assert isinstance(EXPANSION_OFFER, str) and EXPANSION_OFFER.strip()


def _chunk(distance: float, chunk_type: str = "prose") -> RetrievedChunk:
    return RetrievedChunk(
        source="projects/hrm.md",
        title="HRM",
        project="hrm",
        content="x",
        distance=distance,
        chunk_type=chunk_type,
    )


def test_empty_retrieval_is_weak() -> None:
    assert is_weak_retrieval([], max_distance=0.7) is True


def test_close_chunk_is_not_weak() -> None:
    assert is_weak_retrieval([_chunk(0.2)], max_distance=0.7) is False


def test_all_far_chunks_is_weak() -> None:
    assert is_weak_retrieval([_chunk(0.8), _chunk(0.9)], max_distance=0.7) is True


def test_best_chunk_decides() -> None:
    # One close chunk among far ones is enough to NOT be weak.
    assert is_weak_retrieval([_chunk(0.9), _chunk(0.3)], max_distance=0.7) is False


def test_boundary_is_inclusive_of_relevant() -> None:
    # Exactly at the threshold is treated as relevant (only strictly beyond is weak).
    assert is_weak_retrieval([_chunk(0.7)], max_distance=0.7) is False


def test_gate_anchors_on_prose_not_a_near_code_chunk() -> None:
    # An off-topic query can land a near CODE chunk (0.3) while the prose is far
    # (0.8). At threshold 0.45 the gate must still refuse — it keys on the prose
    # distance (the honest relevance signal), not the stray code chunk.
    chunks = [_chunk(0.3, chunk_type="code"), _chunk(0.8, chunk_type="prose")]
    assert is_weak_retrieval(chunks, max_distance=0.45) is True


def test_gate_falls_back_to_all_chunks_when_no_prose() -> None:
    # A code-only retrieval (no prose at all) still works: the gate uses every
    # chunk, so a close code chunk keeps the query answerable.
    assert is_weak_retrieval([_chunk(0.3, chunk_type="code")], max_distance=0.45) is False


def test_refusal_reply_is_nonempty_and_points_to_help() -> None:
    assert WEAK_RETRIEVAL_REPLY
    assert "help" in WEAK_RETRIEVAL_REPLY


def test_generative_requests_are_declined() -> None:
    # Creative/generic writing asks — declined on the QUERY pattern, even when
    # they name an on-corpus topic the retrieval gate would let through.
    for q in (
        "write me a poem about Helsinki",
        "Write a poem about cats",
        "compose a song about ReadLog",
        "give me a joke",
        "can you make a haiku about Finland",
        "generate a short story set in space",
        "draft an essay on TTS",
        "write me a rap about audiobooks",
        # verbs the first cut missed
        "pen a poem",
        "tell me a joke",
        "sing me a song",
        "come up with a haiku",
        "make up a story",
        "recite a limerick",
        # adjectives between the determiner and the artefact
        "write me a funny poem",
        # VERB-LESS artefact requests (live: a real haiku was written)
        "a haiku about ReadLog please",
        "I want a poem about X",
        "can I get a poem about Mikko's work",
        "I'd like a limerick",
    ):
        assert is_generative_request(q) is True, q


def test_real_questions_are_not_generative() -> None:
    # Legitimate questions that share words with the gate must NOT trip it.
    for q in (
        "how does the Finnish text normalizer work?",
        "what's the story behind ReadLog?",
        "write a test for the chunker",  # 'test' is not a creative artefact
        "how do I create a new project?",
        "what song-playback library does strudel use?",
        "generate the build script — how is it set up?",
        "tell me about AudiobookMaker",
        # artefact words NOT anchored to a producing determiner (was a false decline)
        "give me an overview of the songs feature",
        "give a summary of the essays project",
        "how would you describe Spacepotatis",
        "tell me about the songs feature",
        # leading determiner + topic noun (NOT an artefact) — verb-less guard
        "a question about the songs feature",
        "an overview of the audio bus",
        "how does the normalizer work",
    ):
        assert is_generative_request(q) is False, q


def test_generative_reply_is_nonempty() -> None:
    assert GENERATIVE_REPLY


def test_translation_tasks_are_declined() -> None:
    # Translating text into a named language is a task, not a question — and the
    # portfolio's own i18n keeps a prose chunk close enough to defeat the gate.
    for q in (
        "translate hello to spanish",
        "Translate this to Finnish",
        "please translate good morning into french",
        "can you translate the readme to german",
        # paraphrases the leading-"translate" form missed (live leaks)
        "say good morning in finnish",
        "spanish word for hello",
        "how do you say hello in spanish",
        "french phrase for thank you",
        "how to say thanks in german",
    ):
        assert is_translation_request(q) is True, q


def test_translation_questions_are_not_declined() -> None:
    # Genuine questions about the portfolio's i18n must still answer.
    for q in (
        "how does the site translate to Finnish?",
        "what languages does the portfolio support",
        "does ReadLog translate book titles",
        "how is the translation pipeline built",
        # the reviewer's over-gating guards (bare "what is X in LANG" not added)
        "is the portfolio available in finnish",
        "what is the project in finnish locale about",
    ):
        assert is_translation_request(q) is False, q


@pytest.mark.parametrize(
    "query",
    [
        "kirjoita minulle runo Mikon projekteista",
        "keksi vitsi HRM:stä",
        "tee laulu Spacepotatiksesta",
        "sepitä tarina AudiobookMakerista",
    ],
)
def test_is_generative_request_finnish_creative_asks(query: str) -> None:
    assert is_generative_request(query)


@pytest.mark.parametrize(
    "query",
    [
        # "kerro" is a QUESTION verb here - the story of a project, not authoring
        "kerro tarina HRM:n takana",
        "kerro tarinasi",
        "mitä projekteja Mikolla on?",
        "miten Strudel-kappaleet on tehty?",
    ],
)
def test_is_generative_request_finnish_questions_pass(query: str) -> None:
    assert not is_generative_request(query)


def test_generative_fi_does_not_misfire_on_satunnainen() -> None:
    # 'satunnainen' (random) shares its first four letters with 'satu'
    # (fairy tale) - a review-caught false positive
    assert not is_generative_request("tee satunnainen haku projekteista")


def test_unsupported_years_flags_the_invented_range() -> None:
    # the live Kasvulabs case: context dates the employment 2022-2024, the
    # answer said 2019-2021
    out = unsupported_years(
        "Mikko työskenteli siellä vuosina 2019–2021.",
        ["**Kasvu Labs Oy** (2022–2024) — first paid programming role."],
    )
    assert out == ["2019", "2021"]


def test_unsupported_years_grounded_answer_is_clean() -> None:
    out = unsupported_years(
        "Kasvu Labs Oy:ssä vuosina 2022–2024.",
        ["**Kasvu Labs Oy** (2022–2024)."],
    )
    assert out == []


def test_unsupported_years_question_years_are_supported() -> None:
    # a year the visitor asked about may legitimately be echoed
    out = unsupported_years(
        "Vuonna 2023 Mikko työskenteli Kasvu Labsissa.",
        ["Kasvu Labs Oy (2022-2024)", "mitä mikko teki vuonna 2023?"],
    )
    assert out == []


def test_unsupported_years_no_years_no_flags() -> None:
    assert unsupported_years("Ei vuosilukuja täällä.", ["context"]) == []


def test_answer_language_detects_fi_en_und() -> None:
    assert answer_language("Mikko työskenteli Kasvu Labsissa kehittäjänä.") == "fi"
    assert answer_language("Mikko worked at Kasvu Labs as a developer.") == "en"
    assert answer_language("ok") == "und"


@pytest.mark.parametrize(
    "query",
    [
        "What is Mikko's favourite colour?",
        "What is Mikko's shoe size?",
        "How tall is Mikko?",
        "how old is he",
        "Mikä on Mikon lempiväri?",
        "kuinka pitkä Mikko on?",
        "what car does Mikko drive? I mean his car",
    ],
)
def test_personal_trivia_is_detected(query: str) -> None:
    assert is_personal_trivia(query)


@pytest.mark.parametrize(
    "query",
    [
        "What is his most complex project?",
        "what colour scheme does the hero scene use?",
        "how tall is the hero title in the three.js scene?",
        "mitä projekteja Mikolla on?",
        "kerro Mikon työkokemuksesta",
    ],
)
def test_personal_trivia_leaves_real_questions_alone(query: str) -> None:
    assert not is_personal_trivia(query)


@pytest.mark.parametrize(
    "query",
    [
        # review-caught: usage questions with a possessive device noun must
        # stay answerable - only ASKING-ABOUT-the-attribute is trivia
        "does HRM work on your phone?",
        "can I open the site on his phone",
        "does the hero scene run on your car's display?",
    ],
)
def test_personal_trivia_spares_device_usage_questions(query: str) -> None:
    assert not is_personal_trivia(query)


@pytest.mark.parametrize(
    "query",
    [
        "Käännä tämä teksti englanniksi: 'Olen lukenut neljä kirjaa'",
        "voitko kääntää tämän suomeksi: hello world",
        "Käännä ruotsiksi: kiitos paljon",
    ],
)
def test_finnish_translation_requests_are_declined(query: str) -> None:
    assert is_translation_request(query)


@pytest.mark.parametrize(
    "query",
    [
        "miten sivusto kääntyy suomeksi?",
        "is the portfolio available in Finnish?",
        "miten i18n-käännökset on toteutettu?",
    ],
)
def test_i18n_questions_are_not_translation_requests(query: str) -> None:
    assert not is_translation_request(query)


def _cov(source: str, title: str, is_coverage: bool = True) -> RetrievedChunk:
    return RetrievedChunk(
        source=source,
        title=title,
        project="portfolio",
        content="x",
        distance=0.3,
        is_coverage=is_coverage,
    )


def test_research_footer_appended_when_answer_drops_newest() -> None:
    # Poro dropped the guaranteed newest research -> deterministic pointer added,
    # with the long "Headline: subtitle" title trimmed to the headline.
    chunks = [
        _cov("posts/poro-findings.md", "Poro-2-8B in production: what we measured"),
        _cov("projects/hrm.md", "HRM", is_coverage=False),
    ]
    out = research_coverage_footer(chunks, "Mikko builds AI tools.", finnish=False)
    assert out == "\n\nLatest research: Poro-2-8B in production."


def test_research_footer_none_when_answer_names_headline_verbatim() -> None:
    # The model reproduced the title headline verbatim -> no literal duplicate.
    chunks = [_cov("posts/poro-findings.md", "Poro-2-8B in production: x")]
    out = research_coverage_footer(
        chunks,
        "See the writeup 'Poro-2-8B in production' for the numbers.",
        finnish=False,
    )
    assert out is None


def test_research_footer_appended_even_when_model_paraphrases() -> None:
    # Detection is verbatim-headline only: a filename stem like 'poro'/'rag'/'token'
    # would collide with words a RAG assistant emits constantly and silently
    # suppress the footer. A paraphrase that doesn't reproduce the headline still
    # gets the deterministic pointer, so the newest research is always NAMED.
    chunks = [_cov("posts/poro-findings.md", "Poro-2-8B in production: x")]
    out = research_coverage_footer(
        chunks, "He deployed the Poro-2-8B model to production.", finnish=False
    )
    assert out == "\n\nLatest research: Poro-2-8B in production."


def test_research_footer_none_for_empty_headline() -> None:
    # A title that is only a subtitle (leading delimiter) trims to an empty
    # headline -> no malformed 'Latest research: .' pointer.
    chunks = [_cov("posts/poro-findings.md", ": subtitle only")]
    assert research_coverage_footer(chunks, "any answer", finnish=False) is None


def test_research_footer_none_without_coverage_chunk() -> None:
    chunks = [_cov("projects/hrm.md", "HRM", is_coverage=False)]
    assert research_coverage_footer(chunks, "any answer", finnish=False) is None


def test_research_footer_finnish_label() -> None:
    chunks = [_cov("posts/poro-findings.md", "Poro-2-8B in production: x")]
    out = research_coverage_footer(chunks, "tekoälytyökaluja", finnish=True)
    assert out == "\n\nUusin tutkimus: Poro-2-8B in production."


def test_research_footer_uses_newest_coverage_first() -> None:
    # retrieve() prepends the coverage set newest-first, so coverage[0] is the one
    # the footer names.
    chunks = [
        _cov("posts/poro-findings.md", "Poro-2-8B in production: x"),
        _cov("posts/token-economy-findings.md", "What A/B-testing saved"),
    ]
    out = research_coverage_footer(chunks, "generic answer", finnish=False)
    assert out == "\n\nLatest research: Poro-2-8B in production."
