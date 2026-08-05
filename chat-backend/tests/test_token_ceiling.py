"""The real-token ceiling enforcement.

The word-based estimate in chunking.py is calibrated on English prose. Measured
against this corpus with the embedder's own tokenizer, real tokens ran 1.97x the
estimate on average and 4.60x at worst, which left 170 of 211 code chunks over
the model's 512-token limit. The embedder truncates there silently, so those
tails were never embedded and could never be retrieved.

These tests use a fake counter, not the real tokenizer: the point of injecting
`count_tokens` is that this module stays testable without loading a model.
"""

from __future__ import annotations

from app.chunking import Chunk, enforce_token_ceiling, hash_chunk


def _chunk(text: str, index: int = 0) -> Chunk:
    return Chunk(index=index, text=text, content_hash=hash_chunk(text))


def by_chars(text: str) -> int:
    """One token per character. Makes the arithmetic in these tests obvious."""
    return len(text)


def test_chunk_under_the_ceiling_is_returned_untouched() -> None:
    original = _chunk("short enough")
    out = enforce_token_ceiling([original], by_chars, 100)
    assert len(out) == 1
    assert out[0].text == original.text


def test_over_long_chunk_is_split_until_every_piece_fits() -> None:
    text = "\n".join("x" * 10 for _ in range(10))  # 109 chars with newlines
    out = enforce_token_ceiling([_chunk(text)], by_chars, 30)
    assert len(out) > 1
    assert all(by_chars(c.text) <= 30 for c in out)


def test_split_preserves_every_line() -> None:
    """The whole point is that no content is dropped. A split that loses a line
    would be the same silent data loss with a different cause."""
    lines = [f"line{i}" for i in range(20)]
    out = enforce_token_ceiling([_chunk("\n".join(lines))], by_chars, 25)
    recovered = "\n".join(c.text for c in out).split("\n")
    assert recovered == lines


def test_indices_are_contiguous_and_ascending() -> None:
    """indexer.py reconciles stored rows on (source, chunk_index). A gap or a
    duplicate would orphan a row or overwrite the wrong one."""
    out = enforce_token_ceiling(
        [_chunk("\n".join("y" * 8 for _ in range(12)))], by_chars, 20
    )
    assert [c.index for c in out] == list(range(len(out)))


def test_content_hash_follows_the_new_text() -> None:
    """A re-split chunk carrying its old hash would look unchanged to the
    reconcile and never be re-embedded, which is the bug wearing a disguise."""
    out = enforce_token_ceiling(
        [_chunk("\n".join("z" * 9 for _ in range(6)))], by_chars, 20
    )
    assert all(c.content_hash == hash_chunk(c.text) for c in out)


def test_single_line_over_the_ceiling_is_kept_whole() -> None:
    """Splitting mid-line would corrupt code rather than shorten it. Truncation
    is then the embedder's and is unavoidable without mangling the text, so the
    chunk is passed through rather than butchered."""
    out = enforce_token_ceiling([_chunk("q" * 200)], by_chars, 30)
    assert len(out) == 1
    assert out[0].text == "q" * 200


def test_several_chunks_are_renumbered_across_the_whole_batch() -> None:
    chunks = [_chunk("a" * 5, 0), _chunk("\n".join("b" * 9 for _ in range(5)), 1)]
    out = enforce_token_ceiling(chunks, by_chars, 20)
    assert [c.index for c in out] == list(range(len(out)))
    assert out[0].text == "a" * 5
