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
