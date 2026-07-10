# LAUNCH.md — Bringing the chat live, step by step

The static site always works without any of this. The RAG chat is progressive
enhancement: when the backend is reachable and its local LLM is responding, the
/contact terminal gains free-form Q&A. When it is not, the terminal is
byte-for-byte identical to today — no error, no hint, no broken box. This
runbook is only about turning the chat on.

---

## 0. Prerequisites

Before you start, make sure the following are in place on the machine that will
run the stack.

| What | Why |
| --- | --- |
| Windows with WSL2 | `make`, `docker compose`, and GPU passthrough all depend on WSL2. Run every command in this guide from a WSL2 shell, not PowerShell. |
| Docker Desktop (WSL2 backend enabled) | The whole stack is Docker Compose. |
| `nvidia-container-toolkit` installed **inside WSL2** | The `ollama` container needs GPU access. Without it the model is unreachable and the health check never passes. [Installation guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) |
| An NVIDIA GPU (RTX class recommended) | The local model needs VRAM. The stack starts without a GPU but generation will be unusably slow. |
| A Cloudflare account (free tier is fine) | You need one named tunnel to publish the backend over a stable HTTPS hostname. |

---

## 1. Get the code

```bash
git pull origin master
```

Everything — the Astro site, the Docker Compose stack, the FastAPI backend, the
content corpus — is in the same repo.

---

## 2. Create a Cloudflare named tunnel and note its hostname

**Why a named tunnel, not a quick tunnel?**
A quick tunnel (`cloudflared tunnel --url ...`) generates a random hostname on
every restart. That hostname is baked into the Vercel build as
`PUBLIC_CHAT_API_URL` — so every restart would force a new build and redeploy.
A named tunnel gets a **permanent, stable hostname** that survives restarts and
reboots. You build once and toggle the chat simply by starting or stopping the
stack.

Steps in the Cloudflare dashboard:

1. Open **Zero Trust → Networks → Tunnels**.
2. Click **Create a tunnel**, choose **Cloudflared**, give it a name (e.g.
   `portfolio-chat`).
3. Under **Public hostname**, point the tunnel at the backend:
   - **Service type**: `HTTP`
   - **URL**: `backend:8000` — this is the Docker Compose service name;
     cloudflared reaches it over the internal Docker network.
4. Copy the **token** shown on the connector install page. This is
   `TUNNEL_TOKEN`.
5. Note the stable public hostname assigned to the tunnel (visible on the
   tunnel detail page after creation). This is `THE-TUNNEL-HOST` referenced
   throughout this runbook.

---

## 3. Configure `.env` at the repo root

The repo root contains `.env.example`. Copy it and fill in two values:

```bash
cp .env.example .env
```

Edit `.env`:

```
TUNNEL_TOKEN=<paste the token from step 2>
CORS_ALLOW_ORIGINS=https://mikkonumminen.dev
```

`CORS_ALLOW_ORIGINS` tells the backend which origin browsers are allowed to
call it from. Setting it to the real site URL prevents cross-origin request
blocks. You can leave `LLM_MODEL` at its default (`qwen2.5:7b`) or switch models any time with `ragctl model`.

> **These are secrets. `.env` is gitignored. Never commit it.**

---

## 4. Bring the stack up in WSL2

Run all of the following from the repo root inside WSL2.

**Start the full backend:**

```bash
make up
```

This starts three things in order: Postgres + pgvector, Ollama (with GPU), and
a one-shot `ollama-pull` service that downloads `qwen2.5:7b` into a named
Docker volume. The FastAPI backend only starts after the model pull completes,
so you cannot end up with a half-ready stack. **The first run downloads several
GB**; subsequent starts are fast because the model lives in the `ollama` named
volume and is reused.

**Index the content corpus (one-time job):**

```bash
make index
```

This embeds the `content/` folder into pgvector. Re-run only after editing
files under `content/`. Output looks like:
`N file(s), M chunk(s) (E embedded, S unchanged, D pruned) - T rows in DB`
A run with no content changes embeds nothing and writes nothing.

**Start the tunnel to make the backend publicly reachable:**

```bash
make up-public
```

`make up-public` is shorthand for `make up` followed by starting the
`cloudflared` tunnel container. If the stack is already running, this is safe
to re-run — it brings the tunnel up without restarting anything else.

---

## 5. Deploy the site with the tunnel hostname

Trigger a Vercel deployment with this build environment variable set:

```
PUBLIC_CHAT_API_URL=/api/rag
```

Set it in the Vercel project's **Environment Variables** (Settings → Environment
Variables), then redeploy. The value is not a secret — it is embedded in the
static HTML delivered to every browser — so plain (non-sensitive) env var
storage in Vercel is fine.

Since [ADR 0012](docs/decisions/0012-same-origin-chat-proxy.md), `vercel.json`
proxies `/api/rag/*` to the tunnel host server-side, so it's the rewrite
destinations in `vercel.json` — not this env var — that must match `THE-TUNNEL-HOST`.

Once the build is promoted to production, the site is wired to the backend.
No code changes, no further redeploys needed to toggle the chat on or off (see
section 7).

---

## 6. Verify

**Backend health check** — run this from anywhere on the public internet once
the tunnel is up:

```bash
curl https://THE-TUNNEL-HOST/health
```

Expected response:

```json
{ "status": "ok", "checks": { "db": true, "llm": true }, "model": "qwen2.5:7b" }
```

`checks.llm` must be `true`. The LLM check sends a real 1-token completion, so
it confirms the model is actually generating — not just that the process is
running. If the model is still warming up after a fresh start, wait a few
seconds and retry.

**Live site check:** open `/contact` in a browser. The terminal fires one
`/health` probe in the background on page load. When `checks.llm` is `true`,
the terminal quietly unlocks free-form chat for the rest of that session. Type
a question and the local model answers it. There is no loading indicator for
the unlock itself — the terminal just starts accepting questions.

---

## 7. On/off behavior

The chat is controlled by whether your machine is running the stack, not by the
Vercel deployment.

| State | What visitors see |
| --- | --- |
| `make up-public` running, LLM healthy | Chat available; the `/health` probe passes on page load and the terminal unlocks free-form input |
| Stack stopped (`make down`) or tunnel down | Terminal is scripted-only; no visual difference — the probe times out silently and the terminal behaves exactly as before |
| Machine off | Same as above — the probe fails immediately and the terminal falls back |

**No rebuild or redeploy needed to toggle the chat.** The static build has
`PUBLIC_CHAT_API_URL` baked in, and the frontend re-probes `/health` on every
page load. Stop the stack and the next visitor sees the scripted terminal. Start
it again and the one after that gets the chat.

---

## Troubleshooting

**Chat does not appear on the live site**

1. Run `curl https://THE-TUNNEL-HOST/health` from the public internet. If the
   request fails or times out: the tunnel is not running. Check `make ps` in
   WSL2 and run `make up-public` if the tunnel container is absent or stopped.
2. Check `checks.llm` in the health response. If it is `false`: Ollama is up
   but the model has not finished loading or is not responding. Check
   `docker compose logs ollama` and retry after a moment.
3. Check the browser console for a CORS error. If one appears:
   `CORS_ALLOW_ORIGINS` in `.env` does not match the site's exact origin.
   Update `.env` and restart the backend: `docker compose restart backend`.
4. Check that the `/api/rag/*` rewrite destinations in `vercel.json` match the
   tunnel hostname exactly (ADR 0012). A mismatch means the proxy forwards to
   the wrong URL, and a missing `PUBLIC_CHAT_API_URL` value means the chat
   layer is fully dormant regardless of backend state.

**`make up` fails with GPU errors**

With Docker Desktop's WSL2 backend you do **not** install
`nvidia-container-toolkit` in the distro yourself — Docker Desktop provides the
GPU passthrough. Confirm the host has a current NVIDIA driver and that Settings →
Resources → WSL Integration is enabled for your distro, then test passthrough
before starting the stack:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

If that exact tag is unavailable, any recent `nvidia/cuda:*-base-ubuntu22.04`
tag works — the test only needs `nvidia-smi` to print your GPU.

**Stack is up but `make index` errors**

`make index` runs as its own one-shot container that waits for Postgres and the
model pull before it starts — it does not depend on the long-lived `backend`
service being healthy. If it errors, make sure `make up` has been run first so
the `db` service is up (`make ps` shows each service's state), then re-run
`make index`.
