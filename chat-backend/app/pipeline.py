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

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping, Sequence
from typing import Protocol

from . import sse

logger = logging.getLogger("chat")

# Shown verbatim (not LLM-generated) when every generation slot is taken and the
# request can't acquire one within the timeout. A clean, friendly shed beats
# queueing behind a slow generation on the single local GPU.
LLM_BUSY_REPLY = (
    "I'm handling another question right now — give me a moment and try again."
)

# Called once after a generation completes, with (completion_tokens, latency_ms),
# so the caller can record usage. Injected by `main`; left None in tests. Counting
# the streamed token EVENTS (not asking Ollama for a usage object) keeps the LLM
# client contract unchanged and is safe under concurrent requests — no shared
# per-client usage state to race on while friends hit the chat at once.
UsageRecorder = Callable[[int, int], Awaitable[None]]
from .guardrails import (
    EXPANSION_OFFER,
    GENERATIVE_REPLY,
    WEAK_RETRIEVAL_REPLY,
    is_expansion_request,
    is_generative_request,
    is_translation_request,
    is_weak_retrieval,
)
from .prompts import build_messages
from .query_projects import detect_projects
from .request_log import RequestLogger
from .retrieval import (
    SupportsEmbedQuery,
    SupportsSearch,
    retrieve,
    retrieve_narrative,
    to_context,
    to_source_refs,
)

# Fed to the model as the question on an EXPANSION turn: the prior topic comes from
# the threaded memory; this directs the model to go deeper using ONLY the narrative.
_EXPANSION_DIRECTIVE = (
    "Tell me more about the previous topic, in more depth, using ONLY the "
    "development narrative provided in the context above."
)


def _last_user_message(history: Sequence[Mapping[str, str]]) -> str | None:
    """The most recent user turn in the threaded history, or None."""
    for turn in reversed(history):
        if turn.get("role") == "user" and turn.get("content"):
            return turn.get("content")
    return None


def _sole_project(text: str | None) -> str | None:
    """The single project a message names, or None when zero or several do — so
    expansion and the offer only fire when the topic is unambiguous."""
    if not text:
        return None
    projects = detect_projects(text)
    return next(iter(projects)) if len(projects) == 1 else None


class SupportsStreamChat(Protocol):
    def stream_chat(self, messages: Sequence[dict[str, str]]) -> AsyncIterator[str]: ...


# The terminal renders raw text, so any markdown the model emits despite the
# system prompt (`**bold**`, `` `code` ``) would show as literal characters.
# Strip those markers from each streamed token — safe per token because they are
# single characters with no cross-token state (a `**` split across two tokens
# still loses each `*`). `#` is deliberately NOT stripped: it occurs in real
# content (e.g. "C#").
def _strip_markup(text: str) -> str:
    return text.replace("*", "").replace("`", "")


async def chat_event_stream(
    query: str,
    history: Sequence[Mapping[str, str]],
    *,
    embedder: SupportsEmbedQuery,
    db: SupportsSearch,
    llm: SupportsStreamChat,
    top_k: int,
    weak_retrieval_distance: float,
    force_english: bool = True,
    hybrid: bool = False,
    rrf_k: int = 60,
    dense_weight: float = 1.0,
    lexical_weight: float = 1.0,
    project_filter_strict: bool = False,
    on_complete: UsageRecorder | None = None,
    on_answer: Callable[[str, str], Awaitable[None]] | None = None,
    semaphore: asyncio.Semaphore | None = None,
    acquire_timeout: float = 0.5,
    log_request: RequestLogger | None = None,
    role: str = "public",
    allowed_classifications: Sequence[str] | None = None,
    disclosure_enabled: bool = True,
) -> AsyncIterator[str]:
    start = time.monotonic()

    # Generative-intent gate: a request to WRITE creative/generic content (poem,
    # story, song, ...) is out of scope. When it names an on-corpus topic it slips
    # past the retrieval gate below, and a small local model won't reliably refuse
    # it from the prompt alone — so decline deterministically before any retrieval
    # or generation. No GPU touched, no sources cited.
    if is_generative_request(query) or is_translation_request(query):
        if log_request is not None:
            log_request(query, [], True, GENERATIVE_REPLY, role, {})
        yield sse.sse_sources([])
        yield sse.sse_token(GENERATIVE_REPLY)
        yield sse.sse_done()
        return

    # Progressive disclosure (Phase 5): a topic-less "tell me more" expands into the
    # prior topic's precomputed narrative (the topic resolved via the threaded
    # memory); every other question takes the normal concise-answer path.
    # `effective_query` is what the model is asked — the expansion directive on an
    # expansion turn, else the original question.
    expansion = False
    effective_query = query
    try:
        if disclosure_enabled and is_expansion_request(query):
            prior = _last_user_message(history)
            project = _sole_project(prior)
            narrative = (
                await retrieve_narrative(
                    embedder,
                    db,
                    prior or query,
                    project,
                    top_k,
                    allowed_classifications=allowed_classifications,
                )
                if project is not None
                else []
            )
            if narrative:
                expansion = True
                chunks = narrative
                effective_query = _EXPANSION_DIRECTIVE
        if not expansion:
            chunks = await retrieve(
                embedder,
                db,
                query,
                top_k,
                hybrid=hybrid,
                rrf_k=rrf_k,
                dense_weight=dense_weight,
                lexical_weight=lexical_weight,
                project_filter_strict=project_filter_strict,
                allowed_classifications=allowed_classifications,
            )
    except Exception:
        yield sse.sse_error("retrieval unavailable")
        return

    # `chunks` may include a prose anchor appended by retrieve() when the top-k is
    # all code (see retrieval._with_prose_anchor). It both feeds the prose-anchored
    # gate below AND, when the gate passes, intentionally grounds the answer — so a
    # deep-code answer is backed by the project's own description and cites it.
    distances = [chunk.distance for chunk in chunks]
    # Per-classification counts of what surfaced — the audit trail's "which classes
    # of data did this retrieval touch". The role filter has already excluded any
    # class this role cannot see, so these are only ever permitted classes.
    class_counts: dict[str, int] = {}
    for chunk in chunks:
        class_counts[chunk.classification] = (
            class_counts.get(chunk.classification, 0) + 1
        )

    # Guardrail: when retrieval is empty or every chunk is too far to be
    # relevant, refuse deterministically WITHOUT calling the model — a clearly
    # off-topic question can never be answered from hallucinated content. No
    # sources are cited because none were relevant.
    if is_weak_retrieval(chunks, weak_retrieval_distance):
        if log_request is not None:
            log_request(
                query, distances, True, WEAK_RETRIEVAL_REPLY, role, class_counts
            )
        yield sse.sse_sources([])
        yield sse.sse_token(WEAK_RETRIEVAL_REPLY)
        yield sse.sse_done()
        return

    # Concurrency gate around generation ONLY (retrieval and the weak-retrieval
    # refusal above never touch the GPU). One local GPU serves generation: bound
    # how many requests generate at once and shed the overflow with a clean
    # "busy" reply rather than queueing behind a slow generation, which would
    # stack timeouts and risk an OOM. When no semaphore is injected (unit tests)
    # generation runs unguarded.
    acquired = False
    if semaphore is not None:
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=acquire_timeout)
            acquired = True
        except TimeoutError:
            if log_request is not None:
                log_request(query, distances, True, LLM_BUSY_REPLY, role, class_counts)
            yield sse.sse_sources([])
            yield sse.sse_token(LLM_BUSY_REPLY)
            yield sse.sse_done()
            return

    try:
        # Sources up front: the terminal renders them while tokens stream.
        yield sse.sse_sources(to_source_refs(chunks))

        messages = build_messages(
            effective_query, to_context(chunks), history, force_english=force_english
        )
        tokens = 0
        response_parts: list[str] = []
        try:
            async for token in llm.stream_chat(messages):
                cleaned = _strip_markup(token)
                if cleaned:
                    tokens += 1
                    response_parts.append(cleaned)
                    yield sse.sse_token(cleaned)
        except Exception:
            yield sse.sse_error("generation unavailable")
            return

        # Progressive-disclosure offer: after a normal (non-expansion) answer about a
        # single project that HAS a narrative, offer to go deeper. A deterministic
        # suffix (never LLM-generated); the concise answer came FIRST, so value is
        # never gated behind a "short or long?" question. Kept out of response_parts
        # so memory and the log store the substantive answer, not the UX nudge.
        # Guarded — the offer is a nicety and must never break a delivered answer.
        if disclosure_enabled and not expansion:
            offer_project = _sole_project(query)
            if offer_project is not None:
                try:
                    if await db.has_narrative(offer_project, allowed_classifications):
                        yield sse.sse_token("\n\n" + EXPANSION_OFFER)
                except Exception:
                    logger.exception("offer has_narrative check failed")

        yield sse.sse_done()

        # The request log records a real answer (gated=False) with its full text —
        # paired with the gate-fired lines above, this tunes WEAK_RETRIEVAL_DISTANCE
        # (how often relevant retrieval is refused vs answered) and is a readable
        # record of what was asked and how the model answered.
        if log_request is not None:
            log_request(
                query, distances, False, "".join(response_parts), role, class_counts
            )

        # Thread this completed turn into session memory so a follow-up ("tell me
        # more") has a referent. Only a real, fully-streamed answer is remembered —
        # the gate refusals, the busy shed, and the generation-error return all
        # leave before here. Guarded so a memory failure can't break a delivered
        # answer.
        if on_answer is not None:
            try:
                await on_answer(query, "".join(response_parts))
            except Exception:
                logger.exception("memory on_answer failed")

        # Record usage only on a real, fully-streamed generation — the
        # weak-retrieval refusal above never reaches here (the model wasn't
        # called), and a mid-stream error returns early, so the metric stays
        # "answers the model actually produced". Guarded so a telemetry failure
        # can't break a delivered answer.
        if on_complete is not None:
            latency_ms = int((time.monotonic() - start) * 1000)
            try:
                await on_complete(tokens, latency_ms)
            except Exception:
                logger.exception("usage on_complete failed")
    finally:
        # Release on every exit — normal completion, the generation-error early
        # return, or the consumer closing the stream early (GeneratorExit runs
        # this finally) — so a permit can never leak and wedge the gate.
        # `acquired` is only set under `semaphore is not None`; the explicit check
        # keeps that invariant legible to the type checker too.
        if acquired and semaphore is not None:
            semaphore.release()
