# Can a deterministic layer catch a wrong relationship? Measured, 2026-08-08

The chat states things that are not true while citing a document that is. The
existing detector, `unsupported_years`, asks whether a year in the answer appears
in the retrieved context at all, so it catches an invented date and misses a
**rebound** one: two supported facts joined wrongly.

The failure that prompted this, from a live Finnish answer about the sales
career: *"jatkoi vuoteen 2012 asti, jolloin yritys muuttui osaksi Kesko Oyj:tä"*.
The corpus dates Kesko to 2020 and 2012 to a different employer. Both tokens are
supported. The sentence is false, and nothing downstream could tell.

**The output-side approach does not work.** This is the measurement that says
why, and the write-up exists so the next person with the idea can skip it.

## The candidate

Treat a name and a year within N characters as a claimed binding. Collect what
the answer asserts, collect what every retrieved chunk supports, flag the
difference, and restrict to names the context knows.

Reproduce with `chat-backend/evals/misbound_probe.py`, which replays the request
log through production retrieval.

## What it did

588 answered requests with logged text, 316 of them Finnish-looking.

| window | fires | rate | new signal over `unsupported_years` |
| ---: | ---: | ---: | ---: |
| 20 | 6 | 1.0% | 2 |
| 30 | 7 | 1.2% | 3 |
| 40 | 24 | 4.1% | 16 |
| 60 | 35 | 6.0% | 21 |
| 100 | 43 | 7.3% | 26 |

Then the fires were read in full rather than in summary, which is the step that
settled it. At window 30, all three:

| fire | verdict |
| --- | --- |
| `kesk 1998`, `kesk 2012` | **false positive.** The answer was correct: *"at Keijo Numminen Oy (1998-2012) and later at Kesko Oyj (2020-2021)"*. Its own list puts "Kesko" 19 characters from "2012". |
| `node 2024` | **false positive.** Correct answer, same list adjacency. |
| `mikk 2026` | **noise.** The answer WAS wrong (Kasvu Labs dated 2019-2021, really 2022-2024), but the flagged pair is not the error, and `unsupported_years` already catches it, because 2019 is absent from the context. |

**Zero true positives. Three artifacts.**

## Why it is not a tuning problem

Prose lists dates next to names. "Keijo Numminen Oy (1998-2012) and later at
Kesko Oyj (2020-2021)" is a correct sentence in which a name and an unrelated
year sit **19** characters apart. The standard CV entry `**Kasvu Labs Oy**
(2022-2024)` puts a name **22** characters from its own year, and `**Kesko Oyj**
(2020-2021)` puts one **13** apart.

So the spurious binding is TIGHTER than a real one. Any window wide enough to
see that Kasvu Labs is dated 2022-2024, which is the whole point of having a
window, is necessarily wide enough to bind Kesko to a year belonging to the
employer listed before it. The two cases are not merely close, they are ordered
against the detector.

Two narrower rules were tried inside the same loop and are recorded because both
are tempting. Requiring a name to appear mid-sentence somewhere still admitted
"This", since across enough retrieved text some chunk uses it mid-sentence.
Scoping that to the answer alone fixed it and broke the detector's own best case,
a one-sentence answer opening with the name in question. The rule that survived,
that a name is a word never written in lower case, is sound and did not help: the
false positives were never about what counts as a name.

## What was shipped instead

The question that produced the useful answer was whether the corpus itself can be
wrong. It can, and it was, at the moment of asking.

Adding SongGenerator took the site to thirteen projects and left `content/cv.md`
saying "Twelve projects" in two places. The chat would have answered twelve,
cited the CV, and been wrong in a way that reads as authoritative. Nothing about
that is a hallucination: the model was grounded in exactly what it was given, and
what it was given was stale.

**No output-side guard can catch this class**, which is precisely why it is worth
catching at the other end. `scripts/corpus-facts-sync.test.mjs` asserts that a
count the corpus states matches the count the repository holds, for the documents
that describe the current state. Dated research posts are out of scope on
purpose: "13 skills" in a May 2026 study stays 13 forever, and asserting against
those would be asserting that history should change.

## What is still open

A wrong relationship between two supported facts remains undetected. What this
measurement rules out is finding it by proximity in the answer. Anything that
worked would need to know that "(1998-2012)" belongs to the name before it and
not the name after, which is parsing rather than pattern matching, and the corpus
is bilingual.

The cheaper direction is the one taken here: keep widening the set of corpus
claims the repository can check independently, so that fewer wrong answers
originate in a true reading of a false document.
