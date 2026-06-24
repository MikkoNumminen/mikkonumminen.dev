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

Cleanup policy (chosen): `down` stops the Compose stack (frees VRAM) and turns
the Funnel off, but leaves Docker Desktop and Tailscale running.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
COMPOSE = ["docker", "compose"]
BACKEND_HEALTH = "http://localhost:8000/health"
BACKEND_CHAT = "http://localhost:8000/chat"
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
    return f"  {_c(glyph, code)} {label:<22} {detail}"


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
    return "gemma4:e4b"


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
    if not rows:
        return ("warn", "no model resident (cold)")
    names = ", ".join(r.split()[0] for r in rows)
    return ("ok", f"{names} (100% GPU)")


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
        return ("ok", f"{util}% util · {float(power):.0f}W · {used}/{total} MiB VRAM")
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


def security_preflight() -> list[str]:
    """Surface TLS-intercepting apps that can break model/image downloads."""
    tl = tasklist_exe()
    if not tl:
        return ["  (could not read the Windows process list)"]
    rc, out = run([tl], timeout=15)
    procs = out.lower()
    notes: list[str] = []
    if "ipvanish" in procs:
        notes.append(
            "  ▲ IPVanish running — Threat Protection can block model/image pulls "
            "(not the running chat). Toggle it off if a pull stalls."
        )
    if any(v in procs for v in ("nordvpn", "expressvpn", "surfshark", "openvpn", "protonvpn")):
        notes.append("  ▲ A VPN client is running — can break TLS on downloads.")
    if any(a in procs for a in ("avast", "avgui", "kaspersky", "bdagent", "norton", "mcshield")):
        notes.append("  ▲ Third-party AV running — its web shield can block pulls.")
    if not notes:
        notes.append("  ● no known download-blocking security apps detected")
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
            ("Tailscale", check_tailscale()),
            ("Funnel", check_funnel(url)),
            ("public reachable", check_public(url)),
        ]
    services = compose_services()
    url = funnel_url()
    return [
        ("Docker engine", docker),
        ("db (pgvector)", check_container(services, "db")),
        ("ollama", check_container(services, "ollama")),
        ("backend", check_container(services, "backend")),
        ("model loaded", check_model_loaded()),
        ("GPU", check_gpu()),
        ("backend /health", check_backend_health()),
        ("Tailscale", check_tailscale()),
        ("Funnel", check_funnel(url)),
        ("public reachable", check_public(url)),
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
    ensure_funnel()
    print("  ◐ starting the stack …")
    run(COMPOSE + ["up", "-d", "backend"], cwd=REPO, timeout=180)
    model = configured_model()
    print(f"  ◐ warming {model} into VRAM …")
    run(COMPOSE + ["exec", "-T", "ollama", "ollama", "run", model, "ok"], cwd=REPO, timeout=120)
    print()
    print(render(gather()))
    if keep:
        print("  (left running — `ragctl down` to cut it)")
        return 0
    print("  holding the live board — Ctrl-C to cut the rag and clean up.\n")
    try:
        _watch_loop()
    except KeyboardInterrupt:
        pass
    return cmd_down()


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


def main() -> int:
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
    args = p.parse_args()

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
    p.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
