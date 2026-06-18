"""Offline content indexer — `python -m app.indexer`.

Reads the curated `content/` corpus, chunks each document, embeds the chunks
with the in-process model, and upserts them into Postgres+pgvector. Re-running
is idempotent: each chunk is keyed by its content hash, so unchanged content is
neither re-embedded nor re-written, and chunks that changed or were removed have
their stale rows pruned. The static corpus rarely changes, so this is a one-time
offline job — embeddings are precomputed and stored, never generated per deploy.

    docker compose run --rm backend python -m app.indexer
    docker compose run --rm backend python -m app.indexer --dry-run

`--dry-run` reports the chunk plan without touching the database or loading the
embedding model — a fast way to sanity-check chunking after editing content.

The heavy dependencies (embeddings, database) are imported lazily inside
`reindex` so the dry-run path and the unit tests stay dependency-light.
"""

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import sys
from dataclasses import dataclass
from pathlib import Path

from .chunking import Chunk, chunk_text, estimate_tokens
from .config import Settings
from .content import ContentDoc, load_docs

# sql/ sits beside app/ at the package root.
SQL_PATH = Path(__file__).resolve().parent.parent / "sql" / "001_init.sql"


@dataclass(frozen=True)
class FilePlan:
    """The chunking outcome for one source document (no embeddings yet)."""

    doc: ContentDoc
    chunks: list[Chunk]


@dataclass(frozen=True)
class IndexStats:
    files: int
    chunks: int
    embedded: int
    skipped: int
    deleted: int
    total_in_db: int


def plan(settings: Settings) -> list[FilePlan]:
    """Load and chunk the corpus without embedding or persisting anything."""
    docs = load_docs(settings.content_dir)
    return [
        FilePlan(
            doc=doc,
            chunks=chunk_text(
                doc.body,
                max_tokens=settings.chunk_max_tokens,
                min_tokens=settings.chunk_min_tokens,
                overlap_tokens=settings.chunk_overlap_tokens,
            ),
        )
        for doc in docs
    ]


async def reindex(
    settings: Settings, *, plans: list[FilePlan] | None = None
) -> IndexStats:
    """Embed and upsert the corpus idempotently. Returns run statistics."""
    # Lazy heavy imports so `plan()` / dry-run / unit tests never need them.
    from .db import Database, DocumentRow, apply_schema
    from .embeddings import Embedder

    file_plans = plans if plans is not None else plan(settings)
    if not file_plans:
        print(
            f"[indexer] no markdown found under {settings.content_dir!r} - nothing to do"
        )
        return IndexStats(0, 0, 0, 0, 0, 0)

    await apply_schema(settings.database_url, SQL_PATH)
    db = await Database.connect(settings.database_url)
    embedder = Embedder(settings.embedding_model, settings.embedding_dim)

    chunks_total = embedded = skipped = deleted = 0
    try:
        for fp in file_plans:
            doc = fp.doc
            chunks_total += len(fp.chunks)
            existing = await db.existing_hashes(doc.source)

            new_chunks = [c for c in fp.chunks if c.content_hash not in existing]
            skipped += len(fp.chunks) - len(new_chunks)

            if new_chunks:
                vectors = embedder.embed_passages([c.text for c in new_chunks])
                rows = [
                    DocumentRow(
                        source=doc.source,
                        project=doc.project,
                        title=doc.title,
                        kind=doc.kind,
                        chunk_index=c.index,
                        content=c.text,
                        content_hash=c.content_hash,
                        embedding=vec,
                    )
                    for c, vec in zip(new_chunks, vectors, strict=True)
                ]
                embedded += await db.insert_documents(rows)

            # Prune chunks that changed or disappeared from this file.
            deleted += await db.delete_stale(
                doc.source, [c.content_hash for c in fp.chunks]
            )

        # Prune whole files that were deleted from the corpus since last run.
        deleted += await db.delete_sources_absent_from(
            [fp.doc.source for fp in file_plans]
        )

        total = await db.count_documents()
    finally:
        await db.close()

    return IndexStats(
        files=len(file_plans),
        chunks=chunks_total,
        embedded=embedded,
        skipped=skipped,
        deleted=deleted,
        total_in_db=total,
    )


def _print_dry_run(file_plans: list[FilePlan]) -> None:
    if not file_plans:
        print("[indexer] dry-run: no markdown found - nothing to index")
        return
    print("[indexer] dry-run - chunk plan (no DB writes, no embeddings):\n")
    total_chunks = 0
    for fp in file_plans:
        total_chunks += len(fp.chunks)
        print(f"  {fp.doc.source}  ({fp.doc.kind})  ->  {len(fp.chunks)} chunk(s)")
        for c in fp.chunks:
            preview = " ".join(c.text.split())[:60]
            print(f"      [{c.index}] ~{estimate_tokens(c.text):>4} tok  {preview}...")
    print(f"\n[indexer] {len(file_plans)} file(s), {total_chunks} chunk(s) total")


def _ensure_utf8_stdout() -> None:
    """Force UTF-8 console output so previewing content never crashes.

    The corpus contains non-ASCII glyphs (arrows, middots) that a legacy Windows
    code page (cp1252) cannot encode, which would otherwise turn a harmless
    `--dry-run` preview into a UnicodeEncodeError. The service itself runs in a
    UTF-8 Linux container; this only matters when running the CLI directly on a
    Windows host.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):  # pragma: no cover - stream-dependent
                pass


def main(argv: list[str] | None = None) -> int:
    _ensure_utf8_stdout()
    parser = argparse.ArgumentParser(
        prog="python -m app.indexer",
        description="Index the curated content corpus into Postgres+pgvector.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show the chunk plan without embedding or writing to the database.",
    )
    parser.add_argument(
        "--content-dir",
        default=None,
        help="Override the content directory (defaults to CONTENT_DIR / 'content').",
    )
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    if args.content_dir:
        settings = dataclasses.replace(settings, content_dir=args.content_dir)

    if args.dry_run:
        _print_dry_run(plan(settings))
        return 0

    stats = asyncio.run(reindex(settings))
    print(
        "[indexer] done: "
        f"{stats.files} file(s), {stats.chunks} chunk(s) "
        f"({stats.embedded} embedded, {stats.skipped} unchanged, "
        f"{stats.deleted} pruned) - {stats.total_in_db} rows in DB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
