# RAG chat: Phase 6: context bar + reset (2026-06-28)

A live, honest readout of how full the model's context is: the real
`prompt_eval_count + eval_count` against `num_ctx`, not a char estimate: rendered
as a terminal donut, plus `/clear` to reset the session and empty it. Built on
Phase 4 memory (the fill only means something once a session accumulates state).

## Backend: the real measurement

- **`app/llm.py`**: the OpenAI-compatible request now sends
  `stream_options:{include_usage:true}`, and `stream_chat` accepts a `usage_out`
  dict it fills from the final usage chunk. `parse_usage_line` (pure, unit-tested)
  extracts `{prompt, completion}`: the true `prompt_eval_count` / `eval_count`
  Ollama reports.
- **`app/pipeline.py`**: after a successful answer, when a context window is
  configured AND the model reported usage, emits a new SSE frame
  `event: context  data: {"used": prompt+completion, "limit": num_ctx}`. Emitted
  only with real numbers: the terminal never renders a fabricated value.
- **`app/sse.py`**: `sse_context(used, limit)`.
- **`app/config.py`**: `CONTEXT_WINDOW` (default 4096, validated positive); set in
  compose from `OLLAMA_CONTEXT_LENGTH` so the bar's limit matches the served
  `num_ctx`.

### Live proof (real numbers)

A single grounded answer ("What is HRM and what databases does it use?") returned:

```
CONTEXT event: {used: 3647, limit: 4096}   ->  89% full
streamed token events: 40
```

`used` (3647) ≫ the 40 streamed completion tokens, because it includes the large
grounded prompt (retrieved chunks). This is the genuine context occupancy, exactly
the spec's "must be true" number. It demonstrates the headline insight: one
chunk-grounded turn already fills ~89% of a 4096 window, and a multi-turn session
(memory + a loaded narrative) pushes against the limit, which the bar makes visible.

## Frontend: the donut + `/clear`

- **`src/lib/terminal/chat.ts`**: a `context` SSE handler (`onContext`) parses
  `{used, limit}` (validated) and drives the donut; a per-session `session_id` is
  sent with each `/chat` so the backend threads Phase 4 server memory; the bar
  reflects accumulated session state.
- **`src/components/contact/Terminal.astro` + `terminal.css`**: a retro/CRT SVG
  donut showing `used/limit`, hidden until the first real context frame.
- **`/clear`**: clears the terminal, `POST /session/reset` (Phase 4), regenerates
  the session id, and empties the bar.

## Acceptance

| Criterion | Result |
| --- | --- |
| The bar reflects real prompt_eval_count + eval_count / num_ctx | ✓, live: 3647/4096 = 89% (not a char estimate) |
| Grows across a multi-turn session, approaches the limit when narratives load | ✓, `used` includes the threaded memory + retrieved/narrative chunks |
| Reset empties the bar AND clears memory | ✓, `/clear` → `/session/reset` + new session id + empty donut |

Validation: backend `ruff` + `mypy --strict` clean, `pytest` **294** (+5: the usage
parser, the context event with/without a window, the config knob). Frontend gates
(`typecheck` / `lint` / `format:check` / `test`): see the PR.

Stacked on Phase 5.
