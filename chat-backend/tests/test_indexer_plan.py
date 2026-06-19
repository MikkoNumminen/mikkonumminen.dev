"""Tests for the indexer's pure planning step (no DB, no embeddings)."""

from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest

from app.chunking import Chunk, hash_chunk
from app.config import Settings
from app.indexer import plan, select_chunks_to_embed


def _chunk(index: int, text: str) -> Chunk:
    return Chunk(index=index, text=text, content_hash=hash_chunk(text))


@pytest.fixture
def settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Settings:
    for name in ("CONTENT_DIR", "CHUNK_MAX_TOKENS", "CHUNK_MIN_TOKENS"):
        monkeypatch.delenv(name, raising=False)
    base = Settings.from_env()
    return dataclasses.replace(base, content_dir=str(tmp_path))


def test_plan_empty_corpus(settings: Settings) -> None:
    assert plan(settings) == []


def test_plan_chunks_each_document(settings: Settings, tmp_path: Path) -> None:
    (tmp_path / "projects").mkdir()
    (tmp_path / "projects" / "hrm.md").write_text(
        "# HRM\n\nA multi-tenant HR platform built with Next.js.",
        encoding="utf-8",
    )
    (tmp_path / "cv.md").write_text("# CV\n\nSummary line.", encoding="utf-8")

    plans = plan(settings)
    sources = {fp.doc.source for fp in plans}
    assert sources == {"projects/hrm.md", "cv.md"}
    # Every document produced at least one chunk, and chunk text is non-empty.
    for fp in plans:
        assert fp.chunks
        assert all(c.text.strip() for c in fp.chunks)


def test_select_chunks_to_embed_all_new_on_empty_db() -> None:
    chunks = [_chunk(0, "alpha"), _chunk(1, "beta")]
    assert select_chunks_to_embed(chunks, {}) == chunks


def test_select_chunks_to_embed_skips_unchanged() -> None:
    chunks = [_chunk(0, "alpha"), _chunk(1, "beta")]
    existing = {0: chunks[0].content_hash, 1: chunks[1].content_hash}
    assert select_chunks_to_embed(chunks, existing) == []


def test_select_chunks_to_embed_picks_changed_and_new_indices() -> None:
    chunks = [_chunk(0, "alpha"), _chunk(1, "beta-v2"), _chunk(2, "gamma-new")]
    # index 0 unchanged; index 1 hash differs from stored; index 2 absent.
    existing = {0: chunks[0].content_hash, 1: hash_chunk("beta-v1")}
    assert [c.index for c in select_chunks_to_embed(chunks, existing)] == [1, 2]


def test_select_chunks_to_embed_keeps_identical_text_at_distinct_indices() -> None:
    # Two chunks with identical text are distinct retrieval units (same hash,
    # different index) — both must embed on a fresh DB. Regression guard for the
    # (source, chunk_index) identity that replaced the old content-hash key.
    chunks = [_chunk(0, "same text"), _chunk(1, "same text")]
    assert select_chunks_to_embed(chunks, {}) == chunks
