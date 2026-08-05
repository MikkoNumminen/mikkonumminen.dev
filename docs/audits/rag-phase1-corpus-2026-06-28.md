# RAG chat: Phase 1: narrow corpus expansion (2026-06-28)

Phase 1 of the RAG upgrade, scoped **narrow** per the [Phase 0
diagnosis](rag-phase0-diagnosis-2026-06-28.md): the corpus is already strong
(every project's `-deepdive.md` carries the *why*), so this does **not** do a full
per-project PR/commit scan. It adds the `doc_type`/`doc_date` metadata backbone
the spec requires and fills the one clear corpus gap Phase 0 found: **the repo's
own design rationale (ADRs) was not in the corpus**, so the chat could not
ground "why is it built this way" questions.

## What changed

- **Source-genre metadata** (migration `003_doc_type_metadata.sql`): a `doc_type`
  column (`prose` | `code` | `adr`; later phases add `pr` | `commit` |
  `narrative`) and a nullable `doc_date`. Distinct from `chunk_type` (which the
  weak-retrieval gate anchors on, kept to its two values): an ADR is
  `chunk_type='prose'`, `doc_type='adr'`. Existing rows backfill (`code` rows read
  `code`, the rest stay `prose`); the indexer writes the genre + date per
  (re-)embedded chunk.
- **ADR ingestion** (config-driven, no duplication): `ADR_DIR` points the indexer
  at a directory of ADR/design-note markdown (the compose bind-mounts the repo's
  `docs/decisions`); `NNNN-*.md` files are read in place as `doc_type='adr'` prose,
  titled from the H1, dated from the `**Date:**` line, attributed to
  `ADR_PROJECT` (portfolio), under a namespaced `decisions/<file>` source. A
  README/TEMPLATE in that dir is skipped by the name filter.
- **Eval growth**: 4 ADR-targeted questions added to the golden set (48 → 52),
  each a corpus-miss before and grounded after.

## Result (live, hybrid)

41 ADR chunks indexed (11 ADRs); corpus `doc_type` split adr 41 / code 211 /
prose 194.

| Metric (over the 52-question set) | Before (no ADRs) | After (ADRs indexed) | Δ |
| --- | --- | --- | --- |
| Retrieval hit-rate | 0.556 | **0.667** | **+0.111** |
| Source coverage | 0.750 | **0.861** | +0.111 |
| MRR | 0.554 | **0.640** | +0.086 |

All 4 ADR questions flipped corpus-miss → PASS; the must-retrieve hits went
20/36 → 24/36, i.e. **exactly the 4 ADR questions, zero regression** on the
original 48: the spec's acceptance ("lift the corpus/retrieval-miss questions
without regressing others").

Live confirmation: the chat now grounds design-rationale questions in the ADRs
rather than the stale portfolio summary:

> *Q: Why is the RAG chat a separate local service…?* →
> sources `decisions/0009`, `0010`, `0011`, `0002` + `portfolio-deepdive`;
> answer cites ADR 0002 / static output / portability / no per-request billing.
>
> *Q: Why layered defenses instead of just a system prompt?* →
> sources `decisions/0010` + …; answer: "a determined user can out-argue any
> wording", "no single control is load-bearing", "defense in depth".

## Scope notes

- This is the **narrow** cut: ADRs only (the demonstrated gap), not the full
  per-project PR/commit/changelog scan. The larger lever for deep "how I built X"
  remains **Phase 3** (precomputed per-project narratives), per the Phase 0
  diagnosis.
- `doc_type` is stored but not yet used by retrieval; Phase 3 targets
  `doc_type='narrative'` and the UX may surface `adr`.
- A drive-by fix to a pre-existing `mypy --strict` gap in `usage_payload` (a bare
  `dict` return) is included so the changed code's type-closure stays clean; one
  unrelated pre-existing gap in `pipeline.py` is left for a separate cleanup.
