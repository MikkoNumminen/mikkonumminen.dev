"""Tests for the markdown chunker and its content hash."""

from __future__ import annotations

from app.chunking import (
    Chunk,
    chunk_text,
    estimate_tokens,
    hash_chunk,
)

# Shared chunker parameters for the multi-chunk tests.
PARAMS = {"max_tokens": 60, "min_tokens": 10, "overlap_tokens": 12}


def _para(word: str, n: int) -> str:
    """A paragraph of `n` repetitions of `word` — predictable token counts."""
    return " ".join([word] * n)


def test_estimate_tokens_scales_with_words() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("   ") == 0
    # 10 words * 1.4, rounded up.
    assert estimate_tokens(_para("x", 10)) == 14


def test_hash_is_stable_and_distinct() -> None:
    assert hash_chunk("hello") == hash_chunk("hello")
    assert hash_chunk("hello") != hash_chunk("world")


def test_empty_input_yields_no_chunks() -> None:
    assert chunk_text("", **PARAMS) == []
    assert chunk_text("   \n\n  \n", **PARAMS) == []


def test_short_document_is_one_chunk() -> None:
    text = "# Title\n\nA short paragraph well under the limit."
    chunks = chunk_text(text, **PARAMS)
    assert len(chunks) == 1
    assert chunks[0].index == 0
    assert "short paragraph" in chunks[0].text
    assert chunks[0].content_hash == hash_chunk(chunks[0].text)


def test_long_document_splits_and_every_chunk_is_under_max() -> None:
    paras = "\n\n".join(_para(f"alpha{i}", 30) for i in range(6))
    chunks = chunk_text(paras, **PARAMS)
    assert len(chunks) >= 2
    for c in chunks:
        assert estimate_tokens(c.text) <= PARAMS["max_tokens"]
    # Indices are contiguous from zero.
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_overlap_carries_tail_into_next_chunk() -> None:
    # Two distinct paragraphs that won't both fit in one chunk.
    text = _para("unique_first", 30) + "\n\n" + _para("unique_second", 30)
    chunks = chunk_text(text, **PARAMS)
    assert len(chunks) >= 2
    # The second chunk should begin with words carried over from the first.
    assert "unique_first" in chunks[1].text


def test_oversized_single_block_is_word_split() -> None:
    # One paragraph far larger than max with no blank lines to split on.
    giant = _para("token", 300)
    chunks = chunk_text(giant, **PARAMS)
    assert len(chunks) >= 4
    for c in chunks:
        assert estimate_tokens(c.text) <= PARAMS["max_tokens"]


def test_normalization_makes_hashes_stable_across_whitespace() -> None:
    a = chunk_text("Para one.\n\nPara two.", **PARAMS)
    # CRLF line endings, trailing spaces, and an extra blank line must not
    # change the resulting chunk text or its hash.
    b = chunk_text("Para one.  \r\n\r\n\r\nPara two.\r\n", **PARAMS)
    assert [c.content_hash for c in a] == [c.content_hash for c in b]


def test_code_fence_is_kept_whole() -> None:
    # A blank line inside a fenced block must not split the block.
    text = "Intro paragraph.\n\n```\nline 1\n\nline 2\n```\n\nOutro."
    chunks = chunk_text(text, max_tokens=200, min_tokens=10, overlap_tokens=0)
    joined = "\n".join(c.text for c in chunks)
    # Both fenced lines survive and the fence markers are balanced.
    assert "line 1" in joined and "line 2" in joined
    assert joined.count("```") == 2


def test_returns_chunk_dataclass_instances() -> None:
    chunks = chunk_text("Hello world.", **PARAMS)
    assert all(isinstance(c, Chunk) for c in chunks)
