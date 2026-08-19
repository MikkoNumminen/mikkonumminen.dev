"""Detect which portfolio project(s) a question is about, from its text.

Pure cosine retrieval is blind to project identity: a question that names a
specific project ("how did ReadLog .NET handle the find-or-create race?") will
happily pull a semantically-similar passage from a *different* project (e.g.
Platform's achievement-double-unlock race) and answer from it — confidently
wrong. This module recognises a project named in the query so retrieval can
bias toward that project's own chunks (see `retrieval.retrieve`).

Alias-based, not embedding-based, on purpose: it is deterministic, stdlib-only,
trivially unit-tested, and a wrong guess only re-orders candidates (never
invents). Adding a project to the corpus means adding its id + aliases here —
and its stack/language terms to TECH_ALIASES, which may implicate several
projects at once.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Sequence

# project_id -> the lowercased phrases a visitor might use to name it. Order
# within a list does not matter; matching is longest-alias-first across all
# projects (see detect_projects), so a specific alias ("readlog .net") wins over
# and consumes a contained shorter one ("readlog").
PROJECT_ALIASES: dict[str, list[str]] = {
    "readlog-dotnet": [
        "readlog .net",
        "readlog.net",
        "readlog dotnet",
        "readlog c#",
        "readlog csharp",
        "readlog-csharp",
    ],
    # The third ReadLog. "readlog laravel" beats bare "readlog" the same way the
    # .NET aliases do, longest match first.
    "readlog-laravel": [
        "readlog laravel",
        "readlog-laravel",
        "ask your library",
        "readlog php",
        "laravel readlog",
    ],
    "readlog": ["readlog"],
    "hrm": ["hrm", "hrmanager", "hr manager"],
    # "spacepotatikse" is the gradated Finnish stem: a noun ending in -s inflects
    # through -kse- ("Spacepotatis" -> "spacepotatiksesta"), so the suffix rule in
    # _finnish_ending_len cannot reach it from the base alias — the STEM itself
    # changes, not just the ending. Listed explicitly rather than teaching the
    # matcher consonant gradation, which is a much larger and more error-prone rule.
    "spacepotatis": [
        "spacepotatis",
        "space potatis",
        "spacepotatikse",
        "phaser",
    ],
    "audiobookmaker": [
        "audiobookmaker",
        "audiobook maker",
        "tts",
        "text-to-speech",
        "text to speech",
        "piper",
        "chatterbox",
        "edge-tts",
    ],
    "platform": ["platform"],
    "strudel-patterns": ["strudel-patterns", "strudel patterns", "strudel"],
    "claude-continue": ["claude-continue", "claude continue"],
    # Finnish inflections listed explicitly (matching is not stemmed).
    "passwordmanager": [
        "passwordmanager",
        "password manager",
        "password-manager",
        "salasana",
        "salasanan",
        "salasanat",
        "salasanoja",
    ],
    # Scoped forms only — bare "agents"/"agentit" would fire on questions about
    # agents in general (a live topic in this portfolio's chat).
    "claude-agents": [
        "claude-agents",
        "claude agents",
        "subagent",
        "subagents",
        "cost-routing",
        "cost routing",
    ],
    # Bare "feedback" is deliberate: in a portfolio chat the project reading
    # dominates, and a wrong guess only re-orders retrieved chunks. "poro" and
    # "ollama" are NOT aliases — this chat itself runs on Poro via Ollama, so
    # they would misroute questions about the chat to this project.
    "feedback-intelligence": [
        "feedback-intelligence",
        "feedback intelligence",
        "feedback",
        "palaute",
        "palautteen",
        "palautetta",
        "palautteet",
    ],
    "songgenerator": [
        "songgenerator",
        "song generator",
        "song-generator",
        # What a visitor calls it when they do not know the name. Both are
        # specific: AudiobookMaker is the other audio project and it synthesises
        # speech from text rather than moving a singer's notes around, so
        # neither word reaches it.
        #
        # "word bank" was here and is not, because it is not a name for this
        # project so much as two ordinary words: "do you have a word bank of
        # skills" claimed it, and "the readlog word bank" pulled it in alongside
        # readlog. A wrong guess only re-orders candidates, but a phrase that
        # common re-orders them constantly, and the project has a real name.
        # Finnish inflections spelled out, because alias matching is
        # word-boundary rather than stemmed: "sanapankki" alone does not see
        # "sanapankista", which is how the question is actually asked.
        "sanapankki",
        "sanapankin",
        "sanapankista",
        "sanapankkia",
        "biisigeneraattori",
        "biisigeneraattorin",
        "biisigeneraattorista",
    ],
    # chat/RAG terms point at the portfolio: the RAG chat IS a portfolio artifact,
    # and without these a "where does this chat run?" question retrieves other
    # projects' deploy chunks (Vercel/Neon/Azure) and the model welds their hosting
    # onto the chat — a measured live conflation. Finnish inflections listed
    # explicitly because alias matching is word-boundary, not stemmed. Platform's
    # own chat feature is unharmed: multi-detection unions the filters.
    "portfolio": [
        "portfolio",
        "mikkonumminen.dev",
        "mikkonumminen dev",
        "rag",
        "chat",
        "chatti",
        "chattia",
        "chatin",
        "chatissa",
        # "chat" is below the length floor for fused-ending matching (too short
        # to be distinctive), so its inflections stay explicit.
        "chatista",
        "chatbot",
    ],
}

# Stack / language terms -> every project they implicate. Separate from the
# identity aliases above because these are legitimately MULTI-TARGET: ".net"
# means readlog-dotnet AND feedback-intelligence, "typescript" spans half the
# portfolio. The flattening below unions, so a term firing only ever widens the
# retrieval filter — it never excludes the asked-about project. Every
# programming language in the portfolio must route somewhere: "what has he
# built in Rust?" names no project yet has exactly one right answer.
#
# Bare "c#" (a musical note — and there IS a music project) and "razor"
# (shaving, "razor-thin") are deliberately NOT aliases; the scoped/qualified
# forms cover them. Bare "markdown" is excluded too — visitors say "answer in
# markdown". "microsoft"/"azure" can also mean a colour / Office, but in a
# dev-portfolio chat the cloud/.NET reading dominates and a wrong guess only
# re-orders already-retrieved chunks (it never invents). Library names
# (three.js, gsap, phaser…) stay in the identity lists or out entirely: a
# library named NEXT TO a project ("how did spacepotatis bridge phaser and
# three.js") must not drag other projects into the filter.
TECH_ALIASES: dict[str, tuple[str, ...]] = {
    # .NET ecosystem — both C# projects.
    "microsoft": ("readlog-dotnet", "feedback-intelligence"),
    ".net": ("readlog-dotnet", "feedback-intelligence"),
    "dotnet": ("readlog-dotnet", "feedback-intelligence"),
    "csharp": ("readlog-dotnet", "feedback-intelligence"),
    "asp.net": ("readlog-dotnet", "feedback-intelligence"),
    "aspnet": ("readlog-dotnet", "feedback-intelligence"),
    "azure": ("readlog-dotnet", "feedback-intelligence"),
    # Stack pieces only one of the .NET projects uses.
    "ef core": ("readlog-dotnet",),
    "entity framework": ("readlog-dotnet",),
    "razor pages": ("readlog-dotnet",),
    # Languages. Word-boundary matching keeps "trust"/"crust" off "rust" and
    # "pythonic" off "python".
    "rust": ("passwordmanager",),
    "webassembly": ("passwordmanager",),
    "wasm": ("passwordmanager",),
    "python": ("audiobookmaker", "claude-continue", "portfolio", "songgenerator"),
    # Audio DSP. These belong to SongGenerator alone: AudiobookMaker is the other
    # audio project, but it synthesises speech from text and never separates a
    # mix or moves a note, so none of these terms is ambiguous between them.
    "demucs": ("songgenerator",),
    "pitch shift": ("songgenerator",),
    "pitch-shift": ("songgenerator",),
    "formant": ("songgenerator",),
    "vocal separation": ("songgenerator",),
    "stem separation": ("songgenerator",),
    "typescript": ("hrm", "platform", "portfolio", "readlog", "spacepotatis"),
    # PHP ecosystem: one project. "blade" alone is a knife and "pest" alone is
    # an insect, so only the framework and the language route by themselves;
    # the ORM name is unambiguous enough in a developer portfolio.
    "php": ("readlog-laravel",),
    "laravel": ("readlog-laravel",),
    "eloquent": ("readlog-laravel",),
    "javascript": ("strudel-patterns", "passwordmanager", "feedback-intelligence"),
    "astro": ("portfolio",),
    "bash": ("claude-agents",),
}


def _flatten_aliases() -> dict[str, frozenset[str]]:
    """Union identity + tech aliases into one alias -> project-ids map."""
    flat: dict[str, frozenset[str]] = {}
    for project_id, aliases in PROJECT_ALIASES.items():
        for alias in aliases:
            flat[alias] = flat.get(alias, frozenset()) | {project_id}
    for alias, project_ids in TECH_ALIASES.items():
        flat[alias] = flat.get(alias, frozenset()) | frozenset(project_ids)
    return flat


# Flattened alias -> project ids for scanning. Built once at import.
_ALIAS_TO_PROJECTS: dict[str, frozenset[str]] = _flatten_aliases()


# Finnish case endings, longest first so the greedy scan below takes the whole
# ending rather than a shorter prefix of it.
#
# WHY THIS EXISTS: Finnish fuses the case ending onto the word — "kerro
# audiobookmakerista", "portfoliosta", "readlogista". The plain non-alphanumeric
# boundary check below rejects every one of those, so a Finnish visitor naming a
# project by its natural inflected form resolved to NO project at all. Measured:
# of the nine projects with a narrative, only `hrm` resolved, and only by the
# accident that an acronym is inflected with a colon ("HRM:stä") which already
# reads as a boundary. Everything else fell through.
_FI_CASE_ENDINGS = (
    "istä",
    "ista",
    "issä",
    "issa",
    "illä",
    "illa",
    "iltä",
    "ilta",
    "ille",
    "kään",
    "kaan",
    "ksi",
    "ssä",
    "ssa",
    "stä",
    "sta",
    "llä",
    "lla",
    "ltä",
    "lta",
    "lle",
    "ttä",
    "tta",
    "kin",
    "hän",
    "han",
    "ien",
    "nä",
    "na",
    "iä",
    "ia",
    "it",
    "in",
    "en",
    "on",
    "un",
    "yn",
    "ä",
    "a",
    "n",
)

# Only aliases at least this long tolerate a fused Finnish ending. The short ones
# are where over-matching bites: "chat" + "s" or "hrm" + "a" would start claiming
# unrelated words, and the endings include single letters. Long aliases are
# distinctive enough that a fused suffix is overwhelmingly a real inflection.
_MIN_ALIAS_LEN_FOR_INFLECTION = 5


def _finnish_ending_len(text: str, end: int) -> int:
    """Length of a Finnish case ending starting at `end`, or 0 if there is none.

    Returns a length so the caller can extend the matched span to cover the
    ending — span consumption depends on knowing how much of the word the alias
    actually claimed.
    """
    for ending in _FI_CASE_ENDINGS:
        stop = end + len(ending)
        if text[end:stop] == ending:
            after = text[stop] if stop < len(text) else " "
            if not after.isalnum():
                return len(ending)
    return 0


def _word_ish_boundary(text: str, start: int, end: int) -> bool:
    """True iff `text[start:end]` is flanked by non-alphanumeric chars (or edges).

    Stops "platform" from matching inside "platforms" and "hrm" inside a random
    word, while still allowing aliases that themselves contain spaces / `.` / `#`
    (e.g. "readlog .net", "readlog c#") — the check only looks at the OUTER edges.
    """
    before = text[start - 1] if start > 0 else " "
    after = text[end] if end < len(text) else " "
    return not before.isalnum() and not after.isalnum()


def detect_projects(query: str) -> set[str]:
    """Return the set of project ids named in `query` (possibly empty).

    Every alias occurrence is found, then claimed greedily LONGEST-FIRST with
    span consumption: "readlog .net" claims its span and maps to readlog-dotnet,
    so the contained bare "readlog" (which overlaps that span) is not also
    counted — yet a *separate* "readlog" elsewhere in the query still maps to
    readlog. A claimed alias contributes EVERY project it implicates (a tech
    term like ".net" legitimately means more than one) — the union only widens
    the retrieval filter. Empty result => caller must behave exactly as plain
    cosine search.
    """
    text = query.lower()
    occurrences: list[tuple[int, int, frozenset[str]]] = []
    for alias, project_ids in _ALIAS_TO_PROJECTS.items():
        start = 0
        while True:
            idx = text.find(alias, start)
            if idx == -1:
                break
            end = idx + len(alias)
            if _word_ish_boundary(text, idx, end):
                occurrences.append((idx, end, project_ids))
            elif len(alias) >= _MIN_ALIAS_LEN_FOR_INFLECTION:
                # The alias is fused to a Finnish case ending
                # ("audiobookmakerista"). Claim the ending too, so the span
                # consumption below still reflects how much of the word was
                # actually matched.
                before = text[idx - 1] if idx > 0 else " "
                suffix = _finnish_ending_len(text, end)
                if not before.isalnum() and suffix:
                    occurrences.append((idx, end + suffix, project_ids))
            start = idx + 1
    # Longest alias first (most specific claims the span), then by position.
    occurrences.sort(key=lambda o: (-(o[1] - o[0]), o[0]))
    claimed: list[tuple[int, int]] = []
    detected: set[str] = set()
    for start, end, project_ids in occurrences:
        if any(start < c_end and end > c_start for c_start, c_end in claimed):
            continue  # overlaps an already-claimed (longer/earlier) span
        claimed.append((start, end))
        detected.update(project_ids)
    return detected


# CV / work-experience intent. The embedder is English-only, so a Finnish query
# like "mitä työkokemusta?" cannot land on the CV's English Experience chunk by
# cosine — the model then presents project chunks AS work experience (a measured
# live conflation). Deterministic detection here lets retrieval pull the kind='cv'
# chunks explicitly. PREFIX matching (unlike the alias spans above) because
# Finnish inflects: one stem covers työkokemusta / työkokemuksesta / työurastasi….
# A wrong guess only prepends the CV chunks to already-retrieved context — it
# never invents — so a mild false positive ("resume" the verb) is acceptable.
_CV_PREFIXES = (
    "työkokemu",  # työkokemus / työkokemusta / työkokemuksesta…
    "työhistoria",
    "työura",  # työura / työurasta / työurallasi… ("ura" alone is too short/risky)
    "työpaik",  # työpaikka / työpaikoista…
    "työsk",  # työskennellyt / työskentelet / työskentely…
    # Career-change compounds, long enough to be unambiguous. The bare `ura`
    # stem is NOT a prefix here; see _CV_EXACT for why.
    # Cut BEFORE the gradating consonant: uranvaihto but uranvaihDosta, so a
    # stem ending in "t" misses every inflected form.
    "uranvaih",  # uranvaihto / uranvaihdosta / uranvaihdon…
    "ansioluettelo",
    # THE 24 YEARS BEFORE THIS ONE. The CV now carries a full hardware-retail
    # history (1998 to 2022), and none of the ways a visitor asks about it were
    # in this vocabulary: "did Mikko work in retail" and "what did he do before
    # programming" both scored False, so the chunks that answer them were only
    # reachable when some other word happened to trip the route. Measured
    # against the live corpus: with the route off, the retail chunks do not
    # appear in the top six at all; with it on they are second and third.
    "retail",
    "salesper",  # salesperson / salespeople
    "myyj",  # fi: myyjä / myyjänä / myyjänpaikka
    "myynti",  # fi: myynti / myyntiura / myyntityö
    "rautakau",  # fi: rautakauppa / rautakaupassa / rautakaupan
    "arbetserfarenhet",  # Swedish visitors ask too; the boost is language-neutral
    "career",
    "employment",
    "employer",
    "resume",
    "résumé",
    # Asking about a named EMPLOYER is a work-experience question — the answer
    # lives in the CV's Experience chunk, which cosine ranks ~0.46 for such
    # queries (out of top-k AND beyond the gate; measured live on "mitä mikko
    # teki kasvulabsissa?"). The prefix absorbs Finnish case endings.
    "kasvulabs",  # kasvulabsissa / kasvulabsin…
)
# WHOLE TOKENS, NOT PREFIXES, and this list is where the Finnish `ura` (career)
# family lives. Prefix matching was tried first and was wrong: `uran` also starts
# Uranus, `ural` starts Uralilla, and `uras` starts urasointi, so three ordinary
# astronomy/geography/machining questions claimed CV intent. Finnish inflects by
# suffix, so the inflected forms can simply be enumerated, and equality has no
# reach at all. The compound support that prefixes gave up is covered by `työura`
# and `uranvaiht` above.
#
# "töissä" is here for the same reason at one remove: it folds to "toissa", and
# `toiss` as a prefix would claim "toissapäivänä". The BARE form is handled in
# _CV_PHRASES instead, because "toissa" on its own is also the temporal modifier
# in "toissa vuonna" (the year before last); only the possessive forms are
# unambiguous enough to match as tokens.
_CV_EXACT = (
    "cv",
    "töitä",
    "töihin",
    "töissäsi",
    "töissäni",
    "töissään",
    # Systems he used daily for two decades, and the reason the domain knowledge
    # is on the CV at all. Whole tokens: "pos" as a prefix would claim "position".
    "erp",
    "pos",
    "ura",
    "uran",
    "urani",
    "urasi",
    "uransa",
    "uranne",
    "uraa",
    "uraan",
    "urat",
    "uralla",
    "urallasi",
    "urallani",
    "urallaan",
    "uralle",
    "uralta",
    "urasta",
    "urastasi",
    "urastani",
    "urastaan",
)
_CV_PHRASES = (
    " work experience ",
    " work history ",
    " employment history ",
    # The verb, which the noun phrases above all miss: "where have you worked",
    # "who have you worked for", "have you worked anywhere" were each measured
    # as a miss.
    " have you worked ",
    " did you work ",
    " where do you work ",
    # Bare "töissä" (at work), which cannot be a token match: it folds to
    # "toissa", the temporal modifier in "toissa vuonna" / "toissa kesänä". The
    # preceding verb is what separates the two readings, and the temporal one
    # never has it.
    # Asking what came BEFORE the programming, which is how the career change is
    # usually raised and which no single word covers.
    " before programming ",
    " before software ",
    " before he became ",
    " before becoming ",
    " previous career ",
    " career change ",
    " work in retail ",
    " worked in retail ",
    " hardware store ",
    " ennen ohjelmointia ",
    " ollut töissä ",
    " olet töissä ",
    " oletko töissä ",
    " olitko töissä ",
    # No trailing space: suffix-tolerant, so the spaced-AND-inflected form a
    # visitor may type ("Kasvu Labsissa") matches too, not only the exact
    # canonical spelling a translated query carries.
    " kasvu labs",
)


# Known proper nouns a retrieval-side TRANSLATION must not lose. Poro translates
# meaning-bearing names no matter how firmly the prompt says not to ("kasvulabs"
# → "Growth Labs", measured live — 'kasvu' is Finnish for growth), which starves
# retrieval of the exact term the corpus uses. Deterministic restoration instead:
# when the ORIGINAL query contains the stem (substring — Finnish case endings
# attach after it) but the translation lost it, the canonical corpus spelling is
# appended to the retrieval query. Appending only ever ADDS retrieval signal;
# the model still answers the untouched original question.
KNOWN_ENTITIES: dict[str, str] = {
    "kasvulabs": "Kasvu Labs",
    "kasvu labs": "Kasvu Labs",
    # 'kysely' is the Finnish word for 'query', so the Kysely LIBRARY never
    # survives translation — the measured eval flip spacepotatis-kysely-vs-
    # prisma lost its expected chunks exactly this way. The Finnish common
    # noun can also trigger this append on non-library questions; that only
    # re-orders already-retrieved candidates, never invents.
    "kysely": "Kysely",
}


def restore_entities(original: str, translated: str) -> str:
    """Append canonical spellings of known entities the translation lost."""
    low_orig = original.lower()
    low_trans = translated.lower()
    restored = translated
    seen: set[str] = set()
    for stem, canonical in KNOWN_ENTITIES.items():
        if canonical in seen:
            continue
        if stem in low_orig and canonical.lower() not in low_trans:
            restored = f"{restored} {canonical}"
            seen.add(canonical)
    return restored


def wants_cv_intent(original: str, retrieval_query: str) -> bool:
    """CV intent over BOTH texts — the original question carries the Finnish
    forms, the (possibly translated) retrieval query the English phrases. The
    single definition shared by retrieval's CV boost and the pipeline's
    gate override, so the two can never disagree."""
    if retrieval_query == original:
        return wants_cv(original)
    return wants_cv(f"{retrieval_query}\n{original}")


def _fold(text: str) -> str:
    """Lowercase, strip diacritics, and reduce non-alphanumerics to spaces.

    THE DIACRITIC STRIPPING IS THE POINT. Finnish visitors type from whatever
    keyboard they have, and "mita tyokokemusta sinulla on" is a question this
    module used to miss entirely while its accented twin matched — measured, not
    supposed. Folding both the query and the vocabulary means one stem covers
    both spellings, so nobody has to remember to add the ASCII variant.

    It also makes "résumé" and "resume" the same string, so the two spellings
    collapse to a single entry rather than needing to stay in sync.

    DELIBERATELY NOT the language router's normalisation, which this used to
    share. `guardrails.looks_finnish` reads ä and ö as evidence a query is
    Finnish, so folding them there would destroy the signal it runs on. The two
    want opposite things from the same characters; do not re-unify them.
    """
    decomposed = unicodedata.normalize("NFKD", text.lower())
    unaccented = "".join(c for c in decomposed if not unicodedata.combining(c))
    return "".join(c if c.isalnum() else " " for c in unaccented)


# Folded once at import: the query side is folded per call, and comparing a
# folded query against unfolded vocabulary would silently match nothing for
# every accented entry above.
_CV_PREFIXES_FOLDED = tuple(sorted({_fold(p).strip() for p in _CV_PREFIXES}))
_CV_EXACT_FOLDED = frozenset(_fold(e).strip() for e in _CV_EXACT)
# NOT stripped: the padding is load-bearing. " kasvu labs" has no trailing space
# on purpose, which is what lets it match "Kasvu Labsissa". Every phrase above is
# ASCII, so folding leaves its leading/trailing spaces exactly where they were.
# (`_fold` is not length-preserving in general — NFKD expands ligatures and
# fractions, "ﬁ" to "fi" and "½" to "1 2" — so a non-ASCII phrase added later
# would need its padding rechecked.)
_CV_PHRASES_FOLDED = tuple(sorted({_fold(p) for p in _CV_PHRASES}))

def _reject_empty_vocabulary(
    prefixes: Sequence[str], exact: Iterable[str], phrases: Sequence[str]
) -> None:
    """Refuse a CV vocabulary entry that folds away to nothing.

    THE FAILURE THIS PREVENTS IS TOTAL, AND SILENT. `"x".startswith("")` is True
    and a blank phrase is a substring of every padded query, so ONE entry that
    folds to an empty string makes `wants_cv` return True for every question the
    site is ever asked. The CV route skips the relevance gate, so that is the
    containment gate off for every visitor, caused by an edit that looks like a
    typo (a stray "-", an entry that is only a combining mark).

    Called at import, so the process refuses to start rather than serving an
    unguarded model. A separate function rather than an inline `if` so the check
    can be tested with a bad vocabulary, which a module-level statement cannot.
    """
    if not all(prefixes) or not all(exact):
        raise ValueError("a CV vocabulary entry folds to an empty token")
    if not all(phrase.strip() for phrase in phrases):
        raise ValueError("a CV phrase folds to whitespace only")


_reject_empty_vocabulary(_CV_PREFIXES_FOLDED, _CV_EXACT_FOLDED, _CV_PHRASES_FOLDED)


def wants_cv(query: str) -> bool:
    """True when the query asks about work experience / career / the CV itself."""
    tokens = _fold(query).split()
    if any(tok in _CV_EXACT_FOLDED for tok in tokens):
        return True
    if any(tok.startswith(prefix) for tok in tokens for prefix in _CV_PREFIXES_FOLDED):
        return True
    padded = f" {' '.join(tokens)} "
    return any(phrase in padded for phrase in _CV_PHRASES_FOLDED)


# Research / recency-coverage intent. "tell me about Mikko's latest research",
# "what has he published", "kerro viimeisimmistä tutkimuksista". Pure similarity
# BURIES the newest research: every research post is project='portfolio', so the
# generic-query diversity cap collapses them to a single slot, and doc_date has no
# ranking weight — so on this intent `retrieval.retrieve()` forces the newest
# research posts (by doc_date) into context (see db.recent_research). PREFIX
# matching like the CV route so Finnish inflection is covered without a stemmer
# (tutkimus / tutkimuksesta / tutkimuksista…). English markers also catch the
# English translate-for-retrieval anchor of a Finnish question. High-precision
# stems only — a wrong guess would prepend real-distance research chunks (it never
# invents, and cannot rescue an off-topic query past the weak-retrieval gate), but
# keeping the vocabulary tight keeps the diversity/coverage behaviour predictable.
_RESEARCH_MARKERS = (
    "research",
    "finding",  # finding / findings
    "experiment",  # experiment / experiments / experimental
    "benchmark",
    "measurement",  # measurement / measurements
    "tutkimu",  # fi: tutkimus / tutkimuksesta / tutkimuksista / tutkimuksia
    "mittau",  # fi: mittaus / mittauksesta (measurement)
    "forskning",  # sv: research
    # NB: deliberately NOT "study"/"studie" — those false-fire on the education
    # question "where did Mikko study?", which is a CV/bio query, not a research
    # sweep. "research"/"experiment"/"finding" carry the research intent instead.
    # Keep in sync with `_PREPOSITIONAL_RESEARCH_MARKERS` below, which is the
    # subset the off-corpus check may read. The split is semantic, not derivable:
    # adding a marker here does NOT arm the veto for it (and must not, for any
    # Finnish stem — see that constant's note).
)


# Asking HOW TO GET the research is not a research sweep, and treating it as one
# actively breaks the answer.
#
# MEASURED, from a real visitor. "miten voin kopioida tutkimusdokumentteja?" fired
# the coverage intent on "tutkimu", which force-occupies the top three context
# slots with the newest research posts. Those sat at 0.44 to 0.49 while the
# document that actually answers the question (site-terminal.md, describing the
# `download` command) sat at 0.165, the best chunk in the corpus for that query,
# pushed to position four. On the Finnish phrasing it was crowded out of the
# context entirely. The model dutifully listed research posts, and in the logged
# answer recommended a build script from an unrelated project.
#
# Coverage forcing exists because pure similarity BURIES the newest research. That
# reasoning does not apply when the question is about obtaining it: there the
# ranking was already right and the forcing is what broke it.
# WHICH DIRECTION TO ERR IN, decided once here rather than per marker. A veto
# that fires wrongly only skips coverage forcing, and a direct content question
# still retrieves its own document by similarity: mild. A veto that FAILS to fire
# reproduces the original bug, where the document holding the answer is pushed
# out of the context: a plainly wrong answer. So the list leans inclusive.
#
# VERBS, NOT "pdf". The first version matched the bare noun, which vetoed
# "what does the findings pdf say" and "which experiment is in the pdf" — content
# questions that should keep coverage. `where can i get` carries the pdf cases
# that actually are about obtaining.
_ACQUISITION_MARKERS = (
    "download",
    "lataa",  # fi: lataa / lataan / lataaminen
    "ladat",  # fi: ladata / latasin
    "kopioi",  # fi: kopioida / kopioin
    "tallenna",  # fi: tallentaa / tallennan (save)
    "ladda",  # sv: ladda ner
    "obtain",
    "copy",
    "copie",  # copies
    # KNOWN COLLATERAL, accepted: "lataa" also starts lataamo (a charging depot)
    # and lataaja (a loader), so "onko lataamon tutkimus valmis" is vetoed. Finnish
    # inflects by suffix, so no prefix separates them, and by the rule above a
    # false veto is the cheap direction. Neither word can occur in this corpus.
)

# Multi-word forms whose individual words are far too common to stem. "get" and
# "saada" would match most of the language; the phrase does not.
_ACQUISITION_PHRASES = (
    " get a copy ",
    " where can i get ",
    " where can i find ",
    " how do i get ",
    " how can i get ",
    " mistä saan ",
    " miten saan ",
    " mistä löydän ",
    " voinko saada ",
)

# Folded once at import, and validated by the same guard the CV vocabulary uses:
# an entry that folds away to nothing would veto every research question, quietly
# disabling coverage forcing for the whole site.
_RESEARCH_MARKERS_FOLDED = tuple(sorted({_fold(m).strip() for m in _RESEARCH_MARKERS}))
_ACQUISITION_MARKERS_FOLDED = tuple(
    sorted({_fold(m).strip() for m in _ACQUISITION_MARKERS})
)
_ACQUISITION_PHRASES_FOLDED = tuple(sorted({_fold(p) for p in _ACQUISITION_PHRASES}))
_reject_empty_vocabulary(
    _RESEARCH_MARKERS_FOLDED + _ACQUISITION_MARKERS_FOLDED,
    (),
    _ACQUISITION_PHRASES_FOLDED,
)


def is_research_coverage_request(query: str) -> bool:
    """True when the query asks broadly about Mikko's research / latest findings.

    Fires on a research-genre marker UNLESS a specific *other* project is named,
    so "how did you research the HRM domain model?" does NOT fire (that is an hrm
    question, served by normal project-aware retrieval) but "what research has
    Mikko published?" does. Reuses `detect_projects` for the exclusion so the two
    stay in sync. Recency words ("latest"/"viimeisin") are deliberately NOT
    required — a plain "what research has he done" should surface the newest too.

    It also does not fire when the query asks how to OBTAIN the research rather
    than what is in it; see `_ACQUISITION_MARKERS` for the measurement behind
    that.

    Folded through `_fold`, the same normalisation `wants_cv` uses, so a Finnish
    question typed without diacritics is read the same as one with them. This
    function used to lowercase only, which is the exact gap that made `wants_cv`
    miss "mita tyokokemusta sinulla on" while matching its accented twin.
    """
    tokens = _fold(query).split()
    has_research = any(
        tok.startswith(marker) for tok in tokens for marker in _RESEARCH_MARKERS_FOLDED
    )
    if not has_research:
        return False
    if any(
        tok.startswith(marker)
        for tok in tokens
        for marker in _ACQUISITION_MARKERS_FOLDED
    ):
        return False
    padded = f" {' '.join(tokens)} "
    if any(phrase in padded for phrase in _ACQUISITION_PHRASES_FOLDED):
        return False
    # A named non-portfolio project makes this a project question, not a
    # research-corpus sweep — defer to normal project-aware retrieval.
    return not (detect_projects(query) - {"portfolio"})


# The subset of `_RESEARCH_MARKERS` whose languages bind a topic with a
# PREPOSITION ("research ON x", "forskning OM x"). Finnish stems are excluded on
# purpose and must never be added: Finnish marks its topic with a case ending and
# uses no preposition, and Finnish "on" is the COPULA — "mitkä tutkimukset on
# julkaistu" means "which studies HAVE BEEN published". Reading that "on" as the
# English preposition would veto a genuine sweep, so the rule below is kept
# structurally unable to see it. That is what buys Finnish correctness with no
# language ID, no threaded flag, and no import edge into guardrails.
_PREPOSITIONAL_RESEARCH_MARKERS = (
    "research",
    "finding",
    "experiment",
    "benchmark",
    "measurement",
    "forskning",  # sv: safe here — Swedish has no "on"-copula homograph
)

# Prepositions that bind a SUBJECT to a research noun. Closed by construction —
# this is a grammatical role, not a vocabulary. It is never a list of subjects:
# enumerating the world's topics is exactly what makes a whitelist unmaintainable.
# "in"/"for" are deliberately absent: both read temporally far more often than
# topically ("any findings IN 2026", "what research stands out FOR you"), and that
# reading collides head-on with the recency framing this feature exists to serve.
# Their absence leaves "research in quantum computing" un-vetoed — today's
# behaviour, and a cheaper miss than vetoing the flagship recency question.
_TOPIC_PREPOSITIONS = frozenset({"on", "about", "into", "regarding", "concerning", "om"})

# Closed-class words that name no subject: "findings on THIS" is still a sweep.
_DEICTIC_WORDS = frozenset(
    {
        "this",
        "that",
        "these",
        "those",
        "it",
        "them",
        "they",
        "the",
        "a",
        "an",
        "your",
        "his",
        "her",
        "its",
        "their",
        "our",
        "my",
        "all",
        "any",
        "some",
        "everything",
        "anything",
    }
)

# Tokens compare edge-stripped so "research," and "computing?" match; interior
# punctuation survives for detect_projects (".net", "readlog.net").
_EDGE_PUNCT = "\"'`.,;:!?()[]{}<>*_~…—–-"

# How far past the marker a binding preposition may sit. 5 covers the realistic
# "what research has been done ON x" (preposition at marker+4) — measured to leak
# at 3. Unbounded was measured strictly worse: it gains no containment and starts
# vetoing on chatty tails ("...published? I'm working on a startup"). Failing to
# find a preposition fails OPEN (toward today's behaviour), so the bound can only
# ever cost containment, never recall.
#
# Distance alone cannot decide this: at THIS width English also strands the
# preposition ("what research have you been working ON lately" fronts the object,
# leaving "on" bound to nothing), which read the adverbial tail as a subject and
# vetoed 16 measured genuine sweeps. Narrowing to adjacency fixed those but lost
# "what research has been done on quantum computing" — a real off-corpus query. So
# the tail's CONTENT decides, in `_names_foreign_subject`, not its distance.
_TOPIC_PREP_WINDOW = 5

# What a STRANDED preposition trails: temporal adverbials ("...working on LATELY",
# "...landed on SO FAR") and references to Mikko's own publishing surface
# ("...published on YOUR SITE"). Neither names an outside subject, so neither may
# arm the veto.
#
# This is a CLOSED grammatical class, which is why it is not round 1's fatal
# mistake. Round 1 died whitelisting FRAMING vocabulary ("key", "interesting",
# "shown") — unbounded, because any adjective or verb can frame a question. These
# words only ever occupy one narrow slot: the tail of a stranded preposition. That
# slot admits adverbials, not arbitrary prose.
_NON_SUBJECT_TAIL_WORDS = frozenset(
    {
        # temporal adverbials
        "lately",
        "recently",
        "recent",
        "now",
        "currently",
        "today",
        "yesterday",
        "tomorrow",
        "tonight",
        "so",
        "far",
        "then",
        "again",
        "nowadays",
        "year",
        "years",
        "month",
        "months",
        "week",
        "weeks",
        "day",
        "days",
        "time",
        "times",
        "end",
        "in",
        "ago",
        "since",
        "yet",
        "still",
        "ever",
        "later",
        "before",
        "after",
        "during",
        "while",
        "first",
        "last",
        "next",
        # Mikko's own publishing surface — not an outside subject
        "blog",
        "site",
        "website",
        "page",
        "pages",
        "portfolio",
        "terminal",
        "here",
        "own",
        "record",
        "paper",
        "papers",
        "post",
        "posts",
        "writeup",
    }
)


def _names_foreign_subject(topic: str) -> bool:
    """True when `topic` names a subject outside Mikko's corpus."""
    cores = [t.strip(_EDGE_PUNCT).lower() for t in topic.split()]
    cores = [c for c in cores if c]
    if not cores:
        return False
    # "the findings ON the experiments" points at the research genre itself; "...working
    # on LATELY" points at no subject at all. EVERY token must be genre, deictic or a
    # non-subject tail to earn that reading: `any` let a single genre noun anywhere in
    # the tail disarm the veto, so "latest research on quantum computing experiments"
    # claimed — the live bug's own class, rescued by one trailing noun.
    if all(
        c in _DEICTIC_WORDS
        or c in _NON_SUBJECT_TAIL_WORDS
        or c.startswith(_PREPOSITIONAL_RESEARCH_MARKERS)
        for c in cores
    ):
        return False
    return not detect_projects(topic)


def names_offcorpus_research_topic(intent_text: str) -> bool:
    """True when the text asks for research ON A SUBJECT the corpus does not cover.

    Gates the deterministic recency CLAIM only, never the injection. The measured
    fabrication ("what is the latest research on quantum computing" → the model
    asserting a portfolio post "mentions ... quantum computing") appeared only once
    that claim started stating "Mikko's most recent research is <X>"; the same query
    with the posts merely injected hedged correctly. So the posts still go in and
    the retrieval gate anchor is untouched — only the claim stands down.

    The fabrication's signature is a research noun BINDING a subject through a
    preposition, where the subject is none of Mikko's. Only the subject slot is
    looked up, and only against `detect_projects` — a closed, already-maintained
    lexicon of his own work. The framing around it ("key", "interesting", "shown")
    is never consulted: English framing vocabulary is unbounded, and any rule that
    must enumerate it collapses into vetoing genuine questions.

    Scanned per LINE: `intent_text` is "<english translation>\\n<original>", and a
    preposition on one line must never bind a marker on the other.
    """
    for line in intent_text.splitlines():
        raw = line.split()
        cores = [t.strip(_EDGE_PUNCT).lower() for t in raw]
        for i, core in enumerate(cores):
            if not core.startswith(_PREPOSITIONAL_RESEARCH_MARKERS):
                continue
            window = min(i + 1 + _TOPIC_PREP_WINDOW, len(cores))
            for j in range(i + 1, window):
                if cores[j] in _TOPIC_PREPOSITIONS and _names_foreign_subject(
                    " ".join(raw[j + 1 :])
                ):
                    return True
    return False
