"""rag-experiment: a deterministic, eval-gated harness for single-variable
"should we swap X for Y" experiments in the RAG pipeline (X, Y in
{model, embedder, chunking, reranker}).

AI-free measurement is the core discipline: the ONLY tokens any run may spend are
the synthesis-under-test generations (questions x arms). Everything else — context
discovery (inspect), lock-asserts, retrieval scoring, baseline/variant delta,
VRAM/token measurement, table generation — is deterministic, zero-token Python.

This package knows the RAG pipeline's STRUCTURE, never a specific experiment;
"what we vary" lives in the per-experiment config, not in this code.
"""
