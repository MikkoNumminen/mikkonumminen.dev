#!/usr/bin/env python3
"""ragctl — operator CLI for the local RAG chat stack.

One tool that owns the whole "get the rag live" lifecycle: it brings up the
dependencies (Docker Desktop, the Compose stack, Ollama, the Tailscale Funnel),
shows a live status board so you can watch the run go green, and tears it all
down cleanly so nothing lingers.

Runs INSIDE WSL2 (where docker + ollama live) and reaches the Windows-side apps
(Docker Desktop, Tailscale) over WSL interop. Pure stdlib — no pip install — so
it runs with any python3.

  python chat-backend/ragctl.py status     one-shot status board
  python chat-backend/ragctl.py watch      live board (refreshes; Ctrl-C exits)
  python chat-backend/ragctl.py doctor     board + security pre-flight + versions
  python chat-backend/ragctl.py up         bring the stack live, then hold the
                                           live board; Ctrl-C tears it down
  python chat-backend/ragctl.py up --keep  bring it live and leave it running
  python chat-backend/ragctl.py down       cut the rag: compose down + funnel off
  python chat-backend/ragctl.py model NAME --effort quick|balanced|thorough
                                           [--context 4k|8k|16k]  switch model + tuning
  python chat-backend/ragctl.py english on|off  force English across all models
  python chat-backend/ragctl.py features   list the RAG dials + what the
                                           container actually resolved
  python chat-backend/ragctl.py feature NAME VALUE  set one dial (on|off or a
                                           number) and recreate the backend
  python chat-backend/ragctl.py            (no command, on a TTY) -> interactive
                                           REPL: bare commands, Tab-complete, the
                                           menu reprinted after each command

Cleanup policy (chosen): `down` stops the Compose stack (frees VRAM) and turns
the Funnel off, but leaves Docker Desktop and Tailscale running.

It also carries the shoutbox moderation verbs — `queue`, `approve`, `reject`,
`reply`, and `publish` — for reviewing and answering visitor submissions.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
COMPOSE = ["docker", "compose"]
# Per-request log (query + answer). The compose backend bind-mounts the host dir
# below to this container path; `ragctl up` enables it. Host file == REPO/rag-logs.
RAG_LOG_DIR = REPO / "rag-logs"
RAG_LOG_CONTAINER_FILE = "/srv/rag-logs/requests.jsonl"
# The autostarted background watchdog records its pid here and streams its output
# to the log beside it, so `up` can spawn it, `down` can stop it, and `status`
# can report whether it's running.
WATCHDOG_PID_FILE = RAG_LOG_DIR / "watchdog.pid"
WATCHDOG_LOG_FILE = RAG_LOG_DIR / "watchdog.log"
BACKEND_HEALTH = "http://localhost:8000/health"
BACKEND_CHAT = "http://localhost:8000/chat"
BACKEND_USAGE = "http://localhost:8000/usage"
FUNNEL_PORT = "8000"
# The public HTTPS port this project's funnel occupies. The node is shared with
# other projects' funnels (on other ports), so every enable/disable — and the
# status check — is scoped to exactly this one.
FUNNEL_HTTPS_PORT = "443"
# The genuine end-to-end visitor path: browser -> Vercel rewrite -> funnel ->
# backend. Probing this from the node is NOT a hairpin — it goes out to the
# internet and back — so it can see the "local healthy, public path dead" state
# that every local check misses (the 2026-07-20 stale-ingress outage).
PUBLIC_SITE_HEALTH_URL = "https://mikkonumminen-dev.vercel.app/api/rag/health"
# Same host, static root: Vercel serves it healthily (2xx) whenever the uplink
# is up AND Vercel is up, regardless of OUR funnel. Healthy here but /api/rag
# down => the funnel is the problem (recover it). NOT healthy (dead uplink, or a
# Vercel-side 5xx) => not something a tailscale reconnect can fix, so the
# watchdog must stand down rather than flap the node against it.
UPLINK_PROBE_URL = "https://mikkonumminen-dev.vercel.app/"
# Stop churning the SHARED node: after this many down/up attempts in one outage
# without recovery, the watchdog gives up and only alerts, rather than flapping
# the node (and the other project's :8443 funnel) every cooldown against
# something a reconnect can't fix — expired tailscale auth, a Vercel incident.
WATCHDOG_RECONNECT_CAP = 3
DOCKER_DESKTOP_EXE = "/mnt/c/Program Files/Docker/Docker/Docker Desktop.exe"

# "effort" presets -> (temperature, num_predict). Low temperature for grounded
# RAG; effort mainly buys answer length (num_predict = max output tokens).
#
# "balanced" MUST track Settings.llm_num_predict's default. `ragctl model`
# defaults to this preset and writes LLM_NUM_PREDICT into the live .env
# unconditionally, so a stale value here silently pins the cap back on the next
# model swap and undoes whatever the code default says. That is how a fix
# reverts itself months later with nothing in the diff to show for it.
EFFORT_PRESETS = {
    "quick": (0.2, 512),
    "balanced": (0.4, 1024),
    "thorough": (0.6, 2048),
}
# "context" presets -> served context window (num_ctx). More context = more VRAM.
CONTEXT_PRESETS = {"4k": 4096, "8k": 8192, "16k": 16384}

# --- tiny terminal helpers -------------------------------------------------

USE_COLOR = sys.stdout.isatty() and os.environ.get("TERM") != "dumb"


def _c(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if USE_COLOR else text


# state -> (glyph, colour code)
_GLYPH = {
    "ok": ("●", "32"),  # green
    "busy": ("◐", "33"),  # yellow
    "warn": ("▲", "33"),  # yellow
    "down": ("○", "31"),  # red
}


def _line(label: str, result: tuple[str, str]) -> str:
    state, detail = result
    glyph, code = _GLYPH.get(state, ("?", "0"))
    # Colour the dot AND the result value by state (green ok / yellow busy|warn /
    # red down); leave the label column in the terminal's default colour.
    return f"  {_c(glyph, code)} {label:<22} {_c(detail, code)}"


# --- subprocess + interop --------------------------------------------------


def run(cmd: list[str], timeout: int = 30, cwd: Path | None = None) -> tuple[int, str]:
    try:
        p = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            errors="replace",  # Windows exes (tasklist) emit non-UTF-8 bytes
            timeout=timeout,
        )
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except FileNotFoundError:
        return 127, ""
    except subprocess.TimeoutExpired:
        return 124, ""


def _win_exe(name: str, *fallbacks: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    for f in fallbacks:
        if Path(f).exists():
            return f
    return None


def tailscale_exe() -> str | None:
    return _win_exe("tailscale.exe", "/mnt/c/Program Files/Tailscale/tailscale.exe")


def tasklist_exe() -> str | None:
    return _win_exe("tasklist.exe", "/mnt/c/Windows/System32/tasklist.exe")


def powershell_exe() -> str | None:
    return _win_exe(
        "powershell.exe",
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
    )


def http_json(url: str, timeout: int = 8) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            parsed: dict[str, Any] = json.loads(r.read().decode())
            return parsed
    except Exception:
        return None


def configured_model() -> str:
    env = REPO / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("LLM_MODEL="):
                return line.split("=", 1)[1].strip()
    return "qwen2.5:7b"


def configured_force_english() -> bool:
    """Read FORCE_ENGLISH from the repo .env (default on, matching config.py).

    Lenient on purpose — only the explicit false words turn it off; anything
    else (incl. empty / unset / a typo) falls back to the on default, so the
    board never silently reports English-off because of a malformed value.
    """
    env = REPO / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("FORCE_ENGLISH="):
                return line.split("=", 1)[1].strip().lower() not in (
                    "0",
                    "false",
                    "no",
                    "off",
                )
    return True


def list_models() -> list[str]:
    rc, out = run(
        COMPOSE + ["exec", "-T", "ollama", "ollama", "list"],
        cwd=REPO,
        timeout=15,
    )
    if rc != 0:
        return []
    return [
        ln.split()[0]
        for ln in out.splitlines()
        if ln.strip() and not ln.startswith("NAME")
    ]


def set_env_vars(updates: dict[str, str]) -> bool:
    """Upsert KEY=value pairs in the repo .env, preserving the other lines.

    Returns False on an IO failure rather than raising: every caller then
    recreates the backend, and doing that after a failed write would apply the
    OLD config while reporting the new one. The sibling readers in this file
    already catch OSError; this one did not, so a read-only .env surfaced as a
    traceback in one-shot CLI mode.
    """
    env = REPO / ".env"
    try:
        lines = env.read_text(encoding="utf-8").splitlines() if env.exists() else []
    except OSError as err:
        print(f"\n  could not read {env}: {err}\n")
        return False
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        key = (
            line.split("=", 1)[0]
            if "=" in line and not line.lstrip().startswith("#")
            else None
        )
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, val in updates.items():
        if key not in seen:
            out.append(f"{key}={val}")
    try:
        env.write_text("\n".join(out) + "\n", encoding="utf-8")
    except OSError as err:
        print(f"\n  could not write {env}: {err}\n")
        return False
    return True


def configured_rag_log() -> str:
    """Read RAG_LOG_FILE from the repo .env (empty/unset -> logging off)."""
    env = REPO / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("RAG_LOG_FILE="):
                return line.split("=", 1)[1].strip()
    return ""


def ensure_request_log() -> None:
    """Make sure the per-request log (query + answer) is on and persisted before
    the stack comes up: create the host dir the compose file bind-mounts, make it
    writable by the backend's uid 10001, and point RAG_LOG_FILE at the mounted
    path if it isn't set. Logging stays opt-in in the repo; RAG Control is what
    turns it on."""
    # 0o777 is deliberate: the backend writes the log as the non-root uid 10001,
    # so the bind-mounted host dir must be writable by a different uid; this host
    # is single-operator-local, so world-write is tolerated. (On a Windows Docker
    # Desktop host the chmod is a near no-op — writability comes from the mount
    # translation — but it is correct + necessary when ragctl runs on Linux.)
    try:
        RAG_LOG_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(RAG_LOG_DIR, 0o777)
    except OSError as exc:
        print(_c(f"  ⚠ could not prepare rag-logs/ ({exc}); logging may stay off", "33"))
    if not configured_rag_log():
        set_env_vars({"RAG_LOG_FILE": RAG_LOG_CONTAINER_FILE})
        print(_c("  ◐ request log on -> rag-logs/requests.jsonl", "36"))


# --- component checks (each returns (state, detail)) -----------------------


def check_docker_engine() -> tuple[str, str]:
    rc, _ = run(["docker", "info"], timeout=8)
    if rc == 0:
        return ("ok", "engine running")
    return ("down", "unreachable — start Docker Desktop")


def compose_services() -> dict[str, str]:
    """Map service name -> status string, robust to array vs NDJSON output."""
    rc, out = run(COMPOSE + ["ps", "--format", "json"], cwd=REPO, timeout=15)
    services: dict[str, str] = {}
    if rc != 0:
        return services
    out = out.strip()
    rows: list[dict[str, Any]] = []
    try:
        parsed = json.loads(out)
        rows = parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError:
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    for o in rows:
        services[o.get("Service", "?")] = o.get("Health") or o.get("State") or "?"
    return services


def check_container(services: dict[str, str], name: str) -> tuple[str, str]:
    s = services.get(name)
    if s is None:
        return ("down", "not running")
    low = s.lower()
    if "healthy" in low or low == "running":
        return ("ok", s)
    if "starting" in low or "created" in low or "restart" in low:
        return ("busy", s)
    return ("warn", s)


def check_model_loaded() -> tuple[str, str]:
    rc, out = run(
        COMPOSE + ["exec", "-T", "ollama", "ollama", "ps"],
        cwd=REPO,
        timeout=15,
    )
    if rc != 0:
        return ("down", "ollama not up")
    rows = [ln for ln in out.splitlines() if ln.strip() and not ln.startswith("NAME")]
    active = configured_model()
    if not rows:
        return ("warn", f"none resident (cold) · active = {active}")
    names = [r.split()[0] for r in rows]
    labelled = " · ".join(f"{n} (active)" if n == active else n for n in names)
    if active not in names:
        labelled += f"  [active '{active}' not loaded]"
    return ("ok", labelled)


def check_english() -> tuple[str, str]:
    """FORCE_ENGLISH state. A mode, not a health check — both states are `ok`
    (off is a deliberate choice, not a fault), so it never flips `render`'s
    'rag is LIVE' verdict; the detail carries the actual on/off."""
    if configured_force_english():
        return ("ok", "on · every answer in English")
    return ("ok", "off · answers follow the question's language")


def check_gpu() -> tuple[str, str]:
    rc, out = run(
        COMPOSE
        + [
            "exec",
            "-T",
            "ollama",
            "nvidia-smi",
            "--query-gpu=utilization.gpu,power.draw,memory.used,memory.total",
            "--format=csv,noheader,nounits",
        ],
        cwd=REPO,
        timeout=12,
    )
    row = out.strip().splitlines()[0] if out.strip() else ""
    parts = [p.strip() for p in row.split(",")]
    if rc != 0 or len(parts) < 4:
        return ("warn", "nvidia-smi unavailable")
    util, power, used, total = parts[:4]
    try:
        used_mib, total_mib = float(used), float(total)
        pct = (used_mib / total_mib * 100) if total_mib else 0.0
        detail = (
            f"{util}% util · {float(power):.0f}W"
            f" · {used}/{total} MiB VRAM ({pct:.0f}%)"
        )
        # VRAM near full risks an OOM on the next model load -> warn (yellow).
        return ("warn" if pct >= 95 else "ok", detail)
    except ValueError:
        return ("warn", "parse error")


def check_backend_health() -> tuple[str, str]:
    body = http_json(BACKEND_HEALTH, timeout=8)
    if body is None:
        return ("down", "backend not answering")
    checks = body.get("checks", {})
    if checks.get("llm") is True:
        return ("ok", f"llm:true · model:{body.get('model', '?')}")
    return ("warn", f"llm:{checks.get('llm')} (warming?)")


def check_tailscale() -> tuple[str, str]:
    ts = tailscale_exe()
    if not ts:
        return ("down", "tailscale.exe not found")
    rc, out = run([ts, "status"], timeout=10)
    if rc != 0:
        return ("down", "daemon down")
    if "Logged out" in out:
        return ("down", "logged out")
    return ("ok", "up")


def funnel_url() -> str | None:
    ts = tailscale_exe()
    if not ts:
        return None
    rc, out = run([ts, "status", "--json"], timeout=10)
    if rc != 0:
        return None
    try:
        dns = json.loads(out).get("Self", {}).get("DNSName", "").rstrip(".")
        return f"https://{dns}" if dns else None
    except json.JSONDecodeError:
        return None


def funnel_routes(status_json: str) -> dict[str, str] | None:
    """Publicly-exposed funnel routes: "<host>:<port>" -> proxy target.

    Parses `tailscale funnel status --json`. Returns None when the output could
    not be read as JSON at all (failed call, or a tailscale too old for --json)
    — distinct from an empty dict, which means "read fine, nothing funnelled".
    Only `AllowFunnel` routes are returned, so a tailnet-private `serve` mount
    on the same port can never read as public exposure.

    Structured output rather than the human-readable table on purpose: this node
    funnels OTHER projects too (e.g. :8443 → oauth2-proxy), and a bare "Funnel
    on" substring in that table is not evidence THIS project's route exists —
    that misreading let `up` skip re-enabling the rag's route while another
    project's funnel was on, leaving the chat publicly dead with every local
    check green.
    """
    try:
        cfg = json.loads(status_json)
        allow = cfg.get("AllowFunnel") or {}
        return {
            host: handler["Proxy"]
            for host, entry in (cfg.get("Web") or {}).items()
            if allow.get(host) is True
            for handler in (entry.get("Handlers") or {}).values()
            if "Proxy" in handler
        }
    except (AttributeError, KeyError, TypeError, json.JSONDecodeError):
        return None


def funnel_serves_port(routes: dict[str, str], port: str) -> bool:
    """True iff a public :443 route proxies to 127.0.0.1:`port`.

    Exact target match, never a substring: `:{port}` as a prefix test would let
    a short port (:80) read another project's :8000 route as this one's.
    """
    target = f"http://127.0.0.1:{port}"
    return any(
        host.endswith(f":{FUNNEL_HTTPS_PORT}") and proxy == target
        for host, proxy in routes.items()
    )


def check_funnel(url: str | None = None) -> tuple[str, str]:
    ts = tailscale_exe()
    if not ts:
        return ("down", "tailscale.exe not found")
    rc, out = run([ts, "funnel", "status", "--json"], timeout=10)
    routes = funnel_routes(out)
    if routes is None:
        # Unreadable is not "off": reporting a state we could not read as a
        # definite one is what let the last outage hide behind a green board.
        return ("warn", f"funnel status unreadable (exit {rc})")
    if funnel_serves_port(routes, FUNNEL_PORT):
        return ("ok", url or funnel_url() or "on")
    if routes:
        return (
            "down",
            f"other funnels on, :{FUNNEL_HTTPS_PORT}→{FUNNEL_PORT} off — `ragctl up`",
        )
    return ("down", "off — run `ragctl up`")


def check_public(url: str | None) -> tuple[str, str]:
    if not url:
        return ("warn", "no funnel url")
    body = http_json(url + "/health", timeout=12)
    if body is None:
        return ("down", "not reachable publicly")
    if body.get("checks", {}).get("llm") is True:
        return ("ok", "public /health ok")
    return ("warn", "public but llm not ready")


# --- watchdog: auto-recover the public path --------------------------------
# The 2026-07-20 outage: a network change left tailscale's connection to its
# funnel INGRESS relays stale, so the visitor path 502'd while every local check
# (backend, funnel config, cert, node health) stayed green. Nothing local can
# see it; only an external probe can. This guards that path unattended.


def watchdog_action(
    external_ok: bool,
    local_ok: bool,
    uplink_ok: bool,
    consecutive_failures: int,
    fail_threshold: int,
    reasserted_this_outage: bool,
    reconnects_this_outage: int,
    reconnect_cap: int,
) -> str:
    """Decide the watchdog's next move from the health signals. Pure.

    Returns one of:
      "ok"                — public path healthy; clear outage state.
      "wait"              — down, but under `fail_threshold` consecutive failures;
                            treat as a transient blip, do nothing yet.
      "skip-uplink"       — down AND the funnel-INDEPENDENT path (the static site)
                            is unhealthy too: a dead uplink or a Vercel-side
                            outage. Not ours to fix — never flap tailscale.
      "skip-backend-down" — down AND the local backend is down too; the operator
                            must bring the stack up (`ragctl up`), not reconnect.
      "reassert"          — confirmed public outage, backend + uplink fine: try
                            the cheap scoped fix first (`funnel --bg 8000`).
      "reconnect"         — a re-assert already failed this outage, so force a
                            full `tailscale down/up` to rebuild the ingress.
      "give-up"           — `reconnect_cap` reconnects have not recovered it, so
                            stop churning the shared node and only alert.

    `consecutive_failures` counts consecutive external-broken polls INCLUDING the
    current one. `reasserted_this_outage` becomes True after the first re-assert
    since the last healthy poll, escalating the next action to a reconnect;
    `reconnects_this_outage` then bounds how many down/up cycles are attempted.
    """
    if external_ok:
        return "ok"
    if consecutive_failures < fail_threshold:
        return "wait"
    if not uplink_ok:
        return "skip-uplink"
    if not local_ok:
        return "skip-backend-down"
    if not reasserted_this_outage:
        return "reassert"
    if reconnects_this_outage >= reconnect_cap:
        return "give-up"
    return "reconnect"


def _healthy_http(url: str, timeout: int = 8) -> bool:
    """True only for a genuine 2xx/3xx — a 4xx/5xx (urllib raises HTTPError) or a
    connection error is False. So a Vercel-side 5xx reads as 'not healthy', not
    'internet up', and can't trigger a needless reconnect during their outage."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            status: int = r.status
            return 200 <= status < 400
    except Exception:
        return False


def probe_public_path() -> bool:
    """True iff the Vercel visitor path returns a healthy backend /health."""
    body = http_json(PUBLIC_SITE_HEALTH_URL, timeout=12)
    return bool(body and body.get("checks", {}).get("llm") is True)


def probe_uplink() -> bool:
    """True iff the static site root serves healthily — the funnel-independent
    canary that separates 'our funnel is stale' from 'no internet / Vercel down'."""
    return _healthy_http(UPLINK_PROBE_URL)


def probe_local_backend() -> bool:
    """True iff the backend answers healthily on localhost (funnel-independent)."""
    return check_backend_health()[0] == "ok"


def defender_note() -> str:
    """Windows Defender real-time-protection state, via Get-MpComputerStatus.

    Informational, not a fault — Defender on is the normal Windows state; it just
    occasionally scans (and so slows) Docker image/model pulls. Hence a plain `·`
    rather than the `▲` used for actively TLS-breaking apps like IPVanish.
    """
    ps = powershell_exe()
    if not ps:
        return "  · Windows Defender: can't check (powershell.exe not found)"
    rc, out = run(
        [
            ps, "-NoProfile", "-Command",
            "(Get-MpComputerStatus).RealTimeProtectionEnabled",
        ],
        timeout=20,
    )
    val = out.strip().lower()
    if rc != 0 or not val:
        return "  · Windows Defender: status unknown (Get-MpComputerStatus unavailable)"
    if "true" in val:
        return (
            "  · Windows Defender real-time protection on — normal; may briefly scan "
            "Docker image/model pulls (not the running chat)."
        )
    if "false" in val:
        return "  · Windows Defender real-time protection off"
    return "  · Windows Defender: status unknown"


def security_preflight() -> list[str]:
    """Surface TLS-intercepting / scanning apps that can break or slow downloads."""
    notes: list[str] = []
    tl = tasklist_exe()
    if not tl:
        notes.append("  (could not read the Windows process list)")
    else:
        rc, out = run([tl], timeout=15)
        procs = out.lower()
        if "ipvanish" in procs:
            notes.append(
                "  ▲ IPVanish running — Threat Protection can block model/image pulls "
                "(not the running chat). Toggle it off if a pull stalls."
            )
        if any(
            v in procs
            for v in ("nordvpn", "expressvpn", "surfshark", "openvpn", "protonvpn")
        ):
            notes.append("  ▲ A VPN client is running — can break TLS on downloads.")
        if any(
            a in procs
            for a in ("avast", "avgui", "kaspersky", "bdagent", "norton", "mcshield")
        ):
            notes.append("  ▲ Third-party AV running — its web shield can block pulls.")
    # Windows Defender uses a separate API (not the process list); always reported.
    notes.append(defender_note())
    if not any("▲" in n for n in notes):
        notes.insert(0, "  ● no known download-blocking security apps detected")
    return notes


# --- board -----------------------------------------------------------------


def gather() -> list[tuple[str, tuple[str, str]]]:
    docker = check_docker_engine()
    if docker[0] != "ok":
        # Engine down — everything below depends on it; report once, cheaply.
        url = funnel_url()
        return [
            ("Docker engine", docker),
            ("db", ("down", "—")),
            ("ollama", ("down", "—")),
            ("backend", ("down", "—")),
            ("model loaded", ("down", "—")),
            ("GPU", ("down", "—")),
            ("backend /health", ("down", "—")),
            ("English-only", check_english()),
            ("Tailscale", check_tailscale()),
            ("Funnel", check_funnel(url)),
            ("public reachable", check_public(url)),
        ]
    services = compose_services()
    url = funnel_url()
    # Run the independent checks concurrently. Sequentially, the /health
    # generation plus the network/exe probes summed to ~10s and made the board
    # (and `up`) feel hung; in parallel the whole board resolves in ~max(check).
    labeled = [
        ("db (pgvector)", lambda: check_container(services, "db")),
        ("ollama", lambda: check_container(services, "ollama")),
        ("backend", lambda: check_container(services, "backend")),
        ("model loaded", check_model_loaded),
        ("GPU", check_gpu),
        ("backend /health", check_backend_health),
        ("English-only", check_english),
        ("Tailscale", check_tailscale),
        ("Funnel", lambda: check_funnel(url)),
        ("public reachable", lambda: check_public(url)),
    ]
    with ThreadPoolExecutor(max_workers=len(labeled)) as ex:
        pending = [(label, ex.submit(fn)) for label, fn in labeled]
        return [("Docker engine", docker)] + [
            (label, fut.result()) for label, fut in pending
        ]


def render(rows: list[tuple[str, tuple[str, str]]]) -> str:
    live = all(r[1][0] == "ok" for r in rows)
    head = _c("rag is LIVE", "32") if live else _c("rag is not fully up", "33")
    body = "\n".join(_line(label, res) for label, res in rows)
    return f"  {_c('RAG control — ' + head, '1')}\n\n{body}\n"


def cmd_status() -> int:
    rows = gather()
    print(render(rows))
    # Reported below the board, not as a board row: the watchdog is optional
    # protection, so its being off must not flip the board's LIVE verdict.
    pid = watchdog_pid()
    note = f"running (pid {pid})" if pid else "off — `ragctl watchdog` or re-`up`"
    print(f"  {_c('●' if pid else '○', '2')} watchdog       {note}\n")
    return 0 if all(r[1][0] == "ok" for r in rows) else 1


def _watch_loop() -> None:
    """Redraw the board every 2s until interrupted. Lets KeyboardInterrupt out so
    each caller decides what to do on Ctrl-C (watch: just stop; up: tear down)."""
    while True:
        frame = render(gather())
        if USE_COLOR:
            sys.stdout.write("\033[H\033[J")  # cursor home + clear screen
        print(frame)
        time.sleep(2)


def _watch_until_ready(timeout_s: float = 90.0) -> None:
    """Redraw the live board until every check is ok (the rag is fully LIVE) or
    `timeout_s` elapses, then return. Lets `up` show each component turning green
    as it comes online without ever blocking the caller indefinitely."""
    start = time.monotonic()
    while True:
        rows = gather()
        if USE_COLOR:
            sys.stdout.write("\033[H\033[J")  # cursor home + clear screen
        print(render(rows))
        if all(r[1][0] == "ok" for r in rows):
            print(_c("\n  ✓ rag is LIVE — back to the prompt (still running).", "32"))
            return
        if time.monotonic() - start > timeout_s:
            print(
                _c(
                    "\n  still coming up — back to the prompt;"
                    " it'll finish in the background.",
                    "33",
                )
            )
            return
        time.sleep(1.5)


def cmd_watch() -> int:
    try:
        _watch_loop()
    except KeyboardInterrupt:
        print("\n  stopped watching (stack left running).")
    return 0


def cmd_doctor() -> int:
    rc = cmd_status()
    print("  " + _c("security pre-flight", "1"))
    for note in security_preflight():
        print(note)
    print("\n  " + _c("versions", "1"))
    _, dv = run(["docker", "--version"], timeout=8)
    _, cv = run(COMPOSE + ["version", "--short"], cwd=REPO, timeout=8)
    print(f"    docker: {dv.strip()}   compose: {cv.strip()}")
    return rc


# --- bring-up / tear-down --------------------------------------------------


def _wait_for(
    check: Callable[[], tuple[str, str]],
    want_ok_for: int = 1,
    timeout: int = 150,
    every: int = 4,
) -> bool:
    deadline = time.time() + timeout
    hits = 0
    while time.time() < deadline:
        if check()[0] == "ok":
            hits += 1
            if hits >= want_ok_for:
                return True
        else:
            hits = 0
        time.sleep(every)
    return False


def ensure_docker() -> bool:
    if check_docker_engine()[0] == "ok":
        print("  ● Docker engine already up")
        return True
    if not Path(DOCKER_DESKTOP_EXE).exists():
        print("  ○ Docker Desktop not found — start it manually")
        return False
    print("  ◐ starting Docker Desktop …")
    subprocess.Popen([DOCKER_DESKTOP_EXE])
    if _wait_for(check_docker_engine, timeout=180, every=5):
        print("  ● Docker engine up")
        return True
    print("  ○ Docker engine didn't come up in time")
    return False


def ensure_funnel() -> None:
    ts = tailscale_exe()
    if not ts:
        print("  ○ tailscale.exe not found — funnel left as-is")
        return
    if check_funnel()[0] == "ok":
        print(f"  ● Funnel already on → {funnel_url()}")
        return
    print("  ◐ enabling Funnel …")
    # Scope to :8000 on the default funnel port (443): this tailnet node also runs
    # Funnels for OTHER projects, so only this port is ever toggled — never a
    # blanket `tailscale funnel reset`, which would drop the other projects' too.
    run([ts, "funnel", "--bg", FUNNEL_PORT], timeout=20)
    print(f"  ● Funnel → {funnel_url()}")


# --- watchdog daemon lifecycle (autostarted by `up`, stopped by `down`) -----


def _proc_argv(pid: int) -> list[str] | None:
    """argv of `pid` from /proc, or None if it isn't running / readable. ragctl
    runs in WSL (Linux), so /proc is always available."""
    try:
        raw = Path(f"/proc/{pid}/cmdline").read_bytes()
    except OSError:
        return None
    return [p.decode("utf-8", "replace") for p in raw.split(b"\x00") if p]


def _cmdline_is_watchdog(argv: list[str] | None) -> bool:
    """True iff `argv` is our watchdog invocation. Guards against a RECYCLED pid:
    a crashed watchdog whose pid Linux reassigned to an unrelated process must NOT
    read as 'the watchdog', or `down` would SIGTERM a stranger and `up` would
    refuse to respawn (silently leaving the path unguarded)."""
    return argv is not None and "watchdog" in argv and any("ragctl" in a for a in argv)


def watchdog_pid() -> int | None:
    """The running background watchdog's pid, or None. A stale pid file, a gone
    process, OR a recycled pid now owned by something else all read as None — so a
    crashed watchdog re-spawns cleanly and stop never signals the wrong process."""
    try:
        pid = int(WATCHDOG_PID_FILE.read_text().strip())
    except (OSError, ValueError):
        return None
    return pid if _cmdline_is_watchdog(_proc_argv(pid)) else None


def start_watchdog_daemon() -> int | None:
    """Spawn the watchdog as a DETACHED background process and record its pid.

    Idempotent: a second call while one is running is a no-op. Safe to call from
    `up` before the model has warmed — the watchdog's backend-down guard makes it
    stand down (never reconnect) until the stack is actually serving.
    """
    running = watchdog_pid()
    if running is not None:
        print(f"  ● watchdog already running (pid {running})")
        return running
    RAG_LOG_DIR.mkdir(parents=True, exist_ok=True)
    # The child inherits the log fd, so the parent can close its own handle on
    # exit without cutting the child's output. start_new_session detaches it so
    # it outlives this `ragctl` invocation (and Ctrl-C in the REPL).
    with open(WATCHDOG_LOG_FILE, "a", encoding="utf-8") as log:
        proc = subprocess.Popen(
            # -u: unbuffered, so each poll/alert line reaches the log immediately.
            # Block-buffered stdout to a file would strand the watchdog's output
            # (including its alerts) in a buffer that a sparse logger never fills.
            [sys.executable, "-u", str(Path(__file__).resolve()), "watchdog"],
            stdout=log,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
            cwd=str(REPO),
        )
    WATCHDOG_PID_FILE.write_text(str(proc.pid))
    print(f"  ● watchdog started (pid {proc.pid}) — log: {WATCHDOG_LOG_FILE}")
    return proc.pid


def stop_watchdog_daemon() -> bool:
    """Stop the background watchdog if running; return whether one was killed.

    `down` calls this FIRST, before cutting the funnel — otherwise the still-live
    watchdog would see the public path drop (because WE turned the funnel off) and
    race to 'recover' the very funnel we are intentionally shutting down.
    """
    pid = watchdog_pid()
    if pid is None:
        WATCHDOG_PID_FILE.unlink(missing_ok=True)
        return False
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pass
    WATCHDOG_PID_FILE.unlink(missing_ok=True)
    print(f"  ● watchdog stopped (pid {pid})")
    return True


def cmd_up(keep: bool, watchdog: bool = True) -> int:
    print(_c("\n  bringing the rag up …\n", "1"))
    if not ensure_docker():
        return 1
    ensure_request_log()
    ensure_funnel()
    print("  ◐ starting the stack …  (watch it come online below)")
    run(COMPOSE + ["up", "-d", "backend"], cwd=REPO, timeout=180)
    # No separate blocking warm: the live board's /health check loads and verifies
    # the model lazily and SHOWS it happening, instead of a silent multi-second
    # `ollama run` that made `up` feel hung.
    if watchdog:
        start_watchdog_daemon()
    if keep:
        print()
        print(render(gather()))
        print("  (left running — `ragctl down` to cut it)")
        return 0
    # Show a live, colour-coded board while the backend finishes coming up, then
    # return to the prompt with the stack STILL running. Ctrl-C also just returns
    # — only `down` tears it down, so `up` never strands you in a blocking hold.
    try:
        _watch_until_ready()
    except KeyboardInterrupt:
        print(_c("\n  (returned — the rag is still up; `down` to cut it)", "33"))
    return 0


def cmd_down() -> int:
    print(_c("\n  cutting the rag …", "1"))
    # Stop the watchdog BEFORE cutting the funnel, or it would fight the shutdown.
    stop_watchdog_daemon()
    print("  ◐ docker compose down (frees VRAM) …")
    run(COMPOSE + ["down"], cwd=REPO, timeout=120)
    ts = tailscale_exe()
    if ts:
        print("  ◐ funnel off …")
        # `--https=443 off` cuts ONLY this project's funnel port. The node is
        # shared with other projects' funnels, so a blanket `funnel off`/`reset`
        # is deliberately avoided — it would cut theirs too.
        run([ts, "funnel", f"--https={FUNNEL_HTTPS_PORT}", "off"], timeout=20)
    print("  ● done — stack + funnel stopped; Docker Desktop & Tailscale left running.")
    return 0


def _wd_stamp() -> str:
    return time.strftime("%H:%M:%S")


def _watchdog_reassert(ts: str) -> None:
    # Force the scoped re-assert — do NOT gate on check_funnel(): in the
    # stale-ingress failure mode the route IS present and check_funnel reports
    # ok, which is exactly why this outage class is invisible locally. Scoped to
    # :8000, so the other project's funnel is untouched.
    print(f"  ▲ {_wd_stamp()}  re-asserting funnel route (--bg {FUNNEL_PORT}) …")
    run([ts, "funnel", "--bg", FUNNEL_PORT], timeout=20)


def _watchdog_reconnect(ts: str) -> bool:
    """Force a full `tailscale down/up` to rebuild a stale ingress; return whether
    the node came back UP. Funnel config persists across down/up, so both our
    route and the other project's restore. A `down` whose `up` then fails would
    strand the whole node (and the other project's funnel) offline, so the `up`
    result is verified and a failure is surfaced loudly rather than swallowed."""
    print(f"  ▲ {_wd_stamp()}  re-asserting did not take — tailscale down/up …")
    run([ts, "down"], timeout=25)
    rc, _ = run([ts, "up"], timeout=40)
    if rc != 0 or check_tailscale()[0] != "ok":
        print(
            f"  ✗ {_wd_stamp()}  `tailscale up` did NOT bring the node back — it may "
            "be OFFLINE (this project's funnel AND the shared node). Run "
            "`tailscale up` / re-check auth."
        )
        return False
    return True


def _wd_sleep(seconds: int, stop: dict[str, bool]) -> None:
    """Sleep up to `seconds`, waking within ~1s of a stop request so the daemon
    reacts promptly to `ragctl down` instead of waiting out a full cooldown."""
    for _ in range(seconds):
        if stop["requested"]:
            return
        time.sleep(1)


def cmd_watchdog(
    interval: int = 120, fail_threshold: int = 2, cooldown: int = 300
) -> int:
    """Guard the PUBLIC visitor path and auto-recover a stale funnel ingress.

    Polls the Vercel path (a true external probe); on a confirmed outage with a
    healthy backend and a live uplink, escalates re-assert -> down/up, with a
    cooldown so it can never flap. Ctrl-C or SIGTERM (`ragctl down`) to stop;
    a stop that lands mid-reconnect lets the down/up finish first."""
    ts = tailscale_exe()
    if not ts:
        print("  ○ tailscale.exe not found — the watchdog can't recover the funnel")
        return 1
    print(_c("\n  rag watchdog — guarding the public visitor path\n", "1"))
    print(f"  probe   {PUBLIC_SITE_HEALTH_URL}")
    print(
        f"  every {interval}s · act after {fail_threshold} consecutive failures ·"
        f" {cooldown}s cooldown between recovery attempts\n"
    )
    failures = 0
    reasserted = False
    reconnects = 0
    # SIGTERM (how `ragctl down` stops the daemon) sets a flag checked only at
    # loop boundaries — NON-raising, so a stop that lands mid-reconnect lets the
    # in-flight `tailscale down/up` FINISH before we exit. The node is never left
    # down by the stop itself. Ctrl-C (SIGINT) still exits via KeyboardInterrupt.
    stop = {"requested": False}

    def _request_stop(signum: int, frame: object) -> None:
        stop["requested"] = True

    old_handler = signal.signal(signal.SIGTERM, _request_stop)
    try:
        while not stop["requested"]:
            ext = probe_public_path()
            failures = 0 if ext else failures + 1
            # The local + uplink probes only matter when the public path is down;
            # skip them (and their HTTP round-trips) on a healthy poll.
            action = watchdog_action(
                ext,
                probe_local_backend() if not ext else True,
                probe_uplink() if not ext else True,
                failures,
                fail_threshold,
                reasserted,
                reconnects,
                WATCHDOG_RECONNECT_CAP,
            )
            wait = interval
            if action == "ok":
                if reasserted or reconnects:
                    print(f"  ● {_wd_stamp()}  public path recovered")
                reasserted = False
                reconnects = 0
            elif action == "wait":
                print(f"  ◐ {_wd_stamp()}  public path down ({failures}) — transient")
            elif action == "skip-uplink":
                print(
                    f"  ○ {_wd_stamp()}  site itself unreachable (uplink/Vercel)"
                    " — not the funnel"
                )
            elif action == "skip-backend-down":
                print(f"  ○ {_wd_stamp()}  backend down too — run `ragctl up`")
            elif action == "reassert":
                _watchdog_reassert(ts)
                reasserted = True
                wait = cooldown
            elif action == "reconnect":
                _watchdog_reconnect(ts)
                reconnects += 1
                wait = cooldown
            elif action == "give-up":
                print(
                    f"  ✗ {_wd_stamp()}  {reconnects} reconnects did not recover the "
                    "public path — MANUAL FIX NEEDED (check `tailscale status`, auth, "
                    "or a Vercel-side issue). Not churning the shared node further."
                )
                wait = cooldown
            if stop["requested"]:
                break
            _wd_sleep(wait, stop)
        print("\n  watchdog stopping (SIGTERM) — funnel left as-is.")
    except KeyboardInterrupt:
        print("\n  watchdog stopped (funnel left as-is).")
    finally:
        signal.signal(signal.SIGTERM, old_handler)
    return 0


def cmd_prune() -> int:
    """Reclaim Docker disk left by rebuilds — build cache, stopped containers, and
    dangling images. Disk only: the running stack, the named volumes (Postgres
    data + the pulled model), and the warm model are never touched, so the live
    chat keeps serving throughout. (`down` first if you also want the RAM back.)"""
    print(_c("\n  reclaiming docker disk …", "1"))
    for label, cmd in (
        ("build cache", ["docker", "builder", "prune", "-f"]),
        ("stopped containers", ["docker", "container", "prune", "-f"]),
        ("dangling images", ["docker", "image", "prune", "-f"]),
    ):
        print(f"  ◐ {label} …")
        rc, out = run(cmd, timeout=300)
        if rc == 127:
            print(_c("  ✗ docker not found on PATH", "31"))
            return 1
        # `builder prune` reports "Total: <size>"; `container`/`image prune`
        # report "Total reclaimed space: <size>". Match either Total line and take
        # the size after the last colon — keying only on "reclaimed space:" would
        # mis-report the build-cache stage (usually the biggest reclaim) as 0B.
        reclaimed = next(
            (
                ln.rsplit(":", 1)[1].strip()
                for ln in out.splitlines()
                if ln.lower().startswith("total") and ":" in ln
            ),
            "0B",
        )
        print(f"     reclaimed {reclaimed}")
    print(_c(
        "  ● done — disk reclaimed; the running stack + warm model untouched.",
        "32",
    ))
    return 0


def cmd_test(question: str) -> int:
    """Doctor the live model with one real query: stream it, time it, show it."""
    payload = json.dumps({"message": question, "history": []}).encode()
    req = urllib.request.Request(
        BACKEND_CHAT, data=payload, headers={"content-type": "application/json"}
    )
    print(f"\n  {_c('Q:', '1')} {question}\n")
    start = time.time()
    first: float | None = None
    parts: list[str] = []
    sources: list[str] = []
    event = None
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace").rstrip("\n")
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data = line[5:].strip()
                    if event == "token":
                        if first is None:
                            first = time.time() - start
                        try:
                            parts.append(json.loads(data).get("text", ""))
                        except json.JSONDecodeError:
                            pass
                    elif event == "sources":
                        try:
                            sources = [
                                s.get("source", "")
                                for s in json.loads(data).get("sources", [])
                            ]
                        except json.JSONDecodeError:
                            pass
                    elif event == "error":
                        print(f"  {_c('✗ error frame', '31')}: {data}")
                        return 1
    except Exception as exc:  # noqa: BLE001 — surface any transport failure plainly
        print(f"  {_c('✗ request failed', '31')}: {exc}")
        return 1

    answer = "".join(parts).strip()
    elapsed = time.time() - start
    print(f"  {_c('A:', '32')} {answer}\n")
    if sources:
        print("  sources: " + ", ".join(s for s in sources if s))
    ttft = f"{first:.1f}s" if first is not None else "—"
    print(f"  {len(answer)} chars · first token {ttft} · total {elapsed:.1f}s\n")
    return 0


def cmd_model(name: str | None, effort: str, context: str | None, do_test: bool) -> int:
    """Pick a model + effort/context, write the config, recreate, warm, test."""
    models = list_models()
    if not models:
        print("  ○ no models found — is ollama up? run `ragctl up` first.")
        return 1
    if name is None:
        print(_c("\n  installed models:", "1"))
        for i, m in enumerate(models, 1):
            print(f"    {i}. {m}")
        choice = input("\n  pick a model (number or name): ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(models):
            name = models[int(choice) - 1]
        elif choice in models:
            name = choice
        else:
            print("  ○ no such model")
            return 1
    elif name not in models:
        print(f"  ○ '{name}' is not installed. have: {', '.join(models)}")
        return 1

    temperature, num_predict = EFFORT_PRESETS[effort]
    updates = {
        "LLM_MODEL": name,
        "LLM_TEMPERATURE": str(temperature),
        "LLM_NUM_PREDICT": str(num_predict),
    }
    restart = ["backend"]
    ctx_note = ""
    if context:
        updates["OLLAMA_CONTEXT_LENGTH"] = str(CONTEXT_PRESETS[context])
        restart.append("ollama")  # context is read by the ollama server at start
        ctx_note = f", context {context}"

    print(
        f"\n  applying → {_c(name, '1')}  ·  effort {effort} "
        f"(temp {temperature}, max_tokens {num_predict}){ctx_note}"
    )
    set_env_vars(updates)
    print(f"  ◐ rebuilding + recreating {', '.join(restart)} with the new config …")
    # --build so a freshly pulled backend (which reads the new knobs) is actually
    # current; the build is layer-cached, so it's a fast no-op when code is unchanged.
    run(COMPOSE + ["up", "-d", "--build", *restart], cwd=REPO, timeout=300)
    print(f"  ◐ warming {name} …")
    run(
        COMPOSE + ["exec", "-T", "ollama", "ollama", "run", name, "ok"],
        cwd=REPO,
        timeout=120,
    )
    print()
    print(render(gather()))
    if do_test:
        cmd_test("In one sentence, what is Mikko's most impressive project and why?")
    return 0


def cmd_english(state: str | None) -> int:
    """Force every answer into English (across all models), or allow the
    question's language. Writes FORCE_ENGLISH to .env and rebuilds the backend.

    Small models follow a system-prompt 'answer in English' rule unreliably, so
    `on` also drives an in-message directive (see app/prompts.py); the toggle
    flips both together."""
    current = configured_force_english()
    if state is None:
        word = "on" if current else "off"
        detail = (
            "every answer in English"
            if current
            else "answers follow the question's language"
        )
        print(f"\n  FORCE_ENGLISH is {_c(word, '32' if current else '33')} — {detail}")
        print("  toggle with:  ragctl english on   |   ragctl english off")
        return 0

    want = state == "on"
    if want == current:
        print(f"\n  already {state} — nothing to change.")
        return 0
    set_env_vars({"FORCE_ENGLISH": "1" if want else "0"})
    note = (
        "every answer in English"
        if want
        else "answers follow the question's language"
    )
    print(f"\n  applying → FORCE_ENGLISH {_c(state, '1')}  ·  {note}")
    print("  ◐ rebuilding + recreating backend with the new config …")
    # --build so the running backend picks up the new env; layer cache keeps it
    # fast when the code is unchanged. Only the backend reads FORCE_ENGLISH.
    run(COMPOSE + ["up", "-d", "--build", "backend"], cwd=REPO, timeout=300)
    print()
    print(render(gather()))
    return 0


# --- feature flags ----------------------------------------------------------
#
# The RAG behaviour dials in one place, because they were spread across three
# sources and only one of them decides anything: the repo `.env`, `config.py`'s
# defaults, and docker-compose's environment block. A knob absent from compose
# CANNOT be set — the value never crosses into the process and the default
# stands, silently. So `features` reports what the RUNNING PROCESS resolved
# rather than what `.env` says; those are different questions, and only one of
# them describes behaviour.


@dataclass(frozen=True)
class Feature:
    """One controllable dial: CLI name, env var, and Settings attribute."""

    name: str
    env: str
    attr: str
    kind: str  # "bool" | "int"
    summary: str
    # Bounds for the int dials, mirroring config.Settings.validate(). Checked
    # BEFORE .env is written: without them a typo like `diversity -1` writes the
    # file, recreates the backend, and the container then dies in validate() —
    # trading a one-line "that is out of range" for a stopped stack.
    min_value: int | None = None
    max_attr: str | None = None  # upper bound taken from another live setting


FEATURES: tuple[Feature, ...] = (
    Feature("finnish", "RAG_ALLOW_FINNISH", "rag_allow_finnish", "bool",
            "answer a Finnish question in Finnish"),
    Feature("translate", "RAG_TRANSLATE_RETRIEVAL", "rag_translate_retrieval", "bool",
            "retrieve a Finnish query via an English translation"),
    Feature("disclosure", "PROGRESSIVE_DISCLOSURE_ENABLED",
            "progressive_disclosure_enabled", "bool",
            "offer 'tell me more' and expand on the follow-up"),
    Feature("hybrid", "HYBRID_ENABLED", "hybrid_enabled", "bool",
            "fuse lexical BM25 with dense retrieval (off = dense only)"),
    Feature("project-filter", "PROJECT_FILTER_STRICT", "project_filter_strict", "bool",
            "restrict retrieval to a named project (fails open)"),
    Feature("shoutbox", "SHOUTBOX_ENABLED", "shoutbox_enabled", "bool",
            "accept POST /shout into the moderation queue"),
    Feature("log-text", "RAG_LOG_TEXT", "rag_log_text", "bool",
            "log question + answer TEXT (never IP, never identity)"),
    Feature("english", "FORCE_ENGLISH", "force_english", "bool",
            "force every answer to English (see also: ragctl english)"),
    Feature("diversity", "RETRIEVAL_DIVERSITY_MAX_PER_PROJECT",
            "retrieval_diversity_max_per_project", "int",
            "max chunks per project when the query names none",
            min_value=1),
    Feature("research-top-n", "RESEARCH_COVERAGE_TOP_N", "research_coverage_top_n",
            "int", "newest research posts forced into a recency answer (0 = off)",
            min_value=0, max_attr="retrieval_top_k"),
)

# Read alongside the dials so a bound expressed against another setting
# (research-top-n <= TOP_K) can be checked against the LIVE value rather than a
# number copied into this file that would drift.
_CONTEXT_ATTRS = ("retrieval_top_k",)

# Wired through compose (so `.env` can set them) but NOT settable here, because
# `Feature.kind` covers on/off and numbers only. Listed so the gap reads as known
# rather than forgotten, and so `features` can say where to change them.
ENV_ONLY: tuple[tuple[str, str], ...] = (
    (
        "RETRIEVAL_EXCLUDE_DOC_TYPES",
        "comma-separated doc_types hidden from retrieval; empty = no filter",
    ),
)

_FEATURES_BY_NAME = {f.name: f for f in FEATURES}
_TRUE_WORDS = {"1", "true", "yes", "on"}
_FALSE_WORDS = {"0", "false", "no", "off"}


def _is_on(raw: str) -> bool:
    """Whether a dial's value reads as ON.

    Handles both spellings this tool sees: the env words (`1`, `true`, `on`) and
    Python's `str(True)` from the container dump, which lowercases into the same
    set — so no separate `== "True"` clause is needed, and one existed only as
    dead code.
    """
    return raw.strip().lower() in _TRUE_WORDS


def live_feature_values() -> dict[str, str] | None:
    """What the RUNNING backend resolved for each dial, or None if it is down.

    Read from inside the container, not from `.env`: the two disagree whenever a
    knob is missing from compose, and only the container's answer describes what
    the service actually does.
    """
    wanted = [f.attr for f in FEATURES] + list(_CONTEXT_ATTRS)
    attrs = ", ".join(f'"{a}": str(s.{a})' for a in wanted)
    code = (
        "import json;from app.config import Settings;"
        f"s=Settings.from_env();print(json.dumps({{{attrs}}}))"
    )
    rc, out = run(
        COMPOSE + ["exec", "-T", "backend", "python", "-c", code],
        timeout=30,
        cwd=REPO,
    )
    if rc != 0 or not out.strip():
        return None
    try:
        parsed = json.loads(out.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return None
    return {str(k): str(v) for k, v in parsed.items()}


def cmd_features() -> int:
    """List every dial with the value the running backend actually resolved."""
    live = live_feature_values()
    print()
    if live is None:
        print(f"  {_c('o', '31')} backend not reachable — values unknown.")
        print("  start it with `up`, then re-run to see what is live.")
        print()
    width = max(len(f.name) for f in FEATURES)
    for f in FEATURES:
        raw = live.get(f.attr) if live else None
        if raw is None:
            shown = _c("?", "33")
        elif f.kind == "bool":
            on = _is_on(raw)
            shown = _c("on" if on else "off", "32" if on else "33")
        else:
            shown = _c(raw, "36")
        print(f"  {f.name.ljust(width)}  {shown}")
        print(f"  {' ' * width}  {_c(f.summary, '90')}")
    print()
    for env, summary in ENV_ONLY:
        print(f"  {_c(env, '90')}  {_c('(.env only — not settable here)', '33')}")
        print(f"  {' ' * width}  {_c(summary, '90')}")
    print()
    print(f"  set one with:  {_c('ragctl feature <name> <value>', '1')}")
    print(f"  {_c('values read from inside the container, not from .env', '90')}")
    print()
    return 0


def cmd_feature(name: str, value: str) -> int:
    """Set one dial, recreate the backend, then PROVE the change took."""
    feature = _FEATURES_BY_NAME.get(name)
    if feature is None:
        known = ", ".join(sorted(_FEATURES_BY_NAME))
        print(f"\n  unknown feature {name!r}. known: {known}\n")
        return 2

    word = value.strip().lower()
    if feature.kind == "bool":
        if word in _TRUE_WORDS:
            env_value = "1"
        elif word in _FALSE_WORDS:
            env_value = "0"
        else:
            print(f"\n  {feature.name} is on/off — got {value!r}\n")
            return 2
    else:
        try:
            number = int(word)
        except ValueError:
            print(f"\n  {feature.name} takes a number — got {value!r}\n")
            return 2
        if feature.min_value is not None and number < feature.min_value:
            print(f"\n  {feature.name} must be >= {feature.min_value} — got {number}\n")
            return 2
        env_value = str(number)

    before = live_feature_values() or {}

    # An upper bound expressed against another live setting. Checked here rather
    # than left to the container's validate(), because failing that check means a
    # backend that will not start.
    if feature.max_attr:
        try:
            ceiling = int(before[feature.max_attr])
        except (KeyError, ValueError):
            ceiling = None
        if ceiling is None:
            # The backend was already down, so the ceiling is unknown and this
            # guard cannot run. Say so — silently skipping the check is how a
            # value that wedges the container gets written anyway.
            print(
                f"\n  {_c('!', '33')} backend is down, so {feature.name} cannot be "
                f"checked against {feature.max_attr}."
            )
            print("    Start it with `up` first if you want that bound enforced.")
        elif int(env_value) > ceiling:
            print(
                f"\n  {feature.name} must be <= {ceiling} "
                f"({feature.max_attr}) — got {env_value}\n"
            )
            return 2
    # Nothing to do — skip the rebuild rather than spending it to reach the state
    # we are already in. `cmd_english` has always short-circuited like this; doing
    # it here covers every dial instead of one.
    current = before.get(feature.attr)
    if current is not None:
        already = (
            _is_on(current) == (env_value == "1")
            if feature.kind == "bool"
            else current == env_value
        )
        if already:
            print(f"\n  {feature.name} is already {value} — nothing to change.\n")
            return 0

    if not set_env_vars({feature.env: env_value}):
        return 1
    print(f"\n  applying → {feature.env}={env_value}  ·  {feature.summary}")
    print("  ◐ recreating backend with the new config …")
    rc, compose_out = run(
        COMPOSE + ["up", "-d", "--build", "backend"], cwd=REPO, timeout=300
    )

    # Retry briefly: a container that is still coming up is not a container that
    # failed, and every other readiness path in this file tolerates that window.
    # A single immediate probe would report a false failure on a slow start.
    after = None
    for _ in range(4):
        after = live_feature_values()
        if after is not None:
            break
        time.sleep(2)

    if after is None:
        # Two very different failures used to print the same sentence: a build
        # that never produced an image, and an image that starts and dies in
        # config.validate(). Say which, and show the reason, rather than sending
        # the operator to another tool to find out.
        print(f"  {_c('x', '31')} backend did not come back.")
        if rc != 0:
            print("    the rebuild itself failed:")
            for line in compose_out.strip().splitlines()[-6:]:
                print(f"      {line}")
        else:
            print("    it built, then failed to start — most likely the new value")
            print("    was rejected by config validation. Recent backend log:")
            _, logs = run(
                COMPOSE + ["logs", "--tail", "8", "backend"], cwd=REPO, timeout=30
            )
            for line in logs.strip().splitlines()[-8:]:
                print(f"      {line}")
        # Put .env back. Leaving the rejected value in place means the stack stays
        # down across every later `up` until someone hand-edits the file — the
        # tool would have broken the thing it exists to operate and then walked
        # away. Restoring the file is not enough to restart the service, so say
        # what to run.
        previous = before.get(feature.attr)
        if previous is not None:
            restore = (
                ("1" if _is_on(previous) else "0")
                if feature.kind == "bool"
                else previous
            )
            if set_env_vars({feature.env: restore}):
                print(f"\n    reverted .env: {feature.env}={restore}")
                print("    run `ragctl up` to bring the backend back.")
        print()
        return 1

    got = str(after.get(feature.attr))
    # Assert INSIDE the container. A compose "Started" line is not evidence the
    # process read anything, and a knob missing from the environment block fails
    # exactly this way: .env changes, behaviour does not.
    if feature.kind == "bool":
        ok = _is_on(got) == (env_value == "1")
    else:
        ok = got == env_value
    if not ok:
        print(f"  {_c('x', '31')} {feature.env} is still {got!r} in the container.")
        print(f"    The value never reached the process — check that {feature.env}")
        print("    is listed in docker-compose.yml's backend environment block.")
        print()
        return 1

    was = before.get(feature.attr, "?")
    print(f"  {_c('ok', '32')} live: {feature.env} {was} -> {got}")
    print()
    return 0


def cmd_usage(hours: int) -> int:
    """Show how much the model has been used over the last `hours` (default 24).

    Reads the backend's /usage on LOCALHOST — operator-only; the funnel is for
    visitors. Counts only: number of answered requests + an approximate token
    total (the streamed token-event count), with a per-model breakdown. The log
    lives in Postgres, so it spans restarts.
    """
    hours = max(1, min(hours, 168))  # mirror the endpoint's 1..168 clamp
    body = http_json(f"{BACKEND_USAGE}?hours={hours}", timeout=8)
    if body is None:
        print(f"\n  {_c('○', '31')} backend not reachable — start it with `up`\n")
        return 1
    total_req = body.get("total_requests", 0)
    total_tok = body.get("total_tokens", 0)
    by_model = body.get("by_model", [])
    plural = "" if total_req == 1 else "s"
    print(_c(f"\n  usage — last {hours}h", "1"))
    print(
        f"  {_c('●', '32')} {_c(str(total_req), '32')} request{plural}"
        f"  ·  ~{_c(str(total_tok), '32')} tokens"
    )
    if by_model:
        print()
        for m in by_model:
            name = str(m.get("model", "?"))
            req = m.get("requests", 0)
            tok = m.get("tokens", 0)
            # Colour the whole padded name (the pad spaces are invisible), so the
            # columns line up even with ANSI codes in the string.
            print(f"    {_c(f'{name:<22}', '36')} {req} req · ~{tok} tokens")
    elif total_req == 0:
        print(f"  {_c('·', '2')} no chat requests in this window yet")
    print()
    return 0


# --- command menu (reprinted in the REPL after every command) --------------

_MENU: list[tuple[str, str]] = [
    ("status", "live status board (one-shot)"),
    ("watch", "live board, refreshing (Ctrl-C exits)"),
    ("doctor", "board + security pre-flight + versions"),
    ("up [--keep]", "bring it live (Ctrl-C tears it down)"),
    ("down", "cut the rag (stack + funnel off)"),
    ('test "Q"', "ask the live model a test question"),
    ("model NAME", "switch model (--effort, --context)"),
    ("english on|off", "force English across all models"),
    ("features", "list the RAG dials + what the container resolved"),
    ("feature NAME VALUE", "set one RAG dial and recreate the backend"),
    ("usage [--hours N]", "how much the model's been used (24h)"),
    ("logs", "show recent questions + answers (request log)"),
    ("queue", "shoutbox: messages waiting for review"),
    ("approve ID", "shoutbox: publish it, rewrite the snapshot"),
    ("reject ID", "shoutbox: delete it (no undo)"),
    ('reply ID "text"', "shoutbox: owner reply on an approved message"),
    ("publish", "shoutbox: rewrite the snapshot from approved messages"),
    ("prune", "reclaim docker disk (rebuild cache, stopped containers)"),
    ("watchdog", "guard the public path, auto-recover a stale funnel"),
    ("exit", "leave ragctl"),
]

# Verbs Tab-completed in the REPL (real commands + the REPL-only quit words).
_VERBS = [
    "status", "watch", "doctor", "up", "down", "test", "model", "english",
    "features", "feature",
    "usage", "logs", "queue", "approve", "reject", "reply", "publish",
    "prune", "watchdog", "exit", "quit",
]


def print_menu() -> None:
    print()
    print(_c("  commands", "1") + _c("   ·  Tab completes  ·  'exit' to leave", "2"))
    for cmd, desc in _MENU:
        print(f"    {cmd:<16}{_c(desc, '2')}")


# --- argparse / dispatch (shared by one-shot mode and the REPL) -------------



# --- shoutbox moderation ----------------------------------------------------
#
# These verbs are the ONLY moderation surface. They live in this local CLI rather
# than on the FastAPI app because the Tailscale Funnel proxies the whole backend
# origin and no route there is authenticated — an approve endpoint would be a
# publicly reachable way to publish to the site. ragctl has no listener at all,
# so it inherits "unreachable from the internet" by construction.
#
# The formatting and outcome logic below is pure and unit-tested; the imperative
# shells only call docker and write a file. Same split as watchdog_action.

SHOUT_SNAPSHOT = REPO / "public" / "data" / "shoutbox.json"


def format_queue(pending: list[dict[str, Any]]) -> str:
    """Render the pending queue. Pure — takes the parsed payload, returns text."""
    if not pending:
        return "  ○ queue empty"
    lines = [_c(f"  {len(pending)} pending", "1")]
    for item in pending:
        stamp = str(item.get("created_at", ""))[:16].replace("T", " ")
        body = " ".join(str(item.get("body", "")).split())
        # Truncated for the listing only — approve/reject act on the stored text,
        # so what is published is never what was abbreviated here.
        if len(body) > 88:
            body = body[:85] + "..."
        ident = str(item.get("id", "?")).rjust(4)
        lines.append(f"  {_c(ident, '36')}  {stamp}  {body}")
    return "\n".join(lines)


def moderation_message(action: str, ok: bool, shout_id: int) -> str:
    """The single line printed after a moderation action.

    A miss reports "nothing to do", never success: `approve` is guarded on
    status='pending' and `reply` on status='approved', so a false result means the
    row was not in the state the verb requires. The operator needs to see that
    rather than have it smoothed over into a checkmark.
    """
    if not ok:
        return _c(f"  ○ #{shout_id}: nothing to do (wrong state, or no such id)", "33")
    verbs = {
        "approve": "approved",
        "reject": "rejected and deleted",
        "reply": "reply attached",
    }
    return _c(f"  ● #{shout_id} {verbs.get(action, action)}", "32")


def publish_reminder(count: int) -> str:
    """What to say after the snapshot is rewritten.

    The snapshot is a COMMITTED artifact: the site serves it from the CDN and
    never reaches this machine to read it. Writing the file therefore changes
    nothing publicly until it is committed and pushed, and saying so is the whole
    difference between "it is live" and "it is staged".
    """
    plural = "s" if count != 1 else ""
    return (
        f"  ● snapshot rewritten: public/data/shoutbox.json ({count} thread{plural})\n"
        + _c("    commit it to publish — the site reads the committed file.", "36")
    )


def _moderate(action: str, shout_id: int = 0, text: str = "") -> dict[str, Any]:
    """Run one moderation action inside the backend container and parse its JSON.

    stdout is JSON by contract, but a container that is down prints docker's error
    instead, so a parse failure is reported as such rather than raising.
    """
    # `--` so a reply beginning with a dash is a positional argument and not an
    # unknown option. Without it, `reply 7 "-- nice work"` dies in argparse
    # inside the container with an error the operator never asked for.
    cmd = COMPOSE + [
        "exec", "-T", "backend", "python", "-m", "app.moderate", action, "--"
    ]
    if shout_id:
        cmd.append(str(shout_id))
    if text:
        cmd.append(text)
    rc, out = run(cmd, timeout=30, cwd=REPO)
    # `run` concatenates stdout and stderr, and docker writes its own warnings
    # there, so the first `{` is not reliably the payload. Try each brace and
    # take the first that decodes as a complete object.
    decoder = json.JSONDecoder()
    for i, ch in enumerate(out):
        if ch != "{":
            continue
        try:
            parsed, _ = decoder.raw_decode(out[i:])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and "ok" in parsed:
            return parsed
    return {"ok": False, "error": out.strip() or f"exit {rc} with no output"}


def _write_snapshot() -> int:
    """Regenerate public/data/shoutbox.json from the approved rows."""
    result = _moderate("publish")
    if not result.get("ok"):
        print(_c(f"  ✗ publish failed: {result.get('error', 'unknown')}", "31"))
        return 1
    snapshot = result["snapshot"]
    SHOUT_SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SHOUT_SNAPSHOT.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(publish_reminder(int(snapshot.get("count", 0))))
    return 0


def cmd_queue() -> int:
    """List messages waiting for review."""
    result = _moderate("queue")
    if not result.get("ok"):
        print(_c(f"  ✗ {result.get('error', 'queue unavailable')}", "31"))
        return 1
    print(format_queue(result.get("pending", [])))
    return 0


def cmd_approve(shout_id: int) -> int:
    """Publish one message, then rewrite the snapshot."""
    result = _moderate("approve", shout_id)
    print(moderation_message("approve", bool(result.get("ok")), shout_id))
    if not result.get("ok"):
        return 1
    return _write_snapshot()


def cmd_reject(shout_id: int) -> int:
    """Delete one message. No category, no explanation, no undo.

    The snapshot is NOT rewritten: a pending message was never in it, so there is
    nothing to remove and no reason to make the operator commit a no-op diff.
    """
    result = _moderate("reject", shout_id)
    print(moderation_message("reject", bool(result.get("ok")), shout_id))
    return 0 if result.get("ok") else 1


def cmd_reply(shout_id: int, text: str) -> int:
    """Attach an owner reply to an APPROVED message, then rewrite the snapshot.

    The status guard lives in SQL, so this cannot publish a thread that was never
    approved on its own merits.
    """
    result = _moderate("reply", shout_id, text)
    print(moderation_message("reply", bool(result.get("ok")), shout_id))
    if not result.get("ok"):
        return 1
    return _write_snapshot()


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="ragctl",
        description="Operator CLI for the local RAG chat.",
    )
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("status", help="one-shot status board")
    sub.add_parser("watch", help="live status board (Ctrl-C exits)")
    sub.add_parser("doctor", help="board + security pre-flight + versions")
    up = sub.add_parser("up", help="bring the stack live")
    up.add_argument(
        "--keep",
        action="store_true",
        help="leave it running instead of holding the board",
    )
    up.add_argument(
        "--no-watchdog",
        action="store_true",
        help="don't autostart the public-path watchdog",
    )
    sub.add_parser("down", help="cut the rag: compose down + funnel off")
    test = sub.add_parser("test", help="doctor the live model with a test question")
    test.add_argument("question", help="the question to ask")
    mdl = sub.add_parser("model", help="choose a model + effort/context and apply it")
    mdl.add_argument("name", nargs="?", help="model name (omit to pick interactively)")
    mdl.add_argument(
        "--effort",
        choices=list(EFFORT_PRESETS),
        default="balanced",
        help="generation effort",
    )
    mdl.add_argument(
        "--context",
        choices=list(CONTEXT_PRESETS),
        help="served context window",
    )
    mdl.add_argument(
        "--no-test",
        action="store_true",
        help="skip the post-apply test query",
    )
    eng = sub.add_parser(
        "english", help="force every answer into English (on|off); omit to show state"
    )
    eng.add_argument(
        "state",
        nargs="?",
        choices=["on", "off"],
        help="on = force English across all models; off = follow the question's language",
    )
    usg = sub.add_parser(
        "usage", help="how much the model's been used (last N hours; default 24)"
    )
    usg.add_argument(
        "--hours", type=int, default=24, help="window in hours (1-168, default 24)"
    )
    lg = sub.add_parser("logs", help="show recent questions + answers")
    lg.add_argument("-n", type=int, default=20, help="how many to show (default 20)")
    sub.add_parser(
        "prune",
        help="reclaim docker disk: build cache + stopped containers + dangling images",
    )
    sub.add_parser("queue", help="shoutbox: list messages waiting for review")
    ap = sub.add_parser("approve", help="shoutbox: publish it + rewrite snapshot")
    ap.add_argument("id", type=int, help="the id shown by `queue`")
    rj = sub.add_parser("reject", help="shoutbox: delete a message (no undo)")
    rj.add_argument("id", type=int, help="the id shown by `queue`")
    rp = sub.add_parser("reply", help="shoutbox: owner reply on an approved one")
    rp.add_argument("id", type=int, help="the id shown by `queue`")
    rp.add_argument("text", help="the reply, published with the message")
    sub.add_parser("publish", help="shoutbox: rewrite snapshot from approved")
    sub.add_parser("features", help="list the RAG dials + what the container resolved")
    ft = sub.add_parser("feature", help="set one RAG dial and recreate the backend")
    ft.add_argument("name", help="dial name (see `ragctl features`)")
    ft.add_argument("value", help="on|off for a toggle, a number for a count")
    wd = sub.add_parser(
        "watchdog",
        help="guard the public path and auto-recover a stale funnel (Ctrl-C stops)",
    )
    wd.add_argument(
        "--interval", type=int, default=120, help="seconds between probes (default 120)"
    )
    wd.add_argument(
        "--fail-threshold",
        type=int,
        default=2,
        help="consecutive failures before acting (default 2)",
    )
    wd.add_argument(
        "--cooldown",
        type=int,
        default=300,
        help="seconds to wait after a recovery attempt (default 300)",
    )
    return p


def dispatch(argv: list[str]) -> int:
    """Parse one command line and run it. Raises SystemExit on argparse errors /
    `-h` — correct for one-shot mode; the REPL catches it to stay alive."""
    p = _build_parser()
    args = p.parse_args(argv)
    if args.cmd == "status":
        return cmd_status()
    if args.cmd == "watch":
        return cmd_watch()
    if args.cmd == "doctor":
        return cmd_doctor()
    if args.cmd == "up":
        return cmd_up(keep=args.keep, watchdog=not args.no_watchdog)
    if args.cmd == "down":
        return cmd_down()
    if args.cmd == "test":
        return cmd_test(args.question)
    if args.cmd == "model":
        return cmd_model(args.name, args.effort, args.context, not args.no_test)
    if args.cmd == "english":
        return cmd_english(args.state)
    if args.cmd == "features":
        return cmd_features()
    if args.cmd == "feature":
        return cmd_feature(args.name, args.value)
    if args.cmd == "usage":
        return cmd_usage(args.hours)
    if args.cmd == "logs":
        return cmd_logs(args.n)
    if args.cmd == "queue":
        return cmd_queue()
    if args.cmd == "approve":
        return cmd_approve(args.id)
    if args.cmd == "reject":
        return cmd_reject(args.id)
    if args.cmd == "reply":
        return cmd_reply(args.id, args.text)
    if args.cmd == "publish":
        return _write_snapshot()
    if args.cmd == "prune":
        return cmd_prune()
    if args.cmd == "watchdog":
        return cmd_watchdog(args.interval, args.fail_threshold, args.cooldown)
    p.print_help()
    return 0


# --- interactive REPL ------------------------------------------------------


def _setup_readline() -> None:
    """Wire Tab-completion of command verbs. No-op if readline is unavailable."""
    try:
        import readline
    except ImportError:
        return

    def completer(text: str, state: int) -> str | None:
        # Verbs at the start of the line; on/off right after `english`.
        if readline.get_begidx() == 0:
            opts = [v for v in _VERBS if v.startswith(text)]
        else:
            words = readline.get_line_buffer().split()
            if words and words[0] == "english":
                opts = [o for o in ("on", "off") if o.startswith(text)]
            else:
                opts = []
        return opts[state] if state < len(opts) else None

    readline.set_completer(completer)
    readline.parse_and_bind("tab: complete")


def _prompt() -> str:
    # Wrap the ANSI in \001..\002 so readline doesn't miscount the prompt width.
    if USE_COLOR:
        return "\001\033[36m\002ragctl>\001\033[0m\002 "
    return "ragctl> "


def repl() -> int:
    """Interactive console: type bare commands, Tab completes, and the menu
    reprints after each one. Entered when ragctl is run with no subcommand on a
    TTY. One-shot `ragctl <command>` is unaffected."""
    _setup_readline()
    print(_c("\n  ragctl", "1") + " — interactive console for the local RAG chat.")
    print_menu()
    while True:
        try:
            line = input(_prompt()).strip()
        except EOFError:  # Ctrl-D leaves cleanly
            print()
            break
        except KeyboardInterrupt:  # Ctrl-C at the prompt: cancel the line, stay
            print()
            continue
        if not line:
            continue
        if line in ("exit", "quit"):
            break
        try:
            argv = shlex.split(line)
        except ValueError as exc:  # e.g. an unbalanced quote
            print(f"  ✗ {exc}")
            print_menu()
            continue
        try:
            dispatch(argv)
        except SystemExit:
            pass  # argparse already explained the error; keep the console alive
        except KeyboardInterrupt:
            # A blocking command (watch/up) interrupted: return to the prompt.
            print("\n  (interrupted — back to ragctl)")
        except Exception as exc:  # noqa: BLE001 — one bad command mustn't kill the console
            print(f"  ✗ {exc}")
        print_menu()
    print("  bye.")
    return 0


def cmd_logs(n: int) -> int:
    """Show the last N logged questions + answers from the request log."""
    log = RAG_LOG_DIR / "requests.jsonl"
    if not log.exists() or not log.stat().st_size:
        print(_c(
            "\n  no request log yet — bring the rag up and ask it something.\n",
            "33",
        ))
        return 0
    lines = log.read_text(encoding="utf-8", errors="ignore").splitlines()
    kept = [ln for ln in lines if ln.strip()]
    shown = kept[-n:] if n > 0 else []
    print(_c(f"\n  last {len(shown)} request(s):\n", "1"))
    for ln in shown:
        ts, brace, rest = ln.partition("{")
        if not brace:
            continue
        try:
            rec = json.loads(brace + rest)
        except Exception:
            continue
        tag = _c("gated", "31") if rec.get("gated") else _c("answered", "32")
        print(_c(ts.strip(), "90") + f"  [{tag}]")
        print("  Q: " + str(rec.get("query", "")))
        print("  A: " + str(rec.get("response", "")))
        print()
    return 0


def main() -> int:
    argv = sys.argv[1:]
    # No subcommand on an interactive terminal -> drop into the REPL. A no-arg
    # invocation that is NOT a TTY (piped, `| cat`, a script) prints help and
    # exits instead, so it can never hang waiting for input.
    if not argv and sys.stdin.isatty():
        return repl()
    return dispatch(argv)


if __name__ == "__main__":
    sys.exit(main())
