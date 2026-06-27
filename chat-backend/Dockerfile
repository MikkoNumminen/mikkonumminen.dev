# Backend image: the in-process embedder + indexer (Phase 1) and, from Phase 2,
# the FastAPI service. One image serves all backend roles; the compose file
# picks the command (indexer as a one-shot `run`, API as the long-lived service).

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # fastembed cache path; the ONNX weights are baked here at build time (below)
    # so startup loads them from the image, never from the network.
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
# evals/ is not a wheel package, but `python -m evals.run_eval` resolves it from
# the WORKDIR — so it must be physically present in the image (the later
# `chown -R /srv` then makes it readable by the non-root user).
COPY evals ./evals
RUN pip install -e .

# Bake the embedding model into the image at build time so the container never
# fetches it from the HF Hub on startup. That runtime fetch intermittently hung
# (HF latency / local TLS scanning), wedging the backend at "Waiting for
# application startup" and 502-ing the funnel. The download happens once here,
# where a hang is a retried build step rather than a dead service.
#
# This model name MUST match _DEFAULT_EMBEDDING_MODEL in app/config.py: only the
# baked model is available at runtime, because HF_HUB_OFFLINE=1 (below) blocks any
# fetch — so a runtime EMBEDDING_MODEL override would crash at startup. Changing
# the model means editing both and rebuilding. NOTE: this step needs network at
# build time (it fails if the HF Hub is unreachable).
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"

# After the model is baked, force the runtime fully offline for HF so a startup
# load reads ONLY the baked cache and never touches the network. (Setting this
# BEFORE the bake would break the download above.)
ENV HF_HUB_OFFLINE=1

# Run unprivileged. The model cache is baked into the image (no volume now), so
# chown /srv to the fixed UID makes it readable by the non-root runtime user.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /srv
USER appuser

# Default command runs the API. The indexer is a one-shot override:
#   docker compose run --rm backend python -m app.indexer
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
