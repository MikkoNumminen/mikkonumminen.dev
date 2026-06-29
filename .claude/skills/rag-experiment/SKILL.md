---
name: rag-experiment
description: The eval-gated, single-variable experiment harness for the local RAG — should we swap X for Y in the pipeline (X, Y ∈ {model, embedder, chunking, reranker})? It runs a methodologically locked comparison: a zero-token static `inspect` of the pipeline seams, a TOML config that declares exactly what varies (and cannot lie — each axis is sweep XOR fixed), a runtime lock-assert + instrument fingerprint that refuses to compare apples to oranges, the multi-arm runner that swaps one resident model/embedder at a time and records VRAM + real token counts, and the parallel-delta + per-arm tables. Core discipline: AI-free measurement — the ONLY tokens any run spends are the synthesis-under-test generations (questions × arms), stated before the run. Use this instead of hand-rolling a one-off comparison; it bakes in the single-variable lock, the instrument-before-result rule, and the findings-recorded honesty the calibration work demands. Architecture context: the `rag-backend` skill. Verify/audit battery: `rag-audit`.
---

# rag-experiment — eval-gated pipeline experiments

Use this when the question is **"should we change one thing in the RAG pipeline?"** — a model swap, an embedder swap, a chunking or reranker change. It runs the comparison as a **locked instrument**, not an ad-hoc spot check, so the answer survives scrutiny. Finnish-model-vs-general was its first instance, not its identity — nothing in the harness names a language or a model; *what varies* lives in a config + an eval set.

## The discipline (why this exists, not just how)

- **AI-free measurement / token budget.** The ONLY AI tokens a run may spend are the synthesis-under-test generations: **`questions × arms`**, printed *before* the run. Everything else — `inspect`, lock-asserts, retrieval scoring, the EN/FI (baseline/variant) delta, VRAM/token capture, table generation — is deterministic, zero-token Python. If a step wants to call a model to "measure," it is the wrong step.
- **Single variable, asserted at runtime.** Two arms may differ on **exactly one** declared sweep axis. `fingerprint.assert_comparable` (the guard, on the runner's data path — never in presentation) classifies every field: **LOCK** `{top_k, temperature, num_ctx, prompt_template_sha}` must always match (differ → not comparable); **SWEEPABLE** `{model, embedder}` may differ on one axis only (differ on two → confounded); **INSTRUMENT-defining** `{eval_set_sha}` differs → a *different instrument*, a separate block, never a numeric delta.
- **As-executed, not as-configured.** The fingerprint that stamps a result uses the *effective runtime* values (real `num_ctx` from `OLLAMA_CONTEXT_LENGTH`, the loaded model/embedder), not code defaults. `inspect`'s static fingerprint is provenance only. A run whose stack drifted from its config **aborts** rather than recording a lie.
- **Instrument before result.** Build and freeze the eval set *before* looking at outcomes. Never reword a question to change a number — that contaminates the instrument (a reworded `must_retrieve` query embeds differently → different retrieval). A detection gap is a **finding to record**, not a thing to silently fix.
- **Either outcome is a win.** Do not frame, tune, or select toward a wanted result. Report what the data shows; record the confounds.

## Layout

- Harness (ordinary, tested `evals` Python): `chat-backend/evals/experiment/` — `inspect.py` (static seam analyzer → manifest), `config.py` (the one TOML, resolved), `fingerprint.py` (the 3 field classes + `assert_comparable`), `lock.py`, `delta.py`, `tables.py`, `runner.py` (orchestration + single-axis pair generation), `eval_arm.py` (container-side per-arm measurement), `report.py` (assemble from per-arm JSON).
- Configs: `chat-backend/evals/experiment/configs/<name>.toml`. Artifacts: `…/runs/<name>/<instrument-fp>/`.
- Tests: `chat-backend/tests/test_experiment.py` (the deterministic core).

## Runbook

```bash
cd chat-backend
# 1. zero-token: map the pipeline seams + assert the tree is clean (provenance baseline)
python -m evals.experiment.inspect --name <exp>        # -> runs/<exp>/<fp>/context-manifest.json
# 2. write configs/<exp>.toml — declare the lock + the axes (each sweep XOR fixed) + the eval set.
#    cells = product of the swept arms; generations = cells × questions (printed before running).
# 3. per arm (one resident model at a time): swap the stack, then measure IN the container.
#    swap models with `ragctl model NAME` (or EMBEDDING_MODEL + re-index for an embedder swap).
docker exec <backend> python -m evals.experiment.eval_arm \
    --eval-set evals/<set>.json --num-ctx <effective> > runs/<exp>/<fp>/arm-<model>.json
# 4. zero-token: assemble — the guard generates only single-axis pairs; renders the tables.
python -m evals.experiment.report --config configs/<exp>.toml \
    --manifest runs/<exp>/<fp>/context-manifest.json --arms runs/<exp>/<fp>/arm-*.json
```
`num_ctx` must match the config's lock for every arm — if a model's GGUF caps it lower (e.g. Poro at 8192), hold **all** arms at that value (set `OLLAMA_CONTEXT_LENGTH`); the lock-assert aborts otherwise. Re-embedding the corpus for an embedder swap is deterministic and spends **no tokens** (note its compute cost; it is not in the generation budget).

## Self-test (the skill's correctness check — Phase-D reproduction)

`configs/phase-d-reproduce.toml` re-runs the committed 3-model Finnish synthesis comparison (single-variable on `model`, embedder fixed, `num_ctx=8192`). The harness is correct iff it reproduces the committed numbers: **FI retrieval hit-rate 0.667 / MRR 0.454; synthesis substantive 25/25/18 (qwen3 / Poro / llama); containment refuse 9/3/3**. If it does not reproduce these, the harness is wrong — fix it before pointing the skill at anything new. The deterministic core (guard field-classes, FIX-A resolver, FIX-B single-axis pairs, delta) is unit-tested in `tests/test_experiment.py`.

## Adding an axis

`fingerprint.AXIS_KEYS` is the closed set of sweepable axes; the config must declare each exactly once. To add `chunking`/`reranker`: extend `AXIS_KEYS`, give `eval_arm` a way to read that axis from the env, and the resolver + guard + pair-generation generalize unchanged.
