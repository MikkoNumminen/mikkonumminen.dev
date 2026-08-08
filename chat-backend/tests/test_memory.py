"""Tests for in-process session memory (Phase 4)."""

from __future__ import annotations

import pytest

from app.memory import SessionMemory


def test_record_then_history_returns_pairs_oldest_first() -> None:
    m = SessionMemory(max_turns=6, max_sessions=10, ttl_seconds=100)
    m.record("s", "q1", "a1", now=1.0)
    m.record("s", "q2", "a2", now=2.0)
    assert m.history("s", now=3.0) == [
        {"role": "user", "content": "q1"},
        {"role": "assistant", "content": "a1"},
        {"role": "user", "content": "q2"},
        {"role": "assistant", "content": "a2"},
    ]


def test_history_none_or_unknown_is_empty() -> None:
    m = SessionMemory(2, 10, 100)
    assert m.history(None, now=1.0) == []
    assert m.history("nope", now=1.0) == []


def test_max_turns_keeps_only_the_last_n() -> None:
    m = SessionMemory(max_turns=2, max_sessions=10, ttl_seconds=100)
    for i in range(4):
        m.record("s", f"q{i}", f"a{i}", now=float(i))
    hist = [msg["content"] for msg in m.history("s", now=10.0)]
    assert hist == ["q2", "a2", "q3", "a3"]  # oldest two turns dropped


def test_max_sessions_evicts_lru() -> None:
    m = SessionMemory(max_turns=2, max_sessions=2, ttl_seconds=1000)
    m.record("a", "q", "a", now=1.0)
    m.record("b", "q", "a", now=2.0)
    m.record("c", "q", "a", now=3.0)  # over the cap -> the LRU ("a") is evicted
    assert m.history("a", now=4.0) == []
    assert m.history("b", now=4.0)
    assert m.history("c", now=4.0)


def test_lru_order_is_updated_on_access() -> None:
    m = SessionMemory(max_turns=2, max_sessions=2, ttl_seconds=1000)
    m.record("a", "q", "a", now=1.0)
    m.record("b", "q", "a", now=2.0)
    m.history("a", now=3.0)  # touch "a" -> "b" becomes the LRU
    m.record("c", "q", "a", now=4.0)  # evicts the LRU, now "b"
    assert m.history("b", now=5.0) == []
    assert m.history("a", now=5.0)


def test_ttl_expiry_drops_a_stale_session() -> None:
    m = SessionMemory(max_turns=2, max_sessions=10, ttl_seconds=10)
    m.record("s", "q", "a", now=1.0)
    assert m.history("s", now=5.0)  # still within the ttl
    assert m.history("s", now=100.0) == []  # idle past the ttl -> expired


def test_record_refreshes_lru_for_a_write_only_session() -> None:
    # A session written-to (never read) must still refresh its LRU slot, so the
    # actively-appended session is not the one evicted.
    m = SessionMemory(max_turns=2, max_sessions=2, ttl_seconds=1000)
    m.record("a", "q", "a", now=1.0)
    m.record("b", "q", "a", now=2.0)
    m.record("a", "q2", "a2", now=3.0)  # write to "a" -> "b" becomes the LRU
    m.record("c", "q", "a", now=4.0)  # evicts the LRU, now "b"
    assert m.history("b", now=5.0) == []
    assert m.history("a", now=5.0)


def test_record_expires_a_stale_session() -> None:
    # TTL is enforced on write too: appending to a long-idle session restarts it
    # rather than silently accumulating onto stale state.
    m = SessionMemory(max_turns=2, max_sessions=10, ttl_seconds=10)
    m.record("s", "first", "a1", now=1.0)
    m.record("s", "second", "a2", now=100.0)  # past the ttl -> "s" expired first
    users = [msg["content"] for msg in m.history("s", now=101.0) if msg["role"] == "user"]
    assert users == ["second"]


def test_reset_clears_one_session_only() -> None:
    m = SessionMemory(2, 10, 1000)
    m.record("a", "q", "a", now=1.0)
    m.record("b", "q", "a", now=1.0)
    m.reset("a")
    assert m.history("a", now=2.0) == []
    assert m.history("b", now=2.0)


def test_record_truncates_stored_text() -> None:
    # The question and the answer have DIFFERENT budgets. Both are bounded, but
    # the answer is bounded tighter, because history is threaded into every
    # later prompt and so the answer cap multiplies by max_turns.
    m = SessionMemory(2, 10, 1000)
    big = "x" * 5000
    m.record("s", big, big, now=1.0)
    stored = m.history("s", now=2.0)
    question = next(msg["content"] for msg in stored if msg["role"] == "user")
    answer = next(msg["content"] for msg in stored if msg["role"] == "assistant")
    assert len(question) == 4000
    assert len(answer) == 1500


def test_record_with_no_session_id_is_a_noop() -> None:
    m = SessionMemory(2, 10, 1000)
    m.record("", "q", "a", now=1.0)
    assert m.history("", now=2.0) == []


def test_bad_bounds_raise() -> None:
    with pytest.raises(ValueError):
        SessionMemory(0, 10, 100)
    with pytest.raises(ValueError):
        SessionMemory(2, 0, 100)
    with pytest.raises(ValueError):
        SessionMemory(2, 10, 0)


def test_a_stored_answer_is_capped_tighter_than_the_delivery_cap() -> None:
    # What is delivered and what is remembered are different budgets. Measured
    # from the request log: Finnish runs 2.69 chars per token, English 4.79, so
    # at max_turns=6 raising the delivered cap from 512 to 1024 tokens would
    # have taken six turns of history from roughly 4,400 to roughly 7,500 tokens
    # against an 8,192 context that also holds the system prompt, the retrieved
    # chunks and the new question. History would crowd out the grounding it
    # exists to support, and the eviction that follows is silent.
    m = SessionMemory(6, 10, 600)
    m.record("s", "q", "x" * 9000, now=0.0)
    answer = next(
        msg["content"] for msg in m.history("s", now=1.0) if msg["role"] == "assistant"
    )
    assert len(answer) == 1500
