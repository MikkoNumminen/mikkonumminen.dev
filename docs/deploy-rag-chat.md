# Deploying the RAG chat backend

Operational runbook for shipping changes to the local RAG chat that powers the
`/contact` terminal. The backend lives in [`chat-backend/`](../chat-backend/); see
[`docs/rag-chat.md`](rag-chat.md) for the as-built architecture and the
`rag-backend` skill for the file map.

## Where the live stack runs

- **Host:** a local box (WSL2 + Docker Desktop, RTX GPU), exposed publicly via
  Tailscale Funnel. The Vercel frontend reveals chat only when `/health` reports
  `checks.llm === true`.
- **Source of truth for the running stack:** the **WSL-native clone** (for this
  operator, `/home/vandroy/mikkonumminen.dev` in the Ubuntu distro — its own
  `.git`). This is a *separate* checkout from any Windows `D:` working copy. Docker
  Compose builds the backend image from `chat-backend/` there, bind-mounts
  `content/ -> /content` and the ADRs `-> /adr`, and persists the index in the `db`
  volume.
- **Compose project name:** `mikkonumminendev` (containers
  `mikkonumminendev-{backend,ollama,db}-1`).
- **Ops CLI:** `ragctl` (`chat-backend/ragctl.py`) — `status` / `up` / `down` /
  `doctor` / `model` / `english` / `usage` / `prune`.

## What needs a rebuild vs. a re-index

| Change | Action |
| --- | --- |
| `chat-backend/app/**` (runtime code) | rebuild the image **+** recreate the container |
| `content/**`, `docs/decisions/**` (corpus / ADRs) | re-index only (`content/` is bind-mounted, no rebuild) |
| chunking / indexer / classification logic | rebuild **then** re-index (the new indexer must run) |

## Deploy sequence

Run everything from the WSL clone. **First push your merged changes to GitHub**
(from wherever you committed them), then pull them into the live clone:

```bash
cd /home/vandroy/mikkonumminen.dev
git pull --ff-only origin master
```

### ⚠️ Pre-flight — confirm the working tree actually updated

WSL's 9p filesystem can serve **stale cached files for a while after a `git
pull`**: `git`, `grep`, and `docker build` may keep reading the *pre-pull*
versions. Building or indexing in that window bakes old code, or **prunes corpus
chunks that the stale `content/` no longer lists**. Verify the working tree
reflects the new HEAD before doing anything else:

```bash
git -C /home/vandroy/mikkonumminen.dev rev-parse --short HEAD   # == the commit you pushed
grep -rc "" chat-backend/app/pipeline.py >/dev/null            # sanity: file is readable
grep -c sse_context chat-backend/app/pipeline.py               # expect a recent feature to be present
ls content/narratives | wc -l                                  # expect the current narrative count
```

If these still show the old state, **wait a moment and re-check** (or open a fresh
shell) — do not proceed until they reflect the pushed commit.

### Rebuild + recreate (code changes)

```bash
docker compose build backend
docker compose -p mikkonumminendev up -d --force-recreate backend
```

After recreate, sanity-check the running container picked up the new code and env:

```bash
docker exec mikkonumminendev-backend-1 sh -lc \
  'grep -c sse_context /srv/app/pipeline.py; printenv CONTEXT_WINDOW'
```

### Re-index (corpus / indexer changes)

```bash
docker compose -p mikkonumminendev run --rm backend python -m app.indexer
```

The indexer is **idempotent and additive** (sha256 per chunk): it embeds new /
changed chunks, leaves unchanged ones, and prunes only chunks whose source is no
longer in the corpus. A healthy run on an up-to-date tree reports **`0 pruned`**.

> **Never `TRUNCATE documents`.** It wipes the live index that serves the contact
> terminal and is blocked in automated contexts for good reason. A full corpus
> rebuild is simply an additive re-index against the complete corpus — no truncate
> required.

## Verify the deploy

```bash
# health — expect {"status":"ok","checks":{"db":true,"llm":true}, ...}
docker exec mikkonumminendev-backend-1 python -c \
  "import urllib.request;print(urllib.request.urlopen('http://localhost:8000/health').read().decode())"

# corpus shape — expect adr + narrative present alongside code/prose
docker exec mikkonumminendev-db-1 psql -U rag -d rag -tc \
  "select doc_type, count(*) from documents group by 1 order by 2 desc;"
```

A full end-to-end check posts to `/chat` and confirms the cited `sources`, the
progressive-disclosure offer ("Would you like me to tell you more?"), and the
`context` frame (`{used, limit}`). The `rag-audit` skill carries the acceptance
battery (containment + retrieval cases).

## Recovery — a stale re-index pruned the corpus

If a re-index ran against a stale `content/` and dropped chunks (e.g. `narrative`
disappears from the `doc_type` counts), it is **fully recoverable**: confirm the
working tree is current (pre-flight above), then re-run the indexer. It re-embeds
the missing chunks additively. Nothing is lost — the index is entirely derived
from the corpus on disk.
