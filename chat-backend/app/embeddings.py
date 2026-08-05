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

import threading
from collections.abc import Sequence
from functools import lru_cache

from fastembed import TextEmbedding

# Recommended retrieval instruction for bge-small-en-v1.5. Applied to queries
# only (passages are embedded bare) to match how the model was trained.
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

# Serialises inference across threads. retrieval runs embed_query via
# asyncio.to_thread (ONNX inference must not block the event loop), so two
# concurrent requests would otherwise call TextEmbedding.embed on the same
# session from two threads at once — fastembed documents no thread-safety
# guarantee for that, so none is assumed. Module-level rather than per-Embedder
# because _load_model is lru_cached: two Embedder instances can share one
# underlying model. The serialisation costs nothing in practice — before the
# to_thread move, inference was already serialised by blocking the loop.
_INFERENCE_LOCK = threading.Lock()


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
        with _INFERENCE_LOCK:
            vectors: list[list[float]] = [
                vec.tolist() for vec in self._model.embed(list(texts))
            ]
        self._check_dims(vectors)
        return vectors

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query (with the bge query instruction)."""
        prefixed = f"{QUERY_INSTRUCTION}{text}"
        with _INFERENCE_LOCK:
            vector: list[float] = next(iter(self._model.embed([prefixed]))).tolist()
        self._check_dims([vector])
        return vector

    def token_count(self, text: str) -> int:
        """Real tokens the model will see, with truncation temporarily OFF.

        Truncation must be disabled or this is useless: the tokenizer stops at
        the model's max length, so every over-long text reports exactly that
        number and an over-length check can never fire. Measuring the corpus with
        it left on reported zero chunks over the limit; with it off, 170 of 211.

        It must also be put BACK. `_load_model` is lru_cached, so this tokenizer
        is the same object the embedding path uses, and `no_truncation()` mutates
        it in place. Leaving it off fed a 598-token sequence into a model built
        for 512 and the ONNX runtime failed mid-index with a broadcast error.
        Counting tokens must not change how anything is embedded.

        Held under the inference lock so a concurrent embed cannot observe the
        window where truncation is off.
        """
        inner = getattr(self._model, "model", None)
        tokenizer = (
            getattr(inner, "tokenizer", None)
            or getattr(self._model, "tokenizer", None)
            or getattr(self._model, "_tokenizer", None)
        )
        if tokenizer is None:  # pragma: no cover - depends on fastembed internals
            raise RuntimeError(
                "embedding model exposes no tokenizer; cannot enforce the token "
                "ceiling. Refusing to guess: a wrong count here silently drops "
                "corpus text."
            )
        with _INFERENCE_LOCK:
            previous = tokenizer.truncation
            tokenizer.no_truncation()
            try:
                return len(tokenizer.encode(text).ids)
            finally:
                if previous:
                    tokenizer.enable_truncation(**previous)

    def _check_dims(self, vectors: list[list[float]]) -> None:
        for vec in vectors:
            if len(vec) != self._dim:
                raise ValueError(
                    f"embedding model {self._model_name!r} emitted dimension "
                    f"{len(vec)}, but configured EMBEDDING_DIM is {self._dim}. "
                    "These must match the DB's vector(N) column."
                )


# The model's own sequence limit. Not a tunable: bge-small-en-v1.5 truncates
# SILENTLY past this, so a chunk over it loses its tail with no error. Lives
# here rather than in Settings because it is a fact about the model, and a
# knob would invite someone to raise it and lose data quietly.
MAX_SEQUENCE_TOKENS = 512


@lru_cache(maxsize=2)
def _load_model(model_name: str) -> TextEmbedding:
    return TextEmbedding(model_name=model_name)
