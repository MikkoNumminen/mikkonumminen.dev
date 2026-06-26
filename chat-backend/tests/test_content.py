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


def test_blank_project_value_falls_back_to_stem(tmp_path: Path) -> None:
    # A present-but-blank `project:` line must normalize like an absent one so
    # the filename-stem default fires (not an empty string in the project field).
    _write(tmp_path / "projects" / "hrm.md", "---\nproject: \n---\n# HRM\n\nbody")
    doc = load_doc(tmp_path / "projects" / "hrm.md", tmp_path)
    assert doc.project == "hrm"


def test_front_matter_without_trailing_newline_parses() -> None:
    # A file that is only front matter, with no final newline, still parses
    # (regex closes on `\n` OR end-of-file) rather than silently dropping fields.
    raw = "---\ntitle: Hi\nurl: https://e.com\n---"
    fields, body = parse_front_matter(raw)
    assert fields == {"title": "Hi", "url": "https://e.com"}
    assert body == ""


# --- source/config ingestion (Workstream B) ---


def test_load_docs_ingests_code_with_language_and_project(tmp_path: Path) -> None:
    from app.content import is_code_doc

    (tmp_path / "projects").mkdir()
    (tmp_path / "projects" / "hrm.md").write_text(
        "---\ntitle: HRM\nproject: hrm\n---\n# HRM\n\nbody", encoding="utf-8"
    )
    (tmp_path / "code" / "audiobookmaker").mkdir(parents=True)
    (tmp_path / "code" / "audiobookmaker" / "norm.py").write_text(
        "def f():\n    return 1\n", encoding="utf-8"
    )
    docs = {d.source: d for d in load_docs(tmp_path)}

    md = docs["projects/hrm.md"]
    assert md.language is None and md.kind == "project" and not is_code_doc(md)

    py = docs["code/audiobookmaker/norm.py"]
    assert py.language == "python"
    assert py.kind == "code"
    assert py.project == "audiobookmaker"
    assert is_code_doc(py)


def test_load_docs_skips_unknown_extensions_under_code(tmp_path: Path) -> None:
    (tmp_path / "code" / "x").mkdir(parents=True)
    (tmp_path / "code" / "x" / "data.bin").write_text("x", encoding="utf-8")
    (tmp_path / "code" / "x" / "app.ts").write_text(
        "export const a = 1;\n", encoding="utf-8"
    )
    sources = {d.source for d in load_docs(tmp_path)}
    assert "code/x/app.ts" in sources
    assert "code/x/data.bin" not in sources


def test_config_files_are_kind_config(tmp_path: Path) -> None:
    (tmp_path / "code" / "p").mkdir(parents=True)
    (tmp_path / "code" / "p" / "tsconfig.json").write_text("{}\n", encoding="utf-8")
    docs = {d.source: d for d in load_docs(tmp_path)}
    cfg = docs["code/p/tsconfig.json"]
    assert cfg.kind == "config"
    assert cfg.language == "json"
