---
title: Does the portfolio RAG need Finnish, and does it need a Finnish-built model?
project: portfolio
date: 2026-06-29
type: research
---

# Does the portfolio RAG need Finnish, and does it need a Finnish-built model?

An eval-gated, single-variable comparison of three 8B local models on Finnish
retrieval, synthesis, and containment for this site's RAG chat: run entirely on
one 12 GB GPU (RTX 3080 Ti) with Ollama and no hosted APIs, at zero cost. The
result that lasts is not "which model" but a method that killed its own starting
assumption and recorded the uncomfortable findings.

## Hypothesis under test

"Weak 8B local models can't synthesise Finnish; a Finnish-built model (Poro 2) is
needed to re-enable it." **Falsified.** Finnish synthesis is already solved at 8B
by general models. Poro wins nothing on synthesis; containment: whether a model
refuses off-scope Finnish: turned out too noisy to rank the three at this sample
size (see the correction in Result II). The real lever is neither a model swap nor
an embedder swap.

## The question and the method

Finnish had been removed from the RAG on the assumption that local models were too
weak for it. That removal conflated two distinct questions, measured here
independently:

1. **Capability**: can an 8B model synthesise acceptable Finnish from an English
   content corpus, well enough for a recruiter-facing terminal?
2. **Specialisation**, if Finnish returns, is a Finnish-built model (Poro 2)
   required, or do general models suffice?

There was an honest non-technical pull toward Poro: a Finnish/European open model
is a coherent thing for a Finnish developer's portfolio. The experiment was built
so that preference could not bias the result: the decision is made on numbers.

Discipline held throughout:

- **Single variable.** Only `LLM_MODEL` changes in the comparison. Retrieval
  top-k, prompt template, temperature (0.4) and context window (8192) are held
  identical and asserted at runtime: the run aborts if any differ.
- **Eval-first.** A fixed 16-entry Finnish eval set is the instrument, authored
  and reviewed before any model ran.
- **Parallel design.** Each Finnish question is a literal translation of an
  English one pointing at the identical expected sources, so the English–Finnish
  delta isolates the embedder with no "asked a different question" confound.
- **Instrument before result.** A fix that would have padded question text to trip
  a language detector was rejected as contamination. It would have changed the
  retrieval embedding. The instrument is not tuned toward a wanted outcome.
- **Findings recorded.** Uncomfortable results are reported, not smoothed.

The three models: `qwen3:8b` (candidate, run with `/no_think`, 6.3 GB at load),
`llama3.1:8b` (control / de-facto RAG baseline, 5.9 GB), and `Poro-2-8B` (Finnish
candidate, a Llama 3.1 8B base whose GGUF caps at 8192 context, 5.9 GB). One model
is resident at a time, swapped between runs: never two at once. Max measured
prompt+output was 5205 tokens, so 8192 context truncates nothing; a 16k pilot
reproduced the 8k numbers.

## Result I: retrieval is not the differential bottleneck

On the identical English/Finnish parallels, retrieval hit-rate is **equal (0.667
both)**. The English embedder (`bge-small-en-v1.5`) pushes Finnish queries
consistently farther (a mean shift of about **+0.12 cosine distance**), but that
mostly moves points within the passing band, not out of it.

| metric (n=12) | English | Finnish |
| --- | --- | --- |
| hit-rate | 0.667 | 0.667 |
| MRR | 0.496 | 0.454 |
| coverage |, | 0.750 |

Two Finnish points cross the 0.45 weak-retrieval gate (`hrm-deep-2`,
`narrative-hrm`), but only `narrative-hrm` is a genuine flip: a passing English
retrieval that became a Finnish miss; `hrm-deep-2` was already a miss in English.
One question improved in Finnish (rank noise). Because all three models share this
embedder, every model receives comparable context, so any synthesis difference
between them is the model's, not retrieval's. A multilingual embedder would recover
the gated case: a secondary win, not the blocker.

## Result II: synthesis is solved; containment is the gap

Nine Finnish-routed must-retrieve questions × 3 runs measured synthesis; four
off-scope probes measured containment. Synthesis is the stable signal here;
containment is not, and is corrected below.

| model | substantive grounded Finnish (3-run) |
| --- | --- |
| **qwen3:8b** | 25/27 |
| **Poro-2-8B** | 25/27 |
| llama3.1:8b | 18/27 |

1. **Hypothesis falsified.** qwen3 and Poro both reach ~93% substantive grounded
   Finnish with no English drift. The original removal was caused by the prompt's
   English-forcing, not by model capability.
2. **Poro does not win.** It ties qwen3 (25/27). Its only edge is qualitative:
   more natural inflected morphology ("Astro 6:sta", "TypeScriptistä"), an edge
   for a human reader, not for the metric. llama's lower score is stub answers, not
   drift.
3. **Containment does not rank the models: a correction.** This post first
   reported qwen3 refusing **9/12** off-scope Finnish probes vs Poro and llama at
   3/12, and concluded *Poro is worst at containment*. **That was wrong.** It was a
   single sample of four probes × three runs, on a run later found to be silently
   **rate-limited**: the production limiter throttling the eval and biasing later
   runs downward. Re-measured over **20 clean runs** per model (the limiter now
   exempts the loopback eval path), containment is a wide, overlapping stochastic
   band, not a ranking:

   | model | refused off-scope Finnish, per-run mean [min–max] / 4 (N = 20) |
   | --- | --- |
   | qwen3:8b | 1.75 [1–3] |
   | Poro-2-8B | 1.55 [1–3] |
   | llama3.1:8b | **2.9 [2–4]** |

   qwen3 and Poro are **tied** (bands fully overlap, means ≈ 1.6–1.8 / 4); the
   resident control **llama refuses the most**. At four probes per run these are
   samples from noisy distributions, not hard numbers, so containment is reported
   as bands, the same deterministic-vs-stochastic honesty the exact retrieval
   (0.667) already gets. The original 9-vs-3 *inversion* was an artifact of sample
   size plus a rate-limiter contaminant: two things this eval process was built to
   expose, and did, before the claim reached anywhere it mattered.
4. **Recorded limitations.** The Finnish detector fires on only 12/16 questions
   (code-identifier-dense Finnish dilutes the ä/ö heuristic, so a code-heavy
   Finnish question may answer in English); refusal outcomes are stochastic at
   temperature 0.4; the weak-retrieval gate is calibrated on English distances.

The genuine Finnish blocker isn't capability: it's that the deterministic refusal
gates (`is_generative` / `is_translation`) are English-keyword-based and never fire
on Finnish, so a Finnish poem or translation request slips past them into the
model, where the prompt backstop is unreliable.

## Diagnosis and decision

| candidate lever | verdict | why |
| --- | --- | --- |
| Model swap (to Poro) | not it | qwen3 already synthesises Finnish as well as Poro; containment doesn't separate them |
| Embedder swap (multilingual) | secondary | recovers the 2 distance-gated questions + the off-corpus slider; retrieval isn't the floor |
| Gate localization | **the lever** | Finnish patterns in the deterministic gates, cheap, AI-free, testable; closes the one real blocker |

The decision is structured by the data, not binary:

- **Ship Finnish?** Yes, but localise the gates first. Synthesis supports it;
  without gate localization a Finnish poem/translation request slips through. "Ship"
  means localise, then merge.
- **Multilingual embedder?** Optional, secondary. Recovers a small number of
  distance-gated questions. Not required to ship.
- **Model swap?** No. The resident family (qwen3) synthesises Finnish as well as any
  model tested, and containment does not separate the candidates (see Result II).

The durable value isn't the model choice. It's a single-variable, locked experiment
that falsified its own starting assumption, and then caught its own *published*
containment finding being backwards (the correction in Result II) and fixed it,
rather than letting it stand. An experiment that corrects itself when the evidence
improves is more trustworthy than one that never erred. (The ä/ö detector also
misses code-identifier-dense Finnish: recorded, not buried.)
The deterministic, AI-free harness (lock-asserts, the English–Finnish
parallel-delta table, context/VRAM measurement, the multi-model runner) generalises
to any "should we swap X for Y" question in the pipeline: embedder, chunking,
reranker, not just models.

The work shipped behind a `RAG_ALLOW_FINNISH` flag (default off): a 16-entry
Finnish parallel eval set, a shared `looks_finnish` detector used by both the
pipeline routing and the tests, and a locked 3-model synthesis run, with the raw
answers retained for qualitative judgment.
