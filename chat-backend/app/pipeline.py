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
LLM_BUSY_REPLY_FI = (
    "Vastaan juuri toiseen kysymykseen — odota hetki ja yritä uudelleen."
)

# Called once after a generation completes, with (completion_tokens, latency_ms),
# so the caller can record usage. Injected by `main`; left None in tests. Counting
# the streamed token EVENTS (not asking Ollama for a usage object) keeps the LLM
# client contract unchanged and is safe under concurrent requests — no shared
# per-client usage state to race on while friends hit the chat at once.
UsageRecorder = Callable[[int, int], Awaitable[None]]
from .guardrails import (
    COURTESY_REPLY,
    COURTESY_REPLY_FI,
    ENGLISH_ONLY_HINT,
    EXPANSION_OFFER,
    EXPANSION_OFFER_FI,
    GENERATIVE_REPLY,
    GENERATIVE_REPLY_FI,
    GREETING_REPLY,
    GREETING_REPLY_FI,
    WEAK_RETRIEVAL_REPLY,
    WEAK_RETRIEVAL_REPLY_FI,
    answer_language,
    is_expansion_request,
    is_finnish_smalltalk,
    is_generative_request,
    is_personal_trivia,
    is_translation_request,
    is_weak_retrieval,
    looks_finnish,
    looks_non_english,
    research_coverage_footer,
    smalltalk_route,
    unsupported_years,
)
from .prompts import build_messages
from .query_projects import detect_projects, restore_entities, wants_cv_intent
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

# Translate-for-retrieval (RAG_TRANSLATE_RETRIEVAL). The embedder and the lexical
# index are English-only, so a Finnish query lands on the right chunk only by
# luck — the Finnish-magnet residual measured in the blind study. When the router
# says Finnish, ask the resident model for a one-line English translation and use
# it FOR RETRIEVAL ONLY; generation still answers the original Finnish question.
# Strictly best-effort: a busy GPU, a failed call, or a suspect translation all
# fall back to the original query — translation may improve retrieval, never
# break the request.
_TRANSLATE_SYSTEM = (
    "You are a translator. Translate the user's message to English. "
    "Output ONLY the English translation — no explanations, no quotes."
)
# A faithful one-line translation is about query-length; a multiple of it plus
# slack means the model ignored the instruction and wrote prose — discard rather
# than embed an essay as the retrieval query.
_MAX_TRANSLATION_FACTOR = 4
_MAX_TRANSLATION_SLACK = 80


async def _translate_for_retrieval(
    llm: SupportsStreamChat,
    query: str,
    semaphore: asyncio.Semaphore | None,
    acquire_timeout: float,
) -> str | None:
    """English translation of `query` for embedding/lexical search, or None.

    Takes a generation slot under the SAME semaphore as the answer (a translation
    is a generation; the single local GPU must never run two at once), released
    before retrieval so the slots never overlap. None on a busy GPU, an error, or
    a translation that doesn't look like a translation — the caller then retrieves
    with the original query, exactly the pre-feature behaviour.
    """
    acquired = False
    if semaphore is not None:
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=acquire_timeout)
            acquired = True
        except TimeoutError:
            return None
    try:
        parts: list[str] = []
        # temperature=0: a translation is a lookup, not a composition. At the
        # chat temperature (0.4) the same question translates differently per
        # request, and everything downstream (retrieval, CV route, the gate)
        # inherits that variance - measured live as an intermittent refusal of
        # a question that usually answers.
        async for token in llm.stream_chat(
            [
                {"role": "system", "content": _TRANSLATE_SYSTEM},
                {"role": "user", "content": query},
            ],
            temperature=0.0,
        ):
            parts.append(token)
    except Exception:
        logger.exception("retrieval translation failed")
        return None
    finally:
        if acquired and semaphore is not None:
            semaphore.release()
    raw = "".join(parts).strip()
    # The model reliably translates but not reliably STOPS: live verification
    # showed Poro appending commentary after a perfect first-line translation
    # ("What is Miko's work experience?" followed by "However, considering…").
    # A one-line translation is the contract — keep only the first non-empty
    # line, then apply the runaway cap to what remains.
    translated = (
        next((line.strip() for line in raw.splitlines() if line.strip()), "")
        .strip('"')
        .strip()
    )
    max_len = _MAX_TRANSLATION_FACTOR * len(query) + _MAX_TRANSLATION_SLACK
    if not translated or len(translated) > max_len:
        return None
    return translated


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
    def stream_chat(
        self,
        messages: Sequence[dict[str, str]],
        *,
        usage_out: dict[str, int] | None = None,
        temperature: float | None = None,
    ) -> AsyncIterator[str]: ...


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
    think: bool | None = None,
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
    context_window: int = 0,
    exclude_doc_types: Sequence[str] | None = None,
    diversify_max_per_project: int | None = None,
    research_coverage_top_n: int = 0,
    model_name: str = "",
    allow_finnish: bool = False,
    translate_retrieval: bool = False,
) -> AsyncIterator[str]:
    start = time.monotonic()

    # RAG_ALLOW_FINNISH (experiment, default off): a Finnish-looking query is
    # answered in Finnish instead of being forced to English. The SAME detector
    # gates the answer and the acceptance language check (guardrails.looks_finnish),
    # so routing and the test can't disagree. When off (or the query isn't Finnish)
    # this is False and every path below is byte-identical to the English-only flow.
    answer_in_finnish = allow_finnish and looks_finnish(query)

    # Small-talk fast path: a standalone greeting or thanks is ANSWERED by template
    # with NO retrieval and NO model. Conservative whole-message match — a real
    # question that merely opens with "hi"/"thanks" falls through to the pipeline.
    # Logged with its route; model + token counts stay None (no inference ran).
    st_route = smalltalk_route(query)
    if st_route is not None:
        # A bare greeting is too short for the language detector; the matched
        # phrase's own language picks the template (gated on the same flag as
        # the Finnish answer path).
        st_finnish = allow_finnish and is_finnish_smalltalk(query)
        if st_route == "greeting":
            reply = GREETING_REPLY_FI if st_finnish else GREETING_REPLY
        else:
            reply = COURTESY_REPLY_FI if st_finnish else COURTESY_REPLY
        if log_request is not None:
            log_request(
                query,
                [],
                st_route,
                reply,
                role,
                {},
                model=None,
                latency_ms=int((time.monotonic() - start) * 1000),
            )
        yield sse.sse_sources([])
        yield sse.sse_token(reply)
        yield sse.sse_done()
        return

    # Generative-intent gate: a request to WRITE creative/generic content (poem,
    # story, song, ...) is out of scope. When it names an on-corpus topic it slips
    # past the retrieval gate below, and a small local model won't reliably refuse
    # it from the prompt alone — so decline deterministically before any retrieval
    # or generation. No GPU touched, no sources cited.
    generative = is_generative_request(query)
    trivia = is_personal_trivia(query)
    if generative or trivia or is_translation_request(query):
        # Personal trivia gets the gate's own "nothing on that" reply (it is a
        # missing-from-corpus fact, not an out-of-scope TASK); creative and
        # translation asks keep the task-decline wording.
        route = (
            "generative"
            if generative
            else ("personal_trivia" if trivia else "translation")
        )
        if trivia and not generative:
            decline_reply = (
                WEAK_RETRIEVAL_REPLY_FI if answer_in_finnish else WEAK_RETRIEVAL_REPLY
            )
        else:
            decline_reply = (
                GENERATIVE_REPLY_FI if answer_in_finnish else GENERATIVE_REPLY
            )
        if log_request is not None:
            log_request(
                query,
                [],
                route,
                decline_reply,
                role,
                {},
                model=None,
                latency_ms=int((time.monotonic() - start) * 1000),
            )
        yield sse.sse_sources([])
        yield sse.sse_token(decline_reply)
        if looks_non_english(query) and not answer_in_finnish:
            yield sse.sse_token(ENGLISH_ONLY_HINT)
        yield sse.sse_done()
        return

    # Progressive disclosure (Phase 5): a topic-less "tell me more" expands into the
    # prior topic's precomputed narrative (the topic resolved via the threaded
    # memory); every other question takes the normal concise-answer path.
    # `effective_query` is what the model is asked — the expansion directive on an
    # expansion turn, else the original question.
    expansion = False
    effective_query = query
    # Assigned on the normal path below (possibly to a translation); initialized
    # here so the CV-intent gate override can read it on the EXPANSION path too,
    # where no retrieval query is ever built.
    retrieval_query = query
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
            # RAG_TRANSLATE_RETRIEVAL (default off): retrieve with an English
            # translation of a Finnish question so the English-only embedder and
            # lexical index can actually land on the right chunks; the model still
            # answers the ORIGINAL question (and in Finnish — gated on the same
            # detection). Best-effort: any failure falls back to the original
            # query, byte-identical to the flag-off flow.
            retrieval_query = query
            if translate_retrieval and answer_in_finnish:
                translated = await _translate_for_retrieval(
                    llm, query, semaphore, acquire_timeout
                )
                if translated is not None:
                    # The model translates meaning-bearing proper nouns away
                    # ("kasvulabs" -> "Growth Labs") no matter what the prompt
                    # says; restore the canonical corpus spellings the original
                    # question carried so retrieval keeps its exact-term signal.
                    retrieval_query = restore_entities(query, translated)
            chunks = await retrieve(
                embedder,
                db,
                retrieval_query,
                top_k,
                # Intent (CV route, project aliases) must see the ORIGINAL
                # question too: translation wording can drop the intent-bearing
                # phrase, and the original always carries the Finnish forms the
                # detectors know.
                intent_query=query if retrieval_query is not query else None,
                hybrid=hybrid,
                rrf_k=rrf_k,
                dense_weight=dense_weight,
                lexical_weight=lexical_weight,
                project_filter_strict=project_filter_strict,
                allowed_classifications=allowed_classifications,
                exclude_doc_types=exclude_doc_types,
                diversify_max_per_project=diversify_max_per_project,
                research_coverage_top_n=research_coverage_top_n,
            )
    except Exception:
        logger.exception("retrieval failed")
        # Record the failure so the operational log counts error events (latency
        # spent, no GPU touched) — a health/latency log that drops every error is
        # blind to exactly the requests worth triaging. route="error" (not gated,
        # not answered); no distances/classes since retrieval never returned.
        if log_request is not None:
            log_request(
                query,
                [],
                "error",
                "",
                role,
                {},
                model=None,
                latency_ms=int((time.monotonic() - start) * 1000),
            )
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
        class_counts[chunk.classification] = class_counts.get(chunk.classification, 0) + 1

    # Guardrail: when retrieval is empty or every chunk is too far to be
    # relevant, refuse deterministically WITHOUT calling the model — a clearly
    # off-topic question can never be answered from hallucinated content. No
    # sources are cited because none were relevant.
    # Deterministic intent overrides the statistical gate: when the CV route
    # fired (the question IS about Mikko's work experience, by construction) and
    # the CV chunks are in the context, refusing on cosine distance is wrong -
    # a second-person phrasing ("what work experience do YOU have?") embeds
    # ~0.47 against a third-person corpus and straddled the 0.45 gate, measured
    # live as a deterministic refusal of an answerable question. Off-corpus
    # questions never trip the CV route, so they keep full gate protection.
    cv_grounded = wants_cv_intent(query, retrieval_query) and any(
        c.source == "cv.md" for c in chunks
    )
    if is_weak_retrieval(chunks, weak_retrieval_distance) and not cv_grounded:
        weak_reply = (
            WEAK_RETRIEVAL_REPLY_FI if answer_in_finnish else WEAK_RETRIEVAL_REPLY
        )
        if log_request is not None:
            log_request(
                query,
                distances,
                "weak_retrieval",
                weak_reply,
                role,
                class_counts,
                model=None,
                latency_ms=int((time.monotonic() - start) * 1000),
            )
        yield sse.sse_sources([])
        yield sse.sse_token(weak_reply)
        if looks_non_english(query) and not answer_in_finnish:
            yield sse.sse_token(ENGLISH_ONLY_HINT)
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
                busy_reply = LLM_BUSY_REPLY_FI if answer_in_finnish else LLM_BUSY_REPLY
                log_request(
                    query,
                    distances,
                    "busy",
                    busy_reply,
                    role,
                    class_counts,
                    model=None,
                    latency_ms=int((time.monotonic() - start) * 1000),
                )
            yield sse.sse_sources([])
            yield sse.sse_token(
                LLM_BUSY_REPLY_FI if answer_in_finnish else LLM_BUSY_REPLY
            )
            yield sse.sse_done()
            return

    try:
        # Sources up front: the terminal renders them while tokens stream.
        yield sse.sse_sources(to_source_refs(chunks))

        # With RAG_ALLOW_FINNISH on and FORCE_ENGLISH off, a NON-Finnish
        # question used to get no language anchor at all - and Poro, tuned
        # Finnish-first, drifted to Finnish on English questions (measured in
        # the 2026-07-08 baseline). The Finnish path anchors Finnish; every
        # other path anchors English.
        messages = build_messages(
            effective_query,
            to_context(chunks),
            history,
            force_english=force_english or (allow_finnish and not answer_in_finnish),
            answer_in_finnish=answer_in_finnish,
            think=think,
        )
        tokens = 0
        response_parts: list[str] = []
        usage: dict[str, int] = {}
        try:
            async for token in llm.stream_chat(messages, usage_out=usage):
                cleaned = _strip_markup(token)
                if cleaned:
                    tokens += 1
                    response_parts.append(cleaned)
                    yield sse.sse_token(cleaned)
        except Exception:
            logger.exception("generation failed")
            # A generation that died mid-stream consumed a GPU slot and latency;
            # log it as an error event (model=None — no usable inference) with the
            # distances/classes already computed, so failed generations show up in
            # the latency/health log.
            if log_request is not None:
                log_request(
                    query,
                    distances,
                    "error",
                    "".join(response_parts),
                    role,
                    class_counts,
                    model=None,
                    latency_ms=int((time.monotonic() - start) * 1000),
                )
            yield sse.sse_error("generation unavailable")
            return

        # Progressive-disclosure offer: after a normal (non-expansion) answer about a
        # single project that HAS a narrative, offer to go deeper. A deterministic
        # suffix (never LLM-generated); the concise answer came FIRST, so value is
        # never gated behind a "short or long?" question. Kept out of response_parts
        # so memory and the log store the substantive answer, not the UX nudge.
        # Guarded — the offer is a nicety and must never break a delivered answer.
        # A research-coverage query can name the portfolio via its "rag"/"chat"
        # aliases, so _sole_project would return "portfolio" and the offer would
        # fire ALONGSIDE the completeness footer below — a double suffix (and
        # accepting the offer expands the portfolio BUILD narrative, not the
        # research). The two deterministic suffixes are mutually exclusive here:
        # when the coverage layer injected, it owns the suffix and the offer stands
        # down.
        coverage_injected = any(c.is_coverage for c in chunks)
        if disclosure_enabled and not expansion and not coverage_injected:
            offer_project = _sole_project(query)
            if offer_project is not None:
                try:
                    if await db.has_narrative(offer_project, allowed_classifications):
                        offer = (
                            EXPANSION_OFFER_FI if answer_in_finnish else EXPANSION_OFFER
                        )
                        yield sse.sse_token("\n\n" + offer)
                except Exception:
                    logger.exception("offer has_narrative check failed")

        # Completeness guarantee (research-coverage layer): the newest research was
        # forced into context, but Poro's synthesis can still drop it (measured: "I
        # don't have info on the latest research" with poro-findings at source #1).
        # When the answer didn't name it, append a deterministic pointer — the model
        # may add, never drop. Kept OUT of response_parts (like the offer above), so
        # memory/log store the substantive answer, not the nudge. Guarded: a nicety
        # must never break a delivered answer.
        try:
            footer = research_coverage_footer(
                chunks, "".join(response_parts), finnish=answer_in_finnish
            )
            if footer:
                yield sse.sse_token(footer)
        except Exception:
            logger.exception("research-coverage footer failed")

        # Context bar (Phase 6): the session's REAL fill — prompt_eval_count +
        # eval_count from the model's usage chunk, against the served context
        # window. context_window defaults to 0 (the value tests use to suppress the
        # frame; in production Settings.validate() guarantees it is positive), and an
        # older Ollama that streams no usage chunk leaves `usage` empty — so the
        # terminal only ever sees real numbers, never a fabricated one.
        if context_window > 0 and usage:
            used = usage.get("prompt", 0) + usage.get("completion", 0)
            yield sse.sse_context(used, context_window)

        yield sse.sse_done()

        # The request log records a real answer (gated=False) with its full text —
        # paired with the gate-fired lines above, this tunes WEAK_RETRIEVAL_DISTANCE
        # (how often relevant retrieval is refused vs answered) and is a readable
        # record of what was asked and how the model answered.
        if log_request is not None:
            answer_text = "".join(response_parts)
            log_request(
                query,
                distances,
                "answered",
                answer_text,
                role,
                class_counts,
                model=model_name,
                latency_ms=int((time.monotonic() - start) * 1000),
                prompt_eval_count=usage.get("prompt"),
                eval_count=usage.get("completion"),
                # Answer-quality observability: detected answer language (drift
                # rate) and any stated year absent from BOTH the retrieved
                # context and the question (the measured invented-fact class).
                answer_lang=answer_language(answer_text),
                invented_years=unsupported_years(
                    answer_text, [c.content for c in chunks] + [query]
                ),
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
