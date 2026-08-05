"""The eval harnesses must retrieve the way production does.

They did not. `pipeline.chat_event_stream` passed eleven arguments to
`retrieve()`; the golden-set eval passed eight, the experiment arm passed eight,
and the unnamed-project probe passed ten, each a hand-copy that had drifted. The
published hit-rate and MRR were therefore measured against a configuration the
live system never runs.

The test that matters here is the last one: it compares the shared helper's
argument set against the production call site by reading the source, so adding an
argument to `pipeline.py` and forgetting the harnesses fails here rather than
silently changing what "measured" means.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path

from evals import production_retrieval

APP = Path(__file__).resolve().parent.parent / "app"


def _kwargs_of_retrieve_call(source: str) -> set[str]:
    """Keyword names passed to any `retrieve(...)` call in `source`."""
    found: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func
        name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
        if name != "retrieve":
            continue
        found |= {kw.arg for kw in node.keywords if kw.arg}
    return found


def test_helper_exists_and_is_the_only_retrieve_call_in_evals() -> None:
    evals_dir = Path(production_retrieval.__file__).resolve().parent
    callers = [
        path.name
        for path in evals_dir.rglob("*.py")
        if path.name != "production_retrieval.py"
        and "await retrieve(" in path.read_text(encoding="utf-8")
    ]
    assert callers == [], (
        f"these harnesses still call retrieve() directly: {callers}. "
        "Every one of them is a copy that will drift from production."
    )


def test_helper_passes_every_kwarg_the_pipeline_passes() -> None:
    """The regression this whole module exists for.

    Compares the helper's `retrieve(...)` keywords against the pipeline's. A new
    retrieval argument added to production and not here means the next
    measurement silently describes a different system.
    """
    pipeline_kwargs = _kwargs_of_retrieve_call(
        (APP / "pipeline.py").read_text(encoding="utf-8")
    )
    helper_kwargs = _kwargs_of_retrieve_call(inspect.getsource(production_retrieval))

    missing = pipeline_kwargs - helper_kwargs
    assert not missing, (
        f"pipeline.py passes {sorted(missing)} to retrieve() and the eval helper "
        "does not, so every measurement is against a configuration production "
        "does not run."
    )


def test_the_three_previously_dropped_arguments_are_present() -> None:
    """Named explicitly, so deleting them cannot pass as a refactor.

    Each changed retrieval behaviour enough to be worth building: ADRs hidden
    from visitor retrieval, the per-project chunk cap on generic questions, and
    forced recency coverage.
    """
    helper_kwargs = _kwargs_of_retrieve_call(inspect.getsource(production_retrieval))
    for arg in (
        "exclude_doc_types",
        "diversify_max_per_project",
        "research_coverage_top_n",
    ):
        assert arg in helper_kwargs, f"{arg} dropped again"
