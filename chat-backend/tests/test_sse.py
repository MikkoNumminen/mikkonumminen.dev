"""Tests for SSE wire framing (the contract chat.ts parses)."""

from __future__ import annotations

import json

from app.sse import sse, sse_done, sse_error, sse_sources, sse_token


def test_frame_shape() -> None:
    frame = sse("token", {"text": "hi"})
    assert frame == 'event: token\ndata: {"text": "hi"}\n\n'


def test_token_helper() -> None:
    assert sse_token("hello") == 'event: token\ndata: {"text": "hello"}\n\n'


def test_done_and_error_helpers() -> None:
    assert sse_done() == "event: done\ndata: {}\n\n"
    assert sse_error("boom") == 'event: error\ndata: {"message": "boom"}\n\n'


def test_sources_helper_wraps_in_object() -> None:
    frame = sse_sources([{"source": "cv.md", "title": "CV", "project": None}])
    assert frame.startswith("event: sources\ndata: ")
    body = frame[len("event: sources\ndata: ") : -2]
    assert json.loads(body) == {
        "sources": [{"source": "cv.md", "title": "CV", "project": None}]
    }


def test_newline_in_payload_cannot_break_framing() -> None:
    # A token containing a newline must stay on one data: line (JSON-escaped),
    # or the frame would terminate early and corrupt the stream.
    frame = sse_token("line1\nline2")
    data_lines = [ln for ln in frame.split("\n") if ln.startswith("data:")]
    assert len(data_lines) == 1
    assert "\\n" in data_lines[0]


def test_non_ascii_preserved() -> None:
    frame = sse_token("café →")
    assert "café →" in frame
