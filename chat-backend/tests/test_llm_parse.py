"""Tests for the pure OpenAI-style streaming-chunk parser."""

from __future__ import annotations

from app.llm import (
    LLMClient,
    parse_finish_reason,
    parse_stream_line,
    parse_usage_line,
)


def _data(payload: str) -> str:
    return f"data: {payload}"


def test_parse_usage_line_extracts_real_token_counts() -> None:
    line = _data(
        '{"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":30,'
        '"total_tokens":150}}'
    )
    assert parse_usage_line(line) == {"prompt": 120, "completion": 30}


def test_parse_usage_line_none_for_non_usage_lines() -> None:
    assert parse_usage_line(_data('{"choices":[{"delta":{"content":"hi"}}]}')) is None
    assert parse_usage_line("data: [DONE]") is None
    assert parse_usage_line("") is None
    assert parse_usage_line(_data('{"usage":{"prompt_tokens":"x"}}')) is None


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


def test_non_dict_choice_entry_is_skipped_not_crashed() -> None:
    # A non-dict choice entry must be skipped like any other non-content chunk,
    # never raise (which would abort a healthy in-flight generation).
    assert parse_stream_line(_data('{"choices":[null]}')) is None
    assert parse_stream_line(_data('{"choices":[42]}')) is None
    assert parse_stream_line(_data('{"choices":["str"]}')) is None


def test_chat_payload_applies_effort_knobs() -> None:
    capped = LLMClient("http://x/v1", "m", 60, temperature=0.7, num_predict=256)
    payload = capped._chat_payload([{"role": "user", "content": "hi"}])
    assert payload["temperature"] == 0.7
    assert payload["max_tokens"] == 256
    assert payload["stream"] is True
    # A non-positive num_predict means "no cap" -> max_tokens omitted (model default).
    uncapped = LLMClient("http://x/v1", "m", 60)._chat_payload([])
    assert "max_tokens" not in uncapped
    assert uncapped["temperature"] == 0.4


def test_finish_reason_is_read_even_when_the_chunk_also_carries_content() -> None:
    # The OpenAI wire format permits the last content delta and finish_reason on
    # ONE chunk, and some servers do that. Reading finish_reason only on empty
    # chunks would miss truncation entirely against those, which is exactly the
    # bug the detector exists to catch, reintroduced invisibly.
    line = (
        'data: {"choices":[{"delta":{"content":"tail"},"finish_reason":"length"}]}'
    )
    assert parse_stream_line(line) == "tail"
    assert parse_finish_reason(line) == "length"
