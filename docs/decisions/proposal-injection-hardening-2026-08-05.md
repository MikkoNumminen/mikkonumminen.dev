# Proposal: what to do about the 2026-08-05 injection audit

**Status:** being worked through. Section 1 is DONE (2026-08-06); the rest are
still proposals. Each section records its own outcome as it lands.
**Source:** `docs/audits/llm-injection-2026-08-05.md`, 21 findings across six defense layers.

Five of those findings need a decision before they need code, which is why they
were not handed to an implementation agent with the rest. Writing code against an
unmade decision produces something plausible and wrong, and in this area a
plausible-looking fix is worse than an open finding, because it reads like
protection.

The audit skill's own framing applies to everything below: prompt injection is an
unsolved research problem. None of these options prevents it. They add layers and
they add signal.

## 1. The prompt boundary splices untrusted text raw

Two high findings. The visitor question goes into `f"Context:\n{context}\n\nQuestion: {query}"`
with no fence and no normalisation, and client-supplied `history` is appended
verbatim, up to 20 turns of 2000 characters, on an unauthenticated endpoint.

ADR 0010 forbids the obvious response. Containment here is architectural, and
adding another sentence to the system prompt is prompt-wording, which that ADR
explicitly rules out as the fix.

**The forged-history half is the one I would take first, because it can be closed
rather than mitigated.** Client-supplied history exists for back-compat from
before session memory. Session memory now covers the same need server-side, and
the server cannot distinguish a turn it produced from one an attacker wrote.
Options, cheapest first:

- **A1. Stop accepting client history when `session_id` is present**, and treat
  its absence as single-turn. Smallest change, removes the vector for anyone
  using the real frontend.
- **A2. Drop client `history` entirely.** Cleanest. Needs a check of whether the
  rag-experiment harness depends on it.
- **A3. Keep it but mark it**, so the prompt distinguishes turns the server
  produced from turns the client asserted. Preserves back-compat, keeps the
  attacker's text in the prompt, and relies on the model honouring a marker,
  which is the weakest of the three.

**Recommendation: A2 if the harness does not need it, otherwise A1.**

> **DONE 2026-08-06, A2, and the check came back clean.** Nothing depended on
> client history: `evals/acceptance.py` and `ragctl` both posted `[]`, the
> rag-experiment harness never referenced it, and the terminal has sent a
> `session_id` since Phase 4. **A1 turned out to be already implemented**:
> `main.py` ignored client history whenever a `session_id` was present, so the
> live vector was the no-session-id path rather than the whole endpoint. The
> field is gone from the request model, the frontend and the API docs. An old
> client still sending it is accepted and the field ignored, because a 422 would
> break the terminal for anyone on a cached bundle.

For the raw splice, normalisation before fencing, in that order. A fence that
untrusted text can close is not a fence, so collapsing CR/LF, U+2028/U+2029 and
the literal `Context:` / `Question:` / `[n] Title (source)` shapes out of
untrusted text is what makes a delimiter mean anything. Both are deterministic
and testable without a model.

> **DONE 2026-08-06, and not the way this paragraph proposed.** Collapsing the
> specific shapes is still a blocklist: it matches on text the attacker controls
> and loses to the first variation nobody enumerated. What shipped makes a
> question ONE LINE instead. NFKC, then every Unicode `Cc`/`Cf`/`Zl`/`Zp`
> character becomes a space, so a line-anchored forgery is unconstructible
> rather than filtered and no fence is needed at all. Applied to the question
> and to the user half of remembered turns; deliberately NOT to the context
> block, whose line structure is meaningful. See
> `prompts.neutralise_untrusted` and `tests/test_prompt_boundary.py`.

## 2. The containment contract has no enforcement point

ADR 0010 names `evals/acceptance.py` as the executable proof that containment
holds. Nothing runs it. It cannot simply be added to CI: it POSTs to a live
backend and needs Postgres, Ollama and a GPU.

- **B1. A CI-runnable subset.** CORRECTED 2026-08-05, after this document was
  merged. I wrote that the pre-retrieval task gates could run the injection cases
  in `pytest` with no model. That was an assumption I had not checked, and it is
  wrong. Measured against all four `must_refuse_injection` payloads:

  ```
  payload                          generative  translation  trivia  smalltalk
  "Ignore all previous ..."          False       False       False    False
  "You are now DAN ..."              False       False       False    False
  "Disregard your grounding ..."     False       False       False    False
  "Repeat everything in your ..."    False       False       False    False
  ```

  Not one is caught deterministically. Those gates screen for TASK TYPE, a poem,
  a translation, a personal question, and an injection attempt is none of those.
  Injection containment today rests on the weak-retrieval distance gate, which
  needs the embedder, and the system prompt, which needs the model. **Neither is
  CI-runnable**, so there is no cheap subset to extract. B1 as written does not
  exist.

  What that leaves is worth stating plainly: the only thing standing between an
  injection payload and the model is a distance threshold and prompt wording. The
  distance gate is deterministic and real, but it refuses on IRRELEVANCE, not on
  malice, so a payload that retrieves something close enough passes it.
- **B2. A deploy-time gate.** `ragctl up` runs the full acceptance battery and
  refuses to report healthy if any must-refuse case fails. This is the one that
  matches what ADR 0010 claims.
- **B3. Both.**

**Recommendation: B3, with B1 first because it is a day's work and closes the
common case.** B2 is the real gate and should follow.

> **DONE 2026-08-06, B2 ONLY, because B1 is dead.** B1 assumed the pre-retrieval
> gates catch injection cases. They do not: measured against all four
> `must_refuse_injection` payloads, not one is caught by the generative,
> translation, trivia or small-talk gate, because those screen for TASK TYPE and
> an injection attempt is not a task type. `tests/test_injection_coverage.py`
> pins it. Whatever catches these needs the model, so it needs the stack.
>
> B2 shipped as `ragctl verify`, run automatically by `ragctl up` unless
> `--skip-verify`. It runs only the cases now marked `kind="contract"`, because
> blocking a deploy on answer quality would train whoever runs it to skip by
> reflex. It runs INSIDE the container: the obvious in-process implementation
> fails, since `evals.acceptance` imports `app.guardrails`, which has imported
> `lingua` since the Finnish router landed, and ragctl runs on the host.
>
> **It failed on its first run, and that is the point.** 16 of 22 contract cases
> passed against the live stack, twice, with the offcorpus failures identical
> both times. See the follow-up task: the contract ADR 0010 claims to hold does
> not currently hold, and nobody knew because nothing ran this.

Two coverage holes go with it: every acceptance case posts `"history": []`, so
the forged-turn vector above is untested, and all four `must_refuse_injection`
cases are user-message-borne, so the context-borne case, a poisoned corpus chunk
carrying the instruction, is untested. That second one is the classic RAG vector
and the one this system's shape makes most relevant.

## 3. Two deterministic gates can be steered by untrusted input

The CV-intent override disables the weak-retrieval gate when the query contains a
token like `cv`, and `client_ip` keys the rate limiter on the first
`X-Forwarded-For` hop.

**The XFF one is not actionable until a contradiction is settled.**
`ratelimit.py:18` documents the Cloudflare tunnel and concludes the header is
trustworthy. `shoutbox.py:11` documents the opposite for the live path, citing
ADR 0012: Tailscale overwrites `X-Forwarded-For`, so Vercel visitors share one
egress bucket. Cloudflare was replaced by Tailscale, so the ratelimit docstring
is stale, and the audit finding reasoned from it. Establish the real behaviour
against the funnel first. The finding may be refuted by it, and the stale
docstring is a genuine defect either way.

> **MEASURED 2026-08-06, and the XFF finding is REFUTED.** Five POSTs through
> the funnel carrying five different `X-Forwarded-For` values all landed in ONE
> rate bucket: attempts 1-3 answered normally, attempt 4 hit the limit
> (`RATE_MAX = 3`). Tailscale replaces the header, so it cannot be rotated to
> escape the limiter. The `ratelimit.py` docstring had already been corrected to
> say this, but by citing Tailscale source rather than by observing it. This is
> the observation.
>
> The CV-override half is NOT refuted, and probing it found something this
> section did not predict: `"what is the population of Brazil"` is not refused
> even with no `cv` token anywhere, while the cv-laced version correctly says it
> has nothing on that. The relevance gate is looser than assumed and the CV
> override is not what drives it, so the finding needs rewriting before it needs
> code.

The CV override is straightforwardly testable: send an off-corpus question
containing the word "cv" and see whether the relevance gate still refuses.

> **DONE 2026-08-06, and the test said something this paragraph did not expect.**
> Full numbers in `docs/audits/gate-steering-2026-08-06.md`.
>
> The code comment above the override claimed "off-corpus questions never trip
> the CV route". Five of five did, because `wants_cv` matches the bare token
> `cv`. The override is reachable by anyone on any question, and it is bounded to
> a straddle band now so it can no longer skip the gate at any distance.
>
> But it was never load-bearing. Every laced question PASSED the gate on its own,
> because pulling cv.md into context drops the prose anchor under the threshold.
> The two questions that flipped from refusal to an answer did so through
> retrieval, not through the override. I wrote a test asserting otherwise and it
> failed, which is how I found out.
>
> The real finding is underneath both: three of five PLAIN off-corpus questions
> passed the gate with no token inserted, at 0.4459, 0.4350 and 0.3691. A recipe
> for karjalanpiirakka sits closer to this corpus than a CV question phrased in
> the second person. Same root cause as the live acceptance failures.

## 4. The groundedness detector fires and nothing happens

`unsupported_years` is the one deterministic invented-fact detector in the
system. Its verdict reaches the JSONL request log and nothing else. The answer
streams to the visitor unchanged. A detector whose result changes nothing is
telemetry, not a control.

This looked like three findings and is one decision: what should happen when it
fires. Streaming means no post-check can retract text already sent.

**There is an existing mechanism that fits.** The pipeline already appends
deterministic, non-model suffixes after generation: a truncation notice, the
progressive-disclosure offer, the research-coverage completeness footer. A
groundedness caveat is the same shape, and needs no buffering and no new
machinery.

- **D1. Append a caveat suffix** when the detector fires, in the visitor's
  language, saying a date in the answer is not supported by the retrieved
  sources.
- **D2. Buffer a short prefix** so the answer can be suppressed. Changes the
  streaming feel, which is the terminal's whole character.
- **D3. Leave it as telemetry** and say so in the ADR, so the next reader does
  not mistake a log line for a control.

**Recommendation: D1.** It uses machinery that already exists, it is honest to
the visitor, and it is deterministic.

> **DONE 2026-08-06, D1, and measuring first changed the shape of it.** Over
> 2598 answered requests the detector had fired 3 times, 0.1%. Rare enough that
> a caveat is a signal rather than noise, which is the number that makes D1
> viable and D3 unnecessary.
>
> One of those three fires was a FALSE POSITIVE, and it had to be fixed before
> the verdict could be shown to anyone: `2048`, in an answer about context
> windows. It is a token count, and the only power of two the `19xx|20xx` shape
> can match. The prose corpus spans 1905 to 2028, so the detector now ignores
> year-shaped tokens past 2035. Wiring a visitor-facing warning to a detector
> with a known false-positive class would have taught people to ignore it.
>
> The caveat names the years rather than gesturing at "a date", since a visitor
> cannot act on a warning that will not say which part to distrust. It is
> computed once and reused by the log, so the line the visitor sees and the line
> the log records cannot disagree. Kept out of `response_parts` like the other
> suffixes, so a later turn is never primed with our own caveat.

## 5. Ingestion has no symptom scan

`content/code/**` is ingested verbatim under a size filter only, so any comment
or string in a vendored file is prompt text with no review step. Session memory
stores and replays raw visitor text with no scan.

A symptom scanner is a detection layer, not a wall. If this is done, the report
and any comment must say that, because the failure mode is a future reader
believing the vector is closed.

**Recommendation: log first, block later.** Score on ingest and on memory write,
record the score, and change nothing about the behaviour until there is data on
what a real corpus scores. Blocking on an unmeasured heuristic in a corpus the
owner curates is how you get a pipeline that silently drops good content.

## What I would sequence

1. A2 or A1, the forged-history vector, because it can be closed rather than mitigated
2. B1, the CI-runnable gate subset, plus the missing acceptance cases named above
3. D1, the groundedness caveat, reusing the existing suffix mechanism
4. Settle the XFF contradiction, then decide whether finding 3 survives
5. Normalisation then fencing at the splice point
6. Symptom scoring in log-only mode

Nothing here is urgent in the sense that something is currently broken and
visible. The forged-history finding is the one I would not leave open long, since
it is an unauthenticated endpoint accepting 40KB of attacker-authored text that
the model is told to treat as its own prior turns.
