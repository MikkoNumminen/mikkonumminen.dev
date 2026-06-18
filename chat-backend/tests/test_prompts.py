"""Tests for grounded prompt assembly."""

from __future__ import annotations

from app.prompts import SYSTEM_PROMPT, ContextChunk, build_messages, format_context


def test_format_context_empty() -> None:
    assert format_context([]) == "(no relevant content found)"


def test_format_context_numbers_and_labels_chunks() -> None:
    chunks = [
        ContextChunk(source="projects/hrm.md", title="HRM", content="A platform."),
        ContextChunk(source="cv.md", title="CV", content="A developer."),
    ]
    out = format_context(chunks)
    assert "[1] HRM (projects/hrm.md)" in out
    assert "[2] CV (cv.md)" in out
    assert "A platform." in out and "A developer." in out


def test_build_messages_shape() -> None:
    chunks = [ContextChunk(source="cv.md", title="CV", content="ships apps.")]
    messages = build_messages("who is mikko?", chunks)
    assert messages[0] == {"role": "system", "content": SYSTEM_PROMPT}
    last = messages[-1]
    assert last["role"] == "user"
    assert "who is mikko?" in last["content"]
    assert "ships apps." in last["content"]  # context is inlined


def test_build_messages_threads_history_between_system_and_question() -> None:
    history = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "system", "content": "ignored"},  # only user/assistant kept
        {"role": "user", "content": ""},  # empty content dropped
    ]
    messages = build_messages("next?", [], history)
    roles = [m["role"] for m in messages]
    assert roles == ["system", "user", "assistant", "user"]
    assert messages[1]["content"] == "hi"
    assert messages[2]["content"] == "hello"


def test_build_messages_empty_context_path() -> None:
    messages = build_messages("anything", [])
    assert "(no relevant content found)" in messages[-1]["content"]
