"""Tests for the pure OpenAI-style streaming-chunk parser."""

from __future__ import annotations

from app.llm import parse_stream_line


def _data(payload: str) -> str:
    return f"data: {payload}"


def test_extracts_content_delta() -> None:
    line = _data('{"choices":[{"delta":{"content":"Hello"}}]}')
    assert parse_stream_line(line) == "Hello"


def test_done_sentinel_is_none() -> None:
    assert parse_stream_line("data: [DONE]") is None


def test_non_data_line_is_none() -> None:
    assert parse_stream_line(": keep-alive") is None
    assert parse_stream_line("") is None
    assert parse_stream_line("event: message") is None


def test_role_only_first_chunk_is_none() -> None:
    # The opening chunk often carries the role but no content.
    assert (
        parse_stream_line(_data('{"choices":[{"delta":{"role":"assistant"}}]}')) is None
    )


def test_empty_content_is_none() -> None:
    assert parse_stream_line(_data('{"choices":[{"delta":{"content":""}}]}')) is None


def test_malformed_json_is_none() -> None:
    assert parse_stream_line(_data("{not json")) is None


def test_missing_choices_is_none() -> None:
    assert parse_stream_line(_data('{"id":"x"}')) is None
    assert parse_stream_line(_data('{"choices":[]}')) is None
