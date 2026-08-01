"""Environment-driven configuration for the whole backend.

One frozen `Settings` object describes everything the indexer and the API need:
the database, the embedding model, the chunker, and the generation LLM. It is
read once from the environment at process start so the indexer and the query
path share an identical view of the world (same embedding model, same vector
dimension) — the single most important invariant for a RAG system, because a
mismatch silently returns garbage rather than failing loudly.

This module is intentionally dependency-light (stdlib only) so it can be
imported and unit-tested without pulling in fastembed / asyncpg / the LLM
client.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from .gdpr import GdprPolicy, load_policy

# Defaults target the local Docker stack (service hostnames `db` / `ollama`).
# Running the indexer or tests on the host without overrides falls back to
# localhost so a developer poking at it outside compose still connects.
_DEFAULT_DATABASE_URL = "postgresql://rag:rag@localhost:5432/rag"
# MUST match the model baked into the image at build time (chat-backend/Dockerfile):
# the runtime sets HF_HUB_OFFLINE=1, so ONLY the baked model can load — overriding
# EMBEDDING_MODEL at runtime to anything else would crash the container at startup.
_DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
_DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1"
_DEFAULT_LLM_MODEL = "qwen2.5:7b"


def _get_str(name: str, default: str) -> str:
    value = os.environ.get(name)
    # Treat an empty string the same as unset — an env file with `FOO=` should
    # not blank out a meaningful default and produce a baffling downstream error.
    return value if value else default


def _get_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(
            f"environment variable {name!r} must be an integer, got {raw!r}"
        ) from exc


def _get_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if not raw:
        return default
    items = [part.strip() for part in raw.split(",") if part.strip()]
    return items or default


def _get_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(
            f"environment variable {name!r} must be a number, got {raw!r}"
        ) from exc


_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
_FALSE_VALUES = frozenset({"0", "false", "no", "off"})


def _get_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if not raw:
        return default
    value = raw.strip().lower()
    if value in _TRUE_VALUES:
        return True
    if value in _FALSE_VALUES:
        return False
    raise ValueError(
        f"environment variable {name!r} must be a boolean "
        f"(one of {sorted(_TRUE_VALUES | _FALSE_VALUES)}), got {raw!r}"
    )


@dataclass(frozen=True)
class Settings:
    """Resolved runtime configuration. Construct via `Settings.from_env()`."""

    # --- storage / retrieval ---
    database_url: str
    content_dir: str
    # Optional extra prose source (Phase 1): a directory of ADR / design-note
    # markdown ingested as doc_type='adr' prose, attributed to `adr_project`.
    # Empty = off (a bare indexer run and the unit tests stay corpus-only); the
    # compose sets ADR_DIR to the bind-mounted decisions dir. Only ADR-named files
    # (NNNN-*.md) are taken, so a README / TEMPLATE alongside them is skipped.
    adr_dir: str
    adr_project: str
    embedding_model: str
    embedding_dim: int

    # --- chunker (token counts are estimates; see chunking.estimate_tokens) ---
    chunk_max_tokens: int
    chunk_min_tokens: int
    chunk_overlap_tokens: int

    # --- generation (used by the Phase 2 query path; declared here so the whole
    # service reads a single config object) ---
    ollama_base_url: str
    llm_model: str
    llm_timeout_seconds: int
    # Generation tuning — the CLI's "effort" knobs. Temperature stays low by
    # default for grounded RAG; num_predict <= 0 means "no cap" (model default).
    #
    # The cap is 1024, raised from 512 after the request log showed answers
    # ending at exactly 512, i.e. cut off rather than finished, on 4.8% of
    # requests to the DEPLOYED model (52/1084 Poro). The whole-log figure is
    # 169/2547, but that spans four models and two thirds of it is qwen3:8b
    # experiment traffic, so it overstates what a visitor meets. It is
    # set so both languages get the same ANSWER, not the same token count:
    # Finnish is agglutinative and costs roughly twice the tokens of the same
    # content, which is why it was truncated 9.3% of the time against English's
    # 0.7%. English is all but unaffected: its p99 answer is 502 tokens, so it
    # stops on its own inside the old cap, and a cap only binds a model that
    # wants to keep going. One English answer in 138 did hit 512 and will now
    # run longer, and p99 from 138 samples is a thin tail, not a stable floor.
    #
    # 1024 is also the largest round value that still fits: the longest prompt
    # ever logged was 6816 tokens against an 8192 context, so 6816 + 1024 = 7840
    # leaves 352 tokens of headroom. Raising this further without also raising
    # OLLAMA_CONTEXT_LENGTH would start evicting context on the longest prompts,
    # which fails silently and costs grounding rather than length.
    llm_temperature: float
    llm_num_predict: int
    # Force every answer into English regardless of the question's language.
    # Default on: small models (e.g. qwen2.5:7b) follow a system-prompt "answer
    # in English" rule unreliably and slip into Finnish, so this also drives an
    # in-message directive (see prompts.build_messages). Toggle via `ragctl
    # english on|off`.
    force_english: bool
    # EXPERIMENTAL (default OFF): when on, a Finnish-looking query (guardrails.
    # looks_finnish) is answered IN FINNISH instead of being forced to English —
    # force_english is dropped for that request and a positive Finnish closing
    # directive is added. OFF leaves behavior byte-identical (English-only). The
    # public deployment stays OFF until the Finnish eval data justifies flipping it.
    rag_allow_finnish: bool
    # When on, a Finnish query is retrieved with a model-generated English
    # translation (the embedder and lexical index are English-only) while the
    # answer still addresses the original Finnish question. Best-effort — any
    # translation failure falls back to retrieving with the original query.
    # Only ever active when rag_allow_finnish routes the query Finnish.
    rag_translate_retrieval: bool
    # Progressive disclosure (Phase 5): a concise answer plus an explicit
    # "tell me more?" offer; a topic-less follow-up expands into the topic's
    # precomputed narrative. Default on; off restores single-shot answers.
    progressive_disclosure_enabled: bool
    # The model's served context window (num_ctx, matches OLLAMA_CONTEXT_LENGTH).
    # The context bar (Phase 6) renders the real prompt_eval_count + eval_count
    # against this; keep it in sync with the Ollama service's context length.
    context_window: int

    # --- retrieval + API surface ---
    retrieval_top_k: int
    # --- hybrid retrieval (Workstream B) ---
    # Combine a lexical (BM25-style) search with the dense vector search via
    # reciprocal rank fusion, so exact identifiers (class/engine names, file
    # paths) the embeddings blur are still surfaced. Fully reversible:
    # HYBRID_ENABLED off restores pure dense retrieval. The weights bias the
    # fusion (per ranked list); RRF_K is the standard rank-fusion constant.
    # PROJECT_FILTER_STRICT hard-restricts retrieval to a named project rather
    # than soft-boosting it.
    hybrid_enabled: bool
    rrf_k: int
    retrieval_dense_weight: float
    retrieval_lexical_weight: float
    project_filter_strict: bool
    cors_allow_origins: list[str]
    # --- retrieval diversity + doc_type filtering ---
    # Comma-separated doc_types to hide from visitor retrieval (e.g. 'adr' to
    # suppress architecture decision records from project-overview answers). Empty
    # tuple disables the filter. Toggle via RETRIEVAL_EXCLUDE_DOC_TYPES.
    retrieval_exclude_doc_types: tuple[str, ...]
    # Per-project chunk cap for queries that name no project. When a visitor asks
    # "tell me about the projects", at most this many chunks from any single
    # project appear in the top_k so showcased projects spread across the answer.
    # Named-project queries are never capped. Set via RETRIEVAL_DIVERSITY_MAX_PER_PROJECT.
    #
    # This was 1, on the assumption that naming no project means wanting a survey.
    # That assumption is wrong for a specific question that merely omits the name
    # ("how many shapes does the home page star field cycle through?"), and at 1
    # the owning project got a single chunk while five slots went to the best
    # chunk of five unrelated projects. Measured over evals/eval_set_unnamed_project.json,
    # the retrieved text contained the answering phrase in only 6/12 cases — the
    # model then answered confidently from a neighbouring project.
    #
    # Measured trade (see evals/unnamed_project_probe.py):
    #   cap  answer-phrase present   distinct projects per survey query
    #    1        6/12  (50%)                 4.00
    #    2        8/12  (67%)                 3.00
    #    3       10/12  (83%)                 2.75
    #    6       10/12  (83%)                 --
    # 3 is the knee: 6 buys more of the owning project but answers nothing extra.
    # The golden set is unchanged at every value, because its questions name their
    # projects and named-project queries are never capped.
    retrieval_diversity_max_per_project: int
    # On a research/recency intent ("latest research"), force this many newest
    # research posts (by doc_date) into the context so pure similarity plus the
    # per-project diversity cap can't bury them. 0 disables (byte-identical to the
    # pre-feature behaviour). See retrieval.retrieve / db.recent_research.
    research_coverage_top_n: int

    # --- guardrails (Phase 4) ---
    # Cosine distance above which even the closest chunk is treated as
    # irrelevant -> deterministic refusal instead of generation. Conservative;
    # tune against evals/run_eval.py.
    weak_retrieval_distance: float
    # Per-IP sliding-window limit + a request-body byte cap, to protect the
    # machine while the tunnel is open.
    rate_limit_requests: int
    rate_limit_window_seconds: float
    max_body_bytes: int

    # --- containment (Workstream A) ---
    # Hard cap on the question length that reaches the model, enforced in the
    # /chat handler BEFORE retrieval or generation. The Pydantic model carries a
    # looser backstop; this is the real, tunable limit. Containment is
    # architectural, not prompt-wording: a bounded input cannot smuggle a giant
    # payload past the model no matter what the message says.
    input_max_chars: int
    # One local GPU serves generation. Bound how many requests generate at once
    # (default 2) and how long a request waits for a free slot before being shed
    # with a clean "busy" reply (default 0.5s). Shedding, not queueing: a queue
    # behind a slow generation just stacks timeouts and risks an OOM.
    llm_max_concurrency: int
    llm_acquire_timeout_seconds: float
    # Local request log. ON by default with operational telemetry only (timestamp,
    # route, latency, model + real token counts, retrieval distances) — no PII.
    # Empty path disables it. See request_log.py.
    rag_log_file: str
    # When True, the request log ALSO writes the raw query + answer text (the one
    # place both are recorded). OFF by default; turn on for local debugging only —
    # the public Tailscale Funnel deployment leaves it off.
    rag_log_text: bool

    # --- GDPR-aware context control (Phase 2) ---
    # The validated policy: classification rules, the role -> permitted-classes
    # ladder, pseudonymisation patterns, and the data-residency flag. Loaded once
    # from GDPR_POLICY_FILE (or the benign default — everything public, one public
    # role, no pseudonymisation) and validated, so a malformed policy fails startup
    # rather than silently widening access.
    gdpr_policy: GdprPolicy

    # --- session memory (Phase 4) ---
    # Backend conversation memory: at most this many prior turns are threaded into
    # the next prompt per session, at most this many sessions are kept (LRU-evicted),
    # and a session expires after this many idle seconds. The bounds keep memory
    # from becoming an unbounded-growth or abuse vector; the per-turn input cap,
    # relevance gate, role filter, and output cap still fire regardless.
    memory_max_turns: int
    memory_max_sessions: int
    memory_ttl_seconds: float

    @staticmethod
    def from_env() -> Settings:
        # RETRIEVAL_EXCLUDE_DOC_TYPES: default "adr"; empty string -> empty tuple
        # (opt-out the filter entirely). Handled inline because _get_list treats ""
        # as unset and falls back to the default — we need "" to mean "no filter".
        _raw_exclude = os.environ.get("RETRIEVAL_EXCLUDE_DOC_TYPES")
        if _raw_exclude is None:
            _exclude_doc_types: tuple[str, ...] = ("adr",)
        else:
            _exclude_doc_types = tuple(
                p.strip() for p in _raw_exclude.split(",") if p.strip()
            )

        settings = Settings(
            database_url=_get_str("DATABASE_URL", _DEFAULT_DATABASE_URL),
            content_dir=_get_str("CONTENT_DIR", "content"),
            adr_dir=_get_str("ADR_DIR", ""),
            adr_project=_get_str("ADR_PROJECT", "portfolio"),
            embedding_model=_get_str("EMBEDDING_MODEL", _DEFAULT_EMBEDDING_MODEL),
            embedding_dim=_get_int("EMBEDDING_DIM", 384),
            chunk_max_tokens=_get_int("CHUNK_MAX_TOKENS", 480),
            chunk_min_tokens=_get_int("CHUNK_MIN_TOKENS", 100),
            chunk_overlap_tokens=_get_int("CHUNK_OVERLAP_TOKENS", 60),
            ollama_base_url=_get_str("OLLAMA_BASE_URL", _DEFAULT_OLLAMA_BASE_URL),
            llm_model=_get_str("LLM_MODEL", _DEFAULT_LLM_MODEL),
            llm_timeout_seconds=_get_int("LLM_TIMEOUT_SECONDS", 60),
            llm_temperature=_get_float("LLM_TEMPERATURE", 0.4),
            llm_num_predict=_get_int("LLM_NUM_PREDICT", 1024),
            force_english=_get_bool("FORCE_ENGLISH", True),
            rag_allow_finnish=_get_bool("RAG_ALLOW_FINNISH", False),
            rag_translate_retrieval=_get_bool("RAG_TRANSLATE_RETRIEVAL", False),
            progressive_disclosure_enabled=_get_bool(
                "PROGRESSIVE_DISCLOSURE_ENABLED", True
            ),
            context_window=_get_int("CONTEXT_WINDOW", 4096),
            retrieval_top_k=_get_int("TOP_K", 6),
            hybrid_enabled=_get_bool("HYBRID_ENABLED", True),
            rrf_k=_get_int("RRF_K", 60),
            retrieval_dense_weight=_get_float("RETRIEVAL_DENSE_WEIGHT", 1.0),
            retrieval_lexical_weight=_get_float("RETRIEVAL_LEXICAL_WEIGHT", 1.0),
            project_filter_strict=_get_bool("PROJECT_FILTER_STRICT", True),
            cors_allow_origins=_get_list("CORS_ALLOW_ORIGINS", ["*"]),
            retrieval_exclude_doc_types=_exclude_doc_types,
            retrieval_diversity_max_per_project=_get_int(
                "RETRIEVAL_DIVERSITY_MAX_PER_PROJECT", 3
            ),
            research_coverage_top_n=_get_int("RESEARCH_COVERAGE_TOP_N", 3),
            weak_retrieval_distance=_get_float("WEAK_RETRIEVAL_DISTANCE", 0.45),
            rate_limit_requests=_get_int("RATE_LIMIT_REQUESTS", 30),
            rate_limit_window_seconds=_get_float("RATE_LIMIT_WINDOW_SECONDS", 60.0),
            max_body_bytes=_get_int("MAX_BODY_BYTES", 16384),
            input_max_chars=_get_int("INPUT_MAX_CHARS", 800),
            llm_max_concurrency=_get_int("LLM_MAX_CONCURRENCY", 2),
            llm_acquire_timeout_seconds=_get_float("LLM_ACQUIRE_TIMEOUT_SECONDS", 0.5),
            # A log FILE is the one config where an explicit empty value means OFF
            # (the intuitive "turn it off"), so read it directly rather than via
            # _get_str, which folds an empty value into the default.
            rag_log_file=os.environ.get("RAG_LOG_FILE", "rag-logs/requests.jsonl"),
            rag_log_text=_get_bool("RAG_LOG_TEXT", False),
            gdpr_policy=load_policy(_get_str("GDPR_POLICY_FILE", "") or None),
            memory_max_turns=_get_int("MEMORY_MAX_TURNS", 6),
            memory_max_sessions=_get_int("MEMORY_MAX_SESSIONS", 1000),
            memory_ttl_seconds=_get_float("MEMORY_TTL_SECONDS", 1800.0),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        """Fail fast on a configuration that can only misbehave at runtime."""
        if self.context_window <= 0:
            raise ValueError(
                f"CONTEXT_WINDOW must be positive, got {self.context_window}"
            )
        if self.embedding_dim <= 0:
            raise ValueError(f"EMBEDDING_DIM must be positive, got {self.embedding_dim}")
        if self.chunk_max_tokens <= 0:
            raise ValueError(
                f"CHUNK_MAX_TOKENS must be positive, got {self.chunk_max_tokens}"
            )
        if self.chunk_min_tokens < 0:
            raise ValueError(
                f"CHUNK_MIN_TOKENS must be non-negative, got {self.chunk_min_tokens}"
            )
        if self.chunk_min_tokens >= self.chunk_max_tokens:
            raise ValueError(
                "CHUNK_MIN_TOKENS must be smaller than CHUNK_MAX_TOKENS "
                f"({self.chunk_min_tokens} >= {self.chunk_max_tokens})"
            )
        if not 0 <= self.chunk_overlap_tokens < self.chunk_max_tokens:
            raise ValueError(
                "CHUNK_OVERLAP_TOKENS must be in [0, CHUNK_MAX_TOKENS) "
                f"({self.chunk_overlap_tokens} not in [0, {self.chunk_max_tokens}))"
            )
        if self.llm_timeout_seconds <= 0:
            raise ValueError(
                f"LLM_TIMEOUT_SECONDS must be positive, got {self.llm_timeout_seconds}"
            )
        if self.retrieval_top_k <= 0:
            raise ValueError(f"TOP_K must be positive, got {self.retrieval_top_k}")
        if self.retrieval_diversity_max_per_project <= 0:
            raise ValueError(
                "RETRIEVAL_DIVERSITY_MAX_PER_PROJECT must be positive, got "
                f"{self.retrieval_diversity_max_per_project}"
            )
        if self.research_coverage_top_n < 0:
            raise ValueError(
                "RESEARCH_COVERAGE_TOP_N must be non-negative, got "
                f"{self.research_coverage_top_n}"
            )
        if self.research_coverage_top_n > self.retrieval_top_k:
            # A coverage set larger than the whole result would truncate away the
            # newest research it exists to guarantee (and squeeze out every semantic
            # pick); fail fast instead of silently under-delivering.
            raise ValueError(
                "RESEARCH_COVERAGE_TOP_N must be <= TOP_K "
                f"({self.research_coverage_top_n} > {self.retrieval_top_k})"
            )
        if self.rrf_k <= 0:
            raise ValueError(f"RRF_K must be positive, got {self.rrf_k}")
        if self.retrieval_dense_weight < 0:
            raise ValueError(
                "RETRIEVAL_DENSE_WEIGHT must be non-negative, got "
                f"{self.retrieval_dense_weight}"
            )
        if self.retrieval_lexical_weight < 0:
            raise ValueError(
                "RETRIEVAL_LEXICAL_WEIGHT must be non-negative, got "
                f"{self.retrieval_lexical_weight}"
            )
        if self.weak_retrieval_distance <= 0:
            raise ValueError(
                "WEAK_RETRIEVAL_DISTANCE must be positive, got "
                f"{self.weak_retrieval_distance}"
            )
        if self.rate_limit_requests <= 0:
            raise ValueError(
                f"RATE_LIMIT_REQUESTS must be positive, got {self.rate_limit_requests}"
            )
        if self.rate_limit_window_seconds <= 0:
            raise ValueError(
                "RATE_LIMIT_WINDOW_SECONDS must be positive, got "
                f"{self.rate_limit_window_seconds}"
            )
        if self.max_body_bytes <= 0:
            raise ValueError(
                f"MAX_BODY_BYTES must be positive, got {self.max_body_bytes}"
            )
        if self.input_max_chars <= 0:
            raise ValueError(
                f"INPUT_MAX_CHARS must be positive, got {self.input_max_chars}"
            )
        if self.llm_max_concurrency <= 0:
            raise ValueError(
                f"LLM_MAX_CONCURRENCY must be positive, got {self.llm_max_concurrency}"
            )
        # Must be > 0, not >= 0: asyncio.wait_for(acquire, timeout=0) always
        # times out — even with a free permit — so a 0 here would wedge the gate
        # shut (every request "busy") while the GPU sits idle.
        if self.llm_acquire_timeout_seconds <= 0:
            raise ValueError(
                "LLM_ACQUIRE_TIMEOUT_SECONDS must be positive, got "
                f"{self.llm_acquire_timeout_seconds}"
            )
        if self.memory_max_turns <= 0:
            raise ValueError(
                f"MEMORY_MAX_TURNS must be positive, got {self.memory_max_turns}"
            )
        if self.memory_max_sessions <= 0:
            raise ValueError(
                f"MEMORY_MAX_SESSIONS must be positive, got {self.memory_max_sessions}"
            )
        if self.memory_ttl_seconds <= 0:
            raise ValueError(
                f"MEMORY_TTL_SECONDS must be positive, got {self.memory_ttl_seconds}"
            )
