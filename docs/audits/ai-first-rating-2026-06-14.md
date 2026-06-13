# AI-First Rating — mikkonumminen.dev

**2026-06-14 · Overall: ~8.5/10 (B+/A−)** — measured by an independent multi-agent panel.

> Re-rate after the "push-to-9" campaign (PRs #231–244), which acted on the gaps
> the [2026-06-13 rating](ai-first-rating-2026-06-13.md) surfaced. The headline:
> the verifiability dimension (the long-standing ceiling) finally moved once the
> WebGL layer became browser-verifiable.

## Measured progression

| Date | Method | Overall |
| --- | --- | --- |
| 2026-06-12 | Independent multi-agent panel | 7.3 (B) |
| 2026-06-13 | Self-assessment (panel stalled) | 8.4 |
| 2026-06-13 | Lean independent panel | 8.4 |
| **2026-06-14** | **Lean independent panel** | **~8.5** |

(The lean panel = one self-verifying assessor per dimension; ±~0.2 single-assessor
variance, no inter-rater averaging.)

## Per-dimension (2026-06-14)

| Dimension | Weight | Score | Movement |
| --- | ---: | ---: | --- |
| Onboarding & navigation | 18% | 8.6 | AGENTS.md/README/CONTRIBUTING + governance; gate docs reconciled |
| Code legibility | 18% | 8.7 | scene-entrypoint docs, both `innerHTML` sinks marked, kernel headers |
| Self-verification gates | 16% | 8.7 | **Playwright scene smoke + coverage gate + CodeQL** — the WebGL layer is now CI-verified to boot |
| Decision & rationale | 12% | 8.3 | ADRs 0006/0007 (and this cycle, 0008); audit index |
| Automation & tooling | 12% | 8.0 | CI hardened, de-Windowsed, Dependabot, registry schema validation |
| Type safety & data | 10% | 8.5 | `no-explicit-any` error, `parseRegistry`, JSON Schema |
| Machine-readable artifacts | 7% | 8.4 | registry canonical + schema-validated |
| Security/ops docs | 7% | **9.0** | CodeQL hard gate, threat model synced, invariant markers |

## What moved the score

The campaign (#231–244) closed nearly every actionable per-dimension gap: ADRs,
`no-explicit-any` as an error, de-Windowsed skill tooling, onboarding + governance
docs (CONTRIBUTING, CODEOWNERS, audit index), security-doc sync + CodeQL,
`built_in_references` typing, scene doc comments, the extracted-and-tested
`planetNoise` kernel, CI hardening, a coverage gate, a registry JSON Schema with
build-time validation, and — the structural unlock — **Playwright scene smoke
tests** that boot all four worlds in headless WebGL.

## The remaining ceiling (why not 9+)

Two structural limits, recorded honestly:

1. **Verifiability is boot-not-correctness.** The product is animated WebGL; the
   Playwright smoke verifies the scenes *boot* (canvas mounts, no errors) but
   asserts no rendered pixel or per-frame state, and per-frame visual-regression
   was deliberately rejected as flaky for animated WebGL (see
   [ADR 0008](../decisions/0008-testing-strategy.md)). Unit coverage of the
   jsdom-testable surface is ~32%, held down by DOM-orchestration code that is
   integration-level rather than unit-tested.
2. **Diminishing, noisy returns.** With every actionable gap closed, the residual
   is dominated by inherent limits and single-assessor variance, so the weighted
   overall hovers in the high-8s rather than cleanly crossing 9.

## Method & caveats

Lean independent multi-agent panel (8 self-verifying assessors, one per
dimension), read-only, point-in-time 2026-06-14, calibrated against the 7.3
baseline. The weighted overall is computed deterministically from the verified
per-dimension scores. Calibrated judgement, not a benchmark.
