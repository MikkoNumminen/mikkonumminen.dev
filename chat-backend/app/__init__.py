"""Portfolio RAG chat backend.

A small FastAPI service that answers free-form questions about Mikko's
portfolio from his own curated content via retrieval-augmented generation.

The package is split so the pure, dependency-light logic (config parsing,
chunking, content loading) can be unit-tested without the heavy runtime
dependencies (fastembed, asyncpg, the LLM client). Those heavy modules import
their dependencies at module top level and are exercised against the live
stack, not in the fast unit suite.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
