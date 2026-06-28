"""Load the curated `content/` corpus into typed documents.

The corpus is a version-controlled folder of markdown — one file per project,
`cv.md`, and a couple of posts — each with a small front-matter header. This
module discovers those files and parses them into `ContentDoc`s the indexer can
chunk and embed.

Front-matter contract (a minimal `key: value` block, so we don't pull in a YAML
dependency just for five scalar fields):

    ---
    title: HRM — multi-tenant HR platform
    project: hrm          # optional; the project id this doc is about
    kind: project         # project | cv | post (optional; inferred from path)
    url: https://...      # optional canonical/external link
    ---
    <markdown body>

`source` is not declared in front-matter — it is derived from the file's path
relative to the content directory (e.g. `projects/hrm.md`) so it always matches
where the file actually lives and can't drift.

Stdlib-only and pure (modulo reading files), so it is unit-tested directly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

# The closing `---` may be followed by a newline or end-of-file, so a file that
# is nothing but front matter (no trailing newline) still parses rather than
# silently losing every field.
_FRONT_MATTER_RE = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*(?:\n|\Z)", re.DOTALL)
_H1_RE = re.compile(r"^#[ \t]+(.+?)[ \t]*$", re.MULTILINE)

_KNOWN_KINDS = {"project", "cv", "post"}

# Source/config files (under content/code/<project>/) the indexer ingests
# alongside markdown, so the corpus carries real technical substance, not just
# README-level prose. Extension -> language; the config formats are tagged
# kind='config', the rest kind='code'.
_LANG_BY_EXT = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".cs": "csharp",
    ".astro": "astro",
    ".sql": "sql",
    ".prisma": "prisma",
    ".json": "json",
    ".toml": "toml",
    ".yml": "yaml",
    ".yaml": "yaml",
}
_CONFIG_LANGS = {"json", "toml", "yaml"}
# Skip a source file larger than this (bytes): a single huge or generated file
# would explode into noise chunks and isn't the technical substance we want.
_MAX_CODE_FILE_BYTES = 100_000
# Subtree under the content dir holding source/config (everything else is prose).
_CODE_SUBDIR = "code"

# ADR ingestion (Phase 1). Only files named like an ADR (`0009-foo.md`) are taken
# from the configured ADR dir, so a README.md / TEMPLATE.md alongside them is
# skipped. The title is the H1; the date is the `**Date:** YYYY-MM-DD` line ADRs
# carry in their header.
_ADR_NAME_RE = re.compile(r"^\d{4}-.*\.md$")
_ADR_DATE_RE = re.compile(r"^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})", re.MULTILINE)
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parse_iso_date(value: str | None) -> date | None:
    """Parse a `YYYY-MM-DD` string to a `date`, or None if absent/malformed."""
    if not value or not _ISO_DATE_RE.match(value.strip()):
        return None
    return date.fromisoformat(value.strip())


def is_code_doc(doc: ContentDoc) -> bool:
    """True for source/config docs (chunk_type 'code'), False for markdown prose."""
    return doc.kind in {"code", "config"}


@dataclass(frozen=True)
class ContentDoc:
    """One curated source document, ready to chunk."""

    source: str
    """Path relative to the content dir, POSIX-style (e.g. `projects/hrm.md`)."""
    title: str
    body: str
    kind: str
    project: str | None
    url: str | None
    language: str | None = None
    """Programming/markup language for `kind in {code, config}` docs; None for
    markdown prose. Drives code-aware chunking and the `language` column."""
    doc_type: str = "prose"
    """Source genre for the `doc_type` column: 'prose' | 'code' | 'adr' (Phase 1
    adds 'adr'; later phases add 'pr' | 'commit' | 'narrative'). Distinct from the
    chunk_type the gate anchors on — an ADR is chunk_type='prose', doc_type='adr'."""
    doc_date: date | None = None
    """The source's date where one exists (ADRs carry an explicit Date line); None
    for prose/code without one. Stored in the nullable `doc_date` column."""


def parse_front_matter(raw: str) -> tuple[dict[str, str], str]:
    """Split a `---` front-matter header off the front of `raw`.

    Returns `(fields, body)`. When there is no header, `fields` is empty and
    `body` is the input unchanged. Only simple `key: value` lines are parsed;
    blank lines and `#` comment lines inside the header are ignored.
    """
    match = _FRONT_MATTER_RE.match(raw)
    if not match:
        return {}, raw

    fields: dict[str, str] = {}
    for line in match.group(1).split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, sep, value = stripped.partition(":")
        if not sep:
            continue
        fields[key.strip().lower()] = value.strip()

    body = raw[match.end() :]
    return fields, body


def _infer_kind(rel_path: Path) -> str:
    """Infer a doc's kind from where it sits when front-matter omits it."""
    if rel_path.name == "cv.md":
        return "cv"
    top = rel_path.parts[0] if len(rel_path.parts) > 1 else ""
    if top == "projects":
        return "project"
    if top == "posts":
        return "post"
    return "post"


def _derive_title(fields: dict[str, str], body: str, rel_path: Path) -> str:
    """Title precedence: front-matter, then the first H1, then the filename."""
    if fields.get("title"):
        return fields["title"]
    h1 = _H1_RE.search(body)
    if h1:
        return h1.group(1).strip()
    return rel_path.stem.replace("-", " ")


def load_doc(path: Path, content_dir: Path) -> ContentDoc:
    """Parse a single markdown file into a `ContentDoc`."""
    raw = path.read_text(encoding="utf-8")
    fields, body = parse_front_matter(raw)
    rel_path = path.relative_to(content_dir)

    kind = fields.get("kind") or _infer_kind(rel_path)
    if kind not in _KNOWN_KINDS:
        raise ValueError(
            f"{rel_path.as_posix()}: unknown kind {kind!r} "
            f"(expected one of {sorted(_KNOWN_KINDS)})"
        )

    # `or None` so a blank `project:` line normalizes the same as an absent one
    # (both -> None), letting the stem default below fire and avoiding an empty
    # string landing in the nullable `project` column.
    project = fields.get("project") or None
    # A project doc with no explicit `project:` field defaults to its filename
    # stem — `projects/hrm.md` is about project `hrm` — so the common case needs
    # no redundant front-matter.
    if project is None and kind == "project":
        project = rel_path.stem

    return ContentDoc(
        source=rel_path.as_posix(),
        title=_derive_title(fields, body, rel_path),
        body=body.strip(),
        kind=kind,
        project=project,
        url=fields.get("url") or None,
        # A prose doc may declare a finer genre / date in front-matter; default to
        # plain prose with no date.
        doc_type=fields.get("type") or "prose",
        doc_date=_parse_iso_date(fields.get("date")),
    )


def load_code_doc(path: Path, content_dir: Path) -> ContentDoc | None:
    """Parse one source/config file (under content/code/) into a `ContentDoc`.

    Source files carry no front-matter, so everything is derived from the path:
    `source`/`title` are the content-relative path, `language` from the
    extension, `kind` is 'config' for data formats else 'code', and `project` is
    the first segment under `code/` (content/code/<project>/...). Returns None —
    skipping the file — for an unindexable type (unknown extension), a file that
    can't be read as UTF-8 (binary), or a file directly under code/ with no
    <project> segment to attribute it to.
    """
    language = _LANG_BY_EXT.get(path.suffix.lower())
    if language is None:
        return None
    try:
        raw = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None
    rel_path = path.relative_to(content_dir)
    source = rel_path.as_posix()
    # parts == ('code', '<project>', ...); the project is the segment after code/.
    # A file directly under code/ (no <project> segment) can't be attributed, so
    # skip it loudly rather than indexing a project-less chunk that pollutes the
    # per-project filter and citations.
    parts = rel_path.parts
    if len(parts) < 3:
        print(f"[content] skipping {source}: no <project> segment under code/")
        return None
    project = parts[1]
    kind = "config" if language in _CONFIG_LANGS else "code"
    return ContentDoc(
        source=source,
        title=source,
        body=raw.strip(),
        kind=kind,
        project=project,
        url=None,
        language=language,
        doc_type="code",
    )


def load_adr_doc(path: Path, project: str) -> ContentDoc | None:
    """Parse one ADR / design-note markdown file into a `ContentDoc`.

    ADRs live outside the content tree (a separate, bind-mounted decisions dir),
    carry no front-matter, and follow a fixed header (`# ADR NNNN — Title`, then a
    `**Date:** YYYY-MM-DD` line). The title is the H1; the date is parsed from that
    line; `source` is namespaced `decisions/<filename>` so it never collides with a
    content-tree path. Ingested as prose (kind='project', so the weak-retrieval gate
    treats it as prose) tagged doc_type='adr' and attributed to `project`. Returns
    None for an unreadable file.
    """
    try:
        raw = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None
    h1 = _H1_RE.search(raw)
    title = h1.group(1).strip() if h1 else path.stem.replace("-", " ")
    date_match = _ADR_DATE_RE.search(raw)
    doc_date = _parse_iso_date(date_match.group(1)) if date_match else None
    return ContentDoc(
        source=f"decisions/{path.name}",
        title=title,
        body=raw.strip(),
        kind="project",
        project=project,
        url=None,
        doc_type="adr",
        doc_date=doc_date,
    )


def load_docs(
    content_dir: str | Path,
    *,
    adr_dir: str | Path | None = None,
    adr_project: str = "portfolio",
) -> list[ContentDoc]:
    """Load every markdown doc, source/config file, and (optionally) ADR, by source.

    Markdown prose is loaded from anywhere under `content_dir` EXCEPT the `code/`
    subtree; source and config files from `content/code/<project>/` (skipping
    unknown extensions, unreadable/binary files, and anything over the size cap).
    When `adr_dir` is given, the ADR-named markdown there (`NNNN-*.md`) is also
    ingested as doc_type='adr' prose attributed to `adr_project` — a README /
    TEMPLATE in that dir is skipped by the name filter. Sorting by source keeps the
    indexer's output order deterministic. Returns an empty list only when nothing
    indexable was found anywhere.
    """
    docs: list[ContentDoc] = []

    root = Path(content_dir)
    if root.is_dir():
        code_root = root / _CODE_SUBDIR
        # Markdown prose — everything except the code/ subtree (a .md under code/,
        # if any, is source-adjacent and skipped here to avoid double-loading).
        for path in root.rglob("*.md"):
            if code_root in path.parents:
                continue
            docs.append(load_doc(path, root))

        # Source + config under code/.
        if code_root.is_dir():
            for path in code_root.rglob("*"):
                if not path.is_file():
                    continue
                try:
                    if path.stat().st_size > _MAX_CODE_FILE_BYTES:
                        continue
                except OSError:
                    continue
                doc = load_code_doc(path, root)
                if doc is not None:
                    docs.append(doc)

    # Optional ADR / design-note source — a directory outside the content tree.
    if adr_dir:
        adr_root = Path(adr_dir)
        if adr_root.is_dir():
            for path in sorted(adr_root.glob("*.md")):
                if not _ADR_NAME_RE.match(path.name):
                    continue
                doc = load_adr_doc(path, adr_project)
                if doc is not None:
                    docs.append(doc)

    return sorted(docs, key=lambda d: d.source)
