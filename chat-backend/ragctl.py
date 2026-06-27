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
  python chat-backend/ragctl.py            (no command, on a TTY) -> interactive
                                           REPL: bare commands, Tab-complete, the
                                           menu reprinted after each command

Cleanup policy (chosen): `down` stops the Compose stack (frees VRAM) and turns
the Funnel off, but leaves Docker Desktop and Tailscale running.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
COMPOSE = ["docker", "compose"]
# Per-request log (query + answer). The compose backend bind-mounts the host dir
# below to this container path; `ragctl up` enables it. Host file == REPO/rag-logs.
RAG_LOG_DIR = REPO / "rag-logs"
RAG_LOG_CONTAINER_FILE = "/srv/rag-logs/requests.jsonl"
BACKEND_HEALTH = "http://localhost:8000/health"
BACKEND_CHAT = "http://localhost:8000/chat"
BACKEND_USAGE = "http://localhost:8000/usage"
FUNNEL_PORT = "8000"
DOCKER_DESKTOP_EXE = "/mnt/c/Program Files/Docker/Docker/Docker Desktop.exe"

# "effort" presets -> (temperature, num_predict). Low temperature for grounded
# RAG; effort mainly buys answer length (num_predict = max output tokens).
EFFORT_PRESETS = {"quick": (0.2, 256), "balanced": (0.4, 512), "thorough": (0.6, 1024)}
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


def http_json(url: str, timeout: int = 8) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode())
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
    rc, out = run(COMPOSE + ["exec", "-T", "ollama", "ollama", "list"], cwd=REPO, timeout=15)
    if rc != 0:
        return []
    return [
        ln.split()[0]
        for ln in out.splitlines()
        if ln.strip() and not ln.startswith("NAME")
    ]


def set_env_vars(updates: dict[str, str]) -> None:
    """Upsert KEY=value pairs in the repo .env, preserving the other lines."""
    env = REPO / ".env"
    lines = env.read_text(encoding="utf-8").splitlines() if env.exists() else []
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line and not line.lstrip().startswith("#") else None
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, val in updates.items():
        if key not in seen:
            out.append(f"{key}={val}")
    env.write_text("\n".join(out) + "\n", encoding="utf-8")


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
    try:
        RAG_LOG_DIR.mkdir(parents=True, exist_ok=True)
        os.chmod(RAG_LOG_DIR, 0o777)  # backend writes as the non-root uid 10001
    except OSError:
        pass
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
    rows: list[dict] = []
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
    rc, out = run(COMPOSE + ["exec", "-T", "ollama", "ollama", "ps"], cwd=REPO, timeout=15)
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
        detail = f"{util}% util · {float(power):.0f}W · {used}/{total} MiB VRAM ({pct:.0f}%)"
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


def check_funnel(url: str | None = None) -> tuple[str, str]:
    ts = tailscale_exe()
    if not ts:
        return ("down", "tailscale.exe not found")
    _, out = run([ts, "funnel", "status"], timeout=10)
    if "Funnel on" in out:
        return ("ok", url or funnel_url() or "on")
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
        [ps, "-NoProfile", "-Command", "(Get-MpComputerStatus).RealTimeProtectionEnabled"],
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
        if any(v in procs for v in ("nordvpn", "expressvpn", "surfshark", "openvpn", "protonvpn")):
            notes.append("  ▲ A VPN client is running — can break TLS on downloads.")
        if any(a in procs for a in ("avast", "avgui", "kaspersky", "bdagent", "norton", "mcshield")):
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
                    "\n  still coming up — back to the prompt; it'll finish in the background.",
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


def _wait_for(check, want_ok_for: int = 1, timeout: int = 150, every: int = 4) -> bool:
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
    run([ts, "funnel", "--bg", FUNNEL_PORT], timeout=20)
    print(f"  ● Funnel → {funnel_url()}")


def cmd_up(keep: bool) -> int:
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
    print("  ◐ docker compose down (frees VRAM) …")
    run(COMPOSE + ["down"], cwd=REPO, timeout=120)
    ts = tailscale_exe()
    if ts:
        print("  ◐ funnel off …")
        run([ts, "funnel", "--https=443", "off"], timeout=20)
    print("  ● done — stack + funnel stopped; Docker Desktop & Tailscale left running.")
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
    print(_c("  ● done — disk reclaimed; the running stack + warm model untouched.", "32"))
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
    run(COMPOSE + ["exec", "-T", "ollama", "ollama", "run", name, "ok"], cwd=REPO, timeout=120)
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
    ("usage [--hours N]", "how much the model's been used (24h)"),
    ("logs", "show recent questions + answers (request log)"),
    ("prune", "reclaim docker disk (rebuild cache, stopped containers)"),
    ("exit", "leave ragctl"),
]

# Verbs Tab-completed in the REPL (real commands + the REPL-only quit words).
_VERBS = [
    "status", "watch", "doctor", "up", "down", "test", "model", "english",
    "usage", "logs", "prune", "exit", "quit",
]


def print_menu() -> None:
    print()
    print(_c("  commands", "1") + _c("   ·  Tab completes  ·  'exit' to leave", "2"))
    for cmd, desc in _MENU:
        print(f"    {cmd:<16}{_c(desc, '2')}")


# --- argparse / dispatch (shared by one-shot mode and the REPL) -------------


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ragctl", description="Operator CLI for the local RAG chat.")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("status", help="one-shot status board")
    sub.add_parser("watch", help="live status board (Ctrl-C exits)")
    sub.add_parser("doctor", help="board + security pre-flight + versions")
    up = sub.add_parser("up", help="bring the stack live")
    up.add_argument("--keep", action="store_true", help="leave it running instead of holding the board")
    sub.add_parser("down", help="cut the rag: compose down + funnel off")
    test = sub.add_parser("test", help="doctor the live model with a test question")
    test.add_argument("question", help="the question to ask")
    mdl = sub.add_parser("model", help="choose a model + effort/context and apply it")
    mdl.add_argument("name", nargs="?", help="model name (omit to pick interactively)")
    mdl.add_argument(
        "--effort", choices=list(EFFORT_PRESETS), default="balanced", help="generation effort"
    )
    mdl.add_argument("--context", choices=list(CONTEXT_PRESETS), help="served context window")
    mdl.add_argument("--no-test", action="store_true", help="skip the post-apply test query")
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
        return cmd_up(keep=args.keep)
    if args.cmd == "down":
        return cmd_down()
    if args.cmd == "test":
        return cmd_test(args.question)
    if args.cmd == "model":
        return cmd_model(args.name, args.effort, args.context, not args.no_test)
    if args.cmd == "english":
        return cmd_english(args.state)
    if args.cmd == "usage":
        return cmd_usage(args.hours)
    if args.cmd == "logs":
        return cmd_logs(args.n)
    if args.cmd == "prune":
        return cmd_prune()
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
        print(_c("\n  no request log yet — bring the rag up and ask it something.\n", "33"))
        return 0
    lines = log.read_text(encoding="utf-8", errors="ignore").splitlines()
    shown = [ln for ln in lines if ln.strip()][-n:]
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
