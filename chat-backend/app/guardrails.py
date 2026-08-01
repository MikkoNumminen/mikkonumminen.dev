"""Retrieval-strength guardrail — the deterministic anti-hallucination gate.

The grounded system prompt (prompts.py) already tells the model to refuse when
the context is irrelevant, but that is advisory. This adds a hard gate in front
of generation: when retrieval is empty (un-indexed DB) or every retrieved chunk
is too far in cosine distance to be relevant, the pipeline returns a clean
canned refusal WITHOUT calling the LLM — so a clearly off-topic question can
never be answered from hallucinated content.

The distance threshold is conservative (errs toward answering) because the
prompt-level guardrail handles the borderline cases; the gate exists to catch
the clearly-irrelevant tail. Tune `WEAK_RETRIEVAL_DISTANCE` against the eval
harness (evals/run_eval.py). Pure (lingua for language ID aside), so it is
unit-tested.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from lingua import Language, LanguageDetector, LanguageDetectorBuilder

from .retrieval import RetrievedChunk

# Shown verbatim (not LLM-generated) when retrieval is too weak to ground an
# answer. Matches the grounded prompt's refusal wording so the two paths read
# the same to a visitor.
WEAK_RETRIEVAL_REPLY = (
    "I don't have anything on that. Try `help` to see what I can answer "
    "about Mikko's projects."
)
# Finnish counterparts of every deterministic template below. The generated
# answer path went Finnish with RAG_ALLOW_FINNISH, but the TEMPLATE paths
# (refusals, small talk, busy, the expansion offer) stayed English-only - so a
# Finnish visitor asking anything off-topic, or just saying "kiitos", got
# English with zero model involvement. Selected by the same routing the answer
# path uses; the English constants stay the defaults everywhere else.
WEAK_RETRIEVAL_REPLY_FI = (
    "Minulla ei ole tietoa tuosta. Kokeile `help`-komentoa, niin näet mihin "
    "osaan vastata Mikon projekteista."
)

# Appended to a REFUSAL only when the question looks non-English. The corpus and
# answers are English-only, and the English embedder penalises Finnish/Swedish, so
# a borderline non-English question can get gated — this nudges the visitor to
# rephrase rather than leaving a bare refusal. Never shown on a successful answer.
ENGLISH_ONLY_HINT = "\n\nTip: I answer in English — try asking in English."

# Appended when the model hit LLM_NUM_PREDICT instead of finishing its sentence.
# Measured before this existed: 169 of 2547 answers ended at exactly the cap, and
# a visitor saw three in a row stop mid-word ("...voidaan tarkastaa ket"). Nothing
# downstream could tell a truncated answer from a finished one, so the visitor was
# left to assume the thing was broken. Saying so is cheaper than pretending, and
# it is honest about WHY, so "ask for less at a time" is an obvious next move.
TRUNCATED_NOTICE = (
    "\n\n[Answer cut off at the length limit. "
    "Ask for a narrower slice of it to see the rest.]"
)
TRUNCATED_NOTICE_FI = (
    "\n\n[Vastaus katkesi pituusrajaan. "
    "Kysy rajatumpaa osaa, niin näet loput.]"
)


def truncation_notice(finish_reason: str | None, *, finnish: bool) -> str | None:
    """The suffix to append when generation was cut off, or None.

    Only "length" means truncation. "stop" is a model that finished, and an
    absent reason is an older Ollama that streams none — neither should be
    reported as cut off, because a false "I was truncated" on a complete answer
    is worse than the silence this replaces.
    """
    if finish_reason != "length":
        return None
    return TRUNCATED_NOTICE_FI if finnish else TRUNCATED_NOTICE


def looks_non_english(query: str) -> bool:
    """Cheap heuristic: the query carries a non-ASCII letter (e.g. Finnish/Swedish
    ä/ö/å). ASCII-only English queries never trip it; a rare accented English word
    only adds a harmless hint to an already-refused answer."""
    return any(ch.isalpha() and ord(ch) > 127 for ch in query)


# Language routing. Statistical language ID (lingua) replaced the hand-tuned
# marker/diacritic/case-suffix heuristic: the heuristic scored well on the curated
# eval sets it was tuned against (103/104) but caught only 1/12 of the TERSE
# queries real visitors type ("Onko projekteja?", "Työkokemus?", "Listaa
# projektit") — every leak meant another hand-added marker. Lingua scores 104/104
# on the eval sets and 12/12 on the terse set, offline and CPU-only. Candidates
# restricted to EN/FI/SV, and a smaller set is both faster and harder to
# confuse. SWEDISH stays a candidate even though the site dropped Swedish in
# 2026-08, and that is deliberate: detecting a language is not the same as
# serving it. With SV removed from this tuple the detector has only two
# options left and reads Swedish as Finnish, so "Vilket projekt är mest
# komplext?" came back in FINNISH — measured. Keeping SV means a Swedish
# question fails looks_finnish and gets ENGLISH, which is the language a
# Swedish speaker is far likelier to read. Built lazily — the models are
# ~100MB and must not load at import (unit tests of unrelated guardrails
# would pay for it).
_LANGUAGES = (Language.ENGLISH, Language.FINNISH, Language.SWEDISH)
_detector: LanguageDetector | None = None

# Below this many letters ("ok", "np") language ID is guesswork — such messages
# are small-talk, not questions, and the small-talk fast path answers them in
# English anyway; defaulting to English keeps routing and reply consistent.
_MIN_ALPHA_FOR_DETECTION = 4


def _get_detector() -> LanguageDetector:
    global _detector
    if _detector is None:
        _detector = LanguageDetectorBuilder.from_languages(*_LANGUAGES).build()
    return _detector


def answer_language(text: str) -> str:
    """'fi' | 'en' | 'sv' | 'und' for a generated ANSWER — observability only.

    Logged per answered request so Poro's residual mid-answer language drift
    (a Finnish question answered in English, or vice versa) becomes a measured
    rate in the request log instead of an anecdote. 'und' for text too short
    to identify. Never used for routing — looks_finnish stays the single
    routing definition.
    """
    if sum(1 for c in text if c.isalpha()) < _MIN_ALPHA_FOR_DETECTION:
        return "und"
    detected = _get_detector().detect_language_of(text)
    if detected == Language.FINNISH:
        return "fi"
    if detected == Language.SWEDISH:
        return "sv"
    if detected == Language.ENGLISH:
        return "en"
    return "und"


# Year-shaped tokens (1900-2099). Years are the invented-fact class observed
# live (an employment dated 2019-2021 by the model against a 2022-2024 context)
# and the one fact type extractable with near-zero false positives.
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")


def unsupported_years(response: str, supported_texts: Sequence[str]) -> list[str]:
    """Years stated in `response` that appear in NONE of `supported_texts`.

    The deterministic invented-fact detector for the answered route: supported
    texts are the retrieved context chunks plus the user's own question (a year
    the visitor asked about may legitimately be echoed). Sorted for a stable
    log field. Empty list = every year in the answer is grounded.
    """
    stated = set(_YEAR_RE.findall(response))
    if not stated:
        return []
    supported: set[str] = set()
    for text in supported_texts:
        supported.update(_YEAR_RE.findall(text))
    return sorted(stated - supported)


# English function words that are never standalone Finnish words. A sentence
# dense with Finnish proper nouns ("What did Mikko do at Kasvu Labs?") tips the
# statistical detector to Finnish, and the visitor gets a Finnish answer to an
# English question. Two of these as whole tokens is decisive the other way:
# real Finnish essentially never contains them, so the override costs nothing
# on the Finnish side. Deliberately EXCLUDED look-alikes: "on" (Finnish 'is'),
# "me" ('we'), "he" ('they'), "no" (interjection), "a"/"i" (too short).
_ENGLISH_OVERRIDE_WORDS = frozenset(
    {
        "what", "did", "does", "the", "at", "how", "why", "who", "when",
        "where", "which", "your", "you", "have", "has", "with", "from",
        "about", "that", "this", "do", "are", "was", "were", "his", "her",
        "their", "them", "and", "but", "not",
    }
)


# Code-shaped spans: backticked text, dotted/path names (scripts/export.js),
# kebab-case filenames (gdpr-actions.ts), snake_case, digit-bearing
# identifiers (sha256), camelCase and PascalCase (exportMyData, HeroVoiceover —
# but not acronyms like HRM or names like Mikko, which need no internal case
# change). Bare kebab compounds ("real-time", Finnish "linja-auto") are
# deliberately NOT stripped: they are ordinary prose in the site's languages,
# and only the extension-bearing kebab shape is unambiguously code.
# Identifiers are language-neutral, yet their character n-grams drag
# statistical language ID off Finnish — measured live 2026-07-10:
# "kerro exportMyData funktiosta" detected as SWEDISH and was answered in
# English. The visitor's language lives in the words AROUND an identifier, so
# detection retries on the stripped text when the raw text does not read
# Finnish.
_CODE_TOKEN_RE = re.compile(
    r"`[^`]+`"
    r"|\b\w+(?:-\w+)+(?:\.\w+)+\b"
    r"|\b\w+(?:[./:]\w+)+\b"
    r"|\b\w+_\w+\b"
    r"|\b[A-Za-z]\w*\d\w*\b"
    r"|\b[a-z]+(?:[A-Z]\w*)+\b"
    r"|\b[A-Z]\w*[a-z]\w*(?:[A-Z]\w*)+\b"
)


# An explicit request for a Finnish ANSWER, written in any language.
#
# `looks_finnish` answers "is this text Finnish", which is a different question
# from "does this ask for Finnish". A visitor who typed "Can you tellme about the
# site in finnish?" and then "But in finnish?" was answered in English both
# times, because both messages are English. Asking twice and being ignored reads
# worse than a wrong answer.
#
# Written as explicit steps rather than one regex. The first attempt WAS one
# anchored regex and it failed four ways at once, each visible to an ordinary
# visitor: it ignored negation, so "Don't answer in Finnish" switched TO Finnish;
# it fired on any mention of the word "suomeksi", which is the label on this
# site's own language switcher; it missed the most natural phrasing there is,
# "Tell me about HRM. In Finnish."; and it could not tell a request from a
# question about behaviour, so "Does the RAG answer in Finnish?" flipped the
# language of an English visitor's answer.
_FI_PHRASE_RE = re.compile(r"\b(in\s+finnish|suomeksi)\b", re.IGNORECASE)

# Politeness and filler allowed to trail the language phrase while the request
# still counts as ending the sentence. The wide character ranges cover emoji.
_FI_TRAILER_RE = re.compile(
    r"^[\s,!.? -㌀\U0001F000-\U0001FAFF]*"
    r"(please|thanks|thank\s+you|kiitos|if\s+you\s+can|for\s+me|this\s+time"
    r"|too|as\s+well)?"
    r"[\s,!.? -㌀\U0001F000-\U0001FAFF]*$",
    re.IGNORECASE,
)

# Any of these before the language phrase means the visitor is DECLINING it.
_FI_NEGATION_RE = re.compile(
    r"\b(don'?t|do\s+not|doesn'?t|no\s+need|not|without|never|rather\s+not"
    r"|instead\s+of|en\s+halua|ei\s+tarvitse|älä)\b",
    re.IGNORECASE,
)

# The sentence has to point the request at the assistant. `write` excludes
# "write-up": the hyphen is a word boundary, so a bare \bwrite\b matches inside a
# noun with nothing to do with authoring ("is the write-up published in Finnish?").
_FI_DIRECTIVE_RE = re.compile(
    r"\b(you|answer|reply|respond|say|tell|explain|write(?!-)|put|give|do|make"
    r"|same|sama|vastaa|kerro|kirjoita|selitä)\b",
    re.IGNORECASE,
)

# An interrogative whose subject is NOT the assistant asks ABOUT something rather
# than requesting it. "Does the RAG answer in Finnish?" describes; "Can you answer
# in Finnish?" requests. Only the second should change the answer's language.
_FI_THIRD_PARTY_QUESTION_RE = re.compile(
    r"^\s*(does|do|did|is|are|was|were|will|would|can|could|has|have|which|what"
    r"|how\s+many)\b(?!\s+(you|u)\b)",
    re.IGNORECASE,
)

# Translation trivia asks for one word, not for the whole reply to change
# language. is_translation_request declines these before retrieval; this stops
# them ALSO flipping the answer language on the way.
_FI_TRANSLATION_TRIVIA_RE = re.compile(
    r"\bhow\s+(do|would)\s+you\s+(say|write|spell|pronounce)\b", re.IGNORECASE
)

# Connectors a follow-up opens with. They carry no request of their own, so a
# sentence that is only a connector plus the language phrase is still bare.
_FI_CONNECTOR_RE = re.compile(
    r"^(and|but|ok|okay|now|so|also|then|ja|mutta)\b", re.IGNORECASE
)

_SENTENCE_SPLIT_RE = re.compile(r"[.?!\n]+")


def _sentence_requests_finnish(sentence: str) -> bool:
    """True when this one sentence is itself a request to answer in Finnish."""
    match = _FI_PHRASE_RE.search(sentence)
    if match is None:
        return False
    before, after = sentence[: match.start()], sentence[match.end() :]
    # The phrase has to END the sentence. Mid-sentence it modifies a noun ("the
    # tests in Finnish translations") instead of directing the reply.
    if not _FI_TRAILER_RE.match(after):
        return False
    if _FI_NEGATION_RE.search(before):
        return False
    if _FI_TRANSLATION_TRIVIA_RE.search(sentence):
        return False
    if _FI_THIRD_PARTY_QUESTION_RE.match(sentence.strip()):
        return False
    # A bare "In Finnish." is a complete request by itself, and so is one behind
    # a connector: "But in finnish?" was the visitor's actual second message, and
    # "...use? Also, in Finnish please." is the same shape one sentence along.
    # Anything longer has to actually point at the assistant.
    lead = _FI_CONNECTOR_RE.sub("", before.strip(" ,;:"), count=1).strip(" ,;:")
    if not lead:
        return True
    return bool(_FI_DIRECTIVE_RE.search(before))


def requests_finnish_answer(text: str) -> bool:
    """True when the message asks for the ANSWER in Finnish, in any language.

    Deliberately narrow. This only decides which language a grounded answer is
    written in; it never unlocks a capability. "Translate X to Finnish" is a
    different thing and is declined earlier by `is_translation_request`, which
    runs before retrieval — so widening this cannot be used to reach the
    translator the task gate exists to refuse.

    Checked per sentence, because people put the topic first and the language
    second: "Tell me about HRM. In Finnish." is two sentences, and the request is
    the short one.
    """
    if not text.strip():
        return False
    return any(
        _sentence_requests_finnish(part)
        for part in _SENTENCE_SPLIT_RE.split(text)
        if part.strip()
    )


def looks_finnish(text: str) -> bool:
    """True when the text reads as Finnish (statistical language ID over EN/FI/SV).

    The SINGLE shared definition for both the pipeline's Finnish answer-path routing
    (when RAG_ALLOW_FINNISH is on) and the acceptance harness's language assertion —
    so routing and the test can never disagree on the same text (a Finnish query
    that routes to English is also judged not-Finnish by the check, not a spurious
    failure)."""
    if sum(1 for c in text if c.isalpha()) < _MIN_ALPHA_FOR_DETECTION:
        return False
    # Deterministic tie-break BEFORE the statistical calls: two unambiguous
    # English function words settle the language regardless of how many Finnish
    # proper nouns surround them (the "What did Mikko do at Kasvu Labs?" class).
    # Counted on the code-stripped text so identifier SEGMENTS don't leak into
    # the tally ("mission_not_completed" is not the words "not" + "completed");
    # queries without code shapes tokenize identically either way.
    stripped = _CODE_TOKEN_RE.sub(" ", text)
    tokens = "".join(c if c.isalpha() else " " for c in stripped.lower()).split()
    if sum(1 for t in tokens if t in _ENGLISH_OVERRIDE_WORDS) >= 2:
        return False
    if _get_detector().detect_language_of(text) == Language.FINNISH:
        return True
    # Raw detection short-circuits above, so every phrasing that already routed
    # Finnish keeps routing identically; the stripped retry only ADDS the
    # code-token class ("kerro exportMyData funktiosta"). Too-short residue
    # (a bare identifier plus punctuation) keeps the English default.
    stripped_alpha = sum(1 for c in stripped if c.isalpha())
    if stripped != text and stripped_alpha >= _MIN_ALPHA_FOR_DETECTION:
        return _get_detector().detect_language_of(stripped) == Language.FINNISH
    return False


# Templated replies for the no-LLM small-talk fast path. A greeting or a thanks is
# ANSWERED here without retrieval or the model — distinct from the DECLINE gates,
# which refuse out-of-scope requests.
GREETING_REPLY = (
    "Hi! I'm the assistant for Mikko Numminen's portfolio. Ask me about his "
    "projects — HRM, AudiobookMaker, ReadLog .NET, Spacepotatis, and more — the "
    "tech behind them, or his experience. Type `help` for the scripted commands."
)
GREETING_REPLY_FI = (
    "Hei! Olen Mikko Nummisen portfolion avustaja. Kysy minulta hänen "
    "projekteistaan — HRM, AudiobookMaker, ReadLog .NET, Spacepotatis ja muut — "
    "niiden tekniikoista tai hänen kokemuksestaan. Komennolla `help` näet "
    "valmiit komennot."
)
COURTESY_REPLY = (
    "You're welcome! Anything else you'd like to know about Mikko's projects or work?"
)
COURTESY_REPLY_FI = (
    "Ole hyvä! Haluatko tietää jotain muuta Mikon projekteista tai työstä?"
)

# Whole-message small talk. The matcher compares the WHOLE normalized message
# against these sets — never a substring — so a real question that merely opens
# with "hi" or "thanks" ("hi, how does retrieval work") falls through to the
# normal pipeline. Greeting + capability phrasings share GREETING_REPLY; thanks is
# its own COURTESY route. EN + FI.
_GREETINGS = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "yo",
        "hi there",
        "hello there",
        "hey there",
        "good morning",
        "good evening",
        "good afternoon",
        "good day",
        "sup",
        "howdy",
        "greetings",
        "hei",
        "moi",
        "moikka",
        "terve",
        "morjens",
        "moro",
        "heippa",
        "hei hei",
        "huomenta",
        "iltaa",
        "hyvää huomenta",
        "hyvää iltaa",
        "what can you do",
        "what do you do",
        "what can i ask",
        "who are you",
        "help",
        "mitä osaat",
        "mitä sinä osaat",
        "kuka olet",
        "mitä voin kysyä",
    }
)
_COURTESY = frozenset(
    {
        "thanks",
        "thank you",
        "thank u",
        "thankyou",
        "ty",
        "thx",
        "cheers",
        "thanks a lot",
        "thanks so much",
        "thank you so much",
        "kiitos",
        "kiitti",
        "kiitos paljon",
        "kiitoksia",
    }
)


# The Finnish members of the small-talk sets. A bare greeting is far too short
# for statistical language ID (looks_finnish deliberately defaults short text to
# English), but the matched PHRASE's language is known exactly — so the template
# language rides on which member matched, not on the detector.
_SMALLTALK_FI = frozenset(
    {
        "hei",
        "moi",
        "moikka",
        "terve",
        "morjens",
        "moro",
        "heippa",
        "hei hei",
        "huomenta",
        "iltaa",
        "hyvää huomenta",
        "hyvää iltaa",
        "mitä osaat",
        "mitä sinä osaat",
        "kuka olet",
        "mitä voin kysyä",
        "kiitos",
        "kiitti",
        "kiitos paljon",
        "kiitoksia",
    }
)


# Drift guard, same idiom as the acceptance harness's refusal-marker assert: a
# _SMALLTALK_FI member that is not in the route sets would be dead code (the
# route never fires for it, so the template choice never runs).
_SMALLTALK_FI_ORPHANS = _SMALLTALK_FI - (_GREETINGS | _COURTESY)
assert not _SMALLTALK_FI_ORPHANS, (
    f"_SMALLTALK_FI members missing from route sets: {_SMALLTALK_FI_ORPHANS}"
)


def is_finnish_smalltalk(query: str) -> bool:
    """True when the message is one of the FINNISH small-talk phrasings."""
    return _normalize_smalltalk(query) in _SMALLTALK_FI


def _normalize_smalltalk(query: str) -> str:
    """Lowercase, strip surrounding whitespace + terminal punctuation, and collapse
    inner whitespace — so 'Hi!  ' matches 'hi' while the comparison stays against
    the WHOLE message (inner punctuation is kept, so 'hi, how...' will not match)."""
    return " ".join(query.strip().lower().strip(".!?,").split())


def smalltalk_route(query: str) -> str | None:
    """'greeting', 'courtesy', or None — for a message that IS a standalone
    greeting/thanks, answered by template with no retrieval and no model.

    Conservative by design: only a whole-normalized-message match counts, so a real
    question that opens with a greeting or thanks falls through to the pipeline."""
    norm = _normalize_smalltalk(query)
    if norm in _GREETINGS:
        return "greeting"
    if norm in _COURTESY:
        return "courtesy"
    return None


def is_weak_retrieval(chunks: Sequence[RetrievedChunk], max_distance: float) -> bool:
    """True when retrieval is too weak to ground an answer.

    Weak means either no chunks at all (an un-indexed corpus) or the best
    (smallest-distance) chunk is still farther than `max_distance` — i.e. even
    the closest match is irrelevant. Cosine distance: smaller is more similar.

    The gate anchors on the best PROSE chunk: once the corpus holds source code,
    an off-topic query ("how do I lose weight", "what time is it in New York")
    can land a stray code chunk just inside the threshold and get answered
    off-corpus. Prose chunks are the human-readable description of Mikko's work,
    so they are the honest relevance signal. Falls back to all chunks only when
    no prose was retrieved, so a code-only corpus still works.
    """
    if not chunks:
        return True
    prose = [c for c in chunks if c.chunk_type == "prose"]
    best = min(c.distance for c in (prose or chunks))
    return best > max_distance


# Deterministic "latest research" pointer, appended when the research-coverage
# layer forced the newest research into context but the model's synthesis dropped
# it. Poro measurably answers "I don't have info on the latest research" with the
# newest post sitting at source #1 — the coverage layer guarantees the doc REACHES
# the model; this guarantees the ANSWER names it. The model may add, never drop.
LATEST_RESEARCH_LABEL = "Latest research"
LATEST_RESEARCH_LABEL_FI = "Uusin tutkimus"


def research_coverage_footer(
    chunks: Sequence[RetrievedChunk], answer: str, *, finnish: bool
) -> str | None:
    """The 'latest research' suffix to append after the answer, or None.

    None when nothing was coverage-injected, or when the answer already names the
    newest research VERBATIM (its title headline appears), so the pointer is never a
    literal duplicate. Otherwise it is appended — the guarantee is only that the
    newest research is NAMED, and a compact deterministic citation is cheaper than
    trusting Poro not to drop it. Detection matches the distinctive multi-word title
    headline, NOT a filename stem: a stem like 'rag'/'token' collides with words a
    RAG assistant emits constantly ('storage', 'tokens'), which would silently
    suppress the footer on nearly every answer. The caller keeps this OUT of the
    logged/remembered answer, exactly like the progressive-disclosure offer.
    """
    coverage = [c for c in chunks if c.is_coverage]
    if not coverage:
        return None
    newest = coverage[0]  # retrieve() prepends the coverage set newest-first
    # Trim a long "Headline: subtitle" title down to the distinctive headline.
    title = re.split(r"[:—]", newest.title, maxsplit=1)[0].strip()
    if not title:
        return None  # defensive: no headline to point at
    if title.lower() in answer.lower():
        return None  # already named verbatim — no redundant pointer
    label = LATEST_RESEARCH_LABEL_FI if finnish else LATEST_RESEARCH_LABEL
    return f"\n\n{label}: {title}."


# Progressive disclosure (Phase 5): the explicit offer appended after a concise
# answer when a deeper narrative exists. Deterministic text, never LLM-generated —
# terminal discoverability is low, so the user is told they can go deeper.
EXPANSION_OFFER = "Would you like me to tell you more?"
EXPANSION_OFFER_FI = "Haluatko, että kerron lisää?"

# A topic-LESS follow-up asking to go deeper ("yes", "tell me more", "go on").
# Matched against the WHOLE message so a request that carries a NEW topic ("tell me
# more about HRM", "what is X") is NOT caught — that is a normal question whose
# topic comes from the message, not from memory. The trailing group allows only
# topic-less filler (please / more / about it|that|this), never a real noun.
_EXPANSION_RE = re.compile(
    r"^(?:"
    r"yes(?:\s+please)?|yeah|yep|yup|sure|ok(?:ay)?|"
    r"go\s+on|go\s+ahead|go\s+deeper|dig\s+deeper|keep\s+going|deeper|"
    r"the\s+rest|continue|more|tell\s+me\s+more|"
    r"(?:tell|say|explain|elaborate|expand)(?:\s+(?:me|on|it|that))?|"
    r"i'?d?\s*(?:like|want)\s+to\s+(?:hear|know)\s+more|"
    r"and"
    r")"
    r"(?:\s+(?:please|more|about\s+(?:it|that|this)|on\s+(?:it|that|this)))*"
    r"\s*[.!?]*$",
    re.IGNORECASE,
)


def is_expansion_request(query: str) -> bool:
    """True when the message is a topic-less request to hear more — resolved
    against the prior turn's topic (session memory), not the message itself."""
    return bool(_EXPANSION_RE.match(query.strip()))


# Out-of-scope reply for QUERY-pattern declines — both "write me a poem" and
# "translate X into French". Distinct from WEAK_RETRIEVAL_REPLY because these are
# declined on the request pattern, not on retrieval strength.
GENERATIVE_REPLY = (
    "I only answer questions about Mikko's projects and work — I don't write "
    "or translate content like that."
)
GENERATIVE_REPLY_FI = (
    "Vastaan vain Mikon projekteja ja työtä koskeviin kysymyksiin — en "
    "kirjoita tai käännä tuollaista sisältöä."
)

# Creative ARTEFACT group, shared by both shapes below.
_ARTEFACT = (
    r"poems?|haikus?|limericks?|sonnets?|verses?|rhymes?|songs?|lyrics|raps?|"
    r"jokes?|riddles?|essays?|screenplays?|novels?|poetry|stor(?:y|ies)|tales?"
)

# A request like "write me a poem about Helsinki" names an on-corpus topic, so it
# retrieves real content and slips past is_weak_retrieval; and a small local model
# does not reliably refuse it from the system prompt alone (especially once the
# corpus holds source code, which lowers off-topic distances). Two shapes, both
# requiring a PRODUCING DETERMINER (a/an/some/another/one/your — NOT "the"/"of
# the") then 0-2 adjectives then the artefact:
#   - VERB-based: a producing verb then the determiner+artefact.
#   - VERB-LESS: anchored at the START ("a haiku about ReadLog please", "I want a
#     poem") so a mid-sentence topic noun ("a question about the songs feature",
#     "an overview of the audio bus") does NOT trip it.
# The determiner anchor is what keeps legitimate questions out ("the story behind
# ReadLog", "an overview of the songs feature" — no producing determiner before
# the artefact).
_GENERATIVE_RE = re.compile(
    r"(?:"
    r"\b(?:come up with|make up|write|compose|create|generate|draft|pen|recite|"
    r"sing|tell|make|give)\b\s+(?:me\s+|us\s+)?(?:a|an|some|another|one|your)\s+"
    r"(?:\w+\s+){0,2}(?:" + _ARTEFACT + r")\b"
    r"|^(?:i\s+want|i'?d\s+like|can\s+i\s+(?:get|have)|i\s+need|gimme|give me)?\s*"
    r"(?:a|an|some|another|one|your)\s+(?:\w+\s+){0,2}(?:" + _ARTEFACT + r")\b"
    r")",
    re.IGNORECASE,
)


# Finnish creative requests. Finnish has no determiner to anchor on (the English
# rule keys on "write A poem"), so this stays narrow: a producing VERB followed
# within two words by a creative ARTEFACT stem. "kerro" (tell) is deliberately
# excluded — "kerro tarina HRM:n takana" is a legitimate question about a
# project's story, not a request to author one.
_GENERATIVE_FI_RE = re.compile(
    r"\b(?:kirjoita|sepitä|laadi|keksi|runoile|tee|luo)\b(?:\s+\S+){0,2}?\s+"
    # satu(?!nnai): 'satunnainen' (random) starts with the fairy-tale stem -
    # 'tee satunnainen haku' is a question, not a creative request.
    r"(?:runo|laulu|tarina|satu(?!nnai)|vitsi|riimi|essee|räppi|loru)\w*",
    re.IGNORECASE,
)


def is_generative_request(query: str) -> bool:
    """True when the message asks the assistant to WRITE creative/generic content
    (a poem, story, song, joke, ...) instead of asking about Mikko's work.

    A deterministic query-pattern gate ahead of retrieval/generation: such
    requests can name an on-corpus topic (so the retrieval gate misses them) and
    a small LLM won't reliably refuse them from the system prompt alone.
    """
    return bool(_GENERATIVE_RE.search(query)) or bool(
        _GENERATIVE_FI_RE.search(query)
    )


# Target-language group, shared by every translation-request shape below.
_LANG = (
    r"spanish|french|german|finnish|swedish|english|italian|portuguese|dutch|"
    r"russian|chinese|mandarin|japanese|korean|arabic|hindi|polish|norwegian|"
    r"danish|greek|turkish|hebrew|latin|czech|romanian|hungarian|ukrainian"
)

# Translating text into a named language is a TASK, not a question about Mikko —
# and because the portfolio itself is multilingual (EN/FI/SV i18n), a prose chunk
# stays close enough that the retrieval gate passes, so a small model just does
# the translation. Match four imperative shapes, each anchored so genuine i18n
# questions ("how does the site translate to Finnish", "is the portfolio
# available in Finnish", "what is the project in the Finnish locale about") are
# NOT caught — deliberately omitting the bare "what is X in LANG" form, which
# over-gates those.
_TRANSLATE_RE = re.compile(
    r"(?:"
    # 1. leading "translate ... (in)to LANG"
    r"^(?:please\s+|can you\s+|could you\s+|pls\s+|hey,?\s+)?translate\b"
    r"[^.?!]{1,60}?\b(?:in)?to\b\s+\b(?:" + _LANG + r")\b"
    # 2. "how do you / how to / how would you / how can i say ... in LANG"
    r"|\bhow\s+(?:do\s+you|to|would\s+you|can\s+i)\s+say\b"
    r"[^.?!]{0,40}?\bin\s+\b(?:" + _LANG + r")\b"
    # 3. leading "say ... in LANG"
    r"|^say\b[^.?!]{1,40}?\bin\s+\b(?:" + _LANG + r")\b"
    # 4. "LANG (word|phrase|translation|equivalent) for ..."
    r"|\b(?:" + _LANG + r")\s+(?:word|phrase|translation|equivalent)\s+for\b"
    r")",
    re.IGNORECASE,
)


# Finnish translation-request shapes. The English patterns above never fire on
# Finnish, and a live visitor's "Käännä tämä teksti englanniksi: ..." was
# ANSWERED (measured 2026-07-08, best distance 0.428 - well under the gate).
# Same anchoring philosophy: the imperative verb LEADS, so i18n questions
# ("miten sivusto kääntyy suomeksi") are not caught.
_LANG_FI = (
    r"englanniksi|suomeksi|ruotsiksi|saksaksi|ranskaksi|espanjaksi|venäjäksi|"
    r"italiaksi|japaniksi|kiinaksi|viroksi|norjaksi|tanskaksi|latinaksi"
)
# Both the imperative (käännä) and the polite-infinitive form (voitko kääntää).
_TRANSLATE_FI_RE = re.compile(
    r"^(?:voitko\s+|voisitko\s+|ole hyvä ja\s+)?kään(?:nä|tää)\b"
    r"[^.?!]{0,80}?\b(?:" + _LANG_FI + r")\b",
    re.IGNORECASE,
)


# Personal-trivia questions (favourite colour, shoe size, height, age, car...)
# are never in the corpus, but they embed 0.41-0.44 against it - measured
# 2026-07-08: the legit-query band ends at 0.411 and this class begins at
# 0.4148, a 0.003 gap no robust gate threshold can split. The Finnish answer
# path refuses them at the model level; the English path was measured to leak
# a speculation or pivot to summarizing the context (0/8 refusals across two
# prompt variants). So this class is declined ON THE REQUEST PATTERN, like the
# generative and translation gates. Anchored on an ASKING-ABOUT-the-attribute
# form ("what is Mikko's X", "how tall is he", "mikä on Mikon X") — a bare
# possessive+noun anchor also declined legitimate usage questions ("does HRM
# work on your phone?", review-caught), which project questions must never do.
_TRIVIA_ATTRS_EN = (
    r"favou?rite\s+\w+|shoe\s+size|salary|age|height|weight|address|"
    r"phone(?:\s+number)?|car|girlfriend|wife|family|birthday|religion|"
    r"political\s+\w+"
)
_TRIVIA_ATTRS_FI = (
    r"lempi\w+|kengännumero|palkka|ikä|pituus|paino|osoite|puhelinnumero|"
    r"auto|tyttöystävä|vaimo|perhe|syntymäpäivä|uskonto"
)
_PERSONAL_TRIVIA_RE = re.compile(
    r"(?:"
    r"\bwhat(?:'s|\s+is)\s+(?:mikko'?s|his|your)\s+(?:" + _TRIVIA_ATTRS_EN + r")\b"
    r"|\bhow\s+(?:tall|old|heavy)\s+is\s+(?:mikko|he)\b"
    r"|\bwhat\s+car\s+does\s+(?:mikko|he)\s+drive\b"
    r"|\bmikä\s+on\s+(?:mikon|hänen)\s+(?:" + _TRIVIA_ATTRS_FI + r")"
    r"|\bkuinka\s+(?:pitkä|vanha|painava)\s+(?:mikko|hän)\s+on\b"
    r")",
    re.IGNORECASE,
)


def is_personal_trivia(query: str) -> bool:
    """True for a personal-trivia question the corpus can never answer."""
    return bool(_PERSONAL_TRIVIA_RE.search(query))


def is_translation_request(query: str) -> bool:
    """True when the message asks to translate text into a named language — a
    task, not a question about Mikko's work.

    Catches four shapes ("translate X to LANG", "how do you say X in LANG", "say
    X in LANG", "LANG word for X"), each anchored so genuine i18n questions about
    the portfolio's own multilingual content are not caught.
    """
    stripped = query.strip()
    return bool(_TRANSLATE_RE.search(stripped)) or bool(
        _TRANSLATE_FI_RE.search(stripped)
    )
