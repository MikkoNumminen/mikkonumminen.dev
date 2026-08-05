"""FastAPI service: POST /chat (SSE) and GET /health.

The lifespan wires the shared resources once — the pgvector pool, the in-process
embedder, and the Ollama LLM client — and tears the pool down on shutdown.
`/chat` streams a grounded, source-cited answer; `/health` reports DB + LLM
liveness, where the LLM check confirms the model actually generates (the signal
the frontend uses to decide whether free chat is available). All configuration
comes from the environment (see `config.Settings` / `.env.example`).

This module imports FastAPI and the heavy resource classes; it is exercised
against the live Docker stack. The logic it delegates to — prompt assembly, SSE
framing, the retrieval/stream pipeline, the health payload — is unit-tested in
isolation.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import shoutbox
from .config import Settings
from .db import Database, apply_schema
from .embeddings import Embedder
from .health import health_payload
from .health_cache import CachedFlag
from .llm import LLMClient
from .memory import SessionMemory
from .middleware import BodySizeLimitMiddleware
from .notify import QueueNotifier
from .pipeline import chat_event_stream
from .ratelimit import RateLimiter, client_ip, is_exempt_local
from .request_log import build_request_logger
from .usage import usage_payload

logger = logging.getLogger("chat")


class Message(BaseModel):
    role: str
    content: str = Field(max_length=2000)


class ChatRequest(BaseModel):
    # Pydantic carries only a loose backstop; the operative limit is the
    # configurable INPUT_MAX_CHARS, enforced in the handler so the real cap is
    # one tunable number, not split across two layers. A message between the cap
    # and this backstop is rejected by the handler with a clean 400.
    message: str = Field(min_length=1, max_length=4000)
    # Bound the PARSED structure regardless of Content-Length: the body-size
    # middleware caps raw bytes, and these cap the prompt that reaches the model
    # (a no-Content-Length request can't slip a huge history past Pydantic).
    history: list[Message] = Field(default_factory=list, max_length=20)
    # Opt-in backend conversation memory: when set, the server threads this
    # session's prior turns into the prompt and remembers this one. Absent => the
    # single-turn path (the client may still pass its own `history` for back-compat).
    session_id: str | None = Field(default=None, max_length=200)
    # Optional, generic reasoning-control flag threaded into the SYSTEM prompt
    # (prompts._REASONING_OFF). Default None => no change; the live terminal never
    # sends it. The rag-experiment harness sets it per arm so an arm can run with
    # reasoning disabled without altering the message (retrieval stays identical).
    think: bool | None = None


class ResetRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=200)


class ShoutRequest(BaseModel):
    # A loose Pydantic backstop only. The operative cap is `shoutbox.MAX_CHARS`,
    # applied by the gate — same split as ChatRequest, so the real limit stays one
    # tunable number rather than being spread across two layers that can drift.
    body: str = Field(min_length=1, max_length=4000)


async def _notify_queue(db: Database, notifier: QueueNotifier, now: float) -> None:
    """Send the queue digest out of band. Never raises.

    Runs as a detached task so a slow or dead Telegram cannot delay the visitor's
    confirmation. The queue depth is read here rather than passed in so the digest
    reports the truth at send time, which after a burst is more useful than the
    count at the moment one particular message landed.
    """
    try:
        pending = await db.shout_pending_count()
        if shoutbox.should_notify(pending, notifier.last_sent_at, now):
            await notifier.send_digest(pending, now)
    except Exception:
        # The message is already queued; a failed ping is an operator problem,
        # never the visitor's.
        logger.warning("shoutbox queue notification failed", exc_info=True)


async def _db_ok(db: Database) -> bool:
    """Cheap liveness probe — a count round-trips through the pool and pgvector."""
    try:
        await db.count_documents()
        return True
    except Exception:
        logger.exception("db health check failed")
        return False


# How long an ALIVE /health LLM result is reused before re-probing the model.
# Set just above the frontend poll interval (25s) so one viewer's back-to-back
# probes reuse the result and many viewers can't fan out into a completion each.
# Only the alive result is cached (see health_cache.py): a not-ready/down result
# is never held, so boot and recovery are detected on the next probe rather than
# after this window. Staleness applies only to a model going DOWN while cached
# up — bounded by this — and a model switch is reflected within the window.
HEALTH_LLM_CACHE_SECONDS = 30.0


def create_app() -> FastAPI:
    settings = Settings.from_env()
    # One memo per app: collapses a burst of /health probes into a single
    # 1-token LLM completion (see health_cache.py).
    llm_health = CachedFlag(HEALTH_LLM_CACHE_SECONDS)
    # Local request log — operational telemetry on by default; None only when
    # RAG_LOG_FILE is explicitly emptied, in which case the pipeline skips logging.
    # RAG_LOG_TEXT (off by default) gates the raw query/answer text.
    request_logger = build_request_logger(
        settings.rag_log_file, log_text=settings.rag_log_text
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Apply the schema on startup so an un-indexed deployment still answers
        # (empty corpus -> graceful "nothing on that") rather than 500-ing; the
        # indexer fills it offline.
        await apply_schema(settings.database_url)
        db = await Database.connect(settings.database_url)
        app.state.settings = settings
        app.state.db = db
        app.state.embedder = Embedder(settings.embedding_model, settings.embedding_dim)
        app.state.llm = LLMClient(
            settings.ollama_base_url,
            settings.llm_model,
            settings.llm_timeout_seconds,
            temperature=settings.llm_temperature,
            num_predict=settings.llm_num_predict,
        )
        # One permit per concurrent generation the single local GPU can serve.
        # Created inside the lifespan so it binds to the running event loop.
        app.state.llm_semaphore = asyncio.Semaphore(settings.llm_max_concurrency)
        # Bounded in-process conversation memory (Phase 4) — session-scoped,
        # resettable, cleared on restart.
        app.state.memory = SessionMemory(
            settings.memory_max_turns,
            settings.memory_max_sessions,
            settings.memory_ttl_seconds,
        )
        # Shoutbox: a rate limiter of its own, tighter than the chat guard because
        # this path writes. In-memory, like the chat limiter — no visitor address
        # is ever persisted, which is what keeps the queue genuinely anonymous.
        app.state.shout_limiter = RateLimiter(
            shoutbox.RATE_MAX, shoutbox.RATE_WINDOW_SECONDS
        )
        app.state.shout_notifier = QueueNotifier(settings.telegram_config)
        # Strong references to in-flight notification tasks. asyncio only holds a
        # weak reference to a bare create_task, so without this set a digest can
        # be garbage-collected mid-send and vanish silently.
        app.state.shout_notify_tasks = set()
        try:
            yield
        finally:
            await db.close()

    app = FastAPI(title="Portfolio RAG chat", lifespan=lifespan)

    # Added first -> ends up INNERMOST (runs after the rate-limit guard), so an
    # over-limit IP is shed before its body is read. Caps actual body bytes for
    # both Content-Length and chunked requests.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)

    limiter = RateLimiter(
        settings.rate_limit_requests, settings.rate_limit_window_seconds
    )
    prune_counter = 0

    @app.middleware("http")
    async def guard(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Per-IP sliding-window rate limit (the body-size cap is its own ASGI
        # middleware). CORS preflight is automatic browser traffic — never limit it.
        nonlocal prune_counter
        if request.method == "OPTIONS":
            return await call_next(request)
        xff = request.headers.get("x-forwarded-for")
        peer = request.client.host if request.client else None
        # The eval harness / ops tooling hit the backend directly on loopback with no
        # proxy header; the limiter (external-abuse protection, ADR 0010) must NOT
        # throttle that trusted path — high-N eval runs were silently corrupted by 429s.
        #
        # SECURITY — the exempt branch must never open for external traffic:
        #   1. Conjunctive guard (loopback peer AND no X-Forwarded-For): external
        #      ingress satisfies at most one. cloudflared is a sibling container (172.x
        #      bridge peer, not loopback); the host port is bound 127.0.0.1:8000:8000
        #      (docker-compose.yml), so the only off-host reach is the tunnel, which
        #      carries XFF. Verified empirically: a host->published-port request is
        #      rate-limited (bridge peer), only in-container loopback is exempt.
        #   2. `peer` is request.client.host (raw socket peer). uvicorn runs with NO
        #      --proxy-headers, so it CANNOT be spoofed by a header. Do NOT add
        #      --proxy-headers or an nginx sidecar without revisiting this gate.
        #   3. Residual leak needs TWO non-default overrides AT ONCE: the Docker
        #      userland proxy disabled (iptables-NAT then preserves a loopback peer for
        #      host->port) AND the tunnel dropping XFF — and even then it is host-local
        #      only (loopback-bound port), never an external attacker.
        # The "non-loopback peer is never exempt" property is pinned in
        # tests/test_ratelimit.py so a future refactor can't silently reopen it.
        if is_exempt_local(xff, peer):
            return await call_next(request)
        now = time.monotonic()
        if not limiter.allow(client_ip(xff, peer), now):
            return JSONResponse({"detail": "rate limited"}, status_code=429)
        # Amortized sweep of drained keys so _hits stays bounded to recently
        # active IPs (single worker; a missed sweep under the GIL is harmless).
        prune_counter += 1
        if prune_counter % 1000 == 0:
            limiter.prune(now)
        return await call_next(request)

    # CORS added LAST -> OUTERMOST, so its headers reach the guard's 429 and the
    # body-size middleware's 413. allow_credentials stays off, so "*" is safe.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["content-type"],
    )

    @app.get("/health")
    async def health() -> JSONResponse:
        db_ok = await _db_ok(app.state.db)
        llm_ok = await llm_health.get(app.state.llm.check_health)
        # Always 200 — the body's `checks.llm` carries availability; the frontend
        # reads that flag, not the status code.
        return JSONResponse(health_payload(db_ok, llm_ok, settings.llm_model))

    @app.post("/chat")
    async def chat(req: ChatRequest) -> Response:
        # Hard cap on the CURRENT question, enforced before any retrieval or
        # generation: an over-length message is rejected outright rather than
        # truncated or fed to the model. This bounds the message only — total
        # request size is bounded by MAX_BODY_BYTES (the body-size middleware),
        # and prior turns by the Pydantic history limits (<=20 turns, <=2000
        # chars each). History is deliberately not char-capped here: the byte
        # cap already bounds it and truncating would corrupt legit multi-turn.
        if len(req.message) > settings.input_max_chars:
            return JSONResponse(
                {"detail": f"message exceeds {settings.input_max_chars} characters"},
                status_code=400,
            )

        db = app.state.db
        memory: SessionMemory = app.state.memory

        async def record(tokens: int, latency_ms: int) -> None:
            # The model that answered is the configured one; counts only, never
            # the question. The pipeline already guards this call, so a usage-log
            # hiccup can't break an answer that has already streamed.
            await db.record_usage(settings.llm_model, tokens, latency_ms)

        async def remember(query: str, answer: str) -> None:
            # Record the completed turn into session memory (the pipeline fires this
            # only on a real answer). No-op for the single-turn path (no session_id).
            if req.session_id:
                memory.record(req.session_id, query, answer, time.monotonic())

        # Backend session memory is the source of truth for prior turns when a
        # session_id is given; otherwise fall back to any client-managed history
        # (back-compat with the single-turn terminal).
        history = (
            memory.history(req.session_id, time.monotonic())
            if req.session_id
            else [m.model_dump() for m in req.history]
        )

        stream = chat_event_stream(
            req.message,
            history,
            embedder=app.state.embedder,
            db=app.state.db,
            llm=app.state.llm,
            top_k=settings.retrieval_top_k,
            weak_retrieval_distance=settings.weak_retrieval_distance,
            force_english=settings.force_english,
            think=req.think,
            hybrid=settings.hybrid_enabled,
            rrf_k=settings.rrf_k,
            dense_weight=settings.retrieval_dense_weight,
            lexical_weight=settings.retrieval_lexical_weight,
            project_filter_strict=settings.project_filter_strict,
            on_complete=record,
            on_answer=remember,
            semaphore=app.state.llm_semaphore,
            acquire_timeout=settings.llm_acquire_timeout_seconds,
            log_request=request_logger,
            # The role is SERVER-determined — a public endpoint must never trust a
            # client-claimed role. The public chat runs as the policy's default
            # (least-privilege) role, which gates retrieval to its permitted
            # classifications before anything reaches the model.
            role=settings.gdpr_policy.default_role,
            allowed_classifications=settings.gdpr_policy.allowed_classifications(
                settings.gdpr_policy.default_role
            ),
            disclosure_enabled=settings.progressive_disclosure_enabled,
            context_window=settings.context_window,
            exclude_doc_types=settings.retrieval_exclude_doc_types or None,
            diversify_max_per_project=settings.retrieval_diversity_max_per_project,
            research_coverage_top_n=settings.research_coverage_top_n,
            model_name=settings.llm_model,
            allow_finnish=settings.rag_allow_finnish,
            translate_retrieval=settings.rag_translate_retrieval,
        )
        return StreamingResponse(
            stream,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.post("/session/reset")
    async def reset_session(req: ResetRequest) -> JSONResponse:
        # Clear a session's conversation memory — the terminal's /clear (Phase 6's
        # context bar empties alongside it). The body-size cap and per-IP rate limit
        # already apply via the middleware; no new auth surface.
        app.state.memory.reset(req.session_id)
        return JSONResponse({"ok": True})

    @app.post("/shout")
    async def submit_shout(req: ShoutRequest, request: Request) -> JSONResponse:
        # Submit a message to the moderation queue. NOTHING here publishes: an
        # accepted submission is `pending` until the owner approves it from
        # ragctl, and the public site reads a committed snapshot rather than this
        # database at all.
        #
        # This endpoint is PUBLICLY ADDRESSABLE and unauthenticated. The Tailscale
        # Funnel proxies `/` to this app, and the funnel hostname is published in
        # vercel.json — so being absent from the site's rewrite list hides nothing.
        # The gate below is the whole defence, which is why it is a pure function
        # with its own adversarial suite rather than a few inline `if`s.
        if not app.state.settings.shoutbox_enabled:
            return JSONResponse({"detail": "shoutbox is closed"}, status_code=404)

        db: Database = app.state.db
        now = time.monotonic()

        def refuse(refusal: shoutbox.Refusal) -> JSONResponse:
            # 200, not 4xx: an expected conversational outcome carrying a message
            # the visitor can act on, which the frontend renders inline.
            return JSONResponse(
                {"accepted": False, "detail": shoutbox.REFUSAL_TEXT[refusal]}
            )

        # SHAPE FIRST, and nothing else touched until it passes. The state checks
        # below cost two database round-trips and a slot of rate budget, so
        # running them for an empty or oversized submission would hand an attacker
        # exactly the free flood the limits exist to prevent. Normalised once here
        # and reused, so the stored text is the text the rules ran against.
        # The gate runs through `shoutbox.evaluate`, the same entry point the
        # red-team suite drives. It used to be composed by hand here instead,
        # which meant the adversarial suite for a public write endpoint exercised
        # a parallel implementation and could stay green while this path drifted.
        #
        # `rate_exceeded` is passed as a callable because `allow` RECORDS the
        # attempt as it answers: evaluate calls it only once the shape checks have
        # passed, so a malformed submission cannot spend budget. The two queue
        # facts are read eagerly, which costs two indexed lookups on refused
        # input but no rate budget, and they are advisory anyway: the authority
        # for both is the gated insert below.
        peer = request.client.host if request.client else None
        key = client_ip(request.headers.get("x-forwarded-for"), peer)
        hashed = shoutbox.body_hash(shoutbox.normalise(req.body))

        verdict = shoutbox.evaluate(
            req.body,
            rate_exceeded=lambda: not app.state.shout_limiter.allow(key, now),
            pending_total=await db.shout_pending_count(),
            duplicate_exists=await db.shout_duplicate_exists(
                hashed, shoutbox.DUPLICATE_WINDOW_SECONDS
            ),
        )
        if not verdict.accepted:
            if verdict.refusal is None:
                # accepted=False always carries a reason by construction, so a
                # None here is a bug in the gate, not a visitor error. Raise
                # rather than assert: asserts vanish under `python -O`, and this
                # is a request path.
                raise RuntimeError("shoutbox gate refused without a reason")
            return refuse(verdict.refusal)

        body = verdict.body
        if body is None:
            raise RuntimeError("shoutbox gate accepted without a normalised body")

        # Re-check duplicate and capacity INSIDE the write transaction. The reads
        # above are a snapshot: two identical submissions arriving together both
        # saw `duplicate_exists=False` and both inserted, and a burst likewise each
        # saw room under the cap. This is the atomic decision; the reads above only
        # buy an earlier, cheaper refusal.
        shout_id, reason = await db.enqueue_shout_gated(
            body,
            hashed,
            window_seconds=shoutbox.DUPLICATE_WINDOW_SECONDS,
            max_pending=shoutbox.QUEUE_MAX_PENDING,
        )
        if shout_id is None:
            return refuse(
                shoutbox.Refusal.DUPLICATE
                if reason == "duplicate"
                else shoutbox.Refusal.QUEUE_FULL
            )

        # Notification is fire-and-forget, NOT awaited. Awaiting it would make the
        # visitor wait out the Telegram timeout before their message is confirmed,
        # which is precisely what "best-effort, never surfaces to the visitor"
        # was supposed to mean. The task reference is held so it cannot be
        # garbage-collected mid-flight.
        notifier: QueueNotifier = app.state.shout_notifier
        if notifier.enabled:
            task = asyncio.create_task(_notify_queue(db, notifier, now))
            app.state.shout_notify_tasks.add(task)
            task.add_done_callback(app.state.shout_notify_tasks.discard)

        return JSONResponse({"accepted": True})

    @app.get("/usage")
    async def usage(hours: int = Query(default=24, ge=1, le=168)) -> JSONResponse:
        # How much the model has been used over the last N hours (default 24,
        # capped at a week). Aggregate counts only — no question text is stored
        # or returned. `ragctl usage` reads this on localhost; it carries nothing
        # sensitive, so being reachable through the funnel is acceptable.
        summary = await app.state.db.usage_summary(hours)
        return JSONResponse(usage_payload(summary))

    return app


app = create_app()
