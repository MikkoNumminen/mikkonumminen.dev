"""One retrieval call shaped exactly like production's, for every harness.

WHY THIS EXISTS. `app/pipeline.py` passes eleven arguments to `retrieve()`. The
golden-set eval passed eight, the experiment arm passed eight, and the
unnamed-project probe passed ten, each a hand-copy that drifted from the others.
So the headline hit-rate and MRR, the numbers used to justify retrieval changes
and quoted in published research docs, were measured against a configuration the
live system does not run.

The three omitted arguments are not incidental. `exclude_doc_types` hides ADRs
from visitor retrieval, `diversify_max_per_project` caps how many chunks one
project may take on a generic question, and `research_coverage_top_n` forces the
newest research posts into a recency answer. Each exists because it changed
retrieval behaviour enough to be worth building; measuring without them measures
a system nobody uses.

Every harness calls this. Adding an argument to the production call means adding
it here, once, and every measurement follows. That is the whole point: the rule
of three was met three times over before this existed.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.config import Settings
from app.retrieval import RetrievedChunk, SupportsEmbedQuery, SupportsSearch, retrieve


async def retrieve_as_production(
    embedder: SupportsEmbedQuery,
    db: SupportsSearch,
    question: str,
    settings: Settings,
    *,
    hybrid: bool | None = None,
    top_k: int | None = None,
    diversify_max_per_project: int | None = None,
    allowed_classifications: Sequence[str] | None = None,
    intent_query: str | None = None,
) -> list[RetrievedChunk]:
    """Retrieve the way `pipeline.chat_event_stream` does.

    Overrides exist only for the axes a harness legitimately varies: an
    experiment arm toggles `hybrid`, the unnamed-project probe sweeps the
    diversity cap, and a role-filter test supplies classifications. Everything
    else comes from `settings`, so an arm that does not name an axis is running
    production's configuration rather than an accidental subset of it.
    """
    return await retrieve(
        embedder,
        db,
        question,
        settings.retrieval_top_k if top_k is None else top_k,
        hybrid=settings.hybrid_enabled if hybrid is None else hybrid,
        rrf_k=settings.rrf_k,
        dense_weight=settings.retrieval_dense_weight,
        lexical_weight=settings.retrieval_lexical_weight,
        project_filter_strict=settings.project_filter_strict,
        allowed_classifications=allowed_classifications,
        exclude_doc_types=settings.retrieval_exclude_doc_types or None,
        diversify_max_per_project=(
            settings.retrieval_diversity_max_per_project
            if diversify_max_per_project is None
            else diversify_max_per_project
        ),
        intent_query=intent_query,
        research_coverage_top_n=settings.research_coverage_top_n,
    )
