# ADR 0008 · Testing & verification strategy

**Status:** accepted
**Date:** 2026-06-14
**Decided by:** repo owner

## Context

The product is a WebGL/GSAP visual site. The core (the Three.js scenes) cannot
run in jsdom (no WebGL or 2d-canvas context), so unit tests can't exercise it
directly. Earlier audits flagged "the visual layer is unverified by the gates" as
the single biggest verification gap. This ADR records how the project verifies
itself, and (deliberately) where it stops.

## Decision

A layered gate stack, all runnable locally and in CI with no human:

1. **Static gates**: `astro check` (strict TS + `noUncheckedIndexedAccess`),
   `eslint` with `@typescript-eslint/no-explicit-any` as an **error** (not warn,
   so a stray `any` fails CI), `prettier --check`, and `astro build`.
2. **Unit tests (vitest + jsdom)** of the *extractable* pure logic. Three's
   geometry/camera/material objects construct fine in jsdom, and scene math is
   extracted into tested helpers (`planetNoise`, `responsiveLayout`,
   `resolvePixelRatio`, `easing`, `entranceFlash`, …). A **coverage ratchet**
   (`test:coverage`, run in CI) fails if the tested surface shrinks; WebGL/canvas
   files that can't run in jsdom are excluded so the threshold is meaningful.
3. **Browser scene smoke (Playwright)**: loads all four worlds in headless
   Chromium (WebGL via SwiftShader) and asserts each **boots**: the page loads,
   the scene canvas mounts with non-zero size, and nothing throws or logs an
   error. This is the verification jsdom structurally can't do.
4. **Data contracts**: a published JSON Schema for the served registry, enforced
   at build time (`prebuild`) and at runtime (`parseRegistry`).
5. **Security**: CodeQL static analysis as a hard CI gate; Dependabot for
   advisories.

## Considered alternatives

- **Full per-frame visual-regression testing** (screenshot snapshots of the
  scenes). **Rejected** for now: the scenes are animated and partly random
  (starfield, meteors, time-based camera), and SwiftShader rendering varies
  across runs/platforms, so pixel snapshots would be flaky and high-maintenance
  for low marginal signal. Boot-smoke catches the high-value failure (a scene
  that throws / fails to initialize) without that cost. The trade-off is explicit:
  **we verify the scenes boot, not that they render correctly frame-by-frame.**
- **A WebGL-mocking unit harness** to "run" scenes in jsdom. Rejected: a faithful
  WebGL mock is more code than the scenes and proves nothing about real rendering.
- **`npm audit` as the hard security gate.** Rejected: the open advisories are an
  unfixable dev-only transitive `esbuild` (see ADR 0007), so an `audit` gate would
  be permanently red. CodeQL analyzes our own code and isn't hostage to that.

## Consequences

- The gates verify static correctness, the pure logic, the data contract, that the
  visual layer **boots** in a real browser, and the security surface: a
  self-sufficient stack an autonomous agent can run end to end.
- The acknowledged ceiling: no test asserts a rendered pixel or per-frame scene
  state, and the closure-trapped per-frame camera math is not yet extracted/tested.
  A scene that mounts but renders wrong would pass. Revisit visual-regression if a
  rendering regression ever ships unnoticed.
- Adds a browser devDep (`@playwright/test`) and a separate E2E CI job (~2 min).
