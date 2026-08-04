# ADR 0016 · The home field reshapes continuously; the name is one shape of four

**Status:** accepted
**Date:** 2026-07-25
**Supersedes:** the idle-choreography half of [ADR 0015](0015-home-field-name-state-life.md)

## Context

ADR 0015 gave the formed name three things it had been missing: micro-life so
it never sat perfectly still, a click impulse that struck the letterforms, and
an idle choreography that cycled through alternative formations. The first two
were right. The third was framed wrong, and the framing was the problem rather
than the implementation.

It was **gated on absence**. Twelve seconds of no pointer movement, no click, no
scroll and no key, and only then did the field start moving; any input at all
returned it to the name and reset the clock. That is the shape of a
screensaver: behaviour a page performs when it believes nobody is there.

Two consequences followed from that, both visible once it shipped:

- **Most visitors never saw it.** A reader moving a mouse while reading, which
  is what people do, held the clock at zero indefinitely. The choreography was
  built, tested and documented, and was in practice invisible.
- **It said the wrong thing about the page.** A lander whose field only comes
  alive once you stop interacting is telling you the interesting part happens
  when you leave.

The repo owner's call: reshaping is not something the lander falls back on, it
is what the lander *does*. That reframing, not any defect, is what this record
supersedes ADR 0015's idle sections for.

## Decision

Replace the idle gate with a **continuous four-shape cycle**
(`src/lib/three/field/shapeCycle.ts`, consumed by `homeScene.ts` and
`buildParticleField.ts`).

- **Rotation**: name → galaxy variant → wordmark → sparse cloud → name,
  **5 s held, 3 s morphing**, so a lap is 32 s and each shape holds roughly a
  quarter of the screen time. Nothing gates it: `advance()` reads only
  `{delta, wordReady}`. There is no `armed` input, no `interrupted` input and no
  return-to-name path.
- **The name is one shape in the rotation**, not the resting state everything
  returns to. This is the deliberate cost of the reframing: the page's own
  wordmark is on screen about a quarter of the time. The DOM `<h1>` still
  carries the name for machines and for the fallback paths.
- **The cycle emits `from`, `to` and RAW progress**, not a blended weight
  vector. The per-particle stagger that makes every morph sweep through the
  field rather than move as a rigid unit lives in the vertex shader, and it can
  only be applied to unstaggered progress. This is the single most important
  structural decision in the change; see the rejected alternative below.
- **Clicks strike whatever shape is on screen** and it reassembles into that
  same shape. Hit regions are per-shape and measured on the z=0 plane: the
  space clicks convert into and the space the shader projects particles into
  before applying interaction.
- **Micro-life applies in every shape, scaled per shape.** The amplitudes in
  ADR 0015 were sized against the name's ~0.43 world stroke. The wordmark is
  set at 96 px / weight 600 against the name's 190 px / weight 800, so its
  stroke is roughly 0.4 of the name's, which is exactly the scale factor the
  wordmark carries, and unscaled shimmer visibly wobbles the mark.
- **The sparse cloud drifts like the scroll transition.** It had inherited the
  name's tight 0.11 sway and read as a still image; it now uses the same 0.55
  the dissolve already uses.
- **`uShape` is derived unconditionally from `form`**, never hooked to the
  formation-complete branch: `snapFormed()` sets `form = 1` directly on a
  back/forward restore and never enters it.

Shipped as PR #418 (squash `8f014e1`).

## Considered alternatives

- **Keep the idle gate, shorten the delay.** Rejected: it treats the symptom.
  Any delay still makes the field's behaviour conditional on the visitor's
  absence, and any input still cancels it: a reader who moves the mouse every
  few seconds sees nothing at 3 s that they saw nothing of at 12 s.
- **Blend the weight vector on the CPU and hand the shader one vec4.** Rejected,
  and it is the trap worth recording: it looks like a simplification and it
  silently deletes the per-particle stagger from every morph the page shows.
  The field would still change shape, on schedule, with correct endpoints, and
  would move as a rigid unit. Emitting `from`/`to`/progress costs one extra
  uniform and keeps the stagger where it can be applied.
- **Collapse the load-in blend scalar everywhere.** Rejected on the presentation
  side. Inside the shader the two mix operands provably coincide at the handoff,
  so collapsing is safe. For brightness and bloom, `form` is the scalar's *only*
  route in: collapsing squares `form` into the curve, leaving both endpoints
  correct and the middle of the formation up to 28% wrong. Endpoint-correct,
  middle-wrong curves are invisible to unit tests and to screenshots of settled
  states; this one was caught by an adversarial review, not by the gate.
- **Route every transition back through the name.** Rejected: it would let a
  single swappable target buffer work, at the cost of flashing the name between
  every pair of shapes.
- **Three-wide per-shape presentation tables** (as ADR 0015 had, indexed
  galaxy/word/sparse). Rejected once the name joined the rotation: with no
  `name` row every table sums to zero for the name's hold: brightness 0,
  density 0, bloom 0, a black hero for 5 s of every 32, and **no typecheck
  error**. A test now asserts every table's length.
- **Treat the whole sparse cloud as one hit region.** Rejected: the cloud covers
  ~55% of the frame, so every click during that shape would be a strike and the
  commit-popup easter egg would vanish for a quarter of every cycle. Only the
  two typographic shapes suppress the popup, which is what ADR 0015's stated
  rationale actually said: a label through letterforms fights legibility, and
  the galaxy and cloud have none to protect.
- **Hook the shape handoff to the formation-complete branch.** Rejected:
  `snapFormed()` never enters it, so the cycle would be dead after every
  back/forward restore while the reducer kept advancing underneath it, and the
  click hit-test would have been testing against an invisible shape.

## Consequences

- **Measured** (production build, tab visibility asserted throughout, same
  `?debug=perf` + Long Animation Frames protocol as ADR 0014): 40 s across five
  morphs held **16.67 ms mean / 16.90 ms worst, 2341 frames, zero over 20 ms,
  zero LoAF**: identical to the same-day master baseline of 16.67 / 16.80.
  Verified at a locked 60 fps on `?perf=low`. The schedule was verified by
  sampling the cycle on rAF so sampler and scene share one clock: 5.0 s holds,
  3.0 s morphs, correct wrap.
- **ADR 0015's idle sections no longer describe shipped code.** Its micro-life
  and click-impulse decisions stand and are extended here; its "An idle
  choreography" decision, its 12 s / 20-30 s timings, its `uIdle` /
  `uIdleWeights` uniforms and `field/idleChoreography.ts` are all gone.
- **The state masks are load-bearing, and more so than before.** Three
  independent sources of motion write to the same position, each gated by some
  product of `form`, `dissolve`, `shapeDust` and the weight vector. A mask that
  is slightly too permissive does not fail loudly. It leaks one behaviour into
  a state where it merely looks wrong. Two of the three findings on #418 were
  exactly that, and one of them (the brightness wave losing its dust mask) had
  been introduced while generalising a different mask correctly two lines above.
- **A measurement lesson worth keeping.** Several observations during this work
  were corrupted by a backgrounded tab throttling rAF while wall-clock time ran
  on, including one that looked exactly like a stuck scheduler. Frame-timing
  and schedule measurements on this scene now assert tab visibility, and the
  schedule sampler runs on rAF so it freezes with the scene rather than
  inventing stalls.
- `easeInOutCubic` was removed with `idleChoreography.ts`, its only caller.
- Geometry is unchanged from ADR 0015 at 72 bytes per particle; the fourth
  shape reuses attributes that already existed.
