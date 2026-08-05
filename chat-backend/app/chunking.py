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


def _pack_blocks(
    blocks: list[str], max_tokens: int, min_tokens: int, overlap_tokens: int
) -> list[str]:
    """Greedily pack already-sub-budget blocks into chunk texts of <=`max_tokens`.

    Shared by the prose chunker (markdown blocks) and the code chunker (function
    /class units): each reduces its input to a list of units that already fit the
    budget, then packs them identically — accumulate whole units until the next
    would overflow, flush, and seed the next chunk with an overlap tail so a fact
    (or a signature) spanning a boundary stays retrievable from either side. A
    too-small trailing chunk is merged back into its predecessor when that stays
    under budget, so a one-line tail isn't stranded.
    """
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

    if (
        len(chunks) >= 2
        and estimate_tokens(chunks[-1]) < min_tokens
        and estimate_tokens(chunks[-2] + "\n\n" + chunks[-1]) <= max_tokens
    ):
        merged = chunks[-2] + "\n\n" + chunks[-1]
        chunks = chunks[:-2] + [merged]

    return chunks


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

    texts = _pack_blocks(blocks, max_tokens, min_tokens, overlap_tokens)
    return [
        Chunk(index=i, text=text, content_hash=hash_chunk(text))
        for i, text in enumerate(texts)
    ]


# Line-start patterns for a top-level/member DEFINITION in each language. They
# only need to find SAFE split points: over-identifying (e.g. matching a C# field
# as well as a method) is fine because `_pack_blocks` re-groups small adjacent
# units up to the budget — the hard requirement is never to split *inside* a
# definition. ts/tsx share one pattern, as do js/jsx. A language absent here has
# no boundary support and falls back to line-window chunking.
_CODE_BOUNDARY_RES: dict[str, re.Pattern[str]] = {
    "python": re.compile(r"^[ \t]*(async[ \t]+def|def|class)[ \t]"),
    "typescript": re.compile(
        r"^[ \t]*(export[ \t]+)?(default[ \t]+)?(abstract[ \t]+)?(async[ \t]+)?"
        r"(function\b|class\b|interface\b|enum\b|namespace\b"
        r"|type[ \t]+\w+|const[ \t]+\w+|let[ \t]+\w+|var[ \t]+\w+)"
    ),
    "csharp": re.compile(
        r"^[ \t]*(\[[^\]]*\][ \t]*)?"  # optional leading attribute, e.g. [HttpGet]
        r"((public|private|protected|internal|static|virtual|override|sealed"
        r"|abstract|partial|async|readonly|const|record|class|struct|interface"
        r"|enum|void)[ \t]+)+"
    ),
}
# javascript/jsx reuse the typescript pattern (same declaration surface here).
_CODE_BOUNDARY_RES["javascript"] = _CODE_BOUNDARY_RES["typescript"]

# Line-start patterns for a CONTINUATION line that belongs to the definition
# BELOW it — a decorator (@classmethod, @Component(...)) or a C# attribute on its
# own line ([HttpGet]). Contiguous runs of these immediately above a boundary are
# pulled into that definition's unit so they are never split off from it.
_AT_DECORATOR_RE = re.compile(r"^[ \t]*@\w")
_CODE_DECORATOR_RES: dict[str, re.Pattern[str]] = {
    # Aliased rather than spelled out once per language, matching how
    # _CODE_BOUNDARY_RES above expresses "javascript reuses typescript". The
    # literal was written three times, so a fix to the pattern had three places
    # to land and two chances to be missed.
    "python": _AT_DECORATOR_RE,
    "typescript": _AT_DECORATOR_RE,
    "javascript": _AT_DECORATOR_RE,
    "csharp": re.compile(r"^[ \t]*\[[^\]]*\][ \t]*$"),
}


def _line_window_units(text: str, max_tokens: int) -> list[str]:
    """Split `text` into contiguous line windows each under `max_tokens`.

    The boundary-agnostic fallback: used for languages without a definition
    pattern (config, unknown) and for a single definition that is itself larger
    than the budget. Splits only on whole-line boundaries so indentation and line
    structure survive — never mid-line.
    """
    units: list[str] = []
    current: list[str] = []
    for line in text.split("\n"):
        candidate = current + [line]
        if current and estimate_tokens("\n".join(candidate)) > max_tokens:
            units.append("\n".join(current))
            current = [line]
        else:
            current = candidate
    if current and "\n".join(current).strip():
        units.append("\n".join(current))
    return [u for u in units if u.strip()]


def _split_code_units(text: str, language: str) -> list[str] | None:
    """Split source into units that each hold one whole definition.

    Returns one unit per top-level/member definition (the span from one boundary
    line up to the next), with any leading imports/preamble as the first unit, so
    `_pack_blocks` can regroup them without ever cutting a function in half.
    Returns None when the language has no boundary pattern, signalling the caller
    to fall back to `_line_window_units`.
    """
    pattern = _CODE_BOUNDARY_RES.get(language)
    if pattern is None:
        return None

    lines = text.split("\n")
    boundaries = [i for i, line in enumerate(lines) if pattern.match(line)]
    if not boundaries:
        whole = "\n".join(lines).strip()
        return [whole] if whole else []

    # Pull contiguous decorator/attribute lines immediately above each boundary
    # into that definition's unit, so '@decorator' / '[Attribute]' is never
    # stranded in the preceding unit. Floored at the previous boundary so a
    # decorator can't be claimed across a definition.
    deco = _CODE_DECORATOR_RES.get(language)
    starts: list[int] = []
    for j, b in enumerate(boundaries):
        floor = boundaries[j - 1] + 1 if j > 0 else 0
        start = b
        if deco is not None:
            while start > floor and deco.match(lines[start - 1]):
                start -= 1
        starts.append(start)

    units: list[str] = []
    if starts[0] > 0:
        preamble = "\n".join(lines[: starts[0]]).strip()
        if preamble:
            units.append(preamble)
    for j, start in enumerate(starts):
        end = starts[j + 1] if j + 1 < len(starts) else len(lines)
        unit = "\n".join(lines[start:end]).strip("\n")
        if unit.strip():
            units.append(unit)
    return units


def chunk_code(
    text: str,
    language: str,
    *,
    max_tokens: int,
    min_tokens: int,
    overlap_tokens: int,
) -> list[Chunk]:
    """Chunk source code on definition boundaries, never mid-function.

    Splits into one unit per function/class/member (or line windows for a
    language without a boundary pattern), then packs units with the SAME greedy
    packer the prose chunker uses, so adjacent small definitions share a chunk
    while a large one keeps a chunk to itself. A single definition over the budget
    is line-windowed (preserving indentation) rather than word-split, so its code
    stays readable.
    """
    normalized = _normalize(text)
    if not normalized:
        return []

    effective_max = max_tokens - overlap_tokens
    units = _split_code_units(normalized, language)
    if units is None:
        units = _line_window_units(normalized, effective_max)

    blocks: list[str] = []
    for unit in units:
        if estimate_tokens(unit) > max_tokens:
            blocks.extend(_line_window_units(unit, effective_max))
        else:
            blocks.append(unit)

    texts = _pack_blocks(blocks, max_tokens, min_tokens, overlap_tokens)
    return [
        Chunk(index=i, text=text, content_hash=hash_chunk(text))
        for i, text in enumerate(texts)
    ]


def chunk_document(
    text: str,
    *,
    is_code: bool,
    language: str | None,
    max_tokens: int,
    min_tokens: int,
    overlap_tokens: int,
) -> list[Chunk]:
    """Dispatch to the code- or prose-aware chunker for one document.

    The indexer calls this per document: source/config files (`is_code`) go
    through `chunk_code` with their detected `language`; markdown goes through the
    block-based `chunk_text` unchanged.
    """
    if is_code:
        return chunk_code(
            text,
            language or "",
            max_tokens=max_tokens,
            min_tokens=min_tokens,
            overlap_tokens=overlap_tokens,
        )
    return chunk_text(
        text,
        max_tokens=max_tokens,
        min_tokens=min_tokens,
        overlap_tokens=overlap_tokens,
    )
