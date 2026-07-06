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
)
_CV_EXACT = ("cv",)
_CV_PHRASES = (" work experience ", " work history ", " employment history ")


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
