"""Environment-driven configuration for the whole backend.

One frozen `Settings` object describes everything the indexer and the API need:
the database, the embedding model, the chunker, and the generation LLM. It is
read once from the environment at process start so the indexer and the query
path share an identical view of the world (same embedding model, same vector
dimension) — the single most important invariant for a RAG system, because a
mismatch silently returns garbage rather than failing loudly.

This module is intentionally dependency-light (stdlib only) so it can be
imported and unit-tested without pulling in fastembed / asyncpg / the LLM
client.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Defaults target the local Docker stack (service hostnames `db` / `ollama`).
# Running the indexer or tests on the host without overrides falls back to
# localhost so a developer poking at it outside compose still connects.
_DEFAULT_DATABASE_URL = "postgresql://rag:rag@localhost:5432/rag"
_DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
_DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1"
_DEFAULT_LLM_MODEL = "gemma4:e4b"


def _get_str(name: str, default: str) -> str:
    value = os.environ.get(name)
    # Treat an empty string the same as unset — an env file with `FOO=` should
    # not blank out a meaningful default and produce a baffling downstream error.
    return value if value else default


def _get_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(
            f"environment variable {name!r} must be an integer, got {raw!r}"
        ) from exc


@dataclass(frozen=True)
class Settings:
    """Resolved runtime configuration. Construct via `Settings.from_env()`."""

    # --- storage / retrieval ---
    database_url: str
    content_dir: str
    embedding_model: str
    embedding_dim: int

    # --- chunker (token counts are estimates; see chunking.estimate_tokens) ---
    chunk_max_tokens: int
    chunk_min_tokens: int
    chunk_overlap_tokens: int

    # --- generation (used by the Phase 2 query path; declared here so the whole
    # service reads a single config object) ---
    ollama_base_url: str
    llm_model: str
    llm_timeout_seconds: int

    @staticmethod
    def from_env() -> Settings:
        settings = Settings(
            database_url=_get_str("DATABASE_URL", _DEFAULT_DATABASE_URL),
            content_dir=_get_str("CONTENT_DIR", "content"),
            embedding_model=_get_str("EMBEDDING_MODEL", _DEFAULT_EMBEDDING_MODEL),
            embedding_dim=_get_int("EMBEDDING_DIM", 384),
            chunk_max_tokens=_get_int("CHUNK_MAX_TOKENS", 480),
            chunk_min_tokens=_get_int("CHUNK_MIN_TOKENS", 100),
            chunk_overlap_tokens=_get_int("CHUNK_OVERLAP_TOKENS", 60),
            ollama_base_url=_get_str("OLLAMA_BASE_URL", _DEFAULT_OLLAMA_BASE_URL),
            llm_model=_get_str("LLM_MODEL", _DEFAULT_LLM_MODEL),
            llm_timeout_seconds=_get_int("LLM_TIMEOUT_SECONDS", 60),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        """Fail fast on a configuration that can only misbehave at runtime."""
        if self.embedding_dim <= 0:
            raise ValueError(f"EMBEDDING_DIM must be positive, got {self.embedding_dim}")
        if self.chunk_max_tokens <= 0:
            raise ValueError(
                f"CHUNK_MAX_TOKENS must be positive, got {self.chunk_max_tokens}"
            )
        if self.chunk_min_tokens < 0:
            raise ValueError(
                f"CHUNK_MIN_TOKENS must be non-negative, got {self.chunk_min_tokens}"
            )
        if self.chunk_min_tokens >= self.chunk_max_tokens:
            raise ValueError(
                "CHUNK_MIN_TOKENS must be smaller than CHUNK_MAX_TOKENS "
                f"({self.chunk_min_tokens} >= {self.chunk_max_tokens})"
            )
        if not 0 <= self.chunk_overlap_tokens < self.chunk_max_tokens:
            raise ValueError(
                "CHUNK_OVERLAP_TOKENS must be in [0, CHUNK_MAX_TOKENS) "
                f"({self.chunk_overlap_tokens} not in [0, {self.chunk_max_tokens}))"
            )
        if self.llm_timeout_seconds <= 0:
            raise ValueError(
                f"LLM_TIMEOUT_SECONDS must be positive, got {self.llm_timeout_seconds}"
            )
