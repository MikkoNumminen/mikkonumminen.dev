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
# lookup of `sql/` beside `app/` (see indexer.SQL_PATH) resolves the same way it
# does when run from a source checkout. A plain `pip install .` would copy
# `app` into site-packages and orphan the sibling `sql/` directory.
COPY pyproject.toml ./
COPY app ./app
COPY sql ./sql
RUN pip install -e .

# Default to the indexer; the long-running API command is set by compose in
# Phase 5. `docker compose run --rm backend python -m app.indexer` overrides this.
CMD ["python", "-m", "app.indexer"]
