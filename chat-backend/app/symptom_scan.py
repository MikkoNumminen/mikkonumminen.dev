"""Prompt-injection SYMPTOM scoring for ingested text. Detection, never a wall.

READ THIS BEFORE TRUSTING IT. A symptom scanner does not close the
prompt-injection vector and cannot. It recognises phrasings that known attacks
have used, which means it recognises the past. Anyone who reads a score of 0 as
"this text is safe" has been misled by it, and that misreading is the most likely
harm this module will ever cause, so it is written here in the first paragraph
rather than in a footnote.

WHAT IT IS FOR. `content/code/**` is ingested verbatim under a size filter only,
so a comment or string in a vendored file becomes prompt text with no review
step. Session memory stores and replays raw visitor text. Neither had any signal
at all: nothing anywhere could answer "has anything odd ever gone in".

WHY IT ONLY LOGS. Blocking on an unmeasured heuristic in a corpus the owner
curates is how a pipeline silently drops good content, and the owner would find
out when an answer went missing. So this scores, the score gets recorded, and
behaviour is unchanged until there is data on what a real corpus scores. That
sequencing is the decision, not an implementation detail.

A KNOWN AND EXPECTED FALSE POSITIVE, worth stating before anyone reads a report:
this corpus contains research writing ABOUT prompt injection, including quoted
payloads. Those documents SHOULD score highly. A scanner that scored them zero
would be failing to see text it is looking straight at. Interpreting the
distribution means separating "a document that discusses attacks" from "a
document that is one", and no score can make that distinction for you.

Pure and stdlib-only, so it is unit-tested and can run inside the indexer without
dragging in the model stack.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Grouped by the ATTACK SHAPE each phrasing serves, not lumped into one list.
# The grouping is the whole scoring idea: any single phrase here shows up in
# ordinary writing (a blog post quoting an attack, a docstring explaining a
# guardrail), while several DIFFERENT shapes in one chunk is the combination
# that ordinary prose has little reason to produce.
_MARKERS: dict[str, tuple[str, ...]] = {
    # Trying to void whatever came before.
    "override": (
        r"ignore (all |any )?(previous|prior|above|earlier)",
        r"disregard (all |any )?(previous|prior|above|the)",
        r"forget (all |everything|your) ",
        r"override (your|the) (instructions|rules|prompt)",
    ),
    # Trying to reassign who the model is.
    "role_change": (
        r"you are now",
        r"from now on,? you",
        r"act as (a |an )?(different|new)",
        r"pretend (to be|you are)",
        r"\bdan mode\b",
        r"developer mode",
    ),
    # Trying to make the model emit its own configuration.
    "exfiltration": (
        r"(print|reveal|repeat|show|output) (your|the) (system )?(prompt|instructions)",
        r"what (is|are) your (system )?(prompt|instructions)",
        # NOT a bare "verbatim": it fired on four ordinary files, including this
        # repo's own writing. Only useful tied to what is being asked for.
        r"(prompt|instructions)[^.]{0,40}verbatim",
        r"verbatim[^.]{0,40}(prompt|instructions)",
    ),
    # Trying to forge the frame the server writes around retrieved text.
    "frame_forgery": (
        r"^\s*(context|question)\s*:",
        r"^\s*\[\d+\]\s+\S+\s+\(",
        r"<\|.*?\|>",
        # Column zero, no leading whitespace. Indented "user:" / "system:" is an
        # object key, and this corpus is full of TypeScript permission maps: the
        # indented form matched four code files and zero attacks.
        r"^(system|assistant|user)\s*:\s+\S",
    ),
    # Trying to pin the output into a shape the caller controls.
    "output_hijack": (
        r"respond only with",
        r"reply with exactly",
        r"output nothing (else|but)",
        r"do not (mention|say|include) ",
    ),
}

_COMPILED: dict[str, tuple[re.Pattern[str], ...]] = {
    name: tuple(re.compile(p, re.IGNORECASE | re.MULTILINE) for p in patterns)
    for name, patterns in _MARKERS.items()
}


@dataclass(frozen=True)
class SymptomScore:
    """How many distinct attack shapes a text carries, and which ones.

    `score` is the number of CATEGORIES matched, deliberately not the number of
    matches: a document quoting one payload twenty times is still discussing one
    shape, while a document touching four shapes is doing something a portfolio
    write-up rarely needs to.
    """

    score: int
    categories: tuple[str, ...] = field(default_factory=tuple)

    @property
    def notable(self) -> bool:
        """Worth a human glance. NOT "malicious", and nothing acts on it."""
        return self.score >= _NOTABLE_CATEGORIES


# Two distinct shapes, not one. One marker fires on ordinary writing far too
# often to be worth surfacing: "verbatim" appears in this repo's own docs, and
# `^\s*question\s*:` appears in every eval file. The threshold exists to keep a
# report readable, and it is a reporting choice with nothing downstream, so
# getting it slightly wrong costs nothing but noise.
_NOTABLE_CATEGORIES = 2


def scan(text: str) -> SymptomScore:
    """Score one chunk of text. Never raises, never blocks, never mutates.

    NFKC first so full-width and compatibility forms cannot slip a marker past
    the patterns, matching what the prompt boundary does to visitor text.
    """
    normalised = unicodedata.normalize("NFKC", text)
    hit = tuple(
        name
        for name, patterns in _COMPILED.items()
        if any(p.search(normalised) for p in patterns)
    )
    return SymptomScore(score=len(hit), categories=hit)
