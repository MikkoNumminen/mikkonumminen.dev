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
harness (evals/run_eval.py). Pure and stdlib-only, so it is unit-tested.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from .retrieval import RetrievedChunk

# Shown verbatim (not LLM-generated) when retrieval is too weak to ground an
# answer. Matches the grounded prompt's refusal wording so the two paths read
# the same to a visitor.
WEAK_RETRIEVAL_REPLY = (
    "I don't have anything on that. Try `help` to see what I can answer "
    "about Mikko's projects."
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


# Templated replies for the no-LLM small-talk fast path. A greeting or a thanks is
# ANSWERED here without retrieval or the model — distinct from the DECLINE gates,
# which refuse out-of-scope requests.
GREETING_REPLY = (
    "Hi! I'm the assistant for Mikko Numminen's portfolio. Ask me about his "
    "projects — HRM, AudiobookMaker, ReadLog .NET, Spacepotatis, and more — the "
    "tech behind them, or his experience. Type `help` for the scripted commands."
)
COURTESY_REPLY = (
    "You're welcome! Anything else you'd like to know about Mikko's projects or work?"
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


def is_generative_request(query: str) -> bool:
    """True when the message asks the assistant to WRITE creative/generic content
    (a poem, story, song, joke, ...) instead of asking about Mikko's work.

    A deterministic query-pattern gate ahead of retrieval/generation: such
    requests can name an on-corpus topic (so the retrieval gate misses them) and
    a small LLM won't reliably refuse them from the system prompt alone.
    """
    return bool(_GENERATIVE_RE.search(query))


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


def is_translation_request(query: str) -> bool:
    """True when the message asks to translate text into a named language — a
    task, not a question about Mikko's work.

    Catches four shapes ("translate X to LANG", "how do you say X in LANG", "say
    X in LANG", "LANG word for X"), each anchored so genuine i18n questions about
    the portfolio's own multilingual content are not caught.
    """
    return bool(_TRANSLATE_RE.search(query.strip()))
