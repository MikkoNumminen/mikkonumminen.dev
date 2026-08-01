"""In-process per-session conversation memory (Phase 4).

The backend remembers the prior turn(s) of a session and threads them into the
next prompt, so a follow-up ("yes" / "tell me more") has a referent. Bounded on
every axis so it can never become an unbounded-growth or abuse vector: at most
`max_turns` turns per session, at most `max_sessions` sessions (least-recently-used
evicted), and a session expires after `ttl_seconds` of inactivity. NOT persistent —
session-scoped, resettable (Phase 6's /clear), and cleared on restart.

Like ratelimit/usage this is single-worker in-process state: there is no `await`
between the read and the write of a session, so the dict operations are atomic
under the event loop and need no lock. The caller passes `now` (time.monotonic),
so the whole thing is deterministic and unit-tested without sleeping.
"""

from __future__ import annotations

from collections import OrderedDict, deque
from dataclasses import dataclass

# Stored query/answer are capped so one turn can't bloat the prompt or memory: the
# question is already INPUT_MAX_CHARS-bounded and the answer LLM_NUM_PREDICT-bounded,
# but this is a hard backstop independent of those.
_MAX_STORED_CHARS = 4000

# The ANSWER gets a tighter cap than that backstop, and it is deliberately
# decoupled from LLM_NUM_PREDICT: what is DELIVERED and what is REMEMBERED are
# different budgets.
#
# History is threaded into every later prompt, so the answer cap multiplies.
# Measured from the request log: Finnish runs 2.69 chars per token and English
# 4.79, so at MEMORY_MAX_TURNS=6 raising the answer cap from 512 to 1024 would
# have taken six turns of history from roughly 4,100-4,400 tokens to roughly
# 6,400-7,500 — against an 8,192 context that also has to hold the system
# prompt, the retrieved chunks and the new question. History would have started
# crowding out the grounding it exists to support, and the eviction that follows
# is silent.
#
# 1500 chars keeps six turns of history inside the budget the OLD cap produced
# (Finnish ~5,100 tokens against ~4,900 before; English ~3,000 against ~4,100),
# so the delivered answer doubles without the prompt following it. Memory exists
# to carry the TOPIC, not to replay the answer: the expansion path re-retrieves
# rather than reading the stored text back.
_MAX_STORED_ANSWER_CHARS = 1500


@dataclass
class _Session:
    turns: deque[tuple[str, str]]  # (user_query, assistant_answer), oldest-first
    last_access: float


class SessionMemory:
    """Bounded, resettable per-session conversation memory."""

    def __init__(self, max_turns: int, max_sessions: int, ttl_seconds: float) -> None:
        if max_turns <= 0 or max_sessions <= 0 or ttl_seconds <= 0:
            raise ValueError("max_turns, max_sessions, ttl_seconds must be positive")
        self._max_turns = max_turns
        self._max_sessions = max_sessions
        self._ttl = ttl_seconds
        # OrderedDict as an LRU: the front is least-recently-used, the back most.
        self._sessions: OrderedDict[str, _Session] = OrderedDict()

    def _expire(self, now: float) -> None:
        """Drop sessions idle longer than the TTL (bounds memory by time)."""
        cutoff = now - self._ttl
        stale = [sid for sid, s in self._sessions.items() if s.last_access < cutoff]
        for sid in stale:
            del self._sessions[sid]

    def history(self, session_id: str | None, now: float) -> list[dict[str, str]]:
        """The session's prior turns as oldest-first role/content messages, ready to
        thread between the system prompt and the current question. Empty for a
        None/unknown/expired session."""
        if not session_id:
            return []
        self._expire(now)
        session = self._sessions.get(session_id)
        if session is None:
            return []
        session.last_access = now
        self._sessions.move_to_end(session_id)
        messages: list[dict[str, str]] = []
        for user, assistant in session.turns:
            messages.append({"role": "user", "content": user})
            messages.append({"role": "assistant", "content": assistant})
        return messages

    def record(self, session_id: str, query: str, answer: str, now: float) -> None:
        """Append one (question, answer) turn, keeping only the last `max_turns`.

        Creates the session if new; refreshes its last-access; evicts the
        least-recently-used session(s) once over `max_sessions`. A no-op for an
        empty session id (the single-turn path).
        """
        if not session_id:
            return
        self._expire(now)
        session = self._sessions.get(session_id)
        if session is None:
            session = _Session(turns=deque(maxlen=self._max_turns), last_access=now)
            self._sessions[session_id] = session
        # deque(maxlen) drops the oldest turn automatically when full.
        session.turns.append(
            (query[:_MAX_STORED_CHARS], answer[:_MAX_STORED_ANSWER_CHARS])
        )
        session.last_access = now
        self._sessions.move_to_end(session_id)
        while len(self._sessions) > self._max_sessions:
            self._sessions.popitem(last=False)  # evict the LRU session

    def reset(self, session_id: str) -> None:
        """Drop a session entirely (Phase 6's /clear); no-op for an unknown id."""
        self._sessions.pop(session_id, None)
