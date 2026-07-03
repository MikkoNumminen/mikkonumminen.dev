"""Unit tests for the rag-experiment harness deterministic core — the comparability
guard (three field classes), the config resolver (FIX A: an axis is sweep XOR fixed),
the single-axis pair generation (FIX B: no confounded pairs), the parallel-delta, and
the runbook assembler. Pure logic — no GPU / DB / live stack (that is the documented
end-to-end self-test, Phase-D reproduction)."""

from __future__ import annotations

from pathlib import Path

import pytest

from evals.experiment import config as C
from evals.experiment import delta as D
from evals.experiment import report as RP
from evals.experiment import runner as R
from evals.experiment.fingerprint import (
    arm_fingerprint,
    assert_comparable,
    instrument_fingerprint,
)

VALID = """
name = "t"
[lock]
top_k = 6
temperature = 0.4
num_ctx = 8192
[eval_set]
path = "evals/eval_set_fi.json"
[axes.model]
mode = "sweep"
arms = ["q", "l", "p"]
[axes.embedder]
mode = "fixed"
value = "en"
"""


def _cfg(tmp_path, text):
    p = tmp_path / "c.toml"
    p.write_text(text, encoding="utf-8")
    return C.load(p)


def test_config_resolves_cells_and_budget(tmp_path):
    cfg = _cfg(tmp_path, VALID)
    assert len(cfg.cells()) == 3
    assert cfg.budget(16) == 48
    assert cfg.sweep_axes() == ["model"]


def test_fix_a_axis_cannot_be_both(tmp_path):
    bad = VALID.replace(
        '[axes.embedder]\nmode = "fixed"\nvalue = "en"',
        '[axes.embedder]\nmode = "sweep"\narms = ["e"]\nvalue = "en"',
    )
    with pytest.raises(ValueError, match="must not also set"):
        _cfg(tmp_path, bad)


def test_fix_a_unknown_axis_rejected(tmp_path):
    with pytest.raises(ValueError, match="unknown axes"):
        _cfg(tmp_path, VALID + '\n[axes.reranker]\nmode = "fixed"\nvalue = "x"\n')


def test_fix_a_missing_axis_rejected(tmp_path):
    bad = VALID.replace('[axes.embedder]\nmode = "fixed"\nvalue = "en"', "")
    with pytest.raises(ValueError, match="declared exactly once"):
        _cfg(tmp_path, bad)


LOCK = {
    "top_k": 6,
    "temperature": 0.4,
    "num_ctx": 8192,
    "prompt_template_sha": "s",
    "eval_set_sha": "e",
}


def _fp(**over):
    return {**LOCK, "model": "q", "embedder": "en", **over}


def test_guard_single_axis_comparable():
    assert_comparable(_fp(), _fp(embedder="multi"), "embedder")  # must not raise


def test_guard_rejects_lock_violation():
    with pytest.raises(AssertionError, match="LOCK violation"):
        assert_comparable(_fp(), _fp(num_ctx=4096), "embedder")


def test_guard_rejects_different_instrument():
    with pytest.raises(AssertionError, match="DIFFERENT instrument"):
        assert_comparable(_fp(), _fp(eval_set_sha="native"), "embedder")


def test_guard_rejects_confound():
    with pytest.raises(AssertionError, match="confounded"):
        assert_comparable(_fp(), _fp(model="l", embedder="multi"), "embedder")


def test_instrument_shared_arm_distinct():
    a, b = _fp(), _fp(embedder="multi")
    assert instrument_fingerprint(a) == instrument_fingerprint(b)  # same runs/ dir
    assert arm_fingerprint(a) != arm_fingerprint(b)  # distinct arm files


def test_fix_b_matrix_only_single_axis_pairs():
    cells = [
        {"model": m, "embedder": e} for e in ["en", "multi"] for m in ["q", "l", "p"]
    ]
    arms = [{"cell": c, "fp_fields": {**LOCK, **c}} for c in cells]
    pairs = R.comparable_pairs(arms, ["model", "embedder"])
    assert len(pairs) == 9  # 2*C(3,2) model-pairs + 3 embedder-pairs
    for i, j, ax in pairs:
        diff = [
            k for k in ("model", "embedder") if arms[i]["cell"][k] != arms[j]["cell"][k]
        ]
        assert diff == [ax]  # differs on exactly the declared axis, never both


def test_delta_basic():
    d = D.parallel_delta(
        [{"id": "q1", "hit": True, "rr": 1.0, "best_distance": 0.2}],
        [{"id": "q1", "hit": False, "rr": 0.0, "best_distance": 0.5}],
        label_a="en",
        label_b="multi",
        axis="embedder",
    )
    assert d["hit_rate_a"] == 1.0 and d["hit_rate_b"] == 0.0
    assert d["mean_dist_delta"] == 0.3 and d["flips"] == ["q1"]


def test_report_assemble(tmp_path):
    cfg = _cfg(tmp_path, VALID)
    manifest = {
        "instrument": {"static_lock_params": {"prompt_template_sha": {"value": "s"}}},
        "eval_sets": [{"path": "evals/eval_set_fi.json", "content_sha": "e"}],
    }

    def arm(model):
        return {
            "fp_fields": {
                "top_k": 6,
                "temperature": 0.4,
                "num_ctx": 8192,
                "eval_set_sha": "e",
                "model": model,
                "embedder": "en",
            },
            "observed_lock": {"top_k": 6, "temperature": 0.4, "num_ctx": 8192},
            "vram_mb": 9000,
            "retrieval": [{"id": "q1", "hit": True, "rr": 1.0, "best_distance": 0.2}],
            "synthesis": {"substantive": 10, "total": 12},
            "containment": {"refused": 3, "total": 4},
        }

    res = RP.assemble([arm("q"), arm("l"), arm("p")], cfg, manifest)
    assert len(res["arms"]) == 3
    assert len(res["pairs"]) == 3  # 3 models at a fixed embedder -> C(3,2) model-deltas
    assert all(ax == "model" for _, _, ax in res["pairs"])
    assert "synthesis" in res["results_md"]


def test_report_asserts_lock_drift(tmp_path):
    # The runbook path must apply the same lock guard as the in-process runner: an
    # arm whose eval_arm ran at a num_ctx differing from the config must abort.
    cfg = _cfg(tmp_path, VALID)  # config num_ctx = 8192
    manifest = {
        "instrument": {"static_lock_params": {"prompt_template_sha": {"value": "s"}}},
        "eval_sets": [{"path": "evals/eval_set_fi.json", "content_sha": "e"}],
    }
    drifted = {
        "fp_fields": {
            "top_k": 6,
            "temperature": 0.4,
            "num_ctx": 4096,
            "eval_set_sha": "e",
            "model": "q",
            "embedder": "en",
        },
        "observed_lock": {"top_k": 6, "temperature": 0.4, "num_ctx": 4096},
        "retrieval": [],
    }
    with pytest.raises(AssertionError, match="LOCK drift"):
        RP.assemble([drifted], cfg, manifest)


def test_report_aborts_on_missing_observed_lock(tmp_path):
    # #5 regression. The runbook path must NOT silently accept a MISSING lock: the runner
    # is loud (m["observed_lock"], KeyError), so report must be too. A {} default would
    # make assert_effective a no-op and admit an arm with undetected lock drift into a
    # comparison — the exact silent bypass the lock-assert mechanism exists to prevent.
    cfg = _cfg(tmp_path, VALID)
    manifest = {
        "instrument": {"static_lock_params": {"prompt_template_sha": {"value": "s"}}},
        "eval_sets": [{"path": "evals/eval_set_fi.json", "content_sha": "e"}],
    }
    no_lock = {
        "fp_fields": {
            "top_k": 6,
            "temperature": 0.4,
            "num_ctx": 8192,
            "eval_set_sha": "e",
            "model": "q",
            "embedder": "en",
        },
        "retrieval": [],
    }  # no observed_lock key
    with pytest.raises(KeyError):
        RP.assemble([no_lock], cfg, manifest)


def test_report_asserts_recorded_lock_drift(tmp_path):
    # The smuggle vector the feeder's fp_fields lock check exists for: observed_lock
    # is MISSING the drifted key (assert_effective skips absent keys), and the
    # assembly derives lock values from the config — so without the feeder check, an
    # arm recorded at num_ctx=4096 would be silently re-stamped as the config's 8192
    # and could pair with a genuinely-8192 arm into a lock-confounded delta.
    cfg = _cfg(tmp_path, VALID)  # config num_ctx = 8192
    manifest = {
        "instrument": {"static_lock_params": {"prompt_template_sha": {"value": "s"}}},
        "eval_sets": [{"path": "evals/eval_set_fi.json", "content_sha": "e"}],
    }
    smuggled = {
        "fp_fields": {
            "top_k": 6,
            "temperature": 0.4,
            "num_ctx": 4096,
            "eval_set_sha": "e",
            "model": "q",
            "embedder": "en",
        },
        "observed_lock": {"top_k": 6, "temperature": 0.4},  # num_ctx absent
        "retrieval": [],
    }
    with pytest.raises(AssertionError, match="LOCK drift"):
        RP.assemble([smuggled], cfg, manifest)


def test_report_asserts_runs_drift(tmp_path):
    # The disk arm records the runs count it EXECUTED; the config declares one. The
    # assembly stamps identity from the config only, so a disagreeing disk arm must
    # abort — re-stamping a 1-run aggregate as runs=3 would lie about its scale.
    cfg = _cfg(tmp_path, VALID.replace('name = "t"', 'name = "t"\nruns = 3'))
    manifest = {
        "instrument": {"static_lock_params": {"prompt_template_sha": {"value": "s"}}},
        "eval_sets": [{"path": "evals/eval_set_fi.json", "content_sha": "e"}],
    }
    executed_once = {
        "fp_fields": {
            "top_k": 6,
            "temperature": 0.4,
            "num_ctx": 8192,
            "eval_set_sha": "e",
            "runs": 1,
            "model": "q",
            "embedder": "en",
        },
        "observed_lock": {"top_k": 6, "temperature": 0.4, "num_ctx": 8192},
        "retrieval": [],
    }
    with pytest.raises(AssertionError, match="runs drift"):
        RP.assemble([executed_once], cfg, manifest)


def test_report_asserts_options_drift(tmp_path):
    # The config declares think=false for the q arm, but the disk arm executed with
    # no options. Stamping cfg's options onto it would hide a run-param change from
    # the guard (options are part of the model-axis identity) — abort instead.
    cfg = _cfg(tmp_path, VALID + '\n[arm_options]\n"q" = { think = false }\n')
    manifest = {
        "instrument": {"static_lock_params": {"prompt_template_sha": {"value": "s"}}},
        "eval_sets": [{"path": "evals/eval_set_fi.json", "content_sha": "e"}],
    }
    ran_without_options = {
        "fp_fields": {
            "top_k": 6,
            "temperature": 0.4,
            "num_ctx": 8192,
            "eval_set_sha": "e",
            "model": "q",
            "embedder": "en",
        },
        "observed_lock": {"top_k": 6, "temperature": 0.4, "num_ctx": 8192},
        "retrieval": [],
    }
    with pytest.raises(AssertionError, match="options drift"):
        RP.assemble([ran_without_options], cfg, manifest)


def test_cell_options_merge(tmp_path):
    cfg = _cfg(tmp_path, VALID + '\n[arm_options]\n"q" = { think = false }\n')
    cells = cfg.cells()
    q = next(c for c in cells if c["model"] == "q")
    ll = next(c for c in cells if c["model"] == "l")
    assert cfg.cell_options(q) == '{"think":false}'  # the qwen-like arm carries it
    assert cfg.cell_options(ll) == ""  # the others carry nothing


def test_runner_and_report_agree_on_instrument_fingerprint(tmp_path):
    # S1 regression, kept as the end-to-end net now that both paths share the
    # assembly core: runner.run (automated) and report.assemble (runbook) once built
    # the instrument-fingerprint dict differently — runner omitted `runs` (part of
    # the instrument identity), so a runs=3 run collided with runs=1 in one dir.
    # Drive BOTH real paths on one config and pin that they produce the same
    # instrument fingerprint, the same arm fingerprint, and byte-identical
    # results.md (S2: for runs>1 that includes the variance band + runs= header,
    # never a bare aggregate that looks like a hard number).
    text = VALID.replace('name = "t"', 'name = "eq"\nruns = 3').replace(
        'arms = ["q", "l", "p"]', 'arms = ["q"]'
    )
    cfg = _cfg(tmp_path, text)
    manifest = {
        "instrument": {"static_lock_params": {"prompt_template_sha": {"value": "s"}}},
        "eval_sets": [{"path": "evals/eval_set_fi.json", "content_sha": "e"}],
    }
    measure = {
        "observed_lock": {"top_k": 6, "temperature": 0.4, "num_ctx": 8192},
        "vram_mb": 9000,
        "retrieval": [{"id": "q1", "hit": True, "rr": 1.0, "best_distance": 0.2}],
        "synthesis": {"substantive": 9, "total": 9, "per_run": [3, 3, 3], "cases": 3},
        "containment": {"refused": 3, "total": 12, "per_run": [1, 1, 1], "cases": 4},
    }

    class FakeArm:
        def swap(self, cell: dict[str, str]) -> None:
            pass

        def measure(self, eval_set_path: str) -> dict:
            return measure

    runner_out = R.run(
        cfg, manifest, FakeArm(), runs_dir=tmp_path / "runs", n_questions=16
    )
    runner_fp = Path(runner_out["out_dir"]).name

    arm_json = {
        "fp_fields": {
            "top_k": 6,
            "temperature": 0.4,
            "num_ctx": 8192,
            "eval_set_sha": "e",
            "runs": 3,
            "model": "q",
            "embedder": "en",
            "options": "",
        },
        **measure,
    }
    report_out = RP.assemble([arm_json], cfg, manifest)

    assert runner_fp == report_out["instrument_fingerprint"]
    assert [a["arm_fp"] for a in runner_out["arms"]] == [
        a["arm_fp"] for a in report_out["arms"]
    ]
    runner_md = (Path(runner_out["out_dir"]) / "results.md").read_text(encoding="utf-8")
    assert runner_md == report_out["results_md"]
    assert "runs=3" in runner_md
    assert "per-cell variance" in runner_md


def test_options_are_arm_identity():
    # Per-arm options are part of the arm fingerprint and the model-axis identity.
    plain = _fp(model="q")
    think_off = _fp(model="q", options='{"think":false}')
    assert arm_fingerprint(plain) != arm_fingerprint(think_off)  # not silently merged
    # A model sweep carries options with the model -> comparable.
    assert_comparable(_fp(model="q", options='{"think":false}'), _fp(model="l"), "model")
    # Same model, options differ, but you claim the embedder is the axis -> confound
    # (the model-axis identity, which includes options, has changed).
    with pytest.raises(AssertionError, match="confounded"):
        assert_comparable(plain, think_off, "embedder")


def test_runs_is_instrument_identity(tmp_path):
    assert _cfg(tmp_path, VALID).runs == 1  # default
    assert _cfg(tmp_path, "runs = 3\n" + VALID).runs == 3  # top-level, before tables
    one = _fp(model="q", runs=1)
    three = _fp(model="q", runs=3)
    assert arm_fingerprint(one) != arm_fingerprint(three)  # different-scale aggregates
    with pytest.raises(AssertionError, match="runs differ"):
        assert_comparable(one, three, "model")


def test_variance_reporting():
    from evals.experiment.tables import (
        cell_stats,
        committed_in_band,
        render_variance_table,
    )

    assert cell_stats([3, 1, 2], 4) == {
        "mean": 2.0,
        "min": 1,
        "max": 3,
        "runs": 3,
        "cases": 4,
    }
    assert committed_in_band([1, 2, 3], 3)["in_band"] is True  # 3 in [1,3]
    assert committed_in_band([1, 2, 3], 9)["in_band"] is False  # 9 is an outlier
    arms = [
        {
            "cell": {"model": "q"},
            "retrieval": [{"hit": True}, {"hit": False}],
            "synthesis": {"per_run": [8, 9], "cases": 12},
            "containment": {"per_run": [1, 3], "cases": 4},
        }
    ]
    t = render_variance_table(arms)
    assert "DET" in t and "STOCH" in t
    assert "8.5[8-9]/12" in t and "2.0[1-3]/4" in t
