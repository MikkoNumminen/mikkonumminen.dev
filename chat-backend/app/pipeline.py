"""The /chat orchestration as an injectable async event stream.

Embed query -> retrieve top-k -> assemble a grounded prompt -> stream the LLM ->
emit SSE events: `sources` first (so the terminal can render the `-> projects/x`
refs immediately), then a `token` per chunk, then `done`. Retrieval or
generation failures become a single `error` event and end the stream cleanly —
the frontend degrades to scripted-only rather than showing a broken chat box.

Dependencies (embedder, db, llm) are injected as Protocols, so the whole flow is
unit-tested with fakes; the heavy concrete classes are wired only in `main`.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Protocol

from . import sse
from .guardrails import WEAK_RETRIEVAL_REPLY, is_weak_retrieval
from .prompts import build_messages
from .retrieval import (
    SupportsEmbedQuery,
    SupportsSearch,
    retrieve,
    to_context,
    to_source_refs,
)


class SupportsStreamChat(Protocol):
    def stream_chat(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]: ...


async def chat_event_stream(
    query: str,
    history: Sequence[Mapping[str, str]],
    *,
    embedder: SupportsEmbedQuery,
    db: SupportsSearch,
    llm: SupportsStreamChat,
    top_k: int,
    weak_retrieval_distance: float,
) -> AsyncIterator[str]:
    try:
        chunks = await retrieve(embedder, db, query, top_k)
    except Exception:
        yield sse.sse_error("retrieval unavailable")
        return

    # Guardrail: when retrieval is empty or every chunk is too far to be
    # relevant, refuse deterministically WITHOUT calling the model — a clearly
    # off-topic question can never be answered from hallucinated content. No
    # sources are cited because none were relevant.
    if is_weak_retrieval(chunks, weak_retrieval_distance):
        yield sse.sse_sources([])
        yield sse.sse_token(WEAK_RETRIEVAL_REPLY)
        yield sse.sse_done()
        return

    # Sources up front: the terminal renders them while tokens stream.
    yield sse.sse_sources(to_source_refs(chunks))

    messages = build_messages(query, to_context(chunks), history)
    try:
        async for token in llm.stream_chat(messages):
            yield sse.sse_token(token)
    except Exception:
        yield sse.sse_error("generation unavailable")
        return

    yield sse.sse_done()
