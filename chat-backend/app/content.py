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

_FRONT_MATTER_RE = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*\n", re.DOTALL)
_H1_RE = re.compile(r"^#[ \t]+(.+?)[ \t]*$", re.MULTILINE)

_KNOWN_KINDS = {"project", "cv", "post"}


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

    project = fields.get("project")
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


def load_docs(content_dir: str | Path) -> list[ContentDoc]:
    """Load every `*.md` under `content_dir`, sorted by source path.

    Sorting makes the indexer's output order deterministic across machines.
    Returns an empty list when the directory does not exist or holds no
    markdown — the caller decides whether that is an error (the indexer treats
    it as a no-op with a warning).
    """
    root = Path(content_dir)
    if not root.is_dir():
        return []
    docs = [load_doc(path, root) for path in sorted(root.rglob("*.md"))]
    return docs
