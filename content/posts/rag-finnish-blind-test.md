---
title: Which local model writes the best Finnish? A blind test settles it
project: portfolio
date: 2026-07-02
---

# Which local model writes the best Finnish? A blind test settles it

This is the third measurement round in this RAG's Finnish saga, and the one that
finally measured the right thing. Three 8B local models (`qwen3:8b`,
`llama3.1:8b`, `Poro-2-8B`), 30 Finnish questions, 540 generations, three
measurement layers, zero cost, no LLM judge anywhere. The capstone was a blind
ranking: 30 rounds where a native speaker graded pure linguistic naturalness
without knowing which model wrote what. Poro, twice dismissed by earlier
metrics, won 26 of 30 rounds. Friedman p < 0.0001.

## Why a third round

The earlier experiment (the Finnish experiment post) concluded that Poro wins
nothing on synthesis. But it left one loose thread, in its own words: *"Its only
edge is qualitative — more natural inflected morphology ("Astro 6:sta",
"TypeScriptistä") — an edge for a human reader, not for the metric."* A
checklist metric is blind to the one thing a Finnish-built model exists for.
This round built an instrument for that human reader.

The question, precisely: which model produces the best Finnish *language*. Not
the most correct answers. Correctness is still measured, but only as a
disqualification floor, so that a hallucinating model cannot win on style.

## Method: three layers, no LLM judge

An English-centric judge model grading Finnish is the exact bias under study,
which disqualified LLM-as-judge from the start. The three layers:

1. **Fact floor (deterministic).** 30 must-retrieve Finnish questions over this
   portfolio's corpus, each with verbatim-verified checklist facts. 119 in
   total, every one confirmed present in the corpus before any model ran.
2. **Voikko linguistic analysis (deterministic).** libvoikko spelling and
   morphology over every answer, with two-tier token classification (tech
   identifiers, proper nouns and English loans separated from genuine Finnish
   errors) plus per-answer language detection. The instrument was calibrated on
   168 human-approved Finnish UI strings from this site's own translations.
   Voikko flags 7.2% of that known-good Finnish, so a model's error rate means
   something only above that floor.
3. **Blind human ranking (the gold layer).** 30 rounds: 10 questions, 3
   independent generations each. The three models' answers were anonymized and
   shuffled with a seeded RNG, and the key stayed sealed until all 30 rankings
   were recorded. The judge (me, the native target reader of this deployment)
   ranked naturalness and fluency only. Ties were allowed.

The harness discipline carried over from the earlier rounds: a single variable
(`LLM_MODEL`), lock-asserted top_k=6, temperature 0.4 and num_ctx 8192,
identical retrieval for every arm, a per-arm instrument fingerprint, and the
rate-limiter loopback exemption that the previous round's correction forced.
Three runs per model per prompt version, with the per-run spread reported
rather than hidden.

## Result I: the models keep leaving the language

The first thing the new eval set exposed was not quality but drift. Asked in
Finnish, with an English retrieved context, all three models answered in
English roughly half the time. Finnish-adherence with the baseline prompt:
llama 54%, qwen3 40%, Poro 39%. The Finnish-built model drifted the most. The
drift is question-driven and nearly deterministic: overview questions stay in
Finnish, deep technical ones flip everyone to English.

The cause sat in the prompt, not in the models. The English path enforced its
language with three anchors (a system rule, a user-message prefix and a closing
reminder). The Finnish path had one. Mirroring the triple anchor for Finnish,
with an explicit instruction to translate the explanation while keeping product
names and code identifiers as they are, moved Poro the most: from 39% to 48%,
flipping two questions from all-English to all-Finnish across every run. llama
went 54 to 55, qwen3 40 to 43. At 8B, no prompt fully beats a wall of English
context, but a symmetric one narrows the gap substantially.

Two of the 30 questions never reached any model at all: the English embedder
retrieved them below the relevance gate. That is the same Finnish-retrieval
limit the first experiment measured, still biting. Since the fixed fallback
reply is identical for every model, those two were excluded from ranking
aggregates, leaving 28 questions and 84 scored answers per model per version.

## Result II: when they write Finnish, the spelling is a tie

Voikko error rate on genuinely-Finnish answers, strengthened prompt: Poro 3.3%,
qwen3 4.0%, llama 5.8%. All three sit below the 7.2% human-baseline floor. In
other words, when any of these models writes Finnish, its spelling and
morphology are indistinguishable from human-approved Finnish at this sample
size. The differences live where a spell-checker cannot see: rhythm, word
choice, idiom.

The instrument itself needed honesty first. A naive Voikko pass scored all
three models at roughly 60% "errors", and the human-approved calibration
strings at 18%, because it counted tech-Finnish like "TypeScriptistä" and
"RAG-järjestelmän" as typos. Two-tier token classification fixed the ruler
before it read anything.

## Result III: the blind test

30 rounds, judged blind, naturalness only:

| model | mean rank | firsts /30 | sole firsts | sole lasts |
|---|---|---|---|---|
| **Poro-2-8B** | **1.37** | **26** | **17** | **0** |
| qwen3:8b | 2.23 | 9 | 3 | 9 |
| llama3.1:8b | 2.40 | 6 | 1 | 11 |

Friedman χ² = 22.85 (df 2), p < 0.0001. Kendall's W = 0.38. Pairwise sign
tests: Poro beats qwen3 20 to 3 (p = 0.0005) and llama 22 to 1 (p < 0.0001),
while qwen3 against llama is a coin flip (13 to 10, p = 0.68). Poro was best or
tied-best on 9 of 10 questions and was never the sole worst answer in any
round.

The earlier metric had scored qwen3 and Poro identical, both at roughly 93%
"substantive grounded Finnish". The blind test says a native reader separates
them 20 to 3. Both measurements are correct. They measure different things,
and only one of them is the thing a reader experiences.

## Result IV: the fact floor, and one instructive hallucination

Checklist-fact coverage came out around 52% for all three, with differences
inside the noise. No model won on style while losing on substance, so the
floor held.

One question earned a case study. Asked in Finnish where Mikko got his first
paid programming job, all three models confidently answered "Vuohiliitto",
which is one of his own projects, not an employer. The correct answer (Kasvu
Labs Oy) sits in the corpus's CV. Retrieval simply never surfaced that chunk
for the Finnish query; the retrieval log shows a miss on every arm. The models
improvised from the wrong chunks. The hallucination's root cause was retrieval,
not generation. Grounding is a chain, and the embedder is still its weakest
Finnish link.

## Findings

1. **"Poro is worst" measured the wrong thing.** Task checklists and
   containment probes rank models on dimensions where Finnish-specialisation is
   invisible. Graded blind on the language itself, Poro is decisively best.
2. **Small models mirror their context's language.** Drift, not quality, is
   Poro's real weakness. It is a prompt and architecture problem, partially
   fixed here (+9 points), not a language problem.
3. **A Finnish RAG needs two repairs, not one:** a language-anchored prompt
   (done) and Finnish-capable retrieval (open). The English embedder both drops
   questions at the gate and starves grounding, as the Kasvu Labs case shows.
4. **The deployment decision:** Poro plus drift mitigation for the Finnish
   path, and the current default model for English. Pick the best Finnish
   writer and patch its failure mode with architecture, rather than picking a
   weaker writer for its obedience.

## Limitations, recorded

- One judge. The native target reader of this specific deployment is the right
  judge for this decision, and still a sample of one.
- 30 blocks come from 10 questions with 3 generations each, so same-question
  generations are not fully independent. The pairwise margins of 20 to 3 and
  22 to 1 survive this caveat comfortably.
- The blind set is conditional: only questions where all three models stayed in
  Finnish could be ranked. Poro's quality win presumes its drift is managed.
- One quantization (Q4_K_M), one GPU, this corpus and this prompt. The result
  is a deployment decision, not a leaderboard.

## The series

1. The harness post: the measurement discipline.
2. The Finnish experiment: capability, plus the published containment error and
   its correction.
3. The methodology lesson: how the error was caught, with unrecorded variables
   and a rate-limiter contaminant.
4. This post: the blind test that finally measured the thing a reader
   experiences.
