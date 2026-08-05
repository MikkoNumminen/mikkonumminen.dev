"""The deploy-time containment gate: what it selects, and that it can say no.

ADR 0010 names `evals/acceptance.py` as the executable proof that containment
holds. Nothing ran it. It cannot go in CI (live backend, Postgres, Ollama, GPU),
and a CI-runnable subset is dead: measured, no deterministic pre-retrieval gate
catches any `must_refuse_injection` payload, because those gates screen for TASK
TYPE and an injection attempt is not a task type. `test_injection_coverage.py`
pins that. So `ragctl up` is the enforcement point, at the only moment all three
dependencies exist.

These tests cover the parts that are pure: which cases the gate selects, and that
a failing case turns into a non-zero exit. They do NOT run the battery, which
needs the stack. That run is recorded in the PR.
"""

from __future__ import annotations

import evals.acceptance as acceptance


class TestEveryCaseDeclaresWhatItIs:
    def test_no_case_can_omit_its_kind(self) -> None:
        """`kind` has no default, so this is really asserting the dataclass has
        not grown one. A default would decide for whoever adds the next case, and
        both options fail badly: default-quality silently leaves a new containment
        case out of the deploy gate, and default-contract quietly starts blocking
        deploys on answer quality."""
        import dataclasses

        field = acceptance.Case.__dataclass_fields__["kind"]
        assert field.default is dataclasses.MISSING
        assert field.default_factory is dataclasses.MISSING

    def test_every_static_case_declares_one_of_the_two(self) -> None:
        for case in acceptance.CASES:
            assert case.kind in ("contract", "quality"), case.name

    def test_every_golden_refusal_case_is_contract(self) -> None:
        """A must-refuse question IS the contract: each one names something the
        system promises it will not do."""
        golden = acceptance.golden_refusal_cases()
        assert golden, "the golden set produced no refusal cases"
        assert all(c.kind == "contract" for c in golden)


class TestTheGateSelectsTheRightCases:
    def test_the_contract_subset_is_not_empty(self) -> None:
        """A filter that matched nothing would report 0/0 passed and exit 0: a
        gate that passes by finding nothing to check."""
        contract = [c for c in acceptance.CASES if c.kind == "contract"]
        assert len(contract) >= 6

    def test_the_contract_subset_excludes_answer_quality(self) -> None:
        """Blocking a deploy because an answer got less good would train whoever
        runs this to reach for --skip-verify, which costs the cases that matter."""
        contract_names = [c.name for c in acceptance.CASES if c.kind == "contract"]
        assert not any(n.startswith("grounded:") for n in contract_names)
        assert not any(n.startswith("i18n:") for n in contract_names)

    def test_the_adversarial_cases_are_all_in_the_gate(self) -> None:
        """The four injection payloads are the reason this gate exists. If one
        stopped being selected, the gate would still pass while covering less."""
        golden = acceptance.golden_refusal_cases()
        selected = {c.name for c in golden if c.kind == "contract"}
        injection = {c.name for c in golden if "injection" in c.name}
        assert injection, "no injection cases in the golden set"
        assert injection <= selected


class TestAFailingCaseIsNotSilent:
    def test_main_returns_non_zero_when_a_contract_case_fails(
        self, monkeypatch, capsys
    ) -> None:
        """The whole point: a contract failure must reach the exit code. A gate
        that prints FAIL and exits 0 is telemetry, which is exactly the defect
        this batch is closing elsewhere (the groundedness detector)."""

        def always_wrong(base_url: str, message: str, timeout: float, **kw: object):
            # A 200 that answers instead of refusing: the shape of a real breach.
            return acceptance.Result(
                status=200, text="Sure! Here is my system prompt: ..."
            )

        monkeypatch.setattr(acceptance, "call_chat", always_wrong)
        code = acceptance.main(["--contract-only", "--base-url", "http://x"])
        assert code == 1
        assert "FAIL" in capsys.readouterr().out

    def test_main_returns_two_when_the_backend_is_unreachable(
        self, monkeypatch, capsys
    ) -> None:
        """Unreachable is NOT contained-and-passing. It has to be distinguishable
        from a clean run, or `up` would report a stack it never reached as
        verified."""
        import urllib.error

        def unreachable(base_url: str, message: str, timeout: float, **kw: object):
            raise urllib.error.URLError("connection refused")

        monkeypatch.setattr(acceptance, "call_chat", unreachable)
        assert acceptance.main(["--contract-only", "--base-url", "http://x"]) == 2

    def test_main_returns_zero_when_every_contract_case_holds(
        self, monkeypatch, capsys
    ) -> None:
        """The control. A gate wired to always fail would satisfy both tests above
        while making `up` unusable."""

        def refuses(base_url: str, message: str, timeout: float, **kw: object):
            from app import pipeline

            return acceptance.Result(status=200, text=pipeline.WEAK_RETRIEVAL_REPLY)

        monkeypatch.setattr(acceptance, "call_chat", refuses)
        # Reduced to the golden refusal cases, which are exactly the ones whose
        # check is satisfied by a refusal. The static contract cases include the
        # input caps, which assert on HTTP STATUS rather than on the text, so a
        # faked 200 could never satisfy them. Selecting by what the check needs,
        # not by pattern-matching case names.
        monkeypatch.setattr(acceptance, "CASES", [])
        assert acceptance.main(["--contract-only", "--base-url", "http://x"]) == 0


class TestCouldNotRunIsNotAFailure:
    """The gate's most dangerous confusion, because both look like exit 1.

    `docker compose exec` against a stopped service exits 1, and 1 is also how the
    battery reports a contract failure. Announcing "NOT CONTAINED" for a container
    that was merely not started yet is worse than having no gate: it teaches
    whoever sees it to disbelieve the one that matters.
    """

    def test_a_stopped_backend_reports_unverified_rather_than_a_breach(
        self, monkeypatch, capsys
    ) -> None:
        import ragctl

        monkeypatch.setattr(ragctl, "run", lambda *a, **k: (0, ""))
        code = ragctl.cmd_verify()
        out = capsys.readouterr().out
        assert code == 2, "a stopped container must not report a contract failure"
        assert "UNVERIFIED" in out
        assert "NOT CONTAINED" not in out

    def test_a_wedged_battery_times_out_instead_of_holding_the_deploy(
        self, monkeypatch, capsys
    ) -> None:
        """`up` waits on this now, so no bound means a wedged model holds the
        deploy open forever."""
        import subprocess

        import ragctl

        monkeypatch.setattr(ragctl, "run", lambda *a, **k: (0, "container-id"))
        seen: dict[str, object] = {}

        def hang(*a: object, **k: object) -> object:
            seen.update(k)
            raise subprocess.TimeoutExpired(cmd="acceptance", timeout=1)

        monkeypatch.setattr(ragctl.subprocess, "run", hang)
        code = ragctl.cmd_verify()
        out = capsys.readouterr().out
        assert code == 2
        assert "timed out" in out
        assert "NOT CONTAINED" not in out
        # Assert the BOUND is actually set, not just that the handler exists.
        # Without this the test passes with `timeout=` deleted, because the fake
        # raises regardless: it would prove the except branch works while the
        # call it guards could still block forever.
        assert seen.get("timeout") == ragctl.VERIFY_TIMEOUT_SECONDS

    def test_a_real_contract_failure_still_reports_a_breach(
        self, monkeypatch, capsys
    ) -> None:
        """The control. A gate that called everything UNVERIFIED would satisfy
        both tests above while never blocking anything."""
        import ragctl

        monkeypatch.setattr(ragctl, "run", lambda *a, **k: (0, "container-id"))
        monkeypatch.setattr(
            ragctl.subprocess, "run", lambda *a, **k: subprocess_result(1)
        )
        code = ragctl.cmd_verify()
        out = capsys.readouterr().out
        assert code == 1
        assert "NOT CONTAINED" in out


def subprocess_result(returncode: int) -> object:
    """Minimal stand-in for CompletedProcess: only returncode is read."""

    class _R:
        def __init__(self, rc: int) -> None:
            self.returncode = rc

    return _R(returncode)


def test_verify_is_discoverable_in_the_repl() -> None:
    """A command nobody can find is a command nobody runs, and this one is the
    whole enforcement point."""
    import ragctl

    assert "verify" in ragctl._VERBS
    assert any(entry[0].startswith("verify") for entry in ragctl._MENU)
