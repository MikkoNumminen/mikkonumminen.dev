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
  `doctor` / `model` / `english` / `usage` / `prune` / `watchdog`. Boot it live
  with `ragctl up --keep` (all-green board incl. `public /health ok`); it enables
  the funnel via the **Windows `tailscale.exe` over WSL interop**, so **no sudo** —
  do not run the distro's Linux `tailscale funnel …` by hand, it needs sudo and
  hangs on the password prompt.
- **Auto-recovery:** `ragctl watchdog` guards the **public visitor path** unattended
  and self-heals a stale funnel ingress (the failure below). It polls the Vercel
  URL — a true external probe, not a hairpin, so it sees the "local green, public
  502" state nothing local can — and on a confirmed outage (backend + uplink still
  healthy) escalates a scoped `funnel --bg 8000` re-assert → `tailscale down/up`,
  with a cooldown so it can't flap and never touching another project's port. Runs
  until Ctrl-C; leave it running in a WSL pane, or start it on boot via Task
  Scheduler / a login hook. Tune with `--interval` / `--fail-threshold` /
  `--cooldown`.
- **Shared funnel — never blanket-reset.** This operator runs Tailscale Funnels
  for **other projects on the same tailnet**, so treat the funnel as shared infra.
  This project owns `443 → 127.0.0.1:8000` on its node; `tailscale funnel status`
  lists the other projects' routes alongside it (e.g. `:8443 → 127.0.0.1:4180`),
  so "a funnel is on" never means *this* one is. `ragctl` reads
  `funnel status --json` and asserts the `:443` route proxies to `:8000`
  specifically — a status row reading `other funnels on, :443→8000 off` means
  exactly that, and `ragctl up` re-enables it. `up` / `down` scope every change to
  that one port (`tailscale funnel --bg 8000` /
  `tailscale funnel --https=443 off`) — **never `tailscale funnel reset` or a
  blanket `off`**, which would tear down the other projects' funnels.

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

> GitHub is the **sync + record** path here, not a runtime dependency — the stack
> builds and runs entirely from local files. For a quick local-only test you can
> skip the round-trip and copy `chat-backend/` straight into the clone (or build
> from your worktree). Routing through `master` is what keeps the clone, your other
> checkout, and the record all in agreement on "what's deployed".

### ⚠️ Pre-flight — confirm the working tree actually updated

WSL's 9p filesystem can serve **stale cached files for a while after a `git
pull`**: `git`, `grep`, and `docker build` may keep reading the *pre-pull*
versions. Building or indexing in that window bakes old code, or **prunes corpus
chunks that the stale `content/` no longer lists**. Verify the working tree
reflects the new HEAD before doing anything else:

```bash
git -C /home/vandroy/mikkonumminen.dev rev-parse --short HEAD   # == the commit you pushed
git -C /home/vandroy/mikkonumminen.dev status -sb | head -1     # on master, not "behind"
grep -c <symbol-from-your-change> chat-backend/app/pipeline.py  # a symbol you just added is present
ls content/narratives | wc -l                                  # any corpus you added is on disk
```

If these still show the old state, **wait a moment and re-check** (or open a fresh
shell) — do not proceed until they reflect the pushed commit.

### Rebuild + recreate (code changes)

```bash
docker compose -p mikkonumminendev build backend
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

**Front-matter-only changes propagate too.** Editing just a header field
(`type:`/`project:`/`date:`/`title:`) leaves the chunk *content* — and its hash —
unchanged, so nothing re-embeds; but the indexer now also runs a doc-level
metadata refresh, so those columns still update (watch the `metadata-refreshed`
count in the done line). Tagging a post `type: research` therefore takes effect on
the next re-index with **no manual SQL** — earlier this silently no-op'd because
the content-hash reconcile skipped the source entirely.

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

### A clean corpus does not prove good *retrieval*

A healthy `doc_type` table — every project indexed, all `public` — can still hide
a broken chat. Meta-content (the site's own `portfolio` self-docs, and the ADRs)
can dominate *generic* questions and crowd out the showcased projects, so the chat
describes mikkonumminen.dev's own pages instead of HRM / AudiobookMaker / etc.
(this regression shipped once). So after any re-index — especially one that adds
meta-content like ADRs — post a **generic** project question to `/chat` ("tell me
about the projects", "which project is the most complex") and confirm the answer
names *several distinct showcased projects*, not just the portfolio site and with
no `decisions/` sources.

If it collapses onto the site, two config knobs tune the default retrieval (no code
change — set the env var, then recreate the backend):

- `RETRIEVAL_EXCLUDE_DOC_TYPES` (default `adr`) — doc types kept out of visitor
  retrieval, so engineering ADRs never reach an answer.
- `RETRIEVAL_DIVERSITY_MAX_PER_PROJECT` (default `1`) — max chunks per project on
  generic queries, so the showcased work spreads across the answer. Named-project
  questions are never capped.

## Recovery — a stale re-index pruned the corpus

If a re-index ran against a stale `content/` and dropped chunks (e.g. `narrative`
disappears from the `doc_type` counts), it is **fully recoverable**: confirm the
working tree is current (pre-flight above), then re-run the indexer. It re-embeds
the missing chunks additively. Nothing is lost — the index is entirely derived
from the corpus on disk.
