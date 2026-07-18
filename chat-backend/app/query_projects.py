"""Detect which portfolio project(s) a question is about, from its text.

Pure cosine retrieval is blind to project identity: a question that names a
specific project ("how did ReadLog .NET handle the find-or-create race?") will
happily pull a semantically-similar passage from a *different* project (e.g.
Platform's achievement-double-unlock race) and answer from it — confidently
wrong. This module recognises a project named in the query so retrieval can
bias toward that project's own chunks (see `retrieval.retrieve`).

Alias-based, not embedding-based, on purpose: it is deterministic, stdlib-only,
trivially unit-tested, and a wrong guess only re-orders candidates (never
invents). Adding a project to the corpus means adding its id + aliases here.
"""

from __future__ import annotations

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
        # Tech aliases: readlog-dotnet is the only Microsoft/.NET project, so these
        # ecosystem terms point at it — "the microsoft stack projects" surfaced
        # nothing before because the docs say ".NET"/"C#", not "Microsoft". Bare
        # "c#" (a musical note — and there IS a music project) and "razor" (shaving,
        # "razor-thin") are deliberately NOT aliases; use the scoped/qualified
        # forms below. "azure"/"microsoft" can also mean a colour / Office, but in a
        # dev-portfolio chat the cloud/.NET reading dominates and a wrong guess only
        # re-orders already-retrieved chunks (it never invents).
        "microsoft",
        ".net",
        "dotnet",
        "csharp",
        "asp.net",
        "aspnet",
        "ef core",
        "entity framework",
        "razor pages",
        "azure",
    ],
    "readlog": ["readlog"],
    "hrm": ["hrm", "hrmanager", "hr manager"],
    "spacepotatis": ["spacepotatis", "space potatis", "phaser"],
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
    # "rust" is a tech alias on the microsoft/.net precedent above: this is the
    # only Rust project, and word-boundary matching keeps "trust"/"crust" from
    # firing. Finnish inflections listed explicitly (matching is not stemmed).
    "passwordmanager": [
        "passwordmanager",
        "password manager",
        "password-manager",
        "rust",
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
        "chatbot",
    ],
}

# Flattened alias -> project_id for scanning. Built once at import.
_ALIAS_TO_PROJECT: dict[str, str] = {
    alias: project_id
    for project_id, aliases in PROJECT_ALIASES.items()
    for alias in aliases
}


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
    readlog. Empty result => caller must behave exactly as plain cosine search.
    """
    text = query.lower()
    occurrences: list[tuple[int, int, str]] = []
    for alias, project_id in _ALIAS_TO_PROJECT.items():
        start = 0
        while True:
            idx = text.find(alias, start)
            if idx == -1:
                break
            end = idx + len(alias)
            if _word_ish_boundary(text, idx, end):
                occurrences.append((idx, end, project_id))
            start = idx + 1
    # Longest alias first (most specific claims the span), then by position.
    occurrences.sort(key=lambda o: (-(o[1] - o[0]), o[0]))
    claimed: list[tuple[int, int]] = []
    detected: set[str] = set()
    for start, end, project_id in occurrences:
        if any(start < c_end and end > c_start for c_start, c_end in claimed):
            continue  # overlaps an already-claimed (longer/earlier) span
        claimed.append((start, end))
        detected.add(project_id)
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
    "ansioluettelo",
    "arbetserfarenhet",  # Swedish visitors ask too; the boost is language-neutral
    "career",
    "employment",
    "resume",
    "résumé",
    # Asking about a named EMPLOYER is a work-experience question — the answer
    # lives in the CV's Experience chunk, which cosine ranks ~0.46 for such
    # queries (out of top-k AND beyond the gate; measured live on "mitä mikko
    # teki kasvulabsissa?"). The prefix absorbs Finnish case endings.
    "kasvulabs",  # kasvulabsissa / kasvulabsin…
)
_CV_EXACT = ("cv",)
_CV_PHRASES = (
    " work experience ",
    " work history ",
    " employment history ",
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


def wants_cv(query: str) -> bool:
    """True when the query asks about work experience / career / the CV itself."""
    # Same normalization as the language router: non-alphanumerics fold to spaces
    # so "CV?" and "työkokemusta?" tokenize cleanly; accents (é) survive isalnum.
    text = "".join(c if c.isalnum() else " " for c in query.lower())
    tokens = text.split()
    if any(tok in _CV_EXACT for tok in tokens):
        return True
    if any(tok.startswith(prefix) for tok in tokens for prefix in _CV_PREFIXES):
        return True
    padded = f" {' '.join(tokens)} "
    return any(phrase in padded for phrase in _CV_PHRASES)


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


def is_research_coverage_request(query: str) -> bool:
    """True when the query asks broadly about Mikko's research / latest findings.

    Fires on a research-genre marker UNLESS a specific *other* project is named,
    so "how did you research the HRM domain model?" does NOT fire (that is an hrm
    question, served by normal project-aware retrieval) but "what research has
    Mikko published?" does. Reuses `detect_projects` for the exclusion so the two
    stay in sync. Recency words ("latest"/"viimeisin") are deliberately NOT
    required — a plain "what research has he done" should surface the newest too;
    if evals ever show this over-firing, the documented tightening is to also
    require a recency marker.
    """
    text = "".join(c if c.isalnum() else " " for c in query.lower())
    tokens = text.split()
    has_research = any(
        tok.startswith(marker) for tok in tokens for marker in _RESEARCH_MARKERS
    )
    if not has_research:
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
_TOPIC_PREPOSITIONS = frozenset(
    {"on", "about", "into", "regarding", "concerning", "om"}
)

# Closed-class words that name no subject: "findings on THIS" is still a sweep.
_DEICTIC_WORDS = frozenset(
    {
        "this", "that", "these", "those", "it", "them", "they", "the", "a", "an",
        "your", "his", "her", "its", "their", "our", "my", "all", "any", "some",
        "everything", "anything",
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
        "lately", "recently", "recent", "now", "currently", "today", "yesterday",
        "tomorrow", "tonight", "so", "far", "then", "again", "nowadays", "year",
        "years", "month", "months", "week", "weeks", "day", "days", "time",
        "times", "end", "in", "ago", "since", "yet", "still", "ever", "later",
        "before", "after", "during", "while", "first", "last", "next",
        # Mikko's own publishing surface — not an outside subject
        "blog", "site", "website", "page", "pages", "portfolio", "terminal",
        "here", "own", "record", "paper", "papers", "post", "posts", "writeup",
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
