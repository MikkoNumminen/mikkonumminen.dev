"""The backtracking-safe rewrites of `_FI_TRAILER_RE` and `_CODE_TOKEN_RE`.

CodeQL flagged both as ReDoS risks. The rewrites must match exactly what the
originals matched. The originals themselves are not kept here (CodeQL would
flag them again), so the expected values below were recorded by running the
original patterns from master before the rewrite (8f28ce0,
chat-backend/app/guardrails.py) over the same inputs: the stripped text for
each Finnish sentence, and SHA-256 digests of the results over a trailer
phrase grid and over seeded random text. To re-record, run those inputs
through the patterns in `git show 8f28ce0:chat-backend/app/guardrails.py`.
The timing cases pin the reason for the change.
"""

from __future__ import annotations

import hashlib
import itertools
import random
import time
from collections.abc import Callable

import pytest

from app.guardrails import _CODE_TOKEN_RE, _FI_TRAILER_RE

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

# Recorded from master's original patterns (see the module docstring).
_TRAILER_GRID_DIGEST = "d2d76f635333743067db7f2a95f914cfe838d778c8bb9396233dc0d1eaf1b03d"
_FUZZ_DIGEST = "47cca452faebc26df8d7e1d39264d6344bc4d4391e9c73e82b349a0300ee3ef5"


def _cased(word: str, case: str) -> str:
    return {"lower": word, "upper": word.upper(), "title": word.title()}[case]


def test_trailer_matches_the_original_on_every_phrase_ending_combination() -> None:
    digest = hashlib.sha256()
    for word, case, sep, end in itertools.product(
        _TRAILER_WORDS, ["lower", "upper", "title"], _SEPARATORS, _ENDINGS
    ):
        m = _FI_TRAILER_RE.match(sep + _cased(word, case) + end)
        digest.update(repr((m is not None, m.group(1) if m else None)).encode())
    assert digest.hexdigest() == _TRAILER_GRID_DIGEST


@pytest.mark.parametrize(
    ("text", "stripped"),
    [
        ("Kerro HRM:stä suomeksi", "Kerro   suomeksi"),
        ("Mitä Mikko teki Kasvu Labsilla?", "Mitä Mikko teki Kasvu Labsilla?"),
        ("Miten tämä chat toimii?", "Miten tämä chat toimii?"),
        (
            "Kysymys tiedostossa mainituista projekteista",
            "Kysymys tiedostossa mainituista projekteista",
        ),
        ("Mitkä projektit käyttävät PostgreSQL:ää?", "Mitkä projektit käyttävät  ?"),
        ("kerro exportMyData funktiosta", "kerro   funktiosta"),
        ("Miten __init__ toimii Pythonissa?", "Miten   toimii Pythonissa?"),
        ("selitä snake_case_name ja camelCaseName", "selitä   ja  "),
        ("mikä on XMLHttpRequest?", "mikä on  ?"),
        ("Äiti2 ja öljy3", "Äiti2 ja öljy3"),
        ("my-lib.config.js ja foo.bar.baz", "  ja  "),
        ("v2 vai HRM2?", "  vai  ?"),
        ("Åbo Akademi ja Österbotten", "Åbo Akademi ja Österbotten"),
        ("Mitä ÄÖÅ-merkit tekevät?", "Mitä ÄÖÅ-merkit tekevät?"),
        ("käytä `npm run verify` ennen pushia", "käytä   ennen pushia"),
        ("Öljyä_ja_vettä", " "),
        ("tämäOnCamel ja TämäOnMyös", "tämäOnCamel ja  "),
        ("ÄiTi ja öLjY", "ÄiTi ja öLjY"),
        ("aAAAAAAA ÅåÅå ÖöÖö", "  ÅåÅå ÖöÖö"),
    ],
)
def test_code_tokens_match_the_original_on_finnish_text(text: str, stripped: str) -> None:
    assert _CODE_TOKEN_RE.sub(" ", text) == stripped


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
    digest = hashlib.sha256()
    for _ in range(20_000):
        text = "".join(rng.choice(alphabet) for _ in range(rng.randint(0, 20)))
        m = _FI_TRAILER_RE.match(text)
        spans = [t.span() for t in _CODE_TOKEN_RE.finditer(text)]
        digest.update(repr((m is not None, m.group(1) if m else None, spans)).encode())
    assert digest.hexdigest() == _FUZZ_DIGEST


def _best_ms(fn: Callable[[str], object], text: str) -> float:
    best = float("inf")
    for _ in range(3):
        start = time.perf_counter()
        fn(text)
        best = min(best, (time.perf_counter() - start) * 1000)
    return best


def test_trailer_is_linear_on_a_long_filler_run() -> None:
    # The original took ~145 ms here and grew quadratically; the rewrite ~0.6 ms.
    assert _best_ms(_FI_TRAILER_RE.match, "\t" * 4000 + "x") < 50


def test_camel_case_token_is_linear_on_a_long_word() -> None:
    # The original camel-case alternative took ~190 ms here; the rewrite ~0.6 ms.
    assert _best_ms(lambda t: _CODE_TOKEN_RE.sub(" ", t), "A" + "a" * 4000 + "!") < 50
