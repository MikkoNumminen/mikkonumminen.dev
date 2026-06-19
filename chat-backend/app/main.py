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

import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .config import Settings
from .db import SQL_PATH, Database, apply_schema
from .embeddings import Embedder
from .health import health_payload
from .llm import LLMClient
from .middleware import BodySizeLimitMiddleware
from .pipeline import chat_event_stream
from .ratelimit import RateLimiter, client_ip

logger = logging.getLogger("chat")


class Message(BaseModel):
    role: str
    content: str = Field(max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    # Bound the PARSED structure regardless of Content-Length: the body-size
    # middleware caps raw bytes, and these cap the prompt that reaches the model
    # (a no-Content-Length request can't slip a huge history past Pydantic).
    history: list[Message] = Field(default_factory=list, max_length=20)


async def _db_ok(db: Database) -> bool:
    """Cheap liveness probe — a count round-trips through the pool and pgvector."""
    try:
        await db.count_documents()
        return True
    except Exception:
        logger.exception("db health check failed")
        return False


def create_app() -> FastAPI:
    settings = Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Apply the schema on startup so an un-indexed deployment still answers
        # (empty corpus -> graceful "nothing on that") rather than 500-ing; the
        # indexer fills it offline.
        await apply_schema(settings.database_url, SQL_PATH)
        db = await Database.connect(settings.database_url)
        app.state.settings = settings
        app.state.db = db
        app.state.embedder = Embedder(settings.embedding_model, settings.embedding_dim)
        app.state.llm = LLMClient(
            settings.ollama_base_url, settings.llm_model, settings.llm_timeout_seconds
        )
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
        ip = client_ip(
            request.headers.get("x-forwarded-for"),
            request.client.host if request.client else None,
        )
        now = time.monotonic()
        if not limiter.allow(ip, now):
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
        llm_ok = await app.state.llm.check_health()
        # Always 200 — the body's `checks.llm` carries availability; the frontend
        # reads that flag, not the status code.
        return JSONResponse(health_payload(db_ok, llm_ok, settings.llm_model))

    @app.post("/chat")
    async def chat(req: ChatRequest) -> StreamingResponse:
        stream = chat_event_stream(
            req.message,
            [m.model_dump() for m in req.history],
            embedder=app.state.embedder,
            db=app.state.db,
            llm=app.state.llm,
            top_k=settings.retrieval_top_k,
            weak_retrieval_distance=settings.weak_retrieval_distance,
        )
        return StreamingResponse(
            stream,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return app


app = create_app()
