---
title: How to reach the research: the /research page and the terminal
project: portfolio
date: 2026-08-07
type: reference
---

# How to reach the research: the /research page and the terminal

There are two ways, and the page is the easier one.

## The research page

Every research document is listed at **/research** (Finnish: **/fi/research**),
newest first, with a one-line summary and a download link. That page is the
answer to "where can I find your research?" and it needs no command and no
terminal. It is also linked from the front page, in the card grid.

## The terminal

The contact page is a terminal, and this chat runs inside it, so a visitor asking
"how do I download the research documents?" is asking about a command that is one
line away from them.

Type `download` in the terminal. It lists every document. To grab one, type its
name: `download blindtest`. A unique prefix works too, so `download blind` gets
the same file, and the older dashed spelling (`download --blindtest`) still
works.

Every document is a PDF, served from this site, free, with no sign-up.

| command | document |
| --- | --- |
| `download cv` | Mikko Numminen's CV, the full résumé |
| `download catalog` | Every skill across all four repos: the inventory, with measured costs |
| `download study` | May 2026, the optimization: five rounds of before/after on a SKILL.md, three cost traps found and fixed |
| `download replicates` | Round 6, the noisiest cells re-measured at depth: an N=1 fluke overturned |
| `download results` | The synthesis: what the two skill auditors cost and the traps they exposed |
| `download calibration` | June 2026, the broadest run: 16 skills, cold-vs-skill A/B across three models |
| `download finnish` | June 2026, the RAG Finnish experiment: three local 8B models on Finnish synthesis versus containment |
| `download methodology` | June 2026, the same experiment's methodology: how it caught and corrected its own mistake |
| `download blindtest` | July 2026, the blind test: a native speaker ranks three local models on Finnish naturalness, Poro wins 26 of 30 |
| `download poro` | July 2026, Poro-2-8B in production: what two projects measured, why one adopted it and one passed |
| `download translations` | July 2026, the translation audit: a local Finnish model re-reads all 396 Finnish strings, only 2 of its 276 proposed rewrites held up |
| `download delegation` | July 2026, do the cheap agents pay for themselves: seven instrumented delegations from one session |

## The other commands

`help` lists everything. `whoami` is the short introduction, `cv` prints the CV
in the terminal, `contact` shows how to get in touch, and `links` shows the
online profiles. `skills` covers the Claude Code skill registry. `ls` and `cat`
browse the projects. `man` explains a single command in more detail, and `clear`
empties the screen.

## Why this document exists

A visitor asked this chat how to download the research documents and got an
answer pointing at a build script from an unrelated project, because nothing in
the corpus described the terminal's own commands. The chat knew everything about
the research and nothing about how to hand it over.

Answers here should name the command. A file path from the corpus is not a link
and not something a visitor can act on.
