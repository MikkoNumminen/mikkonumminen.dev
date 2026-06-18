"""Tests for env-driven configuration parsing and validation."""

from __future__ import annotations

import pytest

from app.config import Settings

# Every env var config reads, so a test can wipe the slate and assert defaults
# regardless of what the host environment happens to set.
_CONFIG_ENV_VARS = [
    "DATABASE_URL",
    "CONTENT_DIR",
    "EMBEDDING_MODEL",
    "EMBEDDING_DIM",
    "CHUNK_MAX_TOKENS",
    "CHUNK_MIN_TOKENS",
    "CHUNK_OVERLAP_TOKENS",
    "OLLAMA_BASE_URL",
    "LLM_MODEL",
    "LLM_TIMEOUT_SECONDS",
    "TOP_K",
    "CORS_ALLOW_ORIGINS",
    "WEAK_RETRIEVAL_DISTANCE",
    "RATE_LIMIT_REQUESTS",
    "RATE_LIMIT_WINDOW_SECONDS",
    "MAX_BODY_BYTES",
]


@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in _CONFIG_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def test_defaults(clean_env: None) -> None:
    settings = Settings.from_env()
    assert settings.embedding_model == "BAAI/bge-small-en-v1.5"
    assert settings.embedding_dim == 384
    assert settings.content_dir == "content"
    assert settings.chunk_max_tokens == 480
    assert settings.llm_model == "gemma4:e4b"
    assert settings.ollama_base_url.endswith("/v1")


def test_phase4_defaults(clean_env: None) -> None:
    settings = Settings.from_env()
    assert settings.retrieval_top_k == 5
    assert settings.cors_allow_origins == ["*"]
    assert settings.weak_retrieval_distance == 0.7
    assert settings.rate_limit_requests == 30
    assert settings.rate_limit_window_seconds == 60.0
    assert settings.max_body_bytes == 16384


def test_cors_origins_parsed_as_list(
    clean_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS", "https://mikkonumminen.dev, https://example.com"
    )
    settings = Settings.from_env()
    assert settings.cors_allow_origins == [
        "https://mikkonumminen.dev",
        "https://example.com",
    ]


def test_bad_weak_distance_raises(
    clean_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WEAK_RETRIEVAL_DISTANCE", "0")
    with pytest.raises(ValueError, match="WEAK_RETRIEVAL_DISTANCE"):
        Settings.from_env()


def test_non_numeric_weak_distance_raises(
    clean_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("WEAK_RETRIEVAL_DISTANCE", "nope")
    with pytest.raises(ValueError, match="WEAK_RETRIEVAL_DISTANCE"):
        Settings.from_env()


def test_env_overrides(clean_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMBEDDING_DIM", "768")
    monkeypatch.setenv("CONTENT_DIR", "/tmp/corpus")
    monkeypatch.setenv("LLM_MODEL", "gemma4:e4b-q8")
    settings = Settings.from_env()
    assert settings.embedding_dim == 768
    assert settings.content_dir == "/tmp/corpus"
    assert settings.llm_model == "gemma4:e4b-q8"


def test_empty_string_falls_back_to_default(
    clean_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    # An env file line like `EMBEDDING_MODEL=` must not blank out the default.
    monkeypatch.setenv("EMBEDDING_MODEL", "")
    monkeypatch.setenv("EMBEDDING_DIM", "")
    settings = Settings.from_env()
    assert settings.embedding_model == "BAAI/bge-small-en-v1.5"
    assert settings.embedding_dim == 384


def test_non_integer_env_raises(clean_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMBEDDING_DIM", "not-a-number")
    with pytest.raises(ValueError, match="EMBEDDING_DIM"):
        Settings.from_env()


def test_min_must_be_below_max(clean_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHUNK_MIN_TOKENS", "500")
    monkeypatch.setenv("CHUNK_MAX_TOKENS", "480")
    with pytest.raises(ValueError, match="CHUNK_MIN_TOKENS"):
        Settings.from_env()


def test_overlap_must_be_below_max(
    clean_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CHUNK_OVERLAP_TOKENS", "480")
    monkeypatch.setenv("CHUNK_MAX_TOKENS", "480")
    with pytest.raises(ValueError, match="CHUNK_OVERLAP_TOKENS"):
        Settings.from_env()


def test_zero_dim_raises(clean_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMBEDDING_DIM", "0")
    with pytest.raises(ValueError, match="EMBEDDING_DIM must be positive"):
        Settings.from_env()
