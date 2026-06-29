"""Deterministic, zero-token context analyzer for a RAG-pipeline experiment.

Statically locates the experiment-relevant seams (regex over the source, NO LLM) and
emits ONE compact, diffable `context-manifest.json` + a human summary, with file:line
citations for every seam. The CONTRACT: downstream experiment planning reads ONLY
this manifest, never the raw codebase — that is the token-saving guarantee (the whole
pipeline's seams in one small JSON instead of re-reading app/ on every experiment).

Idempotent + cacheable: same repo state -> byte-identical manifest (only the
generated-at stamp, kept out, would vary). Records the baseline commit and the
tree-clean precondition. This analyzer knows the RAG pipeline's STRUCTURE (where
gates / flags / model+embedder config / prompt / eval-sets live); it knows nothing
about any specific experiment — "what we vary" is the per-experiment config's job.

    python -m evals.experiment.inspect [--name baseline] [--runs-dir DIR] [--print]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from .fingerprint import AXIS_KEYS, INSTRUMENT_KEYS, LOCK_KEYS, lock_fingerprint

# This file is chat-backend/evals/experiment/inspect.py -> chat-backend/ is parents[2].
CB = Path(__file__).resolve().parents[2]
APP = CB / "app"
EVALS = CB / "evals"


def _git(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", *args], cwd=CB, capture_output=True, text=True, check=False
        ).stdout.strip()
    except OSError:
        return ""


def _rel(path: Path) -> str:
    return path.relative_to(CB).as_posix()


def _grep(path: Path, pattern: str) -> list[tuple[int, str, tuple[str, ...]]]:
    """(lineno, stripped-line, match-groups) for every regex hit in a file."""
    if not path.exists():
        return []
    rx = re.compile(pattern)
    hits = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        m = rx.search(line)
        if m:
            hits.append((i, line.strip(), m.groups()))
    return hits


def _cite(path: Path, lineno: int) -> str:
    return f"{_rel(path)}:{lineno}"


def _sha8(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def _config_default(name: str, getter: str) -> tuple[str | None, str | None]:
    """The default value + citation for a `_get_<getter>("NAME", <default>)` call."""
    cfg = APP / "config.py"
    hits = _grep(cfg, rf'_get_{getter}\("{re.escape(name)}",\s*([^)]+?)\)')
    if not hits:
        return None, None
    lineno, _line, groups = hits[0]
    return groups[0].strip(), _cite(cfg, lineno)


def _tree_clean() -> tuple[bool, list[str]]:
    """Clean = no uncommitted change to the PIPELINE under chat-backend/, ignoring the
    experiment harness's own dir + its run artifacts (so building/running the harness
    never makes the subject look dirty)."""
    raw = _git("status", "--porcelain", "--", ".")
    dirty = []
    for line in raw.splitlines():
        p = line[3:].strip()
        # git reports repo-root-relative paths; ignore the harness's own dir + its
        # run artifacts so building/running the harness never marks the subject dirty.
        if "evals/experiment/" in p:
            continue
        dirty.append(p)
    return (not dirty), dirty


def _eval_sets() -> list[dict[str, Any]]:
    out = []
    for path in sorted(EVALS.glob("eval_set*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        queries = data.get("queries", []) if isinstance(data, dict) else []
        fields = sorted({k for q in queries if isinstance(q, dict) for k in q})
        expectations = sorted(
            {str(q.get("expectation")) for q in queries if isinstance(q, dict)}
        )
        # A content fingerprint (questions + expected_sources) so a changed eval set
        # is a different instrument even if the path is unchanged.
        sig_src = json.dumps(
            [
                [q.get("id"), q.get("question"), q.get("expected_sources")]
                for q in queries
                if isinstance(q, dict)
            ],
            sort_keys=True,
            ensure_ascii=False,
        )
        out.append(
            {
                "id": _rel(path),
                "path": _rel(path),
                "n_queries": len(queries),
                "fields": fields,
                "expectations": expectations,
                "content_sha": _sha8(sig_src),
                "cite": _cite(path, 1),
            }
        )
    return out


def build_manifest() -> dict[str, Any]:
    tree_clean, dirty = _tree_clean()
    prompts_src = (APP / "prompts.py").read_text(encoding="utf-8")
    prompt_sha = _sha8(prompts_src)

    # --- lock parameters (the instrument dimensions, from the config defaults) ---
    top_k_v, top_k_c = _config_default("TOP_K", "int")
    temp_v, temp_c = _config_default("LLM_TEMPERATURE", "float")
    ctx_v, ctx_c = _config_default("CONTEXT_WINDOW", "int")
    lock_params: dict[str, dict[str, Any]] = {
        "top_k": {"value": int(top_k_v) if top_k_v else None, "cite": top_k_c},
        "temperature": {"value": float(temp_v) if temp_v else None, "cite": temp_c},
        # CONTEXT_WINDOW is the code default; the ACTUAL generation context is the
        # OLLAMA_CONTEXT_LENGTH env on the ollama service — recorded as a seam below.
        "num_ctx": {"value": int(ctx_v) if ctx_v else None, "cite": ctx_c},
        "prompt_template_sha": {
            "value": prompt_sha,
            "cite": _cite(APP / "prompts.py", 1),
        },
    }
    lock_for_fp = {k: v["value"] for k, v in lock_params.items()}

    # --- the varied-axis config (what an experiment can swap) ---
    llm_default = _grep(APP / "config.py", r'_DEFAULT_LLM_MODEL\s*=\s*"([^"]+)"')
    emb_default = _grep(APP / "config.py", r'_DEFAULT_EMBEDDING_MODEL\s*=\s*"([^"]+)"')
    axes = {
        "model": {
            "env": "LLM_MODEL",
            "default": llm_default[0][2][0] if llm_default else None,
            "cite": _cite(APP / "config.py", llm_default[0][0]) if llm_default else None,
        },
        "embedder": {
            "env": "EMBEDDING_MODEL",
            "default": emb_default[0][2][0] if emb_default else None,
            "cite": _cite(APP / "config.py", emb_default[0][0]) if emb_default else None,
            "note": "HF_HUB_OFFLINE baked model; swap requires re-embedding the corpus",
        },
    }

    # --- feature flags (the _get_bool pattern) ---
    flags = [
        {"name": g[0], "default": g[1], "cite": _cite(APP / "config.py", ln)}
        for ln, _l, g in _grep(APP / "config.py", r'_get_bool\("(\w+)",\s*(\w+)\)')
    ]

    # --- deterministic gates + language detectors (guardrails.py) ---
    gr = APP / "guardrails.py"
    gates = [
        {"symbol": g[0], "cite": _cite(gr, ln)}
        for ln, _l, g in _grep(gr, r"^def (is_\w+)\(")
    ]
    detectors = [
        {"symbol": g[0], "cite": _cite(gr, ln)}
        for ln, _l, g in _grep(gr, r"^def (looks_\w+)\(")
    ]

    # --- prompt template + language handling (prompts.py / pipeline.py) ---
    pr = APP / "prompts.py"
    prompt_builders = [
        {"symbol": g[0], "cite": _cite(pr, ln)}
        for ln, _l, g in _grep(pr, r"^def (build_\w+)\(")
    ]
    closings = [
        {"symbol": g[0], "cite": _cite(pr, ln)}
        for ln, _l, g in _grep(pr, r"^(_CLOSING_\w+|_ENGLISH_\w+)\s*=")
    ]
    pl = APP / "pipeline.py"
    language_threading = [
        {"hit": _l, "cite": _cite(pl, ln)}
        for ln, _l, _g in _grep(pl, r"(force_english|answer_in_finnish)\b")
    ][:6]

    # --- retrieval surface ---
    rt = APP / "retrieval.py"
    retrieval = [
        {"symbol": g[0], "cite": _cite(rt, ln)}
        for ln, _l, g in _grep(rt, r"^(?:async )?def (retrieve\w*)\(")
    ]

    # --- env seam for the actual generation context (not a config.py default) ---
    ctx_env = _grep(CB / ".env.example", r"^(OLLAMA_CONTEXT_LENGTH)=")
    env_cite = _cite(CB / ".env.example", ctx_env[0][0]) if ctx_env else None
    context_env_seam = {"env": "OLLAMA_CONTEXT_LENGTH", "cite": env_cite}

    return {
        "schema_version": "1",
        "generated_by": "evals.experiment.inspect",
        "repo": {
            "baseline_commit": _git("rev-parse", "HEAD"),
            "tree_clean": tree_clean,
            "dirty_paths": dirty,
        },
        "instrument": {
            "static_lock_params": lock_params,
            # PROVENANCE ONLY — the code defaults, not a run. The runner computes the
            # per-run instrument/arm fingerprints from the AS-EXECUTED values (the
            # effective num_ctx from OLLAMA_CONTEXT_LENGTH, the chosen model / embedder
            # / eval-set); THOSE stamp results and drive assert_comparable.
            "static_lock_fingerprint": lock_fingerprint(lock_for_fp),
            "num_ctx_note": (
                "static num_ctx is the config.py CONTEXT_WINDOW default; the "
                "as-executed num_ctx is OLLAMA_CONTEXT_LENGTH (the runtime env seam "
                "below) — the runner stamps results from the effective value."
            ),
            "context_env_seam": context_env_seam,
            # The guard's contract, recorded so downstream reads the field classes
            # from the manifest, not the code. Values for the axes are in `axes`.
            "fingerprint_field_classes": {
                "lock": list(LOCK_KEYS),
                "sweepable_axes": list(AXIS_KEYS),
                "instrument_defining": list(INSTRUMENT_KEYS),
            },
        },
        "axes": axes,
        "feature_flags": flags,
        "deterministic_gates": gates,
        "language": {
            "detectors": detectors,
            "prompt_builders": prompt_builders,
            "closing_directives": closings,
            "threading": language_threading,
        },
        "retrieval": retrieval,
        "eval_sets": _eval_sets(),
    }


def summarize(m: dict[str, Any]) -> str:
    r = m["repo"]
    lp = m["instrument"]["static_lock_params"]
    lines = [
        "# rag-experiment context manifest",
        f"baseline_commit {r['baseline_commit'][:8]}  tree_clean={r['tree_clean']}"
        + ("" if r["tree_clean"] else f"  dirty={r['dirty_paths']}"),
        f"static_lock_fingerprint {m['instrument']['static_lock_fingerprint']}"
        " (provenance)",
        f"lock: top_k={lp['top_k']['value']} temp={lp['temperature']['value']} "
        f"num_ctx={lp['num_ctx']['value']} "
        f"prompt_sha={lp['prompt_template_sha']['value']}",
        f"axes: model<-{m['axes']['model']['env']}({m['axes']['model']['default']}) "
        f"embedder<-{m['axes']['embedder']['env']}({m['axes']['embedder']['default']})",
        f"gates: {', '.join(g['symbol'] for g in m['deterministic_gates'])}",
        f"detectors: {', '.join(d['symbol'] for d in m['language']['detectors'])}",
        f"flags: {', '.join(f['name'] for f in m['feature_flags'])}",
        "eval_sets:",
        *[
            f"  {e['id']}  n={e['n_queries']}  content_sha={e['content_sha']}  "
            f"expectations={e['expectations']}"
            for e in m["eval_sets"]
        ],
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m evals.experiment.inspect")
    ap.add_argument("--name", default="baseline", help="experiment name (runs subdir)")
    ap.add_argument("--runs-dir", default=str(EVALS / "experiment" / "runs"))
    ap.add_argument("--print", action="store_true", help="print the summary to stdout")
    ap.add_argument(
        "--allow-dirty",
        action="store_true",
        help="proceed even if the pipeline tree has uncommitted changes (the baseline "
        "would not be reproducible) — for inspecting work-in-progress only",
    )
    args = ap.parse_args(argv)

    m = build_manifest()
    if not m["repo"]["tree_clean"] and not args.allow_dirty:
        print(
            "[inspect] PRECONDITION FAILED: pipeline tree is dirty "
            f"({m['repo']['dirty_paths']}); commit it or pass --allow-dirty.",
            file=sys.stderr,
        )
        return 1
    fp = m["instrument"]["static_lock_fingerprint"]
    out_dir = Path(args.runs_dir) / args.name / fp
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "context-manifest.json").write_text(
        json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    summary = summarize(m)
    (out_dir / "context-summary.txt").write_text(summary + "\n", encoding="utf-8")
    print(f"[inspect] manifest -> {_rel(out_dir / 'context-manifest.json')}")
    if args.print:
        print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
