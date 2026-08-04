"""Contracts between the backend image and the things that must agree with it.

Both of these were live bugs, and both were invisible: a green CI run said
nothing about either, because CI never builds the Dockerfile.

Deliberately asserted from the files rather than from a shared constant. The
point is to catch an edit to ONE of two places that have to move together, and
a shared constant would remove the second place instead of guarding it.
"""

from __future__ import annotations

import re
from pathlib import Path

CHAT_BACKEND = Path(__file__).resolve().parents[1]
REPO_ROOT = CHAT_BACKEND.parent
DOCKERFILE = CHAT_BACKEND / "Dockerfile"
CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"


def _image_python_version() -> str:
    text = DOCKERFILE.read_text(encoding="utf-8")
    m = re.search(r"^FROM python:(\d+\.\d+)-slim", text, re.M)
    assert m, "could not find the python base image in chat-backend/Dockerfile"
    return m.group(1)


def _ci_python_versions() -> list[str]:
    text = CI_WORKFLOW.read_text(encoding="utf-8")
    return re.findall(r"python-version: '([\d.]+)'", text)


def test_ci_tests_on_the_version_the_image_ships() -> None:
    """A Dependabot bump of the base image does not touch ci.yml, so the two
    drift apart silently and the suite goes on vouching for a version that is no
    longer shipped. That is exactly what #501 did: it moved the image 3.12 -> 3.14
    with a green `chat-backend` check that had run entirely on 3.12."""
    image = _image_python_version()
    ci = _ci_python_versions()
    assert ci, "no python-version pin found in ci.yml"
    assert all(v == image for v in ci), (
        f"chat-backend/Dockerfile ships python {image} but ci.yml tests on {ci}. "
        "Bump the workflow to match, or the suite is testing a version nobody runs."
    )


def test_fastembed_cache_env_var_is_the_one_fastembed_reads() -> None:
    """fastembed reads FASTEMBED_CACHE_PATH and nothing else. The Dockerfile used
    to set FASTEMBED_CACHE_DIR, which looks right, does nothing, and fails toward
    working: the model still baked, just into fastembed's default under /tmp,
    outside the `chown -R appuser /srv`. Result was a root-owned cache the
    non-root runtime user could not write, a permission warning on every boot,
    and a comment in the Dockerfile claiming a location that held no weights."""
    text = DOCKERFILE.read_text(encoding="utf-8")
    assert "FASTEMBED_CACHE_PATH=" in text, "the Dockerfile must set FASTEMBED_CACHE_PATH"
    assert "FASTEMBED_CACHE_DIR" not in text, (
        "FASTEMBED_CACHE_DIR is not read by fastembed; use FASTEMBED_CACHE_PATH"
    )


def test_the_baked_cache_lives_where_the_chown_reaches() -> None:
    """Baking the model outside the chowned tree is what made the misspelling
    bite, so pin the relationship rather than just the spelling."""
    text = DOCKERFILE.read_text(encoding="utf-8")
    m = re.search(r"FASTEMBED_CACHE_PATH=(\S+)", text)
    assert m, "no FASTEMBED_CACHE_PATH value found"
    cache_path = m.group(1)
    assert cache_path.startswith("/srv/"), (
        f"the fastembed cache is baked at {cache_path}, outside /srv. "
        "`chown -R appuser:appuser /srv` then never reaches it and the non-root "
        "user gets a read-only cache."
    )
    assert "chown -R appuser:appuser /srv" in text
