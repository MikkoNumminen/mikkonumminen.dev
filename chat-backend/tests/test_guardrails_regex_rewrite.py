"""The backtracking-safe rewrites of `_FI_TRAILER_RE` and `_CODE_TOKEN_RE`.

CodeQL flagged both as ReDoS risks. The rewrites must match exactly what the
originals matched, so the originals are kept here verbatim as the reference and
every case compares the two: trailer match result and captured word, and the
spans `_CODE_TOKEN_RE` strips. The timing cases pin the reason for the change.
"""

from __future__ import annotations

import itertools
import random
import re
import time

import pytest

from app.guardrails import _CODE_TOKEN_RE, _FI_TRAILER_RE

# Verbatim from master before the rewrite (8f28ce0), with the filler range's
# raw characters written as escapes.
_FILLER = r"[\s,!.?\u2000-\u3300\U0001F000-\U0001FAFF]"
_OLD_FI_TRAILER_RE = re.compile(
    rf"^{_FILLER}*"
    r"(please|thanks|thank\s+you|kiitos|if\s+you\s+can|for\s+me|this\s+time"
    r"|too|as\s+well)?"
    rf"{_FILLER}*$",
    re.IGNORECASE,
)
_OLD_CODE_TOKEN_RE = re.compile(
    r"`[^`]+`"
    r"|\b\w+(?:-\w+)+(?:\.\w+)+\b"
    r"|\b\w+(?:[./:]\w+)+\b"
    r"|\b\w+_\w+\b"
    r"|\b[A-Za-z]\w*\d\w*\b"
    r"|\b[a-z]+(?:[A-Z]\w*)+\b"
    r"|\b[A-Z]\w*[a-z]\w*(?:[A-Z]\w*)+\b"
)


def _same_trailer(text: str) -> bool:
    old, new = _OLD_FI_TRAILER_RE.match(text), _FI_TRAILER_RE.match(text)
    if bool(old) != bool(new):
        return False
    return old is None or new is None or old.group(1) == new.group(1)


def _token_spans(pattern: re.Pattern[str], text: str) -> list[tuple[int, int]]:
    return [m.span() for m in pattern.finditer(text)]


def test_the_reference_filler_class_is_the_one_in_the_module() -> None:
    # Guards the reference itself: the escapes above must spell the same class.
    assert _FILLER in _OLD_FI_TRAILER_RE.pattern
    assert "\u2000-\u3300" in _FI_TRAILER_RE.pattern


_TRAILER_WORDS = [
    "please",
    "thanks",
    "thank you",
    "kiitos",
    "if you can",
    "for me",
    "this time",
    "too",
    "as well",
    "",
]
_SEPARATORS = ["", " ", "  ", ", ", "! ", ". ", "? ", " - ", "\u2003", "\u3000"]
_ENDINGS = [
    "",
    "!",
    ".",
    "?",
    " 🙂",
    " 😀!",
    "!!",
    " .",
    "\t",
    " ä",
    " ö",
    " å",
    " Ä",
    " Ö",
    " Å",
    " kiitos",
    " x",
    " äiti",
    " öljy",
    " Åbo",
    "ä",
    "?ö",
]


def _cased(word: str, case: str) -> str:
    return {"lower": word, "upper": word.upper(), "title": word.title()}[case]


def test_trailer_matches_the_original_on_every_phrase_ending_combination() -> None:
    mismatches = [
        text
        for word, case, sep, end in itertools.product(
            _TRAILER_WORDS, ["lower", "upper", "title"], _SEPARATORS, _ENDINGS
        )
        if not _same_trailer(text := sep + _cased(word, case) + end)
    ]
    assert mismatches == []


@pytest.mark.parametrize(
    "text",
    [
        "Kerro HRM:stä suomeksi",
        "Mitä Mikko teki Kasvu Labsilla?",
        "Miten tämä chat toimii?",
        "Kysymys tiedostossa mainituista projekteista",
        "Mitkä projektit käyttävät PostgreSQL:ää?",
        "kerro exportMyData funktiosta",
        "Miten __init__ toimii Pythonissa?",
        "selitä snake_case_name ja camelCaseName",
        "mikä on XMLHttpRequest?",
        "Äiti2 ja öljy3",
        "my-lib.config.js ja foo.bar.baz",
        "v2 vai HRM2?",
        "Åbo Akademi ja Österbotten",
        "Mitä ÄÖÅ-merkit tekevät?",
        "käytä `npm run verify` ennen pushia",
        "Öljyä_ja_vettä",
        "tämäOnCamel ja TämäOnMyös",
        "ÄiTi ja öLjY",
        "aAAAAAAA ÅåÅå ÖöÖö",
    ],
)
def test_code_tokens_match_the_original_on_finnish_text(text: str) -> None:
    assert _token_spans(_CODE_TOKEN_RE, text) == _token_spans(_OLD_CODE_TOKEN_RE, text)


def test_both_rewrites_match_the_original_on_seeded_random_text() -> None:
    rng = random.Random(1)
    alphabet = list("aAbBzZqQ09_-.:/` \t!?,") + [
        "ä",
        "Ä",
        "ö",
        "Ö",
        "å",
        "Å",
        "\u2003",
        "🙂",
        "kiitos",
        "please",
        "thank you",
        "if you can",
        "for me",
        "this time",
        "as well",
        "too",
        "suomeksi",
        "HRM",
        "exportMyData",
        "__init__",
        "v2",
    ]
    for _ in range(20_000):
        text = "".join(rng.choice(alphabet) for _ in range(rng.randint(0, 20)))
        assert _same_trailer(text), text
        assert _token_spans(_CODE_TOKEN_RE, text) == _token_spans(
            _OLD_CODE_TOKEN_RE, text
        ), text


def _best_ms(fn: object, text: str) -> float:
    best = float("inf")
    for _ in range(3):
        start = time.perf_counter()
        fn(text)  # type: ignore[operator]
        best = min(best, (time.perf_counter() - start) * 1000)
    return best


def test_trailer_is_linear_on_a_long_filler_run() -> None:
    # The original took ~145 ms here and grew quadratically; the rewrite ~0.6 ms.
    assert _best_ms(_FI_TRAILER_RE.match, "\t" * 4000 + "x") < 50


def test_camel_case_token_is_linear_on_a_long_word() -> None:
    # The original camel-case alternative took ~190 ms here; the rewrite ~0.6 ms.
    assert _best_ms(lambda t: _CODE_TOKEN_RE.sub(" ", t), "A" + "a" * 4000 + "!") < 50
