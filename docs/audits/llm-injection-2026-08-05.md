# LLM injection audit, 2026-08-05

## The claim this report can and cannot make

Prompt injection is an unsolved research problem. No prompt wording, input
filter, or eval suite makes an LLM boundary safe against a motivated attacker,
and nothing below should be read as proving safety. What this audit does is
mechanical: it maps every place untrusted text reaches the model prompt, then
checks six defense-in-depth layers for presence and coverage. The output is a
posture description (which layers exist, where each is thin), never a
certification. A clean run of every recommendation in this report would still
not make the boundary safe; it would make it layered.

## Summary

- Commit audited: `3e44c1266ab1caf0d79aee4a6196051351e20d87` on branch `master`
- Findings: 21 (critical: 0 · high: 2 · medium: 14 · low: 5) across the six
  layers
- Untrusted inputs mapped: the visitor question, client-supplied history turns
  (unauthenticated, replayed verbatim), session-memory replay, retrieved corpus
  chunks (including `content/code/**` vendored source ingested verbatim), and,
  with `RAG_TRANSLATE_RETRIEVAL` on, the translation model's own output.

Both highs sit in Layer 1, at the same prompt-assembly site
(`chat-backend/app/prompts.py`), and share a fix shape: fencing and
neutralising the structural labels that untrusted text can currently forge.

## Defenses present

A report that lists only gaps misrepresents the posture, so first the layers
that exist and were verified in place at this commit:

- **Deterministic pre-retrieval gates.** `guardrails.py` refuses generative
  (:694), translation-task (:793), personal-trivia (:788) and smalltalk (:489)
  question shapes before any model call. A refused request never reaches the
  prompt, and no model output can un-refuse it.
- **The weak-retrieval distance gate.** Off-corpus questions are refused
  pre-LLM when retrieval distance says the corpus has nothing
  (`is_weak_retrieval`, guardrails.py:503). Finding 10 below documents a
  bypass, but the gate itself is real, deterministic, and on by default.
- **Input caps.** The question and every history turn are length-capped
  (per-turn 2000 chars, history 20 turns, plus the body-size middleware and
  `INPUT_MAX_CHARS`), so attacker text volume per request is bounded.
- **The GDPR classification filter is applied in SQL.** Excluded
  classifications cannot be retrieved into the prompt no matter what the
  question says, because the filter is a WHERE clause on the retrieval query,
  not model behavior.
- **The role whitelist.** Client-supplied history roles pass through
  `role in ("user", "assistant")` (prompts.py:273), so a forged `system` turn
  is dropped rather than replayed into the prompt.

## Findings by layer

### Layer 1: data/instruction separation (6)

- [chat-backend/app/prompts.py:276](../../chat-backend/app/prompts.py#L276) [high]: the visitor question is spliced raw (`f"Context:\n{context}\n\nQuestion: {query}"`) with no fence, no CR/LF or U+2028/U+2029 collapse, and no neutralization of the `Context:` / `Question:` labels that structure the same string: a question can forge a context row or a closing directive.
- [chat-backend/app/prompts.py:270](../../chat-backend/app/prompts.py#L270) [high]: client-supplied prior turns (≤20 × ≤2000 chars, unauthenticated) are appended verbatim between the system prompt and the grounded question; only `role` is whitelisted (`:273`), content carries no marker distinguishing an attacker-authored "assistant" turn from one this server produced.
- [chat-backend/app/prompts.py:227](../../chat-backend/app/prompts.py#L227) [medium]: retrieved chunk content is spliced raw into `[i] Title (source)\ncontent`; the row marker is trivially forgeable from inside chunk text, and no line-collapsing is applied.
- [chat-backend/app/prompts.py:52](../../chat-backend/app/prompts.py#L52) [medium]: the data-guard rule is scoped to *"everything in the user's message"* only; no rule anywhere declares the CONTEXT block to be data-never-instructions, so a poisoned corpus chunk is not covered by the immunity sentence.
- [chat-backend/app/prompts.py:211](../../chat-backend/app/prompts.py#L211) [medium]: a corpus `title` is interpolated into a first-person assertion ("Mikko's most recent research is: {label}") that sits outside the numbered rows, in the prompt's highest-trust voice, unvalidated and unfenced.
- [chat-backend/app/pipeline.py:137](../../chat-backend/app/pipeline.py#L137) [low]: the translator turn is the raw query under a two-line system prompt with no data guard; injected text can override it. Bounded on the output side (`:148`, `:162-169`) and never user-visible.

### Layer 2: input-symptom flagging (3)

- [chat-backend/app/guardrails.py:694](../../chat-backend/app/guardrails.py#L694) [medium]: the deterministic pre-model gate family covers generative (`:694`), translation (`:793`), personal trivia (`:788`) and smalltalk (`:489`) shapes, but there is no symptom detector for injection phrasing (`ignore previous instructions`, `reveal your system prompt`, `you are now …`, forged `system:`/role markers): such a message reaches the prompt unflagged.
- [chat-backend/app/content.py:307](../../chat-backend/app/content.py#L307) [medium]: every file under `content/code/**` is ingested verbatim (only a size filter, `:311`): comments and strings in a vendored or generated source file become prompt text with no index-time symptom scan.
- [chat-backend/app/memory.py:106](../../chat-backend/app/memory.py#L106) [medium]: raw visitor text is stored (`query[:4000]`) and replayed into a later prompt via `history()` with no symptom scan and no provenance marker; `session_id` is caller-chosen, so any caller may seed a session.

### Layer 3: output-authority bounding (3)

- [chat-backend/app/pipeline.py:547](../../chat-backend/app/pipeline.py#L547) [medium]: tokens are streamed to the visitor as they arrive, so no deterministic post-check can ever suppress, truncate or replace a hijacked answer; every post-check (truncation notice :579, coverage footer :621, `unsupported_years` :662) runs after the text has already left the process.
- [chat-backend/app/pipeline.py:674](../../chat-backend/app/pipeline.py#L674) [low]: the model's own answer is written to session memory verbatim and re-enters the next prompt as a trusted `assistant` turn with no inspection (bounded by `MEMORY_MAX_TURNS`, and session ids are crypto-random at [chat.ts:117](../../src/lib/terminal/chat.ts#L117), so cross-visitor reach is weak).
- [chat-backend/app/guardrails.py:556](../../chat-backend/app/guardrails.py#L556) [low]: model output holds one small decision: a substring match on the answer decides whether the deterministic "Latest research" pointer fires, so text that names the title suppresses the completeness guarantee.

### Layer 4: structural grounding (3)

- [chat-backend/app/pipeline.py:662](../../chat-backend/app/pipeline.py#L662) [medium]: `unsupported_years` is the one deterministic invented-fact detector, but its verdict only reaches the JSONL log: an answer stating a year absent from both context and question is displayed, counted, never dropped or flagged to the visitor.
- [chat-backend/app/guardrails.py:146](../../chat-backend/app/guardrails.py#L146) [medium]: groundedness validation covers year tokens only; no other claim in the answer is checked against the retrieved chunk set, so an injected narrative that stays inside the context block renders in full.
- [chat-backend/app/prompts.py:229](../../chat-backend/app/prompts.py#L229) [low]: the `[n] Title (source)` row shape is reproducible by the model in prose, and answer text is rendered verbatim beside the deterministic citation list with no cross-check that an inline reference exists in the retrieved set.

### Layer 5: deterministic trust anchor (3)

- [chat-backend/app/pipeline.py:462](../../chat-backend/app/pipeline.py#L462) [medium]: the CV-intent override disables the weak-retrieval gate on a token in the untrusted query: `wants_cv` matches `cv`/`career`/`resume`/`työkokemu*` ([query_projects.py:387](../../chat-backend/app/query_projects.py#L387)), which force-injects `cv.md` at [retrieval.py:346](../../chat-backend/app/retrieval.py#L346), which then makes `cv_grounded` true: any off-corpus question carrying a CV word reaches the model with the pre-LLM relevance anchor switched off.
- [chat-backend/app/ratelimit.py:15](../../chat-backend/app/ratelimit.py#L15) [medium]: `client_ip` keys the limiter on the first `X-Forwarded-For` hop, which a tunnel visitor can supply; the per-IP bucket that bounds brute-forcing injection phrasings is therefore attacker-partitionable (the loopback exemption at :36 is correctly conjunctive and is not the issue).
- [chat-backend/app/pipeline.py:398](../../chat-backend/app/pipeline.py#L398) [low]: with `RAG_TRANSLATE_RETRIEVAL` on (default off, [config.py:331](../../chat-backend/app/config.py#L331)) the translation *model's own output* is half of what `wants_cv_intent` reads at :462 and what `is_research_coverage_request` reads via `intent_text` ([retrieval.py:334](../../chat-backend/app/retrieval.py#L334)); model output must never be able to remove a deterministic refusal.

### Layer 6: red-team regression fixture (3)

- [.github/workflows/ci.yml:90](../../.github/workflows/ci.yml#L90) [medium]: CI runs `ruff`/`mypy`/`pytest` only; `python -m evals.acceptance`, the sole place the injection payloads are actually executed, never runs in CI, so a prompt reword or model swap reopens a closed hole with a green build.
- [chat-backend/evals/acceptance.py:161](../../chat-backend/evals/acceptance.py#L161) [medium]: every case posts `"history": []`; no red-team case exercises forged prior turns, though `/chat` accepts 20×2000 chars of unauthenticated attacker-authored `assistant` turns ([main.py:49](../../chat-backend/app/main.py#L49)).
- [chat-backend/evals/eval_set.json:747](../../chat-backend/evals/eval_set.json#L747) [medium]: all four `must_refuse_injection` cases are user-message-borne (override, DAN persona, reveal, echo-exfil); none places a payload inside a *retrieved corpus chunk*, so indirect RAG injection has no assertion, and there are no Unicode-separator / forged-`[n]`-row / homoglyph cases pinning residuals.

## Recommended next steps

Ranked by how much posture each buys, not by severity alone.

1. **Fence the prompt assembly** (`prompts.py:276`, `:270`, `:227`, `:52`,
   `:211`): collapse CR/LF and the Unicode line separators in every untrusted
   string, neutralise the `Context:`/`Question:`/`[n]` labels inside them, and
   extend the data-guard sentence to cover the CONTEXT block. This is the both
   highs plus three mediums, one file.
2. **Close the trust-anchor bypasses** (`pipeline.py:462`, `:398`): the
   weak-retrieval gate must not be switchable off by a token in the query or by
   translator output. Deterministic refusals stay deterministic.
3. **Grow the red-team fixture where the attack surface actually is**
   (`eval_set.json:747`, `acceptance.py:161`, `ci.yml:90`): forged-history
   cases, a corpus-chunk-borne payload case, and an acceptance run in CI.
   Without the CI run, every other fix here is one refactor away from silently
   regressing.
4. The Layer 3/4 items (streaming vs post-check, log-only groundedness) are
   architecture trade-offs, not oversights; the streaming choice is deliberate.
   Record the residual, do not pretend a post-hoc filter would close it.

## What this audit is not

It is a layer inventory at one commit. It did not attempt live exploitation,
it did not fuzz the deployed endpoint, and it cannot certify the boundary
against attacks not yet invented, because nobody can: that is what "unsolved"
means in the opening section. The value of the six layers is that each one an
attacker must cross is one more place a payload can die; the findings above
are where a layer is missing or thin, and the "Defenses present" section is
what already stands.
