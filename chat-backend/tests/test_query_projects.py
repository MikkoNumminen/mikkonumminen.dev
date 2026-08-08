"""Tests for detecting the project(s) a question names."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.content import load_doc
from app.query_projects import (
    PROJECT_ALIASES,
    TECH_ALIASES,
    detect_projects,
    is_research_coverage_request,
    restore_entities,
    wants_cv,
    wants_cv_intent,
)


def test_readlog_dotnet_wins_over_bare_readlog() -> None:
    # The specific alias claims the span, so the contained "readlog" is not also
    # counted — only readlog-dotnet.
    assert detect_projects("How did ReadLog .NET handle the race?") == {"readlog-dotnet"}


def test_bare_readlog() -> None:
    assert detect_projects("tell me about readlog") == {"readlog"}


def test_spacepotatis_with_tech() -> None:
    got = detect_projects("how did spacepotatis bridge phaser and three.js")
    assert got == {"spacepotatis"}


def test_multiple_projects() -> None:
    assert detect_projects("compare readlog and hrm") == {"readlog", "hrm"}


def test_no_project_named() -> None:
    assert detect_projects("what projects are there") == set()


def test_alias_not_matched_inside_a_word() -> None:
    # The "platform" project must not fire on the generic plural "platforms".
    assert "platform" not in detect_projects("which platforms does it run on")


def test_strudel_short_alias() -> None:
    assert detect_projects("the strudel music thing") == {"strudel-patterns"}


def test_two_readlogs_both_detected_when_distinct() -> None:
    # A bare "readlog" elsewhere is still its own project even when a ".net"
    # variant also appears — span consumption is per-occurrence, not global.
    assert detect_projects("compare readlog and readlog .net") == {
        "readlog",
        "readlog-dotnet",
    }


def test_chat_and_rag_point_at_the_portfolio() -> None:
    # "Where does this chat run?" must filter to portfolio chunks — without the
    # alias, other projects' deploy chunks (Vercel/Neon/Azure) reach the context
    # and their hosting gets welded onto the chat (measured live conflation).
    assert detect_projects("Where is this chat actually running / hosted?") == {
        "portfolio"
    }
    assert detect_projects("how does the RAG ground its answers") == {"portfolio"}


def test_finnish_chat_inflections_point_at_the_portfolio() -> None:
    assert detect_projects("missä sä ajat tota chattia?") == {"portfolio"}
    assert detect_projects("miten chatin haku toimii") == {"portfolio"}


def test_platform_chat_detects_both_projects() -> None:
    # Platform has a chat feature: naming both unions the filters, which only
    # widens the allowed set — never excludes the asked-about project.
    got = detect_projects("how does platform's chat work")
    assert got == {"platform", "portfolio"}


def test_detects_tech_ecosystem_aliases() -> None:
    # Ecosystem terms point at every project that uses them, so a question worded
    # in the user's vocabulary ("the microsoft stack") still retrieves the right
    # projects even when the docs say ".NET"/"C#" rather than "Microsoft". Both
    # C# projects are implicated — the union only widens the filter.
    both_dotnet = {"readlog-dotnet", "feedback-intelligence"}
    assert detect_projects("tell me about the microsoft stack projects") == both_dotnet
    assert detect_projects("is anything deployed on Azure?") == both_dotnet
    assert detect_projects("which project does text-to-speech?") == {"audiobookmaker"}


def test_ambiguous_bare_tech_words_are_not_aliases() -> None:
    # High-collision bare words are deliberately NOT aliases: "c#" is a musical
    # note (and there is a music project), "razor" is a blade / "razor-thin". They
    # would mis-route everyday English; the scoped/qualified forms still work.
    assert detect_projects("the key of C# major sounds bright") == set()
    assert detect_projects("razor-thin margins and razor blades") == set()
    assert detect_projects("does he use Razor Pages?") == {"readlog-dotnet"}
    assert detect_projects("does he write csharp?") == {
        "readlog-dotnet",
        "feedback-intelligence",
    }


def test_every_language_routes_to_its_projects() -> None:
    # Every programming language in the portfolio must resolve to the project(s)
    # actually written in it — a visitor asks in the language's name, not the
    # project's.
    assert detect_projects("did he build anything in Rust?") == {"passwordmanager"}
    assert detect_projects("show me the Python projects") == {
        "audiobookmaker",
        "claude-continue",
        "portfolio",
    }
    assert detect_projects("how much TypeScript is there") == {
        "hrm",
        "platform",
        "portfolio",
        "readlog",
        "spacepotatis",
    }
    assert detect_projects("anything written in plain JavaScript?") == {
        "strudel-patterns",
        "passwordmanager",
        "feedback-intelligence",
    }
    assert detect_projects("what runs on WebAssembly / wasm?") == {"passwordmanager"}
    assert detect_projects("is the site built with Astro?") == {"portfolio"}
    assert detect_projects("any bash scripting?") == {"claude-agents"}


def test_language_aliases_respect_word_boundaries() -> None:
    # "rust" inside "trust"/"crust", "python" inside "pythonic", "bash" inside
    # "bashful" must not fire — same boundary rule as the identity aliases.
    assert detect_projects("I trust the crust of this pie") == set()
    assert detect_projects("very pythonic and bashful prose") == set()


def test_tech_alias_targets_are_known_project_ids() -> None:
    # A typo'd project id in TECH_ALIASES would silently bias retrieval toward a
    # project that has no chunks. Every target must be an identity-alias key.
    known = set(PROJECT_ALIASES)
    for alias, project_ids in TECH_ALIASES.items():
        assert set(project_ids) <= known, f"TECH_ALIASES[{alias!r}] -> {project_ids}"


def test_corpus_and_alias_table_cover_the_same_projects() -> None:
    # "The RAG knows every project": every project documented in the corpus is
    # routable by name, and every routable id has corpus docs to route TO.
    # Skipped where the content tree isn't present (e.g. a container running
    # backend tests without the repo root).
    content_root = Path(__file__).resolve().parents[2] / "content"
    projects_dir = content_root / "projects"
    if not projects_dir.is_dir():
        pytest.skip("content/projects not present in this environment")
    corpus_projects = {
        load_doc(path, content_root).project for path in projects_dir.glob("*.md")
    }
    assert corpus_projects == set(PROJECT_ALIASES)


def test_wants_cv_finnish_inflections() -> None:
    # the live failure plus the inflection spread prefix matching exists for
    assert wants_cv("mitä työkokemusta?")
    assert wants_cv("kerro työkokemuksestasi")
    assert wants_cv("millainen työhistoria sinulla on")
    assert wants_cv("kerro työurastasi")
    assert wants_cv("missä työpaikoissa olet ollut")
    assert wants_cv("onko ansioluetteloa?")


def test_wants_cv_english_and_exact_cv() -> None:
    assert wants_cv("what is your work experience?")
    assert wants_cv("tell me about your career")
    assert wants_cv("employment history?")
    assert wants_cv("can I see your CV?")
    assert wants_cv("do you have a resume")


def test_wants_cv_false_for_project_and_tech_questions() -> None:
    assert not wants_cv("what projects are there")
    assert not wants_cv("how does hrm cache permissions?")
    # "experience" alone is a tech question, not a CV question
    assert not wants_cv("do you have experience with react?")
    # "cv" must be a whole token, not a substring
    assert not wants_cv("does the canvas render on mobile?")


def test_wants_cv_employer_name_is_a_work_experience_question() -> None:
    # the live failure: asking about a named employer must pull the CV chunks
    assert wants_cv("mitä mikko teki kasvulabsissa?")
    assert wants_cv("what did Mikko do at Kasvu Labs?")
    # the canonical spelling appended by entity restoration also triggers it
    assert wants_cv("What did Mikko do at Growth Labs? Kasvu Labs")


def test_wants_cv_survives_a_finnish_question_typed_without_diacritics() -> None:
    """The gap that made the relevance gate unfixable.

    A visitor on a keyboard without ä/ö types the same question in ASCII, and
    every Finnish stem in the vocabulary missed it — while its accented twin
    matched. Both spellings now fold to the same string.
    """
    assert wants_cv("mitä työkokemusta sinulla on")
    assert wants_cv("mita tyokokemusta sinulla on")
    assert wants_cv("kerro työurastasi")
    assert wants_cv("kerro tyourastasi")
    assert wants_cv("missä työpaikoissa olet ollut")
    assert wants_cv("missa tyopaikoissa olet ollut")


def test_wants_cv_reaches_the_career_and_at_work_forms() -> None:
    """'ura' inflections and 'töissä', both measured as misses."""
    assert wants_cv("kerro urastasi")
    assert wants_cv("kerro urasta")
    assert wants_cv("mikä on urasi")
    assert wants_cv("mitä urallasi on tapahtunut")
    assert wants_cv("kerro uranvaihdosta")  # gradation: uranvaihto -> uranvaihdosta
    assert wants_cv("missä olet ollut töissä")
    assert wants_cv("missa olet ollut toissa")
    assert wants_cv("oletko töissä jossain")
    assert wants_cv("mitä töitä olet tehnyt")
    assert wants_cv("oletko työskennellyt konsulttina")
    # possessive forms, which an exact-token list has to spell out
    assert wants_cv("oletko tyytyväinen töissäsi")
    assert wants_cv("miten menee töissäni")


def test_the_ura_family_is_matched_by_token_not_by_prefix() -> None:
    """The correction that mattered most in review.

    `uras`/`ural`/`uran` shipped as PREFIXES first, and the comment next to them
    claimed they could not reach unrelated words. That claim was false in three
    ways at once, and all three are ordinary questions a visitor could ask:
    Uranus starts with `uran`, Uralilla with `ural`, urasointi with `uras`.

    Finnish inflects by suffix, so the forms can be enumerated instead, and
    equality has no reach. Compounds are covered separately by `työura` and
    `uranvaih`.
    """
    assert not wants_cv("milloin Uranus löydettiin")
    assert not wants_cv("missä sijaitsevat Uralilla")
    assert not wants_cv("kerro Uralin vuoristosta")
    assert not wants_cv("mitä tarkoittaa urasointi metallityössä")
    assert not wants_cv("onko tässä puussa syvä uras")


def test_bare_toissa_is_temporal_and_needs_its_verb() -> None:
    """"töissä" folds to "toissa", which is ALSO the modifier in "toissa vuonna"
    (the year before last). A token match would claim every such sentence, so the
    bare form is a phrase keyed on the preceding verb, which the temporal reading
    never has."""
    assert not wants_cv("missä asuit toissa vuonna")
    assert not wants_cv("kävimme toissa kesänä Ruotsissa")
    assert not wants_cv("toissapäivänä satoi")
    assert wants_cv("missä olet ollut töissä")
    assert wants_cv("oletko ollut töissä ulkomailla")


def test_wants_cv_reaches_the_verb_not_only_the_noun() -> None:
    """Every English entry used to be a noun phrase ("work experience"), so the
    ordinary way of asking missed."""
    assert wants_cv("where have you worked")
    assert wants_cv("who have you worked for")
    assert wants_cv("have you worked anywhere interesting")
    assert wants_cv("where did you work before")
    assert wants_cv("tell me about previous employers")


def test_wants_cv_reaches_the_24_years_before_programming() -> None:
    """The CV gained a full hardware-retail history (1998 to 2022), and none of
    the ways a visitor asks about it were in the vocabulary.

    Measured against the live corpus before this: with the CV route off, the
    retail chunks did not appear in the top six for any of these questions, so
    the chat answered "no specific information provided" while citing the very
    document that contained it. With the route on they rank second and third.
    """
    assert wants_cv("what did Mikko do before programming?")
    assert wants_cv("what did Mikko do before he became a developer")
    assert wants_cv("did Mikko work in retail")
    assert wants_cv("was Mikko a salesperson")
    assert wants_cv("tell me about his time in the hardware store")
    assert wants_cv("what does Mikko know about ERP and POS systems")
    # Finnish, accented and not
    assert wants_cv("kerro Mikon myyntiurasta rautakaupassa")
    assert wants_cv("mitä mikko teki ennen ohjelmointia")
    assert wants_cv("mita mikko teki ennen ohjelmointia")


def test_wants_cv_new_retail_stems_stay_off_project_questions() -> None:
    """The cost of the stems above, priced. "pos" is a whole token so it must not
    claim "position", and the kiosk app's own sales views are a project question
    that happens to share the word."""
    assert not wants_cv("what position does the cursor start at")
    assert not wants_cv("what sales views did the kiosk app have")
    assert not wants_cv("how does the RAG chat work")


def test_wants_cv_short_stems_do_not_claim_unrelated_finnish_words() -> None:
    """The cost of the stems above, priced. Each of these begins with the same
    letters as a CV stem and must not match: urakka/urakoitsija (ura-), uraani
    (ura-), toissapäivänä (töis- once folded), toisessa (töi- once folded)."""
    assert not wants_cv("mikä on urakka")
    assert not wants_cv("kerro urakoitsijasta")
    assert not wants_cv("uraanin rikastuksesta")
    assert not wants_cv("urheilusta")
    assert not wants_cv("toissapäivänä satoi")
    assert not wants_cv("mitä toisessa projektissa tehtiin")


def test_a_vocabulary_entry_that_folds_to_nothing_is_rejected_at_import() -> None:
    """The worst edit anyone can make to this module, made loud.

    `"x".startswith("")` is True, so a single vocabulary entry that folds away
    to an empty string makes `wants_cv` return True for every query. The CV route
    skips the relevance gate, so that is the containment gate off for every
    visitor, from an edit that looks like a typo. Import has to refuse.
    """
    from app.query_projects import (
        _CV_EXACT_FOLDED,
        _CV_PHRASES_FOLDED,
        _CV_PREFIXES_FOLDED,
        _fold,
        _reject_empty_vocabulary,
    )

    # the shipped vocabulary passes, or the guard is just noise
    _reject_empty_vocabulary(
        _CV_PREFIXES_FOLDED, _CV_EXACT_FOLDED, _CV_PHRASES_FOLDED
    )

    # each of the three lists, poisoned the way a real edit would poison it: an
    # entry with no alphanumerics at all, which `_fold` reduces to spaces
    assert _fold("-") .strip() == ""
    assert _fold("́").strip() == ""  # a lone combining acute

    with pytest.raises(ValueError):
        _reject_empty_vocabulary(("career", ""), _CV_EXACT_FOLDED, _CV_PHRASES_FOLDED)
    with pytest.raises(ValueError):
        _reject_empty_vocabulary(_CV_PREFIXES_FOLDED, {"cv", ""}, _CV_PHRASES_FOLDED)
    with pytest.raises(ValueError):
        _reject_empty_vocabulary(
            _CV_PREFIXES_FOLDED, _CV_EXACT_FOLDED, (" work experience ", "   ")
        )


def test_no_question_expected_to_be_refused_claims_cv_intent() -> None:
    """The blast radius of widening the CV vocabulary, pinned to the eval set.

    CV intent is a key to the relevance-gate override, so any question the corpus
    is supposed to REFUSE must not hold that key. This is the check that would
    catch a future stem like "jobs" (which collides with "cron jobs") or a bare
    "ura" turning an off-corpus question into an answerable one.

    Measured at the time of writing: widening the vocabulary flipped 0 of the 58
    eval questions in either direction.
    """
    import json

    raw = json.loads(
        (Path(__file__).resolve().parents[1] / "evals" / "eval_set.json").read_text(
            encoding="utf-8"
        )
    )
    queries = raw["queries"] if isinstance(raw, dict) else raw
    refusable = [
        str(q["question"])
        for q in queries
        if str(q.get("expectation", "")).startswith("must_refuse")
    ]
    assert refusable, "eval set has no must_refuse cases; this test is vacuous"
    claiming = [q for q in refusable if wants_cv(q)]
    assert not claiming, f"refusable questions claiming CV intent: {claiming}"


def test_the_empty_entry_really_would_match_everything() -> None:
    """The premise of the guard above, proven rather than asserted. Without this,
    the guard could be protecting against nothing and its test would still pass."""
    assert "anything at all".startswith("")
    assert " " in " how does the rag chat work "


def test_wants_cv_accent_folding_does_not_widen_the_english_stems() -> None:
    """Folding makes résumé and resume one entry. It must not also make the
    vocabulary match things it did not match before."""
    assert wants_cv("résumé")
    assert wants_cv("resume")
    assert not wants_cv("how does the RAG chat work")
    assert not wants_cv("kerro spacepotatiksesta")
    assert not wants_cv("does the canvas render on mobile?")


def test_restore_entities_appends_lost_canonical_spelling() -> None:
    # Poro translated the employer name away ("kasvu" = growth, measured live)
    out = restore_entities(
        "mitä mikko teki kasvulabsissa?", "What did Mikko do at Growth Labs?"
    )
    assert out == "What did Mikko do at Growth Labs? Kasvu Labs"


def test_restore_entities_no_duplicate_when_translation_kept_the_name() -> None:
    out = restore_entities(
        "mitä mikko teki kasvulabsissa?", "What did Mikko do at Kasvu Labs?"
    )
    assert out == "What did Mikko do at Kasvu Labs?"


def test_restore_entities_passthrough_without_known_entities() -> None:
    out = restore_entities("mitä työkokemusta?", "What work experience?")
    assert out == "What work experience?"


def test_restore_entities_appends_each_canonical_once() -> None:
    # both stems ("kasvulabs" inflected + spaced form) map to one canonical name
    out = restore_entities(
        "kerro kasvu labs ja kasvulabsin ajasta", "Tell me about the growth time"
    )
    assert out.count("Kasvu Labs") == 1


def test_wants_cv_spaced_inflected_employer_form() -> None:
    # "Kasvu Labsissa" — spaced AND case-inflected: the fused prefix can't see
    # it and an exact-phrase match would need a trailing space the suffix eats
    assert wants_cv("mitä Mikko teki Kasvu Labsissa?")


def test_restore_entities_covers_the_kysely_library() -> None:
    # the other measured translation loss: 'kysely' means 'query' in Finnish,
    # so the library name never survives translation
    out = restore_entities(
        "Miksi Spacepotatis valitsi Kyselyn Prisman sijaan?",
        "Why did Spacepotatis choose a query instead of Prisma?",
    )
    assert out.endswith(" Kysely")


def test_wants_cv_intent_sees_both_texts() -> None:
    # original carries the Finnish form, translation lost it
    assert wants_cv_intent("mitä työkokemusta?", "What kind of background?")
    # translation carries the English phrase, original is opaque
    assert wants_cv_intent("mitä taustaa?", "What work experience is there?")
    # neither text has CV intent
    assert not wants_cv_intent("mitä projekteja?", "What projects are there?")


def test_research_coverage_fires_on_research_markers() -> None:
    # The reported bug: a Finnish "latest research" question.
    assert is_research_coverage_request(
        "kerro jotain mikon viimeisimmistä tutkimuksista"
    )
    # English (also the translate-for-retrieval anchor of the Finnish above).
    assert is_research_coverage_request("tell me about Mikko's latest research")
    assert is_research_coverage_request("what research has Mikko published?")
    assert is_research_coverage_request("what were the findings of the experiment?")
    assert is_research_coverage_request("show me the benchmark study")
    # Swedish visitors.
    assert is_research_coverage_request("berätta om den senaste forskningen")


def test_research_coverage_does_not_fire_on_how_do_i_get_it() -> None:
    """The reported bug, from a real visitor.

    "miten voin kopioida tutkimusdokumentteja?" hit the coverage intent on
    "tutkimu", which force-occupies the top three context slots with the newest
    research posts. Those sat at 0.44 to 0.49 while the document that answers the
    question (site-terminal.md, describing the `download` command) sat at 0.165,
    the closest chunk in the corpus, pushed to position four. The model listed
    research posts and recommended a build script from an unrelated project.

    Asking how to OBTAIN the research is not a request for a research sweep.
    """
    assert not is_research_coverage_request("miten voin kopioida tutkimusdokumentteja?")
    assert not is_research_coverage_request("how can I download the research documents?")
    assert not is_research_coverage_request("how do I download the research")
    assert not is_research_coverage_request("where can I download the findings pdf")
    assert not is_research_coverage_request("mistä voin ladata tutkimukset")
    assert not is_research_coverage_request("var kan jag ladda ner forskningen")


def test_research_coverage_veto_covers_the_ways_people_ask_without_a_verb() -> None:
    """Review found the first marker list was asymmetric: it had Finnish
    "kopioi" but no English "copy", and nothing for "get". Those words are far
    too common to stem, so they are matched as phrases."""
    assert not is_research_coverage_request("can I get a copy of the research")
    assert not is_research_coverage_request("where can I find the research pdfs")
    assert not is_research_coverage_request("how do I get the findings")
    assert not is_research_coverage_request("mistä saan tutkimukset")
    assert not is_research_coverage_request("miten saan tutkimukset")
    assert not is_research_coverage_request("voinko saada tutkimukset")


def test_research_coverage_veto_reads_unaccented_finnish() -> None:
    """The gap that made `wants_cv` miss half its own vocabulary, closed here
    before it could bite: this function lowercased but did not fold."""
    assert not is_research_coverage_request("mista saan tutkimukset")
    assert not is_research_coverage_request("mista voin ladata tutkimukset")
    # and folding must not break the positive direction
    assert is_research_coverage_request("kerro viimeisimmista tutkimuksista")
    assert is_research_coverage_request("kerro viimeisimmistä tutkimuksista")


def test_research_coverage_still_fires_when_the_question_is_about_content() -> None:
    """The veto above must not swallow the intent it sits inside. These ask what
    the research SAYS, and still need the newest posts forced into context."""
    assert is_research_coverage_request("what research has Mikko published?")
    assert is_research_coverage_request("kerro viimeisimmistä tutkimuksista")
    assert is_research_coverage_request("what did the experiment find?")
    # Review found "pdf" as a bare marker vetoed these, which are content
    # questions that happen to name the artefact. The marker list is verbs now.
    assert is_research_coverage_request("what does the findings pdf say")
    assert is_research_coverage_request("which experiment is in the pdf")


def test_research_coverage_needs_a_research_marker() -> None:
    # Recency or generic curiosity alone is not enough — "latest project" is a
    # project question, not a research sweep.
    assert not is_research_coverage_request("what's your latest project?")
    assert not is_research_coverage_request("tell me about readlog")
    assert not is_research_coverage_request("what can you do?")
    assert not is_research_coverage_request("what have you built?")
    # "study" is deliberately not a marker — this is an education/bio question,
    # not a research sweep (it must not inject research posts).
    assert not is_research_coverage_request("where did Mikko study?")
    assert not is_research_coverage_request("what did you study at university?")


def test_research_coverage_defers_to_a_named_project() -> None:
    # A research marker BUT a specific project named -> that project's question,
    # served by normal project-aware retrieval, not the corpus-wide sweep.
    assert not is_research_coverage_request(
        "how did you research the HRM domain model?"
    )
    assert not is_research_coverage_request("what experiments did spacepotatis run?")
    # Naming the portfolio itself still counts as a research sweep, not a project.
    assert is_research_coverage_request("what research is in your portfolio?")


def test_research_coverage_is_deliberately_topic_permissive() -> None:
    # The detector recognises the research-genre INTENT, not the topic — an
    # off-corpus "latest research on X" DOES fire it. Keeping the detector
    # permissive avoids it becoming a brittle, always-behind topic classifier.
    # NB the ORIGINAL rationale here — "the injected chunks are far, so the
    # weak-retrieval gate refuses the query downstream" — is FALSE, and believing it
    # is what allowed a live fabrication. Measured: "latest research on quantum
    # computing" retrieves coverage chunks at distance 0.4466, INSIDE the 0.45 gate;
    # coverage chunks are prose and can only ever move the gate toward answering.
    # What actually makes the permissiveness safe is that injection alone is
    # harmless (the model hedged correctly) and the recency CLAIM is gated
    # separately — see query_projects.names_offcorpus_research_topic and
    # tests/test_research_coverage_precision.py.
    assert is_research_coverage_request(
        "what's the latest research on quantum computing"
    )


# --- Finnish inflection --------------------------------------------------
#
# Finnish fuses the case ending onto the word ("audiobookmakerista"), which the
# plain word-boundary check rejects. Measured before this was handled: of the
# nine projects with a narrative, only `hrm` resolved from a natural Finnish
# mention — and only because an acronym inflects with a colon ("HRM:stä"), which
# already reads as a boundary. That silently broke the whole Finnish
# progressive-disclosure path: the follow-up was recognised, the topic was not,
# and the visitor got a refusal.


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("kerro lisää audiobookmakerista", {"audiobookmaker"}),
        ("kerro portfoliosta", {"portfolio"}),
        ("kerro readlogista", {"readlog"}),
        ("kerro platformista", {"platform"}),
        ("mitä spacepotatiksesta voi sanoa", {"spacepotatis"}),
        ("kerro chatista", {"portfolio"}),
        ("kerro hrm:stä", {"hrm"}),
        ("mitä hrm:ssä on", {"hrm"}),
    ],
)
def test_detect_projects_handles_finnish_case_endings(
    query: str, expected: set[str]
) -> None:
    assert detect_projects(query) == expected


@pytest.mark.parametrize(
    "query",
    [
        # An English word that merely CONTAINS an alias must still not match —
        # this is what the strict boundary check was protecting, and tolerating
        # Finnish endings must not cost it.
        "what platforms exist",
        "chatting about code",
        "readlogs everywhere",
        "hrmm let me think",
    ],
)
def test_finnish_endings_do_not_loosen_english_boundaries(query: str) -> None:
    assert detect_projects(query) == set()
