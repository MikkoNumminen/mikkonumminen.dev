---
title: The translation audit: a local model re-reads my Finnish
project: portfolio
date: 2026-07-21
kind: post
type: research
---

# The translation audit: a local model re-reads my Finnish

The Finnish on this site did not start out in Finnish. I write the source copy in English and mirror it into Finnish and Swedish, and the Finnish mirror was produced with an AI translator. It reads fine to me, but I had never had a native-level speaker go over it line by line. So I handed the whole thing to Poro — the local Poro-2-8B model that already runs the chat on this contact page — and asked it to grade its own language's translation. The real question was not "can Poro translate?" but "how good was the machine translation I already shipped?"

I pulled all 396 translated Finnish strings out of `src/i18n/locales/fi.ts`, paired each with its English source, and had Poro judge every pair: leave it, or here is a better Finnish sentence. Because an 8B model is an eager editor, I did not trust its verdicts directly — every change it proposed went through a 24-agent adversarial verification pass plus a skeptic recheck, whose only job was to reject anything that broke a placeholder, mistranslated a product name, drifted from the English meaning, or simply wasn't clearly better. Only the survivors were kept.

## The result

Poro proposed rewriting 276 of the 396 strings — 70% of the copy. Read literally that looks like a damning verdict on the original translation, but it is really just what a small, eager model does: shown a sentence and asked whether it could be phrased differently, it nearly always says yes. It approved 59 strings outright, and on 61 more it never produced a usable answer (48 came back as malformed JSON, 13 flagged a problem but offered no replacement).

| Stage | Count |
| --- | ---: |
| Finnish strings reviewed | 396 |
| Changes Poro proposed | 276 |
| Left unchanged after verification | 274 |
| Verified as genuine improvements | 2 |

After the adversarial pass, exactly **two** of the 276 changes survived — a 99.3% rejection rate on Poro's own suggestions. Both are real fixes a careful human proofreader would also have made:

- `projectsPage.keyExternalDesc` (accuracy): the original "yhteys ulkomaailmaan" (connection to the outside *world*) had dropped the word *service* from the English "connects to an outside service". Poro's "yhteys ulkoiseen palveluun" restores it, and "kiertoradalla oleva satelliitti" is more precise than "kiertävä satelliitti".
- `contactPage.noscriptIntro` (grammar): the original was missing the comma Finnish requires before a relative "joka" clause. Poro added it, and also rephrased the predicate from "vaatii JavaScriptin" (requires JavaScript) to "toimii vain JavaScriptin kanssa" (only works with JavaScript) — a semantically equivalent wording that reads a little more naturally.

## Where Poro went wrong

The 274 rejected suggestions are more telling than the 2 that passed, because together they map how an 8B model fails at translation. Grouping the reviewers' stated reasons: 115 changed the meaning, 58 were lateral rewordings that weren't better, 41 were other/unclear, 37 mistranslated a brand or tech term, 12 introduced a new grammar error, 9 were awkward Finnish, and 2 broke a placeholder. The dominant failure, by far, is meaning drift — Poro rewriting a sentence and quietly losing part of it.

The pattern is the mirror image of what the original translator got right. Poro reached for the literal calque exactly where the original correctly kept an English term of art: it wanted to turn "Fullstack-kehittäjä" into the tortured "Täysipinokehyksen kehittäjä". It swapped words for synonyms from the wrong domain: "Subagentit" (AI sub-agents) became "Alisopimukset" (legal subcontracts), and "Projektiluettelo" became the wrong-register "Hankelista". And when it rewrote a long sentence — the site's intro paragraph — it silently deleted the closing clause about the seams between the repos being the point. Every one of these is a mistake the original translation did not make.

## So which translator won

The one I started with. A purpose-built Finnish model, allowed to change anything on the site, improved it in two small places and failed to improve it everywhere else it tried — often making it worse, sometimes just changing it sideways. The machine translation I had been quietly unsure about turned out to be solid. Poro earned its keep not as a rewriter but as a second reader: it confirmed the overwhelming bulk of the work and surfaced two genuine misses.

## Caveats

This is one model's read of one site's strings on one afternoon, not a benchmark of Finnish machine translation. Poro (Llama-Poro-2-8B-Instruct, Q4_K_M) ran locally via Ollama at temperature 0.2; I ran each string once and treated every unreadable answer as "no change" rather than guessing, so the tooling never invented an edit. The 48 malformed-JSON answers out of 396 are a plain reminder that small local models are unreliable at structured output. What this is, honestly, is a before-and-after on my own work — and the before held up better than the reviewer I brought in to grade it. The two accepted fixes shipped in PR #389; the full write-up is the downloadable translation-audit PDF.
