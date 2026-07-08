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
# restricted to EN/FI/SV: the only languages the site speaks, and a smaller set is
# both faster and harder to confuse. Built lazily — the models are ~100MB and must
# not load at import (unit tests of unrelated guardrails would pay for it).
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


def looks_finnish(text: str) -> bool:
    """True when the text reads as Finnish (statistical language ID over EN/FI/SV).

    The SINGLE shared definition for both the pipeline's Finnish answer-path routing
    (when RAG_ALLOW_FINNISH is on) and the acceptance harness's language assertion —
    so routing and the test can never disagree on the same text (a Finnish query
    that routes to English is also judged not-Finnish by the check, not a spurious
    failure)."""
    if sum(1 for c in text if c.isalpha()) < _MIN_ALPHA_FOR_DETECTION:
        return False
    # Deterministic tie-break BEFORE the statistical call: two unambiguous
    # English function words settle the language regardless of how many Finnish
    # proper nouns surround them (the "What did Mikko do at Kasvu Labs?" class).
    tokens = "".join(c if c.isalpha() else " " for c in text.lower()).split()
    if sum(1 for t in tokens if t in _ENGLISH_OVERRIDE_WORDS) >= 2:
        return False
    return _get_detector().detect_language_of(text) == Language.FINNISH


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
