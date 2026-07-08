"""Tests for detecting the project(s) a question names."""

from __future__ import annotations

from app.query_projects import (
    detect_projects,
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
    # Ecosystem terms point at the project that uses them, so a question worded in
    # the user's vocabulary ("the microsoft stack") still retrieves the right
    # project even when the docs say ".NET"/"C#" rather than "Microsoft".
    assert detect_projects("tell me about the microsoft stack projects") == {
        "readlog-dotnet"
    }
    assert detect_projects("is anything deployed on Azure?") == {"readlog-dotnet"}
    assert detect_projects("which project does text-to-speech?") == {"audiobookmaker"}


def test_ambiguous_bare_tech_words_are_not_aliases() -> None:
    # High-collision bare words are deliberately NOT aliases: "c#" is a musical
    # note (and there is a music project), "razor" is a blade / "razor-thin". They
    # would mis-route everyday English; the scoped/qualified forms still work.
    assert detect_projects("the key of C# major sounds bright") == set()
    assert detect_projects("razor-thin margins and razor blades") == set()
    assert detect_projects("does he use Razor Pages?") == {"readlog-dotnet"}
    assert detect_projects("does he write csharp?") == {"readlog-dotnet"}


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
