"""Tests for the indexer's pure planning step (no DB, no embeddings)."""

from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest

from app.config import Settings
from app.indexer import plan


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
