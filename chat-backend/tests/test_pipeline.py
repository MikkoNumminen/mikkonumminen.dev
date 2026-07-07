"""Tests for the /chat event-stream orchestration (all deps faked)."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Any

from app.guardrails import (
    COURTESY_REPLY,
    EXPANSION_OFFER,
    GREETING_REPLY,
    WEAK_RETRIEVAL_REPLY,
)
from app.pipeline import LLM_BUSY_REPLY, chat_event_stream


class FakeEmbedder:
    def embed_query(self, text: str) -> list[float]:
        return [0.0]


class FakeDB:
    def __init__(
        self,
        rows: list[dict[str, Any]],
        fail: bool = False,
        narratives: list[dict[str, Any]] | None = None,
        narrative_projects: Sequence[str] = (),
    ) -> None:
        self._rows = rows
        self._fail = fail
        self._narratives = narratives or []
        self._narrative_projects = set(narrative_projects)

    async def search(
        self,
        embedding: list[float],
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
        doc_types: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
        kinds: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        if self._fail:
            raise RuntimeError("db down")
        if doc_types and "narrative" in doc_types:
            rows = self._narratives
            if projects:
                rows = [r for r in rows if r.get("project") in projects]
            return rows[:top_k]
        rows = self._rows
        if kinds:
            rows = [r for r in rows if r.get("kind", "project") in kinds]
        return rows[:top_k]

    async def has_narrative(
        self, project: str, classifications: Sequence[str] | None = None
    ) -> bool:
        return project in self._narrative_projects

    async def search_lexical(
        self,
        query: str,
        top_k: int,
        projects: Sequence[str] | None = None,
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
    ) -> Sequence[Mapping[str, Any]]:
        if self._fail:
            raise RuntimeError("db down")
        return self._rows[:top_k]

    async def closest_prose(
        self,
        embedding: list[float],
        classifications: Sequence[str] | None = None,
        exclude_doc_types: Sequence[str] | None = None,
    ) -> Mapping[str, Any] | None:
        return next((r for r in self._rows if r.get("chunk_type") == "prose"), None)


class FakeLLM:
    def __init__(
        self,
        tokens: list[str],
        fail: bool = False,
        usage: dict[str, int] | None = None,
    ) -> None:
        self._tokens = tokens
        self._fail = fail
        self._usage = usage
        self.called = False
        self.messages: Sequence[dict[str, str]] = []

    async def stream_chat(
        self,
        messages: Sequence[dict[str, str]],
        *,
        usage_out: dict[str, int] | None = None,
    ) -> AsyncIterator[str]:
        self.called = True
        self.messages = list(messages)
        if self._fail:
            raise RuntimeError("llm down")
        for token in self._tokens:
            yield token
        if usage_out is not None and self._usage is not None:
            usage_out.update(self._usage)


def _row(
    source: str, distance: float = 0.1, project: str | None = None
) -> dict[str, Any]:
    return {
        "source": source,
        "title": source.upper(),
        "project": project,
        "content": f"about {source}",
        "distance": distance,
        "chunk_index": 0,
        "chunk_type": "prose",
    }


def _collect(
    query: str,
    *,
    db: FakeDB,
    llm: FakeLLM,
    top_k: int = 5,
    weak_distance: float = 0.7,
) -> list[str]:
    async def run() -> list[str]:
        gen = chat_event_stream(
            query,
            [],
            embedder=FakeEmbedder(),
            db=db,
            llm=llm,
            top_k=top_k,
            weak_retrieval_distance=weak_distance,
        )
        return [frame async for frame in gen]

    return asyncio.run(run())


def _events(frames: list[str]) -> list[str]:
    return [f.split("\n", 1)[0].removeprefix("event: ") for f in frames]


def _token_text(frames: list[str]) -> str:
    return "".join(
        json.loads(f.split("data: ", 1)[1])["text"]
        for f in frames
        if f.startswith("event: token")
    )


def test_happy_path_sources_then_tokens_then_done() -> None:
    llm = FakeLLM(["HRM ", "is great."])
    frames = _collect("what is hrm", db=FakeDB([_row("projects/hrm.md")]), llm=llm)
    assert _events(frames) == ["sources", "token", "token", "done"]
    sources_data = json.loads(frames[0].split("data: ", 1)[1])
    assert sources_data["sources"][0]["source"] == "projects/hrm.md"
    assert _token_text(frames) == "HRM is great."
    assert llm.called is True


# --- context bar (Phase 6) ---


def test_context_event_carries_real_usage() -> None:
    llm = FakeLLM(["HRM is great."], usage={"prompt": 120, "completion": 30})

    async def run() -> list[str]:
        gen = chat_event_stream(
            "what is hrm",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            context_window=4096,
        )
        return [frame async for frame in gen]

    frames = asyncio.run(run())
    ctx = [f for f in frames if f.startswith("event: context")]
    assert len(ctx) == 1
    assert json.loads(ctx[0].split("data: ", 1)[1]) == {"used": 150, "limit": 4096}


def test_no_context_event_without_a_window() -> None:
    # context_window defaults to 0 -> no context frame (never a fabricated number).
    llm = FakeLLM(["x"], usage={"prompt": 1, "completion": 1})
    frames = _collect("what is hrm", db=FakeDB([_row("projects/hrm.md")]), llm=llm)
    assert not any(f.startswith("event: context") for f in frames)


# --- English-only hint on refusals ---


def test_non_english_refusal_gets_an_english_hint() -> None:
    # A Finnish question with nothing to retrieve is refused; the bare refusal
    # gets a nudge to ask in English (corpus + answers are English-only).
    frames = _collect("kerro lisää projekteista", db=FakeDB([]), llm=FakeLLM([]))
    text = _token_text(frames)
    assert "I don't have anything on that" in text
    assert "answer in English" in text


def test_english_refusal_has_no_hint() -> None:
    frames = _collect("what is the airspeed of a swallow", db=FakeDB([]), llm=FakeLLM([]))
    text = _token_text(frames)
    assert "I don't have anything on that" in text
    assert "answer in English" not in text


# --- RAG_ALLOW_FINNISH (experiment, default off) ---


def _llm_messages(
    query: str, *, allow_finnish: bool, force_english: bool = True
) -> list[dict[str, str]]:
    """Run a normal answer turn and return the messages handed to the LLM, so the
    flag's effect on the prompt (English forcing vs Finnish anchor) is assertable."""
    llm = FakeLLM(["answer"])

    async def run() -> None:
        gen = chat_event_stream(
            query,
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            force_english=force_english,
            allow_finnish=allow_finnish,
        )
        async for _frame in gen:
            pass

    asyncio.run(run())
    return list(llm.messages)


_FI_QUERY = "Mitä teknologioita HRM käyttää, ja mikä on sen tietokanta?"


def test_flag_on_routes_finnish_query_to_a_finnish_answer() -> None:
    msgs = _llm_messages(_FI_QUERY, allow_finnish=True)
    system, user = msgs[0]["content"], msgs[-1]["content"]
    assert "ENTIRE reply in English" not in system
    assert "Respond ONLY in English" not in user
    assert "KOKO vastaus suomeksi" in user  # the Finnish closing anchor


def test_flag_off_leaves_finnish_query_forced_to_english() -> None:
    msgs = _llm_messages(_FI_QUERY, allow_finnish=False)  # default
    assert "ENTIRE reply in English" in msgs[0]["content"]
    assert msgs[-1]["content"].startswith("Respond ONLY in English")


def test_flag_on_does_not_affect_an_english_query() -> None:
    msgs = _llm_messages("What database does HRM use?", allow_finnish=True)
    assert "ENTIRE reply in English" in msgs[0]["content"]  # English query stays English
    assert "KOKO vastaus suomeksi" not in msgs[-1]["content"]


def test_flag_on_suppresses_english_hint_on_a_finnish_refusal() -> None:
    # A Finnish off-topic query gets the weak-retrieval refusal; with the flag on the
    # "ask in English" nudge is suppressed (Finnish is allowed). The flag-OFF control
    # is test_non_english_refusal_gets_an_english_hint.
    llm = FakeLLM([])

    async def run() -> list[str]:
        gen = chat_event_stream(
            "Mitä kuuluu projekteille, ja mikä niistä on paras?",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            allow_finnish=True,
        )
        return [frame async for frame in gen]

    text = _token_text(asyncio.run(run()))
    assert "I don't have anything on that" in text  # it did refuse
    assert "answer in English" not in text  # hint suppressed


# --- progressive disclosure (Phase 5) ---


def _collect_with(
    query: str,
    history: list[dict[str, str]],
    *,
    db: FakeDB,
    llm: FakeLLM,
    disclosure_enabled: bool = True,
) -> list[str]:
    async def run() -> list[str]:
        gen = chat_event_stream(
            query,
            history,
            embedder=FakeEmbedder(),
            db=db,
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            disclosure_enabled=disclosure_enabled,
        )
        return [frame async for frame in gen]

    return asyncio.run(run())


def test_expansion_reads_the_narrative_and_omits_the_offer() -> None:
    # "tell me more" after a prior HRM turn expands into HRM's narrative; the deep
    # answer is grounded in the narrative chunk and the offer is NOT re-appended.
    history = [
        {"role": "user", "content": "How does HRM handle multi-tenancy?"},
        {"role": "assistant", "content": "HRM uses a sessionId column."},
    ]
    narrative = _row("narratives/hrm.md", project="hrm")
    narrative["content"] = "HRM development arc: the sessionId multi-tenancy story."
    db = FakeDB(
        [_row("projects/hrm.md", project="hrm")],
        narratives=[narrative],
        narrative_projects=["hrm"],
    )
    llm = FakeLLM(["Deeper HRM answer."])
    frames = _collect_with("tell me more", history, db=db, llm=llm)
    assert "narratives/hrm.md" in frames[0]  # the narrative was the context
    joined = " ".join(m["content"] for m in llm.messages)
    assert "development arc" in joined  # the model saw the narrative
    assert EXPANSION_OFFER not in _token_text(frames)  # no offer — this IS the depth


def test_offer_appended_after_normal_answer_with_a_narrative() -> None:
    db = FakeDB([_row("projects/hrm.md", project="hrm")], narrative_projects=["hrm"])
    frames = _collect_with("how does hrm work", [], db=db, llm=FakeLLM(["HRM works."]))
    assert _token_text(frames).endswith(EXPANSION_OFFER)


def test_no_offer_when_the_project_has_no_narrative() -> None:
    db = FakeDB([_row("projects/hrm.md", project="hrm")], narrative_projects=[])
    frames = _collect_with("how does hrm work", [], db=db, llm=FakeLLM(["HRM works."]))
    assert EXPANSION_OFFER not in _token_text(frames)


def test_expansion_without_a_prior_topic_falls_through_to_normal() -> None:
    # "tell me more" with no resolvable prior topic answers the literal query
    # normally (no narrative, no crash, no offer).
    db = FakeDB([_row("projects/hrm.md", project="hrm")], narrative_projects=["hrm"])
    frames = _collect_with("tell me more", [], db=db, llm=FakeLLM(["A normal answer."]))
    assert _token_text(frames) == "A normal answer."


def test_disclosure_disabled_skips_offer_and_expansion() -> None:
    db = FakeDB([_row("projects/hrm.md", project="hrm")], narrative_projects=["hrm"])
    frames = _collect_with(
        "how does hrm work",
        [],
        db=db,
        llm=FakeLLM(["HRM works."]),
        disclosure_enabled=False,
    )
    assert _token_text(frames) == "HRM works."


def test_empty_retrieval_refuses_without_calling_the_model() -> None:
    llm = FakeLLM(["should not be used"])
    frames = _collect("obscure question", db=FakeDB([]), llm=llm)
    assert _events(frames) == ["sources", "token", "done"]
    assert json.loads(frames[0].split("data: ", 1)[1])["sources"] == []
    assert _token_text(frames) == WEAK_RETRIEVAL_REPLY
    assert llm.called is False  # the guardrail short-circuits generation


def test_far_only_retrieval_refuses_without_calling_the_model() -> None:
    # Chunks come back but the closest is beyond the weak threshold.
    llm = FakeLLM(["should not be used"])
    frames = _collect(
        "off topic", db=FakeDB([_row("cv.md", distance=0.95)]), llm=llm, weak_distance=0.7
    )
    assert _events(frames) == ["sources", "token", "done"]
    assert json.loads(frames[0].split("data: ", 1)[1])["sources"] == []
    assert _token_text(frames) == WEAK_RETRIEVAL_REPLY
    assert llm.called is False


def test_retrieval_failure_emits_error_and_stops() -> None:
    frames = _collect("q", db=FakeDB([], fail=True), llm=FakeLLM(["x"]))
    assert _events(frames) == ["error"]
    assert "retrieval" in json.loads(frames[0].split("data: ", 1)[1])["message"]


def test_generation_failure_emits_sources_then_error() -> None:
    frames = _collect("q", db=FakeDB([_row("cv.md")]), llm=FakeLLM([], fail=True))
    assert _events(frames) == ["sources", "error"]
    assert "generation" in json.loads(frames[1].split("data: ", 1)[1])["message"]


def test_markdown_markers_are_stripped_from_streamed_tokens() -> None:
    # The model emits markdown despite the prompt; the terminal renders raw text,
    # so it must arrive stripped — even when a `**` straddles two token chunks.
    llm = FakeLLM(["**HR", "M** ", "is ", "`great`", "."])
    frames = _collect("what is hrm", db=FakeDB([_row("projects/hrm.md")]), llm=llm)
    assert _token_text(frames) == "HRM is great."


def test_markup_only_token_is_dropped_not_emitted_empty() -> None:
    llm = FakeLLM(["Hello", "**", " world"])
    frames = _collect("q", db=FakeDB([_row("cv.md")]), llm=llm)
    # The "**" token collapses to empty and is skipped, not sent as a blank token.
    assert _events(frames) == ["sources", "token", "token", "done"]
    assert _token_text(frames) == "Hello world"


def test_hash_in_content_is_preserved() -> None:
    # `#` is NOT stripped — it appears in real tech names like "C#".
    llm = FakeLLM(["Built with C# ", "and .NET."])
    frames = _collect("tech", db=FakeDB([_row("projects/readlog.md")]), llm=llm)
    assert _token_text(frames) == "Built with C# and .NET."


def test_force_english_threads_into_the_assembled_messages() -> None:
    # The force_english flag must reach build_messages: when on, the system rule
    # AND the in-message directive are present; when off, neither is.
    captured: dict[str, Any] = {}

    class CapturingLLM:
        async def stream_chat(
            self,
            messages: Sequence[dict[str, str]],
            *,
            usage_out: dict[str, int] | None = None,
        ) -> AsyncIterator[str]:
            captured["messages"] = messages
            yield "ok"

    def collect(force_english: bool) -> None:
        async def run() -> None:
            gen = chat_event_stream(
                "kuka on mikko?",
                [],
                embedder=FakeEmbedder(),
                db=FakeDB([_row("cv.md")]),
                llm=CapturingLLM(),
                top_k=5,
                weak_retrieval_distance=0.7,
                force_english=force_english,
            )
            async for _ in gen:
                pass

        asyncio.run(run())

    collect(True)
    assert captured["messages"][-1]["content"].startswith("Respond ONLY in English")
    assert "ENTIRE reply in English" in captured["messages"][0]["content"]

    collect(False)
    assert "Respond ONLY in English" not in captured["messages"][-1]["content"]
    assert "ENTIRE reply in English" not in captured["messages"][0]["content"]


def test_busy_when_no_generation_slot_is_free() -> None:
    # All generation permits taken: the request is shed with a clean "busy"
    # reply and the model is NEVER called — shedding, not queueing.
    llm = FakeLLM(["should not be used"])

    async def run() -> list[str]:
        sem = asyncio.Semaphore(1)
        await sem.acquire()  # exhaust the only permit
        gen = chat_event_stream(
            "what is hrm",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            semaphore=sem,
            acquire_timeout=0.01,
        )
        return [frame async for frame in gen]

    frames = asyncio.run(run())
    assert _events(frames) == ["sources", "token", "done"]
    assert json.loads(frames[0].split("data: ", 1)[1])["sources"] == []
    assert _token_text(frames) == LLM_BUSY_REPLY
    assert llm.called is False


def _capture_log(sink: list[dict]):
    def capture_log(
        query: str,
        distances: list,
        route: str,
        response: str,
        role: str = "public",
        classifications: dict | None = None,
        *,
        model: str | None,
        latency_ms: int,
        prompt_eval_count: int | None = None,
        eval_count: int | None = None,
    ) -> None:
        sink.append(
            {
                "query": query,
                "route": route,
                "response": response,
                "model": model,
                "latency_ms": latency_ms,
                "prompt_eval_count": prompt_eval_count,
                "eval_count": eval_count,
                "distances": list(distances),
                "classifications": dict(classifications or {}),
            }
        )

    return capture_log


def test_busy_shed_calls_log_request() -> None:
    # When the semaphore is exhausted, log_request records the shed with
    # route="busy" (gated is derived) and no model/tokens (no inference ran).
    llm = FakeLLM(["should not be used"])
    log_calls: list[dict] = []

    async def run() -> list[str]:
        sem = asyncio.Semaphore(1)
        await sem.acquire()  # exhaust the only permit
        gen = chat_event_stream(
            "what is hrm",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            semaphore=sem,
            acquire_timeout=0.01,
            log_request=_capture_log(log_calls),
        )
        return [frame async for frame in gen]

    frames = asyncio.run(run())
    assert _events(frames) == ["sources", "token", "done"]
    assert _token_text(frames) == LLM_BUSY_REPLY
    assert llm.called is False
    assert len(log_calls) == 1
    rec = log_calls[0]
    assert rec["query"] == "what is hrm"
    assert rec["route"] == "busy"
    assert rec["response"] == LLM_BUSY_REPLY
    assert rec["model"] is None
    assert isinstance(rec["latency_ms"], int)
    # The real distances + per-classification counts thread through to the shed row
    # — a regression that logged [] / {} on a gate path would fail here.
    assert rec["classifications"] == {"public": 1}
    assert rec["distances"]


# --- small-talk fast path + answered-row telemetry ---


def _collect_logged(
    query: str, *, db: FakeDB, llm: FakeLLM, log: list[dict]
) -> list[str]:
    async def run() -> list[str]:
        gen = chat_event_stream(
            query,
            [],
            embedder=FakeEmbedder(),
            db=db,
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            log_request=_capture_log(log),
            model_name="qwen2.5:7b",
        )
        return [frame async for frame in gen]

    return asyncio.run(run())


def test_greeting_fast_path_no_llm_no_retrieval() -> None:
    # fail=True: if the greeting fell through to retrieval, db.search would raise —
    # so getting GREETING_REPLY back proves retrieval never ran.
    llm = FakeLLM(["should not run"])
    log: list[dict] = []
    frames = _collect_logged("hi", db=FakeDB([], fail=True), llm=llm, log=log)
    assert _events(frames) == ["sources", "token", "done"]
    assert _token_text(frames) == GREETING_REPLY
    assert llm.called is False
    assert log[0]["route"] == "greeting"
    assert log[0]["model"] is None and log[0]["prompt_eval_count"] is None
    assert json.loads(frames[0].split("data: ", 1)[1])["sources"] == []


def test_courtesy_fast_path() -> None:
    llm = FakeLLM(["nope"])
    log: list[dict] = []
    frames = _collect_logged("kiitos", db=FakeDB([], fail=True), llm=llm, log=log)
    assert _token_text(frames) == COURTESY_REPLY
    assert llm.called is False
    assert log[0]["route"] == "courtesy"
    assert log[0]["model"] is None
    assert json.loads(frames[0].split("data: ", 1)[1])["sources"] == []


def test_smalltalk_does_not_misfire_on_real_question() -> None:
    # "hi, how does..." is NOT a standalone greeting -> the normal pipeline runs.
    llm = FakeLLM(["HRM uses JWTs."])
    log: list[dict] = []
    frames = _collect_logged(
        "hi, how does hrm work",
        db=FakeDB([_row("projects/hrm.md")]),
        llm=llm,
        log=log,
    )
    assert _token_text(frames) == "HRM uses JWTs."
    assert llm.called is True
    assert log[0]["route"] == "answered"


def test_answered_row_logs_model_and_real_tokens() -> None:
    llm = FakeLLM(["HRM is great."], usage={"prompt": 3600, "completion": 40})
    log: list[dict] = []
    _collect_logged("what is hrm", db=FakeDB([_row("projects/hrm.md")]), llm=llm, log=log)
    rec = log[0]
    assert rec["route"] == "answered"
    assert rec["model"] == "qwen2.5:7b"
    assert rec["prompt_eval_count"] == 3600
    assert rec["eval_count"] == 40


def test_generation_error_logs_error_route() -> None:
    # A mid-stream generation failure still emits an operational row (route="error",
    # model=None) so failed/slow requests show up in the latency/health log.
    log: list[dict] = []
    _collect_logged(
        "what is hrm",
        db=FakeDB([_row("projects/hrm.md")]),
        llm=FakeLLM([], fail=True),
        log=log,
    )
    assert log and log[0]["route"] == "error"
    assert log[0]["model"] is None
    assert log[0]["distances"]  # retrieval succeeded, so its distances are recorded


def test_retrieval_error_logs_error_route() -> None:
    # A retrieval failure (non-greeting query) likewise produces an error row.
    log: list[dict] = []
    _collect_logged("what is hrm", db=FakeDB([], fail=True), llm=FakeLLM(["x"]), log=log)
    assert log and log[0]["route"] == "error"
    assert log[0]["model"] is None


def test_generation_permit_is_released_after_a_successful_answer() -> None:
    # After a normal answer the permit must return so the next request can
    # generate — a leaked permit would wedge the gate at "busy" forever.
    llm = FakeLLM(["HRM ", "is great."])

    async def run() -> tuple[list[str], bool]:
        sem = asyncio.Semaphore(1)
        gen = chat_event_stream(
            "what is hrm",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            semaphore=sem,
            acquire_timeout=0.5,
        )
        frames = [frame async for frame in gen]
        return frames, sem.locked()

    frames, still_held = asyncio.run(run())
    assert _events(frames) == ["sources", "token", "token", "done"]
    assert _token_text(frames) == "HRM is great."
    assert still_held is False  # permit released back to the pool


def test_generation_permit_is_released_on_early_client_disconnect() -> None:
    # The leak-guard's hardest path: the consumer stops mid-stream (a browser
    # closing the tab). aclose() raises GeneratorExit at the suspended yield —
    # which must run the finally and release the permit, or the gate wedges.
    llm = FakeLLM(["one ", "two ", "three ", "four"])

    async def run() -> bool:
        sem = asyncio.Semaphore(1)
        gen = chat_event_stream(
            "what is hrm",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            semaphore=sem,
            acquire_timeout=0.5,
        )
        seen = 0
        async for _frame in gen:
            seen += 1
            if seen == 3:  # sources + 2 tokens, then bail like a closed tab
                break
        await gen.aclose()  # mid-stream disconnect path
        return sem.locked()

    still_held = asyncio.run(run())
    assert still_held is False  # permit released despite the early disconnect


# --- session-memory hook (Phase 4) ---


def _run_with_on_answer(query: str, *, db: FakeDB, llm: FakeLLM) -> list[tuple[str, str]]:
    calls: list[tuple[str, str]] = []

    async def on_answer(q: str, a: str) -> None:
        calls.append((q, a))

    async def run() -> None:
        gen = chat_event_stream(
            query,
            [],
            embedder=FakeEmbedder(),
            db=db,
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            on_answer=on_answer,
        )
        async for _frame in gen:
            pass

    asyncio.run(run())
    return calls


def test_on_answer_fires_with_query_and_answer_on_success() -> None:
    calls = _run_with_on_answer(
        "what is hrm",
        db=FakeDB([_row("projects/hrm.md")]),
        llm=FakeLLM(["HRM ", "rocks."]),
    )
    assert calls == [("what is hrm", "HRM rocks.")]


def test_on_answer_not_fired_on_weak_retrieval_refusal() -> None:
    # A canned refusal is not a remembered turn (the model was never called).
    assert _run_with_on_answer("obscure", db=FakeDB([]), llm=FakeLLM(["x"])) == []


def test_on_answer_not_fired_on_generative_decline() -> None:
    calls = _run_with_on_answer(
        "write me a poem about Helsinki",
        db=FakeDB([_row("projects/hrm.md")]),
        llm=FakeLLM(["x"]),
    )
    assert calls == []


def test_on_answer_not_fired_on_smalltalk() -> None:
    # A greeting/thanks is answered by template and returns before the memory hook,
    # so it is never threaded into session memory — a later "tell me more" must not
    # resolve to "hi".
    db = FakeDB([_row("projects/hrm.md")])
    assert _run_with_on_answer("hi", db=db, llm=FakeLLM(["x"])) == []
    assert _run_with_on_answer("kiitos", db=db, llm=FakeLLM(["x"])) == []


def test_on_answer_not_fired_on_generation_error() -> None:
    # A mid-stream generation error returns before the memory hook.
    calls = _run_with_on_answer(
        "what is hrm",
        db=FakeDB([_row("projects/hrm.md")]),
        llm=FakeLLM([], fail=True),
    )
    assert calls == []


def test_on_answer_not_fired_on_busy_shed() -> None:
    # A saturated concurrency semaphore sheds the request with the busy reply
    # before the model runs — not a remembered turn.
    calls: list[tuple[str, str]] = []

    async def on_answer(q: str, a: str) -> None:
        calls.append((q, a))

    async def run() -> None:
        sem = asyncio.Semaphore(0)  # no permits -> the acquire times out
        gen = chat_event_stream(
            "what is hrm",
            [],
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=FakeLLM(["HRM rocks."]),
            top_k=5,
            weak_retrieval_distance=0.7,
            on_answer=on_answer,
            semaphore=sem,
            acquire_timeout=0.01,
        )
        async for _frame in gen:
            pass

    asyncio.run(run())
    assert calls == []


def test_memory_loop_threads_a_recorded_turn() -> None:
    # The full Phase-4 data flow at the seam main.py wires: a successful turn is
    # recorded via on_answer, and the next turn reads it back as threaded history.
    from app.memory import SessionMemory

    mem = SessionMemory(max_turns=6, max_sessions=10, ttl_seconds=1000)

    async def on_answer(q: str, a: str) -> None:
        mem.record("s1", q, a, now=1.0)

    async def run() -> None:
        gen = chat_event_stream(
            "what is hrm",
            mem.history("s1", now=1.0),
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=FakeLLM(["HRM is an HR platform."]),
            top_k=5,
            weak_retrieval_distance=0.7,
            on_answer=on_answer,
        )
        async for _frame in gen:
            pass

    asyncio.run(run())
    threaded = " ".join(m["content"] for m in mem.history("s1", now=1.0))
    assert "what is hrm" in threaded and "HR platform" in threaded


def test_history_is_threaded_into_the_prompt() -> None:
    llm = FakeLLM(["ok"])
    history = [
        {"role": "user", "content": "tell me about hrm"},
        {"role": "assistant", "content": "HRM is an HR platform."},
    ]

    async def run() -> None:
        gen = chat_event_stream(
            "tell me more",
            history,
            embedder=FakeEmbedder(),
            db=FakeDB([_row("projects/hrm.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
        )
        async for _frame in gen:
            pass

    asyncio.run(run())
    contents = [m["content"] for m in llm.messages]
    assert any("HRM is an HR platform." in c for c in contents)


# --- RAG_TRANSLATE_RETRIEVAL (translate-for-retrieval, default off) ---


class RecordingEmbedder:
    """Embedder that records what text was embedded — the flag's whole effect."""

    def __init__(self) -> None:
        self.seen: list[str] = []

    def embed_query(self, text: str) -> list[float]:
        self.seen.append(text)
        return [0.0]


class TranslatingLLM(FakeLLM):
    """First call answers as the translator, later calls as the chat model."""

    def __init__(self, translation: list[str], answer: list[str]) -> None:
        super().__init__(answer)
        self._translation = translation
        self.call_messages: list[list[dict[str, str]]] = []

    async def stream_chat(
        self,
        messages: Sequence[dict[str, str]],
        *,
        usage_out: dict[str, int] | None = None,
    ) -> AsyncIterator[str]:
        self.call_messages.append(list(messages))
        self.messages = list(messages)
        tokens = self._translation if len(self.call_messages) == 1 else self._tokens
        for token in tokens:
            yield token


def _run_translate_turn(
    query: str,
    llm: FakeLLM,
    *,
    translate_retrieval: bool = True,
    allow_finnish: bool = True,
    semaphore: asyncio.Semaphore | None = None,
) -> RecordingEmbedder:
    embedder = RecordingEmbedder()

    async def run() -> None:
        gen = chat_event_stream(
            query,
            [],
            embedder=embedder,
            db=FakeDB([_row("cv.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            allow_finnish=allow_finnish,
            translate_retrieval=translate_retrieval,
            semaphore=semaphore,
            acquire_timeout=0.05,
        )
        async for _frame in gen:
            pass

    asyncio.run(run())
    return embedder


def test_finnish_query_is_retrieved_via_english_translation() -> None:
    llm = TranslatingLLM(["What work experience do you have?"], ["answer"])
    embedder = _run_translate_turn("mitä työkokemusta sinulla on?", llm)
    # retrieval embedded the TRANSLATION...
    assert embedder.seen == ["What work experience do you have?"]
    # ...while generation was asked the ORIGINAL Finnish question
    assert "mitä työkokemusta sinulla on?" in llm.messages[-1]["content"]
    assert len(llm.call_messages) == 2  # translate + answer


def test_flag_off_is_byte_identical() -> None:
    llm = TranslatingLLM(["should never be used"], ["answer"])
    embedder = _run_translate_turn(
        "mitä työkokemusta sinulla on?", llm, translate_retrieval=False
    )
    assert embedder.seen == ["mitä työkokemusta sinulla on?"]
    assert len(llm.call_messages) == 1  # only the answer call


def test_english_query_is_never_translated() -> None:
    llm = TranslatingLLM(["should never be used"], ["answer"])
    embedder = _run_translate_turn("what work experience do you have?", llm)
    assert embedder.seen == ["what work experience do you have?"]
    assert len(llm.call_messages) == 1


def test_busy_gpu_skips_translation_and_retrieves_with_the_original() -> None:
    # The translation takes a slot under the SAME semaphore as generation. With
    # the only slot held, translation must give up quietly (no deadlock, no
    # error) and retrieval must run with the original query; the request then
    # hits the pre-existing busy shed at the generation acquire, as it would
    # have without the flag.
    sem = asyncio.Semaphore(1)
    llm = TranslatingLLM(["unused"], ["answer"])

    async def run() -> tuple[RecordingEmbedder, list[str]]:
        embedder = RecordingEmbedder()
        await sem.acquire()  # occupy the only slot for the whole turn
        frames = []
        gen = chat_event_stream(
            "mitä työkokemusta sinulla on?",
            [],
            embedder=embedder,
            db=FakeDB([_row("cv.md")]),
            llm=llm,
            top_k=5,
            weak_retrieval_distance=0.7,
            allow_finnish=True,
            translate_retrieval=True,
            semaphore=sem,
            acquire_timeout=0.05,
        )
        async for frame in gen:
            frames.append(frame)
        return embedder, frames

    embedder, frames = asyncio.run(run())
    assert embedder.seen == ["mitä työkokemusta sinulla on?"]  # original query
    assert llm.call_messages == []  # neither translation nor generation ran
    assert any("handling another question" in f for f in frames)  # the busy shed


def test_failed_translation_falls_back_to_the_original_query() -> None:
    class FailingFirstCallLLM(TranslatingLLM):
        async def stream_chat(
            self,
            messages: Sequence[dict[str, str]],
            *,
            usage_out: dict[str, int] | None = None,
        ) -> AsyncIterator[str]:
            self.call_messages.append(list(messages))
            self.messages = list(messages)
            if len(self.call_messages) == 1:
                raise RuntimeError("translator down")
            for token in self._tokens:
                yield token

    llm = FailingFirstCallLLM(["unused"], ["answer"])
    embedder = _run_translate_turn("mitä työkokemusta sinulla on?", llm)
    assert embedder.seen == ["mitä työkokemusta sinulla on?"]


def test_chatty_translation_is_cut_to_its_first_line() -> None:
    # Live-verified failure shape: a correct one-line translation followed by
    # unsolicited commentary. Only the first line may reach the embedder.
    llm = TranslatingLLM(
        [
            "What is Miko's work experience? \n\nHowever, considering \"Miko\" "
            "might be a name, here's an alternative translation:\n\n"
            "What are his skills?"
        ],
        ["answer"],
    )
    embedder = _run_translate_turn("Mitä työkokemusta Mikolla on?", llm)
    assert embedder.seen == ["What is Miko's work experience?"]


def test_runaway_translation_is_discarded() -> None:
    # A "translation" many times the query length means the model wrote prose —
    # retrieval must fall back to the original rather than embed an essay.
    llm = TranslatingLLM(["word " * 200], ["answer"])
    embedder = _run_translate_turn("mitä työkokemusta?", llm)
    assert embedder.seen == ["mitä työkokemusta?"]


def test_translation_restores_lost_entity_for_retrieval() -> None:
    # live failure: Poro renders "kasvulabsissa" as "Growth Labs"; retrieval
    # must still carry the canonical corpus spelling
    llm = TranslatingLLM(["What did Mikko do at Growth Labs?"], ["answer"])
    embedder = _run_translate_turn("mitä mikko teki kasvulabsissa?", llm)
    assert embedder.seen == ["What did Mikko do at Growth Labs? Kasvu Labs"]
