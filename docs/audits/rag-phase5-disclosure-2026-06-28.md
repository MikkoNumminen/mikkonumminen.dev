# RAG chat: Phase 5: progressive disclosure (2026-06-28)

Value first, depth on request, without a question in front of the answer. A
normal answer is concise; after it an explicit offer appears; a topic-less "tell
me more" / "yes" (resolved via Phase 4 memory) expands into that topic's Phase 3
narrative. Built on Phases 3 (narratives) + 4 (memory).

## The flow (`app/pipeline.py`)

- **Default answer**: unchanged retrieval + the existing "keep it short" prompt, a
  concise, precise answer from the summary chunks. Value is never gated behind a
  "short or long?" question.
- **The offer**: after a successful, non-expansion answer about a SINGLE project
  that HAS a narrative (`db.has_narrative`), a deterministic suffix:
  `EXPANSION_OFFER = "Would you like me to tell you more?"`: is appended as a final
  SSE token. Never LLM-generated; kept out of `response_parts`, so memory and the
  log store the substantive answer, not the UX nudge.
- **Expansion**: when `is_expansion_request(query)` matches a topic-less follow-up
  AND the prior user turn (from memory) resolves to exactly one project AND a
  narrative exists, the turn is answered from `retrieve_narrative(project)`: the
  single git-grounded document, with an expansion directive ("go deeper using ONLY
  the narrative above"). Because it reads a precomputed, grounded document, the
  deeper answer is factual, not the small model padding a longer version on the fly.
- **Safe fallthrough**: a "tell me more" with zero or several prior topics, or no
  narrative, falls through to a normal answer: never a crash, never a wrong topic.

`is_expansion_request` (`app/guardrails.py`) matches the WHOLE message ("yes", "tell
me more", "go deeper", …) and is anchored so a request carrying a NEW topic ("tell
me more *about HRM*", "what is X") is NOT caught. That is a normal question.

## Acceptance (live-proven, 2 turns)

| Criterion | Result |
| --- | --- |
| Default answers are concise | ✓, the summary-chunk answer, then the offer |
| The offer appears | ✓, turn 1 ended with "Would you like me to tell you more?" |
| "yes" expands into the grounded narrative for the correct topic | ✓, turn 2 ("tell me more") retrieved **only** `narratives/hrm.md` and answered from it |
| Expansion contains no unsourced claims | ✓, grounded in the narrative; the directive forbids improvisation |

Plus: a single project with a narrative is required for both the offer and the
expansion (`_sole_project` returns None for zero/several), so neither fires on an
ambiguous topic. All existing caps/gates (input cap, weak-retrieval gate,
generative/translation gates, semaphore, role filter, output cap, audit) still
fire: the expansion path goes through the same gate/generation machinery.

Validation: `ruff` + `mypy --strict` clean (26 files), `pytest` **285** (+22:
`is_expansion_request` positives/negatives, the expansion-reads-narrative flow, the
offer appears / doesn't-without-a-narrative, the safe fallthrough, disclosure-off).

## Config

`PROGRESSIVE_DISCLOSURE_ENABLED` (default on) restores single-shot answers when off.

Stacked on Phase 4.
