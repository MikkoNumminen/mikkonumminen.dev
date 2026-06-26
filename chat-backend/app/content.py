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


def is_code_doc(doc: "ContentDoc") -> bool:
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
    )


def load_docs(content_dir: str | Path) -> list[ContentDoc]:
    """Load every markdown doc plus every source/config file, by source path.

    Markdown is loaded from anywhere under `content_dir` EXCEPT the `code/`
    subtree; source and config files are loaded from `content/code/<project>/`
    (skipping unknown extensions, unreadable/binary files, and anything over the
    size cap). Sorting by source makes the indexer's output order deterministic
    across machines. Returns an empty list when the directory does not exist or
    holds nothing indexable — the indexer treats that as a no-op with a warning.
    """
    root = Path(content_dir)
    if not root.is_dir():
        return []

    code_root = root / _CODE_SUBDIR
    docs: list[ContentDoc] = []

    # Markdown prose — everything except the code/ subtree (a .md under code/, if
    # any, is treated as source-adjacent and skipped here to avoid double-loading).
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

    return sorted(docs, key=lambda d: d.source)
