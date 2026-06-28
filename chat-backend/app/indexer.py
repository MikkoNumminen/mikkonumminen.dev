"""Offline content indexer — `python -m app.indexer`.

Reads the curated `content/` corpus, chunks each document, embeds the chunks
with the in-process model, and upserts them into Postgres+pgvector. Re-running
is idempotent: a chunk's stored content hash gates re-embedding (unchanged
content is neither re-embedded nor re-written), while a chunk's row identity is
its (source, chunk_index) — so edited chunks are updated in place and chunks
that were removed have their rows pruned. The static corpus rarely changes, so
this is a one-time offline job — embeddings are precomputed and stored, never
generated per deploy.

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

from .chunking import Chunk, chunk_document, estimate_tokens
from .config import Settings
from .content import ContentDoc, is_code_doc, load_docs


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
    docs = load_docs(
        settings.content_dir,
        adr_dir=settings.adr_dir or None,
        adr_project=settings.adr_project,
    )
    return [
        FilePlan(
            doc=doc,
            chunks=chunk_document(
                doc.body,
                is_code=is_code_doc(doc),
                language=doc.language,
                max_tokens=settings.chunk_max_tokens,
                min_tokens=settings.chunk_min_tokens,
                overlap_tokens=settings.chunk_overlap_tokens,
            ),
        )
        for doc in docs
    ]


def select_chunks_to_embed(chunks: list[Chunk], existing: dict[int, str]) -> list[Chunk]:
    """Chunks that must be (re-)embedded: a new index, or a changed hash.

    A chunk's expensive embedding is reused only when the DB already holds its
    exact content hash at the same index. Pure, so the core reconcile decision
    is unit-tested without a database.
    """
    return [c for c in chunks if existing.get(c.index) != c.content_hash]


async def reindex(
    settings: Settings, *, plans: list[FilePlan] | None = None
) -> IndexStats:
    """Embed and upsert the corpus idempotently. Returns run statistics."""
    # Lazy heavy imports so `plan()` / dry-run / unit tests never need them.
    from .db import Database, DocumentRow, apply_schema
    from .embeddings import Embedder

    file_plans = plans if plans is not None else plan(settings)
    if not file_plans:
        # Not an early return: an empty corpus (every file removed) must still
        # reconcile the DB — delete_sources_absent_from([]) prunes every row —
        # or the chat would keep answering from content that no longer exists.
        print(
            f"[indexer] no markdown under {settings.content_dir!r} "
            "- pruning any stale rows"
        )

    await apply_schema(settings.database_url)
    db = await Database.connect(settings.database_url)
    # The embedder (and its one-time model download) is built lazily, only once
    # a chunk actually needs embedding — so an empty or fully-unchanged corpus
    # never loads the model. `db` is bound before the try so a model-load
    # failure still hits `finally` without a NameError, and the pool is closed.
    embedder: Embedder | None = None
    chunks_total = embedded = skipped = deleted = total = 0
    try:
        for fp in file_plans:
            doc = fp.doc
            chunks_total += len(fp.chunks)
            existing = await db.existing_chunk_hashes(doc.source)

            to_embed = select_chunks_to_embed(fp.chunks, existing)
            skipped += len(fp.chunks) - len(to_embed)

            if to_embed:
                if embedder is None:
                    embedder = Embedder(settings.embedding_model, settings.embedding_dim)
                vectors = embedder.embed_passages([c.text for c in to_embed])
                chunk_type = "code" if is_code_doc(doc) else "prose"
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
                        language=doc.language,
                        chunk_type=chunk_type,
                        doc_type=doc.doc_type,
                        doc_date=doc.doc_date,
                    )
                    for c, vec in zip(to_embed, vectors, strict=True)
                ]
                embedded += await db.upsert_documents(rows)

            # Prune chunks left over from a previous, longer version of this file.
            deleted += await db.delete_stale_chunks(doc.source, len(fp.chunks))

        # Prune whole files removed from the corpus since the last run (and, when
        # the corpus is empty, every remaining row).
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
