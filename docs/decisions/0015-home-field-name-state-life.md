# ADR 0015 — Life in the home field's name state: micro-life, a click impulse, and an idle choreography

**Status:** accepted
**Date:** 2026-07-25
**Decided by:** repo owner

## Context

ADR 0014 replaced the home hero's stack of independent visual systems with one
uniform-driven particle field (`src/lib/three/field/buildParticleField.ts`,
orchestrated by `src/lib/three/homeScene.ts`). It shipped the states it set out
to ship — galaxy on load, the name formed _from_ particles, a persistent
starfield behind every section — and cured the measured 306 ms first-scroll
block. It left one weakness, which only became visible once the thing existed:

- **The formation animation was better than what it landed on.** Residual drift
  in the name state was `mix(1.0, 0.04, form) * uDriftAmp` — 0.016 world units,
  about **0.7 px** at 1080p — and the twinkle amplitude was cut to 0.08 for
  legibility. Both choices were right in isolation and wrong together: the field
  arrived at MIKKO NUMMINEN and then read as a finished PNG. A visitor watching
  the letters assemble saw the best moment of the page and then watched it stop.
- **Interactivity was state-blind.** Cursor avoidance and a four-slot ripple pool
  applied identically in every state, so clicking the letterforms did the same
  thing as clicking the page behind them. The name — the one object on the page
  a visitor is actually looking at — had no response of its own.
- **Nothing happened if the visitor stopped.** The field's entire vocabulary was
  driven by load-in time and scroll position. A visitor who simply sat still,
  which is what people do while reading a lander, saw a still image.

Constraints inherited from 0014 and unchanged here: no CPU per-particle work and
no per-frame allocation (the invariant that keeps scroll off the critical path),
static output (ADR 0002), the ≤640 px / reduced-motion paths never construct the
scene at all, and the composer's bloom threshold of 0.32 is close enough to the
formed name's luminance that brightness changes have to be sized against it.

## Decision

Extend the existing state machine — no redesign, no new draw call, no new
material. Three additions, in priority order, each independently releasable.

### Micro-life in the name state (shader-side, zero new attributes or uniforms)

Masked to glyph particles via `form * (1 - dissolve) * (1 - aNameDim) * (1 - idleMix)`,
so it belongs to the name and fades out with it:

- A higher-frequency jitter on top of the existing slow sway. Amplitude alone
  only makes the name lean; frequency is what reads as shimmer. Peak combined
  motion is ~0.065 world (~3 px) against a ~0.43 world (~19 px) glyph stem —
  roughly a 6× legibility margin, and the ratio holds as the block scales.
  Verified visually at a 730 px-wide viewport, where the resize fit has already
  taken `uNameScale` to ~0.89 — inside the band where the name shrinks, though
  not at its floor: the narrowest viewport that still builds the scene is
  641 px, one above the ≤640 px cutoff where the WebGL path is never
  constructed at all.
- A brightness highlight travelling letter to letter on an 8 s period, phased
  from **name-space x** (`aNamePos.x`) rather than live position, so the crest
  tracks the letterforms instead of being dragged around by shimmer, cursor push
  and ripples.
- Strays: a hashed ~1% of glyph particles wander ~0.25 world off the letterform
  and ease back on their own phase (`sin²`, zero slope at both ends), about 47
  of 24 k displaced at any instant.

### A click impulse on the name, on its own uniform

A **dedicated two-slot `uImpulses` uniform**, not an extension of the ripple
pool. Hit-tested against a bounding box measured from the sampled glyph ink in
`distributeNameTargets`, gated on a formed name at the top of the page, and
suppressing the commit-message popup — the scatter is the feedback, and a mono
label rising through the letterforms fights the legibility the name state exists
to protect. Background clicks keep the popup easter egg exactly as ADR 0014 left
it.

### An idle choreography

After 12 s of continuous stillness the field cycles through the galaxy turned
face-on and centred, the wordmark `mikkonumminen.dev`, and a calm sparse cloud,
then returns to the name; 20–30 s per formation, randomised, 3 s transitions
paced to the load-in formation rather than to UI-crossfade speed.

- **Three weighted targets** (`uIdle` + `uIdleWeights`) rather than a swappable
  buffer, so any formation can cross-fade to any other.
- **Only the wordmark costs memory.** The galaxy variant re-reads the existing
  local-disk `position` attribute through its own anchor/tilt/spin uniforms, and
  the sparse cloud is derived from hashed seeds in the shader. Geometry grows
  56 → 72 bytes per particle, **+384 KB at 24 k**.
- **Scroll wins by construction**: the idle blend is applied _before_ the
  dissolve mix, so at `uDissolve` 1 the starfield is the answer whatever idle is
  doing. On top of that it only arms on a fully formed name at the top, and a
  scrub collapses it at 4× — the same catch-up `FORM_CATCHUP` already uses when
  scroll takes the morph over mid-flight.
- **The clock is a pure delta-driven reducer** (`field/idleChoreography.ts`).
  That is what makes it pause with the rAF loop when the tab hides — no
  transitions run off-screen — and it makes the schedule unit-testable rather
  than something inferred by watching the page.
- Any pointer move, click, wheel, key or scroll returns to the name in ~0.9 s and
  restarts the clock. A tab regaining focus does the same, rather than resuming
  a transition the visitor never saw begin.

### Supporting decisions

- **One tuning block.** Every number lives in `src/lib/three/field/tuning.ts`;
  shader-side values are interpolated into the GLSL as compile-time constants,
  so the choreography is re-tunable without reading shader logic and none of it
  costs a uniform read. Safety bounds deliberately stay _out_ of that block — an
  entry on a knob panel that does nothing when turned is worse than no entry.
- **The frame delta is bounded once, where it is computed.** Not every long gap
  between frames announces itself: a suspended machine resumes without a
  `visibilitychange`, and a page opened in a background tab reaches its first
  real frame with the whole background stretch behind it. The perf overlay is
  deliberately fed the **raw** delta — it exists to report frame times honestly,
  and clamping the number the instrument reads would hide exactly the hitches it
  is mounted to catch.
- **All three run on the low tier.** The cost is vertex ALU on 8 k particles;
  the lite path's constraint is pixel/post work, which is why bloom is off there.

Shipped as PR #416 (squash `3c52966`).

## Considered alternatives

- **Encode the impulse as a mode flag in the existing ripple `vec4`.** Rejected:
  a ripple is an expanding gaussian ring that sweeps _past_ a particle; an
  impulse is an immediate radial kick with a per-particle staggered return.
  Different physical shapes. Fitting both into one slot means stealing a
  component's meaning (the sign of `w`) and paying a per-mode branch inside a
  four-iteration loop on every vertex, every frame — taxing the common path to
  avoid one uniform.
- **A single swappable target buffer for the idle formations, rewritten on the
  CPU per transition.** Rejected: the cycle contains consecutive alternatives
  (wordmark → sparse), which one buffer structurally cannot cross-fade, and it
  reintroduces CPU work at the exact moment a transition begins.
- **Route every idle transition back through the name.** Rejected: it would let
  a single buffer work, but the name would flash between every pair of
  formations — undercutting the choreography and cheapening the one state the
  whole page is built around.
- **A fourth position attribute for the sparse cloud.** Rejected: three hashes
  of the existing seed give it for free. Hashing rather than reading seed
  components raw is load-bearing — `aSeed.z` is the density rank, and using it
  as a coordinate would make the density drop that formation applies carve a
  spatially coherent slab out of the cloud instead of thinning it.
- **Wall-clock timers for the idle clock.** Rejected: they do not pause with a
  hidden tab, so transitions would run off-screen and a returning visitor would
  land mid-morph. The delta-driven reducer gets that for free.
- **Skip the idle choreography on the low tier.** Rejected: the added cost there
  is vertex ALU on a third of the particle count plus 128 KB of attributes, and
  the lite path is mostly the 4 K-monitor case — a large, high-resolution
  display is precisely where a static lander is most conspicuous. Skipping it
  would pay a real design cost for an imaginary performance saving.
- **Snap to the nearest stable state when a tab regains focus.** Considered and
  rejected in favour of easing to the name: focus arriving is attention
  arriving, and the name is what that attention should meet. It also reuses the
  interrupt path that already exists rather than adding a second one.
- **A blob fallback for the wordmark, mirroring the name's rasteriser.**
  Rejected: a soft ellipsoid is a reasonable stand-in for a name that must
  appear, and nothing at all as a stand-in for a mark. The formation is skipped
  instead.

## Consequences

- **Measured** (production build, 1600×1000, full tier, same `?debug=perf` +
  Long Animation Frames protocol as ADR 0014): 62 s parked on the formed name
  across two idle transitions ran **16.67 ms mean / 16.80 ms worst, 3661 frames,
  zero over 20 ms, zero LoAF entries**. Click-mash (24 impulses) and the full
  hero dissolve-and-reverse held the same; three consecutive 20 s idle windows
  after the review fixes gave worst 18.4 ms, zero over 20 ms. Master measured
  identically on the same probe, so the delta sits below the vsync-locked
  measurement floor — this establishes no dropped frames, not a zero GPU cost.
  Verified at a locked 60 fps on `?perf=low` (8 k, no bloom).
- Geometry per particle grows 56 → 72 bytes (+384 KB at 24 k, +128 KB at 8 k);
  vertex attributes go 5 → 7 against a WebGL2 floor of 16.
- A second glyph rasterisation runs during scene construction, behind the same
  gate. Its failure is a new, benign failure mode: the wordmark formation is
  skipped, and the cycle runs galaxy → sparse.
- **The state masks are now load-bearing.** Three independent sources of motion
  (micro-life, impulse, idle) write to the same position, each gated by some
  product of `form`, `dissolve`, `aNameDim` and `idleMix`. A mask that is
  slightly too permissive does not fail loudly — it leaks one behaviour into a
  state where it merely looks wrong. Two of the three review findings on #416
  were exactly that.
- The frame delta is bounded at source, which also removes a pre-existing hazard
  from the intro: a page loaded in a background tab used to snap the name into
  existence instead of forming it. `elapsed` deliberately stays wall-clock — it
  feeds `uTime` and the load-in `uGalaxySpin`, both continuous functions of
  absolute time with no accumulator to jump.
- ADR 0014's description of field interactivity (cursor avoidance plus four
  ripples) is extended rather than replaced: those still apply in every state,
  and the name state gains a fourth response on top.
