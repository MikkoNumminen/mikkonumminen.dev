"""GDPR-aware context control — ingest-time classification, pseudonymisation, and
role-based retrieval gating.

This is a configurable, demonstrable reference implementation of how a RAG system
handles sensitive data. The corpus itself is public portfolio content; the policy
ships benign (everything `public`, one `public` role, pseudonymisation off) so the
default behaviour is unchanged, and the capability is exercised by a policy file
(`GDPR_POLICY_FILE`) and the tests.

Core principle: **isolate at ingest, do not filter in front of the model.**

  * `pii`        — never embedded, never in the vector store (one bug in a
                   post-retrieval filter would leak it, so it never gets stored).
  * `restricted` — embedded but gated at retrieval BY ROLE (the legitimate
                   post-retrieval gate, for "show to the right role" data).
  * `internal`   — retrievable by internal/admin roles, not the public one.
  * `public`     — retrievable by everyone.

Pseudonymisation replaces person references with STABLE tokens BEFORE embedding,
so the model only ever sees tokens; the reverse map lives in a separate,
access-controlled store (`pseudonym_map`) resolved out-of-band, never via the
model. This module is pure and stdlib-only, so the policy and transforms are
unit-tested without a database or model.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

# Classifications, ordered MOST-CLOSED first — when several rules match a doc the
# most-closed class wins, so a misconfiguration fails safe (toward not exposing).
PII = "pii"
RESTRICTED = "restricted"
INTERNAL = "internal"
PUBLIC = "public"
CLASSIFICATIONS: tuple[str, ...] = (PII, RESTRICTED, INTERNAL, PUBLIC)

# Built-in role name for the shipped role ladder (roles are otherwise free-form in
# the policy). PUBLIC doubles as the default, least-privilege role.
ADMIN = "admin"


@dataclass(frozen=True)
class ClassificationRule:
    """Map a doc to a classification by source-path prefix and/or content regex.

    A rule with both a prefix and a pattern matches only when BOTH hold. At least
    one matcher must be set (an all-matching rule would silently reclassify the
    whole corpus). The compiled `content_pattern` is held alongside its source so
    the policy can be serialised back if needed.
    """

    classification: str
    source_prefix: str | None = None
    content_pattern: re.Pattern[str] | None = None
    pattern_source: str | None = None

    def matches(self, source: str, content: str) -> bool:
        if self.source_prefix is None and self.content_pattern is None:
            return False
        if self.source_prefix is not None and not source.startswith(self.source_prefix):
            return False
        if self.content_pattern is not None and not self.content_pattern.search(content):
            return False
        return True


@dataclass(frozen=True)
class GdprPolicy:
    """The full, validated GDPR policy — the single config surface."""

    classification_rules: tuple[ClassificationRule, ...] = ()
    # role -> the classifications that role may retrieve. `pii` is never listed:
    # it is not in the store at all, so no role can reach it.
    role_policy: Mapping[str, tuple[str, ...]] = field(
        default_factory=lambda: {
            PUBLIC: (PUBLIC,),
            INTERNAL: (PUBLIC, INTERNAL),
            ADMIN: (PUBLIC, INTERNAL, RESTRICTED),
        }
    )
    pseudonymize_patterns: tuple[re.Pattern[str], ...] = ()
    default_classification: str = PUBLIC
    default_role: str = PUBLIC
    # The local Ollama model means sensitive classes never leave the
    # infrastructure: there is no third-party LLM call path. Explicit + asserted
    # at startup so the data-residency guarantee is a checked invariant, not a
    # comment.
    data_residency_local: bool = True

    def allowed_classifications(self, role: str) -> tuple[str, ...]:
        """Classifications a role may retrieve; an unknown role gets the default
        role's permissions, falling back to public-only — never more."""
        if role in self.role_policy:
            return self.role_policy[role]
        if self.default_role in self.role_policy:
            return self.role_policy[self.default_role]
        return (PUBLIC,)


# Shipped benign: no reclassification rules, the standard role ladder, no
# pseudonymisation. Override via GDPR_POLICY_FILE for a real deployment / the demo.
DEFAULT_POLICY = GdprPolicy()


def classify(source: str, content: str, policy: GdprPolicy) -> str:
    """Classify a doc. The MOST-CLOSED matching rule wins (fail safe); the policy
    default applies when nothing matches."""
    matched = {
        r.classification
        for r in policy.classification_rules
        if r.matches(source, content)
    }
    if not matched:
        return policy.default_classification
    for c in CLASSIFICATIONS:  # most-closed first
        if c in matched:
            return c
    return policy.default_classification


def is_embeddable(classification: str) -> bool:
    """False for `pii`: it is never embedded and never reaches the vector store —
    isolation at ingest, the one class a retrieval-time filter must never be
    trusted to catch."""
    return classification != PII


def token_for(value: str) -> str:
    """A stable, deterministic pseudonym token for a value: the same name maps to
    the same token across every doc, so retrieval stays coherent while the raw
    value never gets embedded. Not reversible from the token alone — the reverse
    map is the only way back, and it lives in the access-controlled store."""
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:10]
    return f"[PERSON-{digest}]"


def pseudonymize(text: str, policy: GdprPolicy) -> tuple[str, dict[str, str]]:
    """Replace every match of the policy's patterns with a stable token, BEFORE
    embedding. Returns the pseudonymised text and a `{token: original}` map for
    the separate reverse store. A no-op (text unchanged, empty map) when no
    patterns are configured."""
    mapping: dict[str, str] = {}

    def repl(match: re.Match[str]) -> str:
        value = match.group(0)
        token = token_for(value)
        mapping[token] = value
        return token

    for pattern in policy.pseudonymize_patterns:
        text = pattern.sub(repl, text)
    return text, mapping


def _load_rules(raw: object) -> tuple[ClassificationRule, ...]:
    if not isinstance(raw, list):
        raise ValueError("classification_rules must be a list")
    rules: list[ClassificationRule] = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError("each classification rule must be an object")
        classification = entry.get("classification")
        if classification not in CLASSIFICATIONS:
            raise ValueError(
                f"rule classification must be one of {CLASSIFICATIONS}, got "
                f"{classification!r}"
            )
        prefix = entry.get("source_prefix")
        pattern_src = entry.get("content_pattern")
        if prefix is None and pattern_src is None:
            raise ValueError("a rule needs a source_prefix and/or a content_pattern")
        pattern = None
        if pattern_src is not None:
            try:
                pattern = re.compile(str(pattern_src))
            except re.error as exc:
                raise ValueError(f"bad content_pattern {pattern_src!r}: {exc}") from exc
        rules.append(
            ClassificationRule(
                classification=str(classification),
                source_prefix=None if prefix is None else str(prefix),
                content_pattern=pattern,
                pattern_source=None if pattern_src is None else str(pattern_src),
            )
        )
    return tuple(rules)


def _load_role_policy(raw: object) -> Mapping[str, tuple[str, ...]]:
    if not isinstance(raw, dict):
        raise ValueError("role_policy must be an object")
    policy: dict[str, tuple[str, ...]] = {}
    for role, classes in raw.items():
        if not isinstance(classes, list):
            raise ValueError(f"role {role!r} must map to a list of classifications")
        for c in classes:
            if c not in CLASSIFICATIONS or c == PII:
                raise ValueError(
                    f"role {role!r} lists {c!r}; allowed: "
                    f"{tuple(x for x in CLASSIFICATIONS if x != PII)} (never pii)"
                )
        policy[str(role)] = tuple(str(c) for c in classes)
    return policy


def load_policy(path: str | None) -> GdprPolicy:
    """Load + validate the GDPR policy from a JSON file, or the benign default
    when no path is set. Raises ValueError on a malformed policy so a bad config
    fails loudly at startup, never silently widens access."""
    if not path:
        return DEFAULT_POLICY
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path}: GDPR policy must be a JSON object")

    rules = _load_rules(data.get("classification_rules", []))
    role_policy = (
        _load_role_policy(data["role_policy"])
        if "role_policy" in data
        else DEFAULT_POLICY.role_policy
    )
    patterns_raw = data.get("pseudonymize_patterns", [])
    if not isinstance(patterns_raw, list):
        raise ValueError("pseudonymize_patterns must be a list")
    try:
        patterns = tuple(re.compile(str(p)) for p in patterns_raw)
    except re.error as exc:
        raise ValueError(f"bad pseudonymize_pattern: {exc}") from exc

    default_classification = str(data.get("default_classification", PUBLIC))
    if default_classification not in CLASSIFICATIONS or default_classification == PII:
        raise ValueError(
            f"default_classification must be one of "
            f"{tuple(c for c in CLASSIFICATIONS if c != PII)}, got "
            f"{default_classification!r}"
        )
    default_role = str(data.get("default_role", PUBLIC))
    data_residency_local = bool(data.get("data_residency_local", True))

    policy = GdprPolicy(
        classification_rules=rules,
        role_policy=role_policy,
        pseudonymize_patterns=patterns,
        default_classification=default_classification,
        default_role=default_role,
        data_residency_local=data_residency_local,
    )
    validate_policy(policy)
    return policy


def validate_policy(policy: GdprPolicy) -> None:
    """Fail fast on a policy that can only misbehave: the default role must be
    known, and (the data-residency invariant) sensitive classes must never have a
    third-party LLM path — here that means the local-only flag must be set, since
    the whole backend has no remote model call to begin with."""
    if policy.default_role not in policy.role_policy:
        raise ValueError(
            f"default_role {policy.default_role!r} is not in role_policy "
            f"{tuple(policy.role_policy)}"
        )
    if not policy.data_residency_local:
        raise ValueError(
            "data_residency_local must be true: the backend has no third-party "
            "LLM path, so sensitive classes never leave the infrastructure — "
            "claiming otherwise would misrepresent the residency guarantee"
        )
