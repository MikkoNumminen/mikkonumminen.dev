"""Tests for the GDPR policy, classification, and pseudonymisation (Phase 2)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.gdpr import (
    ADMIN,
    DEFAULT_POLICY,
    INTERNAL,
    PII,
    PUBLIC,
    RESTRICTED,
    ClassificationRule,
    GdprPolicy,
    classify,
    is_embeddable,
    load_policy,
    pseudonymize,
    token_for,
    validate_policy,
)


def test_classify_default_when_no_rule_matches() -> None:
    assert classify("projects/hrm.md", "body", DEFAULT_POLICY) == PUBLIC


def test_classify_by_source_prefix() -> None:
    pol = GdprPolicy(
        classification_rules=(
            ClassificationRule(classification=RESTRICTED, source_prefix="restricted/"),
        )
    )
    assert classify("restricted/x.md", "body", pol) == RESTRICTED
    assert classify("projects/hrm.md", "body", pol) == PUBLIC


def test_classify_by_content_pattern() -> None:
    pol = GdprPolicy(
        classification_rules=(
            ClassificationRule(
                classification=PII, content_pattern=re.compile(r"\bSSN\b")
            ),
        )
    )
    assert classify("a.md", "contains SSN here", pol) == PII
    assert classify("a.md", "nothing sensitive", pol) == PUBLIC


def test_classify_most_closed_wins_when_several_match() -> None:
    # A doc matching both an internal prefix and a pii content rule must classify
    # as pii (most-closed) — a misconfiguration fails safe toward NOT exposing.
    pol = GdprPolicy(
        classification_rules=(
            ClassificationRule(classification=INTERNAL, source_prefix="x/"),
            ClassificationRule(classification=PII, content_pattern=re.compile("secret")),
        )
    )
    assert classify("x/a.md", "a secret", pol) == PII


def test_rule_with_no_matcher_never_matches() -> None:
    assert ClassificationRule(classification=PUBLIC).matches("a", "b") is False


def test_rule_requires_both_when_both_set() -> None:
    rule = ClassificationRule(
        classification=PII, source_prefix="hr/", content_pattern=re.compile("ssn")
    )
    assert rule.matches("hr/x.md", "has ssn") is True
    assert rule.matches("hr/x.md", "no match") is False  # prefix ok, pattern not
    assert rule.matches("other/x.md", "has ssn") is False  # pattern ok, prefix not


def test_is_embeddable_only_excludes_pii() -> None:
    assert is_embeddable(PII) is False
    assert is_embeddable(RESTRICTED) is True
    assert is_embeddable(INTERNAL) is True
    assert is_embeddable(PUBLIC) is True


def test_token_for_is_stable_and_distinct() -> None:
    assert token_for("Dr. Jane Doe") == token_for("Dr. Jane Doe")
    assert token_for("Dr. Jane Doe") != token_for("Mr. John Roe")
    assert token_for("x").startswith("[PERSON-")


def test_pseudonymize_replaces_with_token_and_maps_back() -> None:
    pol = GdprPolicy(
        pseudonymize_patterns=(re.compile(r"Dr\. [A-Z][a-z]+ [A-Z][a-z]+"),)
    )
    text, mapping = pseudonymize("Signed by Dr. Jane Doe today.", pol)
    token = token_for("Dr. Jane Doe")
    assert "Dr. Jane Doe" not in text  # the raw name never survives to embedding
    assert token in text
    assert mapping == {token: "Dr. Jane Doe"}


def test_pseudonymize_stable_across_occurrences() -> None:
    pol = GdprPolicy(
        pseudonymize_patterns=(re.compile(r"Dr\. [A-Z][a-z]+ [A-Z][a-z]+"),)
    )
    text, mapping = pseudonymize("Dr. Jane Doe met Dr. Jane Doe.", pol)
    token = token_for("Dr. Jane Doe")
    assert text.count(token) == 2  # same value -> same token, retrieval-coherent
    assert mapping == {token: "Dr. Jane Doe"}


def test_pseudonymize_is_noop_without_patterns() -> None:
    text, mapping = pseudonymize("Dr. Jane Doe", DEFAULT_POLICY)
    assert text == "Dr. Jane Doe"
    assert mapping == {}


def test_allowed_classifications_role_ladder() -> None:
    assert DEFAULT_POLICY.allowed_classifications(PUBLIC) == (PUBLIC,)
    assert DEFAULT_POLICY.allowed_classifications(INTERNAL) == (PUBLIC, INTERNAL)
    assert DEFAULT_POLICY.allowed_classifications(ADMIN) == (
        PUBLIC,
        INTERNAL,
        RESTRICTED,
    )


def test_allowed_classifications_unknown_role_falls_back_to_default_never_more() -> None:
    assert DEFAULT_POLICY.allowed_classifications("ghost") == (PUBLIC,)


def test_load_policy_none_or_empty_is_default() -> None:
    assert load_policy(None) is DEFAULT_POLICY
    assert load_policy("") is DEFAULT_POLICY


def _write_policy(tmp_path: Path, data: dict[str, object]) -> str:
    path = tmp_path / "policy.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


def test_load_policy_valid(tmp_path: Path) -> None:
    path = _write_policy(
        tmp_path,
        {
            "classification_rules": [
                {"source_prefix": "restricted/", "classification": "restricted"},
                {"content_pattern": r"\bSSN\b", "classification": "pii"},
            ],
            "role_policy": {"public": ["public"], "admin": ["public", "restricted"]},
            "pseudonymize_patterns": [r"Dr\. \w+ \w+"],
            "default_role": "public",
        },
    )
    pol = load_policy(path)
    assert classify("restricted/x.md", "", pol) == RESTRICTED
    assert classify("a.md", "an SSN", pol) == PII
    assert pol.allowed_classifications("admin") == (PUBLIC, RESTRICTED)
    assert len(pol.pseudonymize_patterns) == 1


def test_load_policy_rejects_bad_classification(tmp_path: Path) -> None:
    path = _write_policy(
        tmp_path,
        {"classification_rules": [{"source_prefix": "x/", "classification": "nope"}]},
    )
    with pytest.raises(ValueError, match="classification"):
        load_policy(path)


def test_load_policy_rejects_rule_with_no_matcher(tmp_path: Path) -> None:
    path = _write_policy(
        tmp_path, {"classification_rules": [{"classification": "restricted"}]}
    )
    with pytest.raises(ValueError, match="source_prefix"):
        load_policy(path)


def test_load_policy_rejects_bad_regex(tmp_path: Path) -> None:
    path = _write_policy(tmp_path, {"pseudonymize_patterns": ["("]})
    with pytest.raises(ValueError, match="pseudonymize_pattern"):
        load_policy(path)


def test_load_policy_rejects_pii_in_a_role(tmp_path: Path) -> None:
    # pii is never stored, so no role may list it.
    path = _write_policy(tmp_path, {"role_policy": {"x": ["pii"]}, "default_role": "x"})
    with pytest.raises(ValueError, match="pii"):
        load_policy(path)


def test_load_policy_rejects_unknown_default_role(tmp_path: Path) -> None:
    path = _write_policy(
        tmp_path, {"role_policy": {"public": ["public"]}, "default_role": "ghost"}
    )
    with pytest.raises(ValueError, match="default_role"):
        load_policy(path)


def test_load_policy_rejects_non_local_data_residency(tmp_path: Path) -> None:
    path = _write_policy(tmp_path, {"data_residency_local": False})
    with pytest.raises(ValueError, match="data_residency_local"):
        load_policy(path)


def test_validate_policy_rejects_non_local_residency_directly() -> None:
    with pytest.raises(ValueError, match="data_residency_local"):
        validate_policy(GdprPolicy(data_residency_local=False))
