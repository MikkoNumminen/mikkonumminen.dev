"""Markdown-aware chunking with a stable content hash per chunk.

The indexer turns each content file into a list of `Chunk`s that are small
enough to embed (bge-small-en-v1.5 truncates silently at 512 tokens, so a chunk
that overflows would lose its tail) and large enough to carry context.

Why a word-based token *estimate* rather than a real tokenizer: the indexer is
deliberately dependency-light, and the exact token count does not matter — only
that every chunk stays comfortably under the model's 512-token ceiling. We
multiply the whitespace-word count by 1.4 (English BPE runs ~1.3 tokens/word;
1.4 gives headroom) so the estimate *over*-counts real tokens. A chunk capped at
an estimated 480 tokens therefore holds well under 512 real tokens even for
token-dense text — the estimate erring high is the safe direction.

This module is stdlib-only and pure, so it is unit-tested directly.
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass

# Words → estimated tokens. See the module docstring for why this errs high.
_TOKENS_PER_WORD = 1.4


@dataclass(frozen=True)
class Chunk:
    """One embeddable unit of a document."""

    index: int
    text: str
    content_hash: str


def estimate_tokens(text: str) -> int:
    """Estimate the BPE token count of `text`, biased to over-count.

    Uses the whitespace-word count scaled by `_TOKENS_PER_WORD`. Empty / blank
    text is zero tokens. Always rounds up so a chunk near the limit is treated
    as over rather than under.
    """
    words = len(text.split())
    return math.ceil(words * _TOKENS_PER_WORD)


def hash_chunk(text: str) -> str:
    """Stable content hash of a chunk's exact stored text.

    Identical stored text always yields the same hash; this is what lets the
    indexer skip re-embedding unchanged chunks across runs.
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _normalize(text: str) -> str:
    """Normalize line endings and collapse runs of blank lines to a single one.

    Keeps the blank line as the paragraph separator the block splitter relies
    on, while ensuring whitespace-only differences (CRLF vs LF, three blank
    lines vs two) don't perturb chunk boundaries — and therefore hashes —
    between runs.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Trim trailing whitespace on each line so re-saves with editor whitespace
    # changes don't churn hashes.
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    # Collapse 2+ blank lines to exactly one.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_blocks(text: str) -> list[str]:
    """Split normalized markdown into blocks on blank lines.

    A block is a paragraph, a heading, a fenced code region, or a contiguous
    list — i.e. the natural seams to chunk on. Code fences are kept whole so a
    ``` pair is never split across chunks.
    """
    blocks: list[str] = []
    current: list[str] = []
    in_fence = False

    for line in text.split("\n"):
        is_fence = line.lstrip().startswith("```")
        if is_fence:
            in_fence = not in_fence
            current.append(line)
            continue
        if line == "" and not in_fence:
            if current:
                blocks.append("\n".join(current))
                current = []
        else:
            current.append(line)

    if current:
        blocks.append("\n".join(current))
    return blocks


def _split_oversized_block(block: str, max_tokens: int) -> list[str]:
    """Split a single block that alone exceeds `max_tokens` into word runs.

    Falls back to a hard word-count split because a single paragraph longer than
    the chunk budget cannot be placed whole. Sentence boundaries would be nicer
    but a word split guarantees every piece is under budget regardless of input.
    """
    words = block.split()
    if not words:
        return []
    # Max words that keep the estimate under the cap (inverse of estimate_tokens).
    max_words = max(1, int(max_tokens / _TOKENS_PER_WORD))
    pieces: list[str] = []
    for start in range(0, len(words), max_words):
        pieces.append(" ".join(words[start : start + max_words]))
    return pieces


def _bounded_overlap(prev: str, block: str, overlap_tokens: int, max_tokens: int) -> str:
    """Trailing words of `prev` to seed the next chunk, trimmed so it fits.

    Carries up to ~`overlap_tokens` words from the end of the flushed chunk so a
    fact spanning a boundary stays retrievable from either side — but never so
    many that `tail + block` would exceed `max_tokens`. The overlap is a
    nice-to-have; staying under the cap is the hard constraint, so the tail is
    trimmed from its front (oldest words first) until the assembled chunk fits,
    and dropped entirely if even one carried word would overflow.
    """
    if overlap_tokens <= 0:
        return ""
    words = prev.split()
    keep = max(1, int(overlap_tokens / _TOKENS_PER_WORD))
    tail_words = words[-keep:]
    while tail_words:
        tail = " ".join(tail_words)
        if estimate_tokens(f"{tail}\n\n{block}") <= max_tokens:
            return tail
        tail_words = tail_words[1:]
    return ""


def chunk_text(
    text: str,
    *,
    max_tokens: int,
    min_tokens: int,
    overlap_tokens: int,
) -> list[Chunk]:
    """Chunk markdown into `Chunk`s of roughly `min_tokens`..`max_tokens`.

    Greedily packs whole blocks into a chunk until the next block would exceed
    `max_tokens`, then flushes and starts the next chunk seeded with an overlap
    tail from the one just flushed. Blocks larger than `max_tokens` on their own
    are word-split first. Adjacent chunks below `min_tokens` are tolerated only
    at the document tail (there is nothing left to merge with).
    """
    normalized = _normalize(text)
    if not normalized:
        return []

    # Expand oversized blocks up front so the packer only ever sees sub-budget
    # units and never has to emit something over the cap. Split to leave room
    # for an overlap tail, so even a word-split giant paragraph keeps its
    # cross-boundary overlap (a piece sized to the full cap would leave no room
    # for the tail and silently lose the overlap).
    effective_max = max_tokens - overlap_tokens
    blocks: list[str] = []
    for block in _split_blocks(normalized):
        if estimate_tokens(block) > max_tokens:
            blocks.extend(_split_oversized_block(block, effective_max))
        else:
            blocks.append(block)

    chunks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for block in blocks:
        candidate = f"{current}\n\n{block}" if current else block
        if current and estimate_tokens(candidate) > max_tokens:
            prev = current
            flush()
            tail = _bounded_overlap(prev, block, overlap_tokens, max_tokens)
            current = f"{tail}\n\n{block}" if tail else block
        else:
            current = candidate

    flush()

    # Merge a too-small trailing chunk back into its predecessor when doing so
    # stays under budget — avoids stranding a one-line final chunk.
    if (
        len(chunks) >= 2
        and estimate_tokens(chunks[-1]) < min_tokens
        and estimate_tokens(chunks[-2] + "\n\n" + chunks[-1]) <= max_tokens
    ):
        merged = chunks[-2] + "\n\n" + chunks[-1]
        chunks = chunks[:-2] + [merged]

    return [
        Chunk(index=i, text=text, content_hash=hash_chunk(text))
        for i, text in enumerate(chunks)
    ]
