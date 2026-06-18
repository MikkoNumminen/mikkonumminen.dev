"""In-process text embeddings via fastembed (bge-small-en-v1.5).

The SAME model and code path embed both the corpus (offline indexer) and the
query (online API), so the vector space is identical in dev and prod. This is
the load-bearing invariant of the whole RAG system: embed passages with one
model and queries with another and cosine similarity becomes meaningless.

bge-small-en-v1.5 detail that matters for recall: the model was trained with an
asymmetric retrieval instruction — the *query* is prefixed with a short
instruction, the *passage* is not. `embed_passages` therefore applies no prefix
and `embed_query` applies `QUERY_INSTRUCTION`. fastembed normalizes outputs, so
cosine distance (`<=>`) over the stored vectors is well-defined.

This module imports fastembed at module load and is exercised against the real
model, not in the fast unit suite.
"""

from __future__ import annotations

from collections.abc import Sequence
from functools import lru_cache

from fastembed import TextEmbedding

# Recommended retrieval instruction for bge-small-en-v1.5. Applied to queries
# only (passages are embedded bare) to match how the model was trained.
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


class Embedder:
    """Loads the embedding model once and embeds passages / queries.

    Model load is lazy and cached per `model_name` so the heavy initialization
    (downloading + memory-mapping the ONNX weights) happens once per process.
    """

    def __init__(self, model_name: str, dim: int) -> None:
        self._model_name = model_name
        self._dim = dim
        self._model = _load_model(model_name)

    @property
    def dim(self) -> int:
        return self._dim

    def embed_passages(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed corpus chunks (no query instruction)."""
        # `.tolist()` is untyped (fastembed ships no stubs); annotate so the
        # return is `list[list[float]]` rather than leaking `Any`.
        vectors: list[list[float]] = [
            vec.tolist() for vec in self._model.embed(list(texts))
        ]
        self._check_dims(vectors)
        return vectors

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query (with the bge query instruction)."""
        prefixed = f"{QUERY_INSTRUCTION}{text}"
        vector: list[float] = next(iter(self._model.embed([prefixed]))).tolist()
        self._check_dims([vector])
        return vector

    def _check_dims(self, vectors: list[list[float]]) -> None:
        for vec in vectors:
            if len(vec) != self._dim:
                raise ValueError(
                    f"embedding model {self._model_name!r} emitted dimension "
                    f"{len(vec)}, but configured EMBEDDING_DIM is {self._dim}. "
                    "These must match the DB's vector(N) column."
                )


@lru_cache(maxsize=2)
def _load_model(model_name: str) -> TextEmbedding:
    return TextEmbedding(model_name=model_name)
