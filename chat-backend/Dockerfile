# Backend image: the in-process embedder + indexer (Phase 1) and, from Phase 2,
# the FastAPI service. One image serves all backend roles; the compose file
# picks the command (indexer as a one-shot `run`, API as the long-lived service).

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # fastembed downloads the ONNX weights on first use; pin the cache to a
    # stable path so a mounted volume can persist it across container restarts
    # (wired up in the compose file) instead of re-downloading every boot.
    FASTEMBED_CACHE_DIR=/srv/.fastembed-cache

WORKDIR /srv

# Install with `-e` (editable) on purpose: it installs the dependencies and
# makes `app` importable while leaving the source tree in place, so the runtime
# lookup of `sql/` beside `app/` (see db.SQL_PATH) resolves the same way it
# does when run from a source checkout. A plain `pip install .` would copy
# `app` into site-packages and orphan the sibling `sql/` directory.
COPY pyproject.toml ./
COPY app ./app
COPY sql ./sql
RUN pip install -e .

# Run unprivileged. Pin a fixed UID so a mounted fastembed-cache volume's
# ownership is predictable across hosts, and pre-create + own the cache dir so
# the first-use ONNX download succeeds as the non-root user. When Phase 5 wires
# the cache as a volume, a host bind-mount target must be owned by UID 10001 (a
# Docker named volume inherits this image-path ownership automatically).
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p "$FASTEMBED_CACHE_DIR" \
    && chown -R appuser:appuser /srv
USER appuser

# Default command runs the API. The indexer is a one-shot override:
#   docker compose run --rm backend python -m app.indexer
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
