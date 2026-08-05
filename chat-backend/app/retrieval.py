"""Top-k cosine retrieval over the indexed corpus.

Embeds the query with the SAME in-process model used at index time, then runs a
cosine-distance search in pgvector (the raw SQL lives in `db.search`). The
embedder and database are injected as small Protocols so this orchestration is
unit-tested with fakes — the heavy fastembed/asyncpg modules are imported only
for type-checking.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date
from typing import Any, Protocol

from .prompts import ContextChunk
from .query_projects import (
    detect_projects,
    is_research_coverage_request,
    names_offcorpus_research_topic,
    wants_cv,
)


class SupportsEmbedQuery(Protocol):
    def embed_query(self, text: str) -> list[float]: ...


class SupportsSearch(Protocol):
    async def search(
        self,
        embedding: list[float],
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
        doc_types: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
        kinds: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]: ...

    async def has_narrative(
        self, project: str, classifications: Sequence[str] | None = None
    ) -> bool: ...

    async def search_lexical(
        self,
        query: str,
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]: ...

    async def closest_prose(
        self,
        embedding: list[float],
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
    ) -> Mapping[str, Any] | None: ...

    async def recent_research(
        self,
        embedding: list[float],
        top_k: int,
        classifications: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]: ...


@dataclass(frozen=True)
class RetrievedChunk:
    """One retrieved chunk plus its cosine distance (smaller = more similar).

    `distance` is always the DENSE cosine distance — that is what the
    weak-retrieval gate keys on, so hybrid fusion must never overwrite it. A
    chunk surfaced by the lexical search but absent from the dense candidates
    carries `_LEXICAL_ONLY_DISTANCE` (the cosine maximum) so it can be ranked
    without ever, on its own, making the dense-based gate judge the query
    relevant. `chunk_index` is the fusion identity (a source has many chunks).
    `chunk_type` ('prose' | 'code') lets the weak-retrieval gate anchor on prose
    distances — a stray nearby code chunk must not make an off-topic query look
    relevant.
    """

    source: str
    title: str
    project: str | None
    content: str
    distance: float
    chunk_index: int = 0
    chunk_type: str = "prose"
    # GDPR classification of the source (public | internal | restricted). Carried
    # so the pipeline can audit-log what classes a retrieval touched; the
    # role-based gate has already filtered out classes the role can't see in SQL.
    classification: str = "public"
    # The model cannot answer "what is the latest" without a date in context —
    # carried through purely so the rendered prompt can show it; retrieval/ranking
    # never read this field.
    doc_date: date | None = None
    # True when force-injected by the research-coverage layer (not organic
    # retrieval). Only the completeness footer reads it — retrieval/ranking never
    # branch on it, so a coverage chunk fuses/gates exactly like any other.
    is_coverage: bool = False


# When the query names a project, or hybrid fusion is on, pull this many * top_k
# candidates so the right chunks are present to fuse/float up; capped so a large
# top_k can't end up scanning a big slice of the table.
_CANDIDATE_MULTIPLIER = 4
_CANDIDATE_CAP = 50
# pgvector cosine distance is in [0, 2]; a lexical-only chunk gets the maximum so
# it never lowers the gate's "is anything relevant?" minimum on its own.
_LEXICAL_ONLY_DISTANCE = 2.0
# On a CV-intent query, pull this many kind='cv' chunks explicitly. cv.md chunks
# to ~3 at the default CHUNK_MAX_TOKENS, so 3 carries the whole CV (Experience
# included) while leaving the other top_k slots for cosine's own picks.
_CV_BOOST_K = 3


def _to_chunk(row: Mapping[str, Any]) -> RetrievedChunk:
    return RetrievedChunk(
        source=str(row["source"]),
        title=str(row["title"]),
        project=(None if row["project"] is None else str(row["project"])),
        content=str(row["content"]),
        distance=float(row["distance"]),
        chunk_index=int(row["chunk_index"]),
        chunk_type=str(row["chunk_type"]),
        classification=str(row.get("classification", "public")),
        doc_date=row.get("doc_date"),
    )


def _to_lexical_chunk(row: Mapping[str, Any]) -> RetrievedChunk:
    """A lexical-search row as a RetrievedChunk with a sentinel dense distance."""
    return RetrievedChunk(
        source=str(row["source"]),
        title=str(row["title"]),
        project=(None if row["project"] is None else str(row["project"])),
        content=str(row["content"]),
        distance=_LEXICAL_ONLY_DISTANCE,
        chunk_index=int(row["chunk_index"]),
        chunk_type=str(row["chunk_type"]),
        classification=str(row.get("classification", "public")),
        doc_date=row.get("doc_date"),
    )


def _key(chunk: RetrievedChunk) -> tuple[str, int]:
    return (chunk.source, chunk.chunk_index)


def _project_boost(
    chunks: list[RetrievedChunk], wanted: set[str]
) -> list[RetrievedChunk]:
    """Stable-partition the named project's chunks to the front (soft boost).

    Preserves the incoming order within each group, so the most-relevant chunk
    still leads — only the named project's chunks are lifted above the rest.
    """
    matched = [c for c in chunks if c.project in wanted]
    others = [c for c in chunks if c.project not in wanted]
    return matched + others


def _prepend_unique(
    front: list[RetrievedChunk], rest: list[RetrievedChunk]
) -> list[RetrievedChunk]:
    """`front` first, then the chunks of `rest` not already in it (by identity)."""
    seen = {_key(c) for c in front}
    return front + [c for c in rest if _key(c) not in seen]


def _diversify(
    chunks: list[RetrievedChunk], max_per_project: int, top_k: int
) -> list[RetrievedChunk]:
    """Walk rank-ordered chunks, keeping at most max_per_project per group.

    The group key is chunk.project when set, else chunk.source (unprojectted
    chunks each form their own singleton group). Preserves rank order within the
    budget; stops once top_k chunks are selected. Applied when no single project
    owns the query (nothing detected, or several detected) so the projects spread
    across the returned top_k instead of one monopolising every slot.
    """
    counts: dict[str, int] = {}
    result: list[RetrievedChunk] = []
    for chunk in chunks:
        if len(result) >= top_k:
            break
        key = chunk.project if chunk.project is not None else chunk.source
        if counts.get(key, 0) < max_per_project:
            result.append(chunk)
            counts[key] = counts.get(key, 0) + 1
    return result


def _rrf_fuse(
    dense: list[RetrievedChunk],
    lexical_rows: Sequence[Mapping[str, Any]],
    *,
    rrf_k: int,
    dense_weight: float,
    lexical_weight: float,
) -> list[RetrievedChunk]:
    """Fuse the dense and lexical rankings with reciprocal rank fusion.

    RRF scores each chunk by Σ weight_list / (rrf_k + rank_in_list), summed over
    the lists it appears in (rank starting at 1). It needs only the ORDER of each
    list, not comparable raw scores — which is why it combines cosine distance and
    ts_rank cleanly. Ties break toward the smaller dense distance, so a chunk
    strong in both beats a lexical-only one. Dense chunks keep their real
    distance; lexical-only chunks carry the sentinel (see RetrievedChunk).
    """
    scores: dict[tuple[str, int], float] = {}
    chunks: dict[tuple[str, int], RetrievedChunk] = {}

    for rank, chunk in enumerate(dense, start=1):
        k = _key(chunk)
        scores[k] = scores.get(k, 0.0) + dense_weight / (rrf_k + rank)
        chunks[k] = chunk
    for rank, row in enumerate(lexical_rows, start=1):
        chunk = _to_lexical_chunk(row)
        k = _key(chunk)
        scores[k] = scores.get(k, 0.0) + lexical_weight / (rrf_k + rank)
        chunks.setdefault(k, chunk)  # keep the dense copy (real distance) if present

    return sorted(
        chunks.values(),
        key=lambda c: (-scores[_key(c)], c.distance),
    )


def _ensure_gate_anchor(
    result: list[RetrievedChunk], dense: list[RetrievedChunk], top_k: int
) -> list[RetrievedChunk]:
    """Guarantee the single closest dense chunk is in the returned top_k.

    The weak-retrieval gate refuses when the BEST dense distance in the returned
    chunks exceeds the threshold. Fusion could, in principle, rank that closest
    chunk just out of the top_k; prepending it (and re-truncating) keeps the gate
    anchored on the true closest distance so a relevant query is never refused
    for a fusion-ordering accident. A no-op in the overwhelmingly common case
    where the closest chunk already ranks highly.
    """
    if not dense:
        return result
    best = min(dense, key=lambda c: c.distance)
    if any(_key(c) == _key(best) for c in result):
        return result
    return ([best] + result)[:top_k]


async def _with_prose_anchor(
    result: list[RetrievedChunk],
    db: SupportsSearch,
    vector: list[float],
    allowed_classifications: Sequence[str] | None = None,
    exclude_doc_types: Sequence[str] | None = None,
) -> list[RetrievedChunk]:
    """Give the prose-anchored weak-retrieval gate a prose distance to judge.

    Off-topic queries ("translate hello to spanish", "what time is it in New
    York") can retrieve ONLY code chunks — coincidental token overlap with the
    source — leaving no prose in the result for the gate to key on, so a near code
    chunk would falsely pass. When the result has no prose, append the corpus's
    closest prose chunk: far prose ⇒ the gate refuses (off-topic), near prose ⇒
    a real description grounds a legitimate deep-code answer. No-op when the result
    already holds prose, or when the corpus has no prose at all (code-only works).

    INTENTIONAL: the appended chunk is more than a gate probe — when the gate
    passes (near prose ≤ threshold, genuinely relevant) it stays in the returned
    list and so feeds the answer's context and `sources` (a +1 source on an
    all-code top-k). That extra grounding — the project's own description
    alongside its code — is desirable, so it is deliberately NOT stripped before
    the answer.
    """
    # Empty retrieval already refuses (is_weak_retrieval([]) is True), and prose
    # already in the result means the gate has its signal — neither needs a fetch.
    if not result or any(c.chunk_type == "prose" for c in result):
        return result
    prose_row = await db.closest_prose(
        vector,
        classifications=allowed_classifications,
        exclude_doc_types=exclude_doc_types,
    )
    if prose_row is None:
        return result
    return result + [_to_chunk(prose_row)]


async def retrieve(
    embedder: SupportsEmbedQuery,
    db: SupportsSearch,
    query: str,
    top_k: int,
    *,
    hybrid: bool = False,
    rrf_k: int = 60,
    dense_weight: float = 1.0,
    lexical_weight: float = 1.0,
    project_filter_strict: bool = False,
    allowed_classifications: Sequence[str] | None = None,
    exclude_doc_types: Sequence[str] | None = None,
    diversify_max_per_project: int | None = None,
    intent_query: str | None = None,
    research_coverage_top_n: int = 0,
) -> list[RetrievedChunk]:
    """Embed `query` and return its `top_k` most relevant corpus chunks.

    Dense cosine search is always run (its closest distance anchors the
    weak-retrieval gate). With `hybrid`, a lexical (BM25-style) search is run too
    and the two rankings are fused with RRF, so exact identifiers the embeddings
    blur are still surfaced. When the query NAMES a project: `project_filter_strict`
    HARD-restricts both searches to those projects; otherwise the named project's
    chunks are soft-boosted to the front (the cross-project contamination fix).
    With `hybrid=False` and no project named this is byte-for-byte a plain `top_k`
    cosine search — the feature is fully reversible from config.

    `exclude_doc_types` hides specific genres (e.g. 'adr') from every search path
    including the prose anchor, so self-documentation doesn't crowd out project
    chunks. `diversify_max_per_project` caps how many chunks any single project
    contributes when no single project owns the query — either nothing was
    detected, or a language/ecosystem term implicated several at once. A query
    naming exactly ONE project is never diversified, so it can still surface all
    of that project's relevant chunks. A CV-intent query ("mitä työkokemusta?",
    "what's your work experience?") pulls the kind='cv' chunks explicitly and prepends
    them to the returned top_k — see the comment at the fetch.
    """
    # embed_query is synchronous ONNX inference — CPU-bound for tens to hundreds
    # of milliseconds. Run on the loop it would stall every concurrent SSE
    # stream, /health probe and rate-limiter tick on this single-process server,
    # so it goes to a worker thread. Concurrent calls on the shared model are
    # serialised inside Embedder (embeddings._INFERENCE_LOCK).
    vector = await asyncio.to_thread(embedder.embed_query, query)
    # Intent detection (project aliases, CV route) scans the retrieval text AND
    # the caller's original question when they differ (translate-for-retrieval):
    # the original carries the Finnish inflections the detectors know, the
    # translation carries the English phrases - a hit in either must count.
    intent_text = query if intent_query is None else f"{query}\n{intent_query}"
    wanted = detect_projects(intent_text)
    strict = bool(wanted) and project_filter_strict
    project_filter: list[str] | None = sorted(wanted) if strict else None

    # CV-intent boost: a work-experience question must carry the kind='cv' chunks
    # even when cosine can't surface them (a Finnish query against the English
    # embedder — the measured "projects presented as työkokemus" conflation).
    # Fetched under the same role/genre filters as every other path; prepended to
    # the final top_k below. Real distances, so the weak-retrieval gate can only
    # get a CLOSER prose signal from these, never a new refusal.
    cv_chunks: list[RetrievedChunk] = []
    if wants_cv(intent_text):
        cv_rows = await db.search(
            vector,
            _CV_BOOST_K,
            classifications=allowed_classifications,
            exclude_doc_types=exclude_doc_types,
            kinds=["cv"],
        )
        cv_chunks = [_to_chunk(row) for row in cv_rows]

    # Research/recency coverage: a "latest research"-type question must carry the
    # NEWEST research posts, which pure retrieval buries — every research post is
    # project='portfolio', so the generic diversity cap collapses them to one slot
    # and doc_date carries no ranking weight. Fetched by doc_date (the guaranteed
    # set); real distances, so like the CV boost the gate only ever gets a CLOSER
    # prose signal, never a new refusal, and an off-topic "latest X" (no research
    # marker) never fires. Reversible: research_coverage_top_n=0 disables it.
    coverage_chunks: list[RetrievedChunk] = []
    if research_coverage_top_n > 0 and is_research_coverage_request(intent_text):
        coverage_rows = await db.recent_research(
            vector,
            research_coverage_top_n,
            classifications=allowed_classifications,
        )
        # An off-corpus "latest research on X" is only DANGEROUS once the note
        # asserts "Mikko's most recent research is <post>" — an 8B model then welds
        # a bridge to X (measured live: the Poro post "mentions AI-native
        # development including quantum computing"; it does not). Injection alone
        # was measured harmless — the same query hedged correctly before the note
        # existed — so the posts still go in and the gate anchor is untouched; only
        # the claim stands down. Decided here because this is the only place
        # `intent_text` exists: `build_messages` sees the ORIGINAL query, which on
        # the Finnish path has no English line to read the topic from.
        claimable = not names_offcorpus_research_topic(intent_text)
        coverage_chunks = [
            replace(_to_chunk(row), is_coverage=claimable) for row in coverage_rows
        ]

    # Both guaranteed sets lead the returned top_k: research coverage first (newest
    # by doc_date), then the CV boost. The per-project diversity cap never applies
    # to them (they are prepended AFTER the diversified slice below), which is what
    # un-collapses the portfolio research. They lead "the model may add, never drop"
    # — with one bounded exception shared with the CV boost: if the guaranteed set
    # exactly saturates top_k, the gate anchor below can reclaim a single slot
    # (dropping the lowest-priority guaranteed chunk) so a genuinely-relevant query
    # is never falsely refused. RESEARCH_COVERAGE_TOP_N <= TOP_K (config.validate)
    # confines this to the rare research+CV dual-intent case.
    guaranteed = _prepend_unique(coverage_chunks, cv_chunks)

    # Diversity applies whenever no SINGLE project owns the question: a generic
    # query (nothing detected), or a term that legitimately implicates several
    # projects at once — a language/ecosystem alias like "python" or ".net" maps
    # to every project written in it. Exactly one detected project is never
    # capped: the user asked about that one and deserves its full context.
    #
    # The multi-project arm is not hypothetical. Detection became genuinely
    # multi-target when TECH_ALIASES landed; before this, "which projects are
    # written in Python?" detected audiobookmaker + claude-continue + portfolio,
    # skipped the cap because *something* was detected, and then returned five
    # portfolio chunks — the two Python-first projects got no slot at all
    # (measured on the live stack).
    diversify = diversify_max_per_project is not None and len(wanted) != 1

    widen = hybrid or (bool(wanted) and not strict) or diversify
    candidate_k = min(top_k * _CANDIDATE_MULTIPLIER, _CANDIDATE_CAP) if widen else top_k

    if project_filter is not None:
        dense_rows = await db.search(
            vector,
            candidate_k,
            project_filter,
            classifications=allowed_classifications,
            exclude_doc_types=exclude_doc_types,
        )
        if not dense_rows:
            # Fail open for the gate: the named project has no surfacing chunk, so
            # a hard filter would starve the weak-retrieval gate into a false
            # refusal. Drop strict and re-run unfiltered so the gate sees the true
            # global best distance (any of the named project's chunks that do
            # surface are still soft-boosted below). The classification filter is
            # NOT dropped — failing open on PROJECT must never widen data access.
            strict = False
            project_filter = None
            dense_rows = await db.search(
                vector,
                candidate_k,
                classifications=allowed_classifications,
                exclude_doc_types=exclude_doc_types,
            )
    else:
        dense_rows = await db.search(
            vector,
            candidate_k,
            classifications=allowed_classifications,
            exclude_doc_types=exclude_doc_types,
        )
    dense_chunks = [_to_chunk(row) for row in dense_rows]
    # Gate-anchor pool: when soft-boosting a NAMED project, anchor on that
    # project's closest chunk so the gate isn't starved by the boost — but never
    # force a wrong-project chunk back in, which would undo the cross-project
    # contamination fix. Otherwise anchor on the closest chunk overall.
    anchor_pool = (
        [c for c in dense_chunks if c.project in wanted]
        if (wanted and not strict)
        else dense_chunks
    )

    if not hybrid:
        result = dense_chunks
        if wanted and not strict:
            result = _project_boost(result, wanted)
        # Apply per-project diversity cap on generic queries, plain slice otherwise.
        # Anchor runs AFTER so the gate's closest eligible chunk is guaranteed present.
        # (No-op when that chunk already ranks in.)
        if diversify:
            assert diversify_max_per_project is not None  # narrowed above
            sliced = _diversify(result, diversify_max_per_project, top_k)
        else:
            sliced = result[:top_k]
        if guaranteed:
            sliced = _prepend_unique(guaranteed, sliced)[:top_k]
        anchored = _ensure_gate_anchor(sliced, anchor_pool, top_k)
        return await _with_prose_anchor(
            anchored, db, vector, allowed_classifications, exclude_doc_types
        )

    if project_filter is not None:
        lexical_rows = await db.search_lexical(
            query,
            candidate_k,
            project_filter,
            classifications=allowed_classifications,
            exclude_doc_types=exclude_doc_types,
        )
    else:
        lexical_rows = await db.search_lexical(
            query,
            candidate_k,
            classifications=allowed_classifications,
            exclude_doc_types=exclude_doc_types,
        )

    fused = _rrf_fuse(
        dense_chunks,
        lexical_rows,
        rrf_k=rrf_k,
        dense_weight=dense_weight,
        lexical_weight=lexical_weight,
    )
    if wanted and not strict:
        fused = _project_boost(fused, wanted)
    if diversify:
        assert diversify_max_per_project is not None  # narrowed above
        sliced = _diversify(fused, diversify_max_per_project, top_k)
    else:
        sliced = fused[:top_k]
    if guaranteed:
        sliced = _prepend_unique(guaranteed, sliced)[:top_k]
    result = _ensure_gate_anchor(sliced, anchor_pool, top_k)
    return await _with_prose_anchor(
        result, db, vector, allowed_classifications, exclude_doc_types
    )


async def retrieve_narrative(
    embedder: SupportsEmbedQuery,
    db: SupportsSearch,
    query: str,
    project: str,
    top_k: int,
    *,
    allowed_classifications: Sequence[str] | None = None,
) -> list[RetrievedChunk]:
    """Retrieve the precomputed development NARRATIVE for one project, ranked by
    relevance to `query`.

    The progressive-disclosure expansion (Phase 5) reads this single git-grounded
    document, so the deeper answer is factual rather than the small model padding a
    longer version on the fly. Hard-filtered to `doc_type='narrative'` and the named
    project; the role/classification filter still applies.
    """
    # Off-loop for the same reason as retrieve() above: sync ONNX inference on
    # the event loop stalls every concurrent request.
    vector = await asyncio.to_thread(embedder.embed_query, query)
    rows = await db.search(
        vector,
        top_k,
        [project],
        classifications=allowed_classifications,
        doc_types=["narrative"],
    )
    return [_to_chunk(row) for row in rows]


def to_context(chunks: Sequence[RetrievedChunk]) -> list[ContextChunk]:
    """Adapt retrieved chunks into the prompt's context shape."""
    return [
        ContextChunk(
            source=c.source,
            title=c.title,
            content=c.content,
            project=c.project,
            doc_date=c.doc_date,
            is_coverage=c.is_coverage,
        )
        for c in chunks
    ]


def to_source_refs(chunks: Sequence[RetrievedChunk]) -> list[dict[str, Any]]:
    """Deduped, order-preserving source references for the `sources` SSE event."""
    seen: set[str] = set()
    refs: list[dict[str, Any]] = []
    for c in chunks:
        if c.source in seen:
            continue
        seen.add(c.source)
        refs.append({"source": c.source, "title": c.title, "project": c.project})
    return refs
