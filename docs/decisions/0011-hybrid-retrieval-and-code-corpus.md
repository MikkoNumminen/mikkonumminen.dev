# ADR 0011 · Hybrid retrieval over a code-enriched corpus for the RAG chat

**Status:** accepted
**Date:** 2026-06-26
**Decided by:** repo owner

## Context

[ADR 0009](0009-rag-chat-backend.md) shipped the contact-page chat as a local
RAG backend ([`chat-backend/`](../../chat-backend/)); [ADR 0010](0010-rag-containment.md)
contained the model so it stays in scope. Both left a quality gap open, tracked
there as "Workstream B (roadmap, not built)."

The corpus was README-level prose only: `content/**/*.md`, project descriptions,
CV, posts. That answers "what is Spacepotatis built with?" well, but it has
nothing to say about _how_ a thing is built. Deep technical questions ("how does
the audio crossfade work?", "what does the retrieval gate key on?") have no
grounded answer because the implementing source was never indexed. The chat could
only ever paraphrase the marketing-level summary.

Two structural limits drove the gap:

- **The corpus described the code instead of containing it.** Prose about a
  project can't ground an answer about a specific function, decorator, or query.
- **Dense embeddings miss exact identifiers.** Cosine similarity over
  `bge-small-en-v1.5` is strong on paraphrase but weak on the literal token:
  a query naming `websearch_to_tsquery` or `LLM_NUM_PREDICT` does not reliably
  pull the chunk that contains that exact string, because the embedding smooths
  it away. Retrieval was dense-only with a soft project boost, so an exact-match
  query had no lexical channel to fall back on.

The full pipeline and every config knob are documented in
[`docs/rag-chat.md`](../rag-chat.md); this record captures the decision, not the
reference.

## Decision

Index curated **source code** alongside the prose, retrieve with a **hybrid
dense + lexical** ranker, and restrict each query to its named project. The
parts:

- **Code corpus.** Ingestion now indexes curated source under
  `content/code/<project>/` (`py`, `ts`, `tsx`, `js`, `cs`, `astro`, `sql`,
  `prisma`, plus config) **in addition to** `content/**/*.md`. 55
  architecture-defining source files were curated from the sibling project repos:
the files that actually answer "how is this built", not the whole tree.
- **Code-aware chunking.** Source is split on function/class/method boundaries
  (Python / TypeScript / JavaScript / C#), keeping decorators and attributes with
  their definition, with a line-window fallback for anything the splitter can't
  bound. Prose stays markdown-block chunked as before. Each chunk carries
  `language` and `chunk_type` (`prose` | `code`) metadata.
- **Schema (`sql/002`).** Added `language` and `chunk_type` (default `prose`)
  columns, plus a `GENERATED` `content_tsv` tsvector and a GIN index over it;
  existing rows backfilled.
- **Hybrid retrieval.** Dense pgvector cosine and lexical BM25-style full-text
  (`websearch_to_tsquery` + `ts_rank`) run as two ranked lists, fused with
  **reciprocal rank fusion**: `score = Σ weight / (RRF_K + rank)` across both
  lists. Defaults: `RRF_K` 60, dense and lexical weights 1.0 each. `HYBRID_ENABLED`
  (default true) gates it; false reverts to pure dense.
- **Hard per-project filter.** `PROJECT_FILTER_STRICT` (default true) restricts
  retrieval to a query-named project, but **fails open for the gate**: if the
  named project returns nothing, it falls back so the relevance gate sees the
  true global best rather than an artificially empty result.

This builds directly on [ADR 0010](0010-rag-containment.md)'s containment, and
extends it, because the code corpus changed the threat surface the gate sees:

- **The weak-retrieval gate now anchors on the best _prose_-chunk distance.**
  Code chunks lower off-topic distances (an off-corpus query can graze a stray
  code token), so gating on the closest prose keeps those queries out; the
  closest prose is fetched explicitly (`db.closest_prose`) when the top-k has
  none. `WEAK_RETRIEVAL_DISTANCE` is lowered **0.7 → 0.45** for the denser corpus.
- **Two deterministic pre-retrieval task gates** decline requests that name an
  on-corpus topic but ask for a _task_: `is_generative_request` ("write me a
  poem/story/song/joke…") and `is_translation_request` ("translate <text> to
  <language>"). These are the residual the small model would otherwise perform.

New validated env keys: `HYBRID_ENABLED`, `RRF_K` (60), `RETRIEVAL_DENSE_WEIGHT`
(1.0), `RETRIEVAL_LEXICAL_WEIGHT` (1.0), `PROJECT_FILTER_STRICT` (true);
`WEAK_RETRIEVAL_DISTANCE` is now 0.45. `content/code/` is excluded from
`tsconfig` / `eslint` / `prettier`. It is corpus data, not site code.

## Considered alternatives

### A. Re-embed the prose corpus only (no source code)

Improve answers by re-chunking or re-embedding the existing markdown, without
indexing source. **Rejected**: the deep-technical answers simply aren't in the
prose. No amount of re-embedding adds information the corpus never held; the
implementing source has to be indexed to ground "how is this built" questions.

### B. A bigger / stronger embedding model

Swap `bge-small-en-v1.5` for a larger embedding model to better capture exact
identifiers. **Rejected**: it's the wrong tool for literal-token matching (still
lossy on exact strings), it inflates index and query latency on Mikko's GPU, and
it doesn't add the missing source content. A lexical channel solves exact-match
directly and cheaply; RRF fuses it with the dense channel we already have.

### C. A hosted retrieval / vector service

Move retrieval to a managed search or vector API with built-in hybrid ranking.
**Rejected**. It reintroduces the per-query cost, lock-in, and runtime
third-party dependency that [ADR 0009](0009-rag-chat-backend.md) deliberately
closed. Postgres + pgvector already runs locally; full-text search is native to
it, so hybrid retrieval costs one more query and an RRF merge, not a new vendor.

## Consequences

### Gained

- **Deeper technical answers.** The chat can now answer from the actual
  implementing source (function bodies, decorators, queries) not just the
  README-level summary.
- **Measured retrieval gain.** Retrieval hit-rate improved **+0.059** (dense →
  hybrid) on the `run_eval` question set: the lexical channel recovers the
  exact-identifier queries dense alone missed.
- **Containment held and extended.** The acceptance contract
  ([`evals/acceptance.py`](../../chat-backend/evals/acceptance.py))
  still passes in full: off-topic code-chunk leaks, poem and translate tasks all
  refuse via the prose-anchored gate and the new task gates; the deep-code
  questions now answer from real source.

### Costs

- **Curated third-party source is committed into this repo.** 55 source files
  from sibling project repos now live under `content/code/`. They're excluded
  from `tsconfig` / `eslint` / `prettier` so they don't enter the site's build,
  lint, or format surfaces (they are read-only corpus data), but they are a
  maintenance and provenance surface to keep curated as those projects evolve.
- **A second retrieval channel and a fusion step.** Hybrid adds a full-text
  query, a GIN index, the generated tsvector column, and the RRF merge to the
  request path. Mitigated by keeping every knob (`HYBRID_ENABLED`, `RRF_K`, the
  two weights, `PROJECT_FILTER_STRICT`) a validated env var, so a deployment can
  retune or revert to pure dense from config.
- **The gate threshold moved.** Lowering `WEAK_RETRIEVAL_DISTANCE` to 0.45 was
  required _because_ the code corpus lowered off-topic distances; it trades a
  tighter off-scope boundary against more potential false refusals and, like
  every threshold in [ADR 0010](0010-rag-containment.md), needs revisiting as the
  corpus grows.

### Residual

- **The model's reasoning ceiling is unchanged.** Better retrieval feeds the
  model better context; it does not make `qwen2.5:7b` reason better. It can still
  perform a literal task when on-corpus content is loosely related: the new
  pre-retrieval task gates mitigate the known shapes (poem, translate), but a
  model upgrade is the deeper fix, tracked separately (see
  [ADR 0010](0010-rag-containment.md)'s residual).

### Follow-ups (roadmap, not built)

These remain future work and are **not** implemented by this ADR:

- **Cross-encoder re-ranking** of the fused candidate set.
- **Automatic per-project summary generation** to seed retrieval.
- **Query expansion** before retrieval.
