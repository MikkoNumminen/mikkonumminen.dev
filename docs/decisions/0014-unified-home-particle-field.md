# ADR 0014 — One uniform-driven particle field for the entire home page

**Status:** accepted
**Date:** 2026-07-24
**Decided by:** repo owner

## Context

The home hero was a stack of independent visual systems: an extruded
`TextGeometry` wordmark ("MIKKO NUMMINEN") in chrome `MeshPhysicalMaterial`
under eight lights, a `Points` spiral galaxy, CPU-animated meteor trails with
collision sprites and commit-message popups on a random timer, per-letter zone
decor (mountain/snow/goat on the M, ring on the O), a lens-flare plane, and an
`UnrealBloomPass` chain. The scene lived inside the hero section only; every
section below it sat on flat CSS, with a gradient fade papering over the
hero→About colour seam.

Two forces pushed against that architecture:

- **Measured opening jank.** Profiling (Long Animation Frames, production
  build) attributed the page's start-up stutter to first-frame shader
  compilation: compiling ~10 material programs under 8 lights blocked the main
  thread **306 ms** (warm driver cache — cold visits worse), landing exactly in
  the window where a visitor's first scroll input arrives. Asset loading and
  scene construction measured clean; the compile burst was the dominant cause.
- **A design goal**: one continuous background that lives through the whole
  scroll — galaxy on load, the name formed *from* particles, then a calm
  starfield persisting behind every section — with all interactivity expressed
  through the same field rather than per-element effect systems.

Constraints: the CSP forbids workers (`worker-src 'none'`, so no
OffscreenCanvas), the build must stay fully static (ADR 0002), and the
small-screen / reduced-motion static fallback must not regress.

## Decision

Replace the stack with **one `THREE.Points` draw call** on a **fixed,
full-viewport, opaque canvas** behind the entire page
(`src/lib/three/field/buildParticleField.ts`, orchestrated by
`src/lib/three/homeScene.ts`):

- **Per-state target attributes, uniform-driven morph.** Every particle
  carries a galaxy position, a name position (sampled from "MIKKO NUMMINEN"
  rasterised on a hidden 2D canvas — the particles *are* the name; there is no
  text mesh), and a starfield position. Two uniforms compose the state:
  `uForm` (time-driven load-in) and `uDissolve` (ScrollTrigger-scrubbed), so
  scrolling back to the top re-forms the name for free. Per-section moods
  (hue/density/drift) are three more scrubbed uniforms.
- **Scroll writes numbers only.** GSAP callbacks pass scalars through the
  scene handle; the tick loop copies them into uniforms; the vertex shader does
  everything else. No per-frame allocations, no layout reads, no CPU
  per-particle work.
- **Field-based interactivity.** Cursor avoidance and a fixed pool of four
  click ripples are vertex-shader displacements from pointer/origin uniforms;
  commit-message popups are DOM spans bound to ripples (never a timer), with a
  once-per-session hint after the name forms.
- **A measured-ready loading gate.** A flat-ink overlay holds the page (scroll
  locked, `scrollbar-gutter: stable`) while the chunk loads, glyphs rasterise,
  `compileAsync` runs, and real warm-up frames render; it reveals when two
  consecutive frames complete under 20 ms, hard cap 2 s. Fallback users are
  never gated. This moves the entire compile cost behind an intentional
  overlay instead of under the visitor's first scroll.
- **Bloom via pmndrs `postprocessing`** (the one new runtime dependency),
  intensity state-driven — loudest on the galaxy, calm on the formed name,
  near-off in the starfield. The composer pairs with
  `renderer.outputColorSpace = LinearSRGBColorSpace` (the composer applies the
  single final sRGB encode; leaving the renderer's own conversion on
  double-encodes and lifts every black to gray) and an opaque `alpha: false`
  context cleared in the page ink, which also deletes the hero→About seam by
  construction: one flat background from top to footer.
- **Perf tiers preserved**: full (24 k particles, DPR 1.5, bloom), `?perf=low`
  / auto-4K (8 k, DPR 1, no bloom, interactions kept), and the untouched
  static fallback for ≤640 px / reduced motion.

Shipped as PR #406 (squash `ea93dd3`); the goat easter egg migrated to
`/experience` in #407.

## Considered alternatives

- **Keep the mesh stack, add only the gate.** Rejected: the gate cures the
  compile burst but not the design goal (no continuous field, no name-from-
  particles), and the ~10-program surface keeps cold-visit compile cost high
  behind a correspondingly longer gate.
- **DOM/CSS name over a separate particle background.** Rejected: the name
  can't dissolve into the field it sits on — the transition between "text" and
  "particles" is the centrepiece, and it requires both to be the same system.
- **OffscreenCanvas + worker for warm-up.** Rejected: `worker-src 'none'` in
  the CSP (kept deliberately; see the threat model).
- **Non-blocking reveal (page scrollable immediately, field fades in when
  warm).** Rejected: a scroll during compilation reproduces exactly the
  measured jank; `compileAsync` reduces but does not eliminate main-thread
  link cost. The explicit gate trades ≤2 s of held scroll for a guaranteed
  warm first input.

## Consequences

- **Measured wins**: first-frame main-thread block went from 306 ms to below
  the 50 ms LoAF detection threshold; gate reveals ~300 ms on warm hardware;
  scroll frame timing through full dissolve-and-reverse measured worst 17.4 ms
  with zero frames over 20 ms (60 fps locked).
- Sixteen scene modules deleted (title/galaxy/meteors/decor/flare/interactions
  and the three-examples bloom chain) plus the 60 KB helvetiker typeface;
  `src/lib/three/field/` (pure, unit-tested generators + one shader module)
  replaces them.
- Per-letter click effects and timer-driven meteor popups no longer exist;
  interactivity is field-wide by design.
- **Dependency constraint**: `postprocessing@6.39.x` declares peer
  `three >= 0.168 < 0.186`. Hold three bumps past 0.185 until pmndrs widens
  the range.
- The composer/renderer colour pairing is load-bearing: if the full tier's
  background tone ever diverges from `?perf=low`'s, suspect that pairing
  first.
