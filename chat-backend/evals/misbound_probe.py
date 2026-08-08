"""Can a deterministic layer catch a WRONG RELATIONSHIP between supported facts?

    docker compose exec -T backend python -m evals.misbound_probe

THE ANSWER, MEASURED, IS NO, AND NOTHING HERE SHIPS. The candidate detector lives
in this file rather than in `app/` because it was measured against real traffic
and failed. An experiment that failed belongs where experiments live. The
write-up is `docs/audits/misbound-facts-2026-08-08.md`.

THE PROBLEM IT WAS AIMED AT. `guardrails.unsupported_years` asks whether a year
in the answer appears in the retrieved context at all. That catches an invented
date and misses a rebound one: the model can take two facts the context supports
and join them wrongly ("Kesko took over in 2012" where the corpus dates Kesko to
2020 and 2012 to a different employer). Every token is supported and the sentence
is false.

WHY IT FAILS, and it is not a tuning problem. Prose lists dates next to names.
"Keijo Numminen Oy (1998-2012) and later at Kesko Oyj (2020-2021)" is a CORRECT
sentence in which "Kesko" sits 19 characters from "2012", while the standard CV
entry "**Kasvu Labs Oy** (2022-2024)" puts a name 22 characters from its OWN
year. The spurious binding is the tighter of the two, so any window wide enough
to see a real one is necessarily wide enough to see the accident.

Kept runnable so the next person with this idea can re-derive the result in one
command instead of rebuilding the detector to find out.

REPLAY FIDELITY. The request log stores the query and the answer but NOT the
chunks retrieved, so context is reconstructed by running retrieval again. That is
sound for the English path, where retrieval is deterministic. It is NOT sound for
Finnish: production translates the query with the LLM first and this replay does
not, so those rows are scored against context production never saw. They are
counted separately for that reason.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Sequence
from pathlib import Path

from app.config import Settings
from app.db import Database
from app.embeddings import Embedder
from app.guardrails import looks_finnish, unsupported_years
from evals.production_retrieval import retrieve_as_production

# Mirrored from `guardrails`, not imported from it. Both are private there,
# and nothing would catch a rename breaking an eval that CI never runs.
# Mirroring also keeps this file reproducing the measurement AS TAKEN: if the
# shipped bound moves later, this probe should still report what it reported
# here.
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_MAX_PLAUSIBLE_YEAR = 2035

LOG = Path("/srv/rag-logs/requests.jsonl")

# The sweep is the point: proximity is the whole mechanism, so the question is
# whether ANY window separates a real rebinding from ordinary list adjacency.
WINDOWS = (20, 30, 40, 60, 100)

_NAME_RE = re.compile(r"\b([A-ZÅÄÖ][\wÅÄÖåäö-]{3,})")
_LOWER_RE = re.compile(r"\b[a-zåäö][\wåäö-]{3,}")


def _capitalised(text: str) -> list[tuple[int, str]]:
    return [(m.start(), m.group(1)) for m in _NAME_RE.finditer(text)]


def _names(text: str) -> set[str]:
    """Stems of words never written in lower case here, so probably names.

    Two weaker rules were measured first and are recorded because both are
    tempting. Sentence position alone let "This" through, because across enough
    retrieved text some chunk uses it mid-sentence. Scoping that test to the
    answer alone fixed it and discarded the name in a one-sentence answer that
    opens with it, which is the detector's own best case.
    """
    lowercased = {m.group(0).lower() for m in _LOWER_RE.finditer(text)}
    return {w[:4].lower() for _, w in _capitalised(text) if w.lower() not in lowercased}


def _bindings(text: str, names: set[str], window: int) -> set[tuple[str, str]]:
    """(name, year) pairs sitting within `window` characters of each other.

    Names are cut to four characters so Finnish case endings do not break the
    match: the answer writes "Kesko Oyj:tä" where the corpus writes "Kesko Oyj".
    """
    pairs: set[tuple[str, str]] = set()
    years = [
        (m.start(), m.group())
        for m in _YEAR_RE.finditer(text)
        if int(m.group()) <= _MAX_PLAUSIBLE_YEAR
    ]
    if not years:
        return pairs
    for name_pos, word in _capitalised(text):
        stem = word[:4].lower()
        if stem not in names:
            continue
        for pos, year in years:
            if abs(pos - name_pos) <= window:
                pairs.add((stem, year))
    return pairs


def misbound_years(
    response: str, supported_texts: Sequence[str], window: int
) -> list[str]:
    """Names the answer dates differently from every retrieved chunk."""
    names = _names(response)
    for text in supported_texts:
        names |= _names(text)
    if not names:
        return []
    stated = _bindings(response, names, window)
    if not stated:
        return []
    supported: set[tuple[str, str]] = set()
    known: set[str] = set()
    for text in supported_texts:
        supported |= _bindings(text, names, window)
        known |= {w[:4].lower() for _, w in _capitalised(text)}
    rebound = {(n, y) for n, y in stated - supported if n in known}
    return sorted(f"{n} {y}" for n, y in rebound)


def _rows() -> list[dict[str, object]]:
    if not LOG.exists():
        raise SystemExit(f"no log at {LOG}")
    out: list[dict[str, object]] = []
    for line in LOG.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        # Only answered turns carry a model-written claim. Refusals are fixed
        # strings and cannot contain an invented relationship.
        if row.get("route") == "answered" and row.get("response") and row.get("query"):
            out.append(row)
    return out


async def main() -> None:
    rows = _rows()
    settings = Settings.from_env()
    db = await Database.connect(settings.database_url)
    emb = Embedder(settings.embedding_model, settings.embedding_dim)

    print(f"answered requests with text: {len(rows)}")
    finnish = sum(1 for r in rows if looks_finnish(str(r["query"])))
    print(f"  of which Finnish-looking: {finnish} (replayed without translation)")

    contexts: list[list[str]] = []
    for i, row in enumerate(rows):
        chunks = await retrieve_as_production(emb, db, str(row["query"]), settings)
        contexts.append([c.content for c in chunks])
        if (i + 1) % 250 == 0:
            print(f"  ...retrieved {i + 1}/{len(rows)}")
    print()

    print("window   fires   rate    new signal over unsupported_years")
    for window in WINDOWS:
        fires, marginal = 0, 0
        samples: list[tuple[str, str, list[str]]] = []
        for row, context in zip(rows, contexts, strict=True):
            hit = misbound_years(str(row["response"]), context, window)
            if not hit:
                continue
            fires += 1
            # A hit whose year is already missing from the context is one the
            # existing layer catches today, so it is not new signal. Only a hit
            # where the year IS supported and the binding is not tells us
            # something `unsupported_years` cannot.
            already = set(unsupported_years(str(row["response"]), context))
            if any(h.split()[-1] not in already for h in hit):
                marginal += 1
                if len(samples) < 5:
                    samples.append((str(row["query"]), str(row["response"]), hit))
        rate = 100 * fires / max(1, len(rows))
        print(f"  {window:>3}   {fires:>5}   {rate:>4.1f}%   {marginal:>5}")
        if window == 30:
            # Printed IN FULL, because the truncated view is what made these
            # look like true positives. Read whole, every one is a correct
            # answer flagged for list adjacency.
            print("      every new-signal fire at this window, in full:")
            for query, response, hit in samples:
                print(f"        hit={hit}")
                print(f"          Q: {query[:88]}")
                print(f"          A: {response[:340]}")

    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
