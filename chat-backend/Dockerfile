# Backend image: the in-process embedder + indexer (Phase 1) and, from Phase 2,
# the FastAPI service. One image serves all backend roles; the compose file
# picks the command (indexer as a one-shot `run`, API as the long-lived service).

FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # fastembed cache path; the ONNX weights are baked here at build time (below)
    # so startup loads them from the image, never from the network. The name is
    # _PATH, not _DIR: fastembed reads only FASTEMBED_CACHE_PATH, so the near-miss
    # spelling silently fell back to the default under /tmp, outside the chown
    # below, and every boot logged a permission warning against a root-owned cache.
    FASTEMBED_CACHE_PATH=/srv/.fastembed-cache

WORKDIR /srv

# Install fastembed and bake the embedding model FIRST, from layers that depend
# only on the explicit version below — NOT on pyproject or app source — so
# neither a dependency bump nor an app edit re-triggers the ~130MB model download
# on rebuild (the dev loop rebuilds the backend often). Keep this version in sync
# with the fastembed pin in pyproject.toml.
#
# The model is baked so the container never fetches it from the HF Hub on
# startup: that runtime fetch intermittently hung (HF latency / local TLS
# scanning), wedging the backend at "Waiting for application startup" and
# 502-ing the funnel. The download happens once here, where a hang is a retried
# build step rather than a dead service. This model name MUST match
# _DEFAULT_EMBEDDING_MODEL in app/config.py. NOTE: this step needs network at
# build time (it fails if the HF Hub is unreachable).
RUN pip install "fastembed==0.8.0"
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"
# lingua's wheel is ~170MB (embedded language models) — same early-layer rule as
# fastembed above: installed before the app COPY so a code edit never re-downloads
# it (the `pip install -e .` layer below is invalidated by every app change, and
# large downloads are the flaky part of a rebuild on this network). Keep the
# version floor in sync with pyproject.toml.
RUN pip install "lingua-language-detector>=2.1"

# After the model is baked, force the runtime fully offline for HF so a startup
# load reads ONLY the baked cache and never touches the network. HF_HUB_OFFLINE=1
# also means a runtime EMBEDDING_MODEL override (to a non-baked model) crashes at
# startup. (Setting this BEFORE the bake would break the download above.)
ENV HF_HUB_OFFLINE=1

# Install with `-e` (editable) on purpose: it installs the remaining dependencies
# and makes `app` importable while leaving the source tree in place, so the
# runtime lookup of `sql/` beside `app/` (see db.SQL_PATH) resolves the same way
# it does when run from a source checkout. A plain `pip install .` would copy
# `app` into site-packages and orphan the sibling `sql/` directory.
COPY pyproject.toml ./
COPY app ./app
COPY sql ./sql
# evals/ is not a wheel package, but `python -m evals.run_eval` resolves it from
# the WORKDIR — so it must be physically present in the image (the later
# `chown -R /srv` then makes it readable by the non-root user).
COPY evals ./evals
RUN pip install -e .

# Run unprivileged. The model cache is baked into the image (no volume now), so
# chown /srv to the fixed UID makes it readable by the non-root runtime user.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /srv
USER appuser

# Default command runs the API. The indexer is a one-shot override:
#   docker compose run --rm backend python -m app.indexer
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
