"""Tests for front-matter parsing and content-corpus loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.content import load_doc, load_docs, parse_front_matter


def test_parse_front_matter_basic() -> None:
    raw = "---\ntitle: Hello\nproject: hrm\n---\n# Body\n\ntext"
    fields, body = parse_front_matter(raw)
    assert fields == {"title": "Hello", "project": "hrm"}
    assert body.startswith("# Body")


def test_parse_front_matter_ignores_blank_and_comment_lines() -> None:
    raw = "---\n# a comment\n\ntitle: Hi\n---\nbody"
    fields, body = parse_front_matter(raw)
    assert fields == {"title": "Hi"}
    assert body == "body"


def test_parse_front_matter_absent() -> None:
    raw = "# Just a heading\n\nno front matter here"
    fields, body = parse_front_matter(raw)
    assert fields == {}
    assert body == raw


def test_parse_front_matter_value_with_colon() -> None:
    # A URL value contains a colon; only the first one splits key/value.
    raw = "---\nurl: https://example.com/x\n---\nbody"
    fields, _ = parse_front_matter(raw)
    assert fields["url"] == "https://example.com/x"


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_load_doc_infers_kind_and_project_from_path(tmp_path: Path) -> None:
    _write(tmp_path / "projects" / "hrm.md", "# HRM\n\nAbout HRM.")
    doc = load_doc(tmp_path / "projects" / "hrm.md", tmp_path)
    assert doc.source == "projects/hrm.md"
    assert doc.kind == "project"
    assert doc.project == "hrm"  # defaulted from the filename stem
    assert doc.title == "HRM"  # from the first H1


def test_load_doc_front_matter_wins_over_inference(tmp_path: Path) -> None:
    _write(
        tmp_path / "posts" / "x.md",
        "---\ntitle: Custom Title\nproject: platform\nurl: https://e.com\n---\nbody",
    )
    doc = load_doc(tmp_path / "posts" / "x.md", tmp_path)
    assert doc.title == "Custom Title"
    assert doc.project == "platform"
    assert doc.kind == "post"
    assert doc.url == "https://e.com"


def test_load_doc_cv_kind(tmp_path: Path) -> None:
    _write(tmp_path / "cv.md", "# Mikko\n\nSummary.")
    doc = load_doc(tmp_path / "cv.md", tmp_path)
    assert doc.kind == "cv"
    assert doc.project is None  # non-project kinds don't default a project id


def test_load_doc_unknown_kind_raises(tmp_path: Path) -> None:
    _write(tmp_path / "x.md", "---\nkind: nonsense\n---\nbody")
    with pytest.raises(ValueError, match="unknown kind"):
        load_doc(tmp_path / "x.md", tmp_path)


def test_load_docs_sorted_and_recursive(tmp_path: Path) -> None:
    _write(tmp_path / "projects" / "b.md", "# B\n\nb")
    _write(tmp_path / "projects" / "a.md", "# A\n\na")
    _write(tmp_path / "cv.md", "# CV\n\ncv")
    docs = load_docs(tmp_path)
    assert [d.source for d in docs] == ["cv.md", "projects/a.md", "projects/b.md"]


def test_load_docs_missing_dir_is_empty(tmp_path: Path) -> None:
    assert load_docs(tmp_path / "does-not-exist") == []
