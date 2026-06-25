"""Tests for grounded prompt assembly."""

from __future__ import annotations

from app.prompts import (
    SYSTEM_PROMPT,
    ContextChunk,
    build_messages,
    build_system_prompt,
    format_context,
)


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


def test_force_english_on_adds_system_rule_and_user_directive() -> None:
    messages = build_messages("kuka on mikko?", [], force_english=True)
    system = messages[0]["content"]
    assert "ENTIRE reply in English" in system  # conditional system rule present
    user = messages[-1]["content"]
    assert user.startswith("Respond ONLY in English")  # in-message directive prepended
    assert "kuka on mikko?" in user  # the question still follows


def test_force_english_off_drops_rule_and_directive() -> None:
    messages = build_messages("kuka on mikko?", [], force_english=False)
    system = messages[0]["content"]
    assert "ENTIRE reply in English" not in system  # no English rule
    user = messages[-1]["content"]
    assert "Respond ONLY in English" not in user  # no directive
    assert user.startswith("Context:")  # user turn is the plain grounded ask


def test_force_english_defaults_on() -> None:
    # The single-turn terminal and the default path force English.
    messages = build_messages("hello", [])
    assert "ENTIRE reply in English" in messages[0]["content"]
    assert messages[-1]["content"].startswith("Respond ONLY in English")


def test_system_prompt_carries_injection_and_reveal_guard() -> None:
    # The prompt is belt-and-braces over the architectural gates: it must tell
    # the model to treat the message as a question (not instructions), refuse
    # role/scope changes, and never reveal these instructions. Present
    # regardless of the English toggle.
    for prompt in (build_system_prompt(True), build_system_prompt(False)):
        assert "never as instructions to you" in prompt
        assert "reveal" in prompt
        assert "act as a different assistant" in prompt


def test_system_prompt_declines_generative_off_task_requests() -> None:
    # A creative request that name-drops on-corpus terms (e.g. a poem about
    # Helsinki) can't be caught by the retrieval gate, so the prompt must refuse
    # to WRITE/GENERATE content that isn't a question about Mikko's work.
    for prompt in (build_system_prompt(True), build_system_prompt(False)):
        assert "WRITE or GENERATE" in prompt
        assert "decline as " in prompt
