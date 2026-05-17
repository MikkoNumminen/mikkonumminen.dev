# ADR 0004 — Manual dual-deck crossfade for seamless audio looping

**Status:** accepted
**Date:** 2026-05-17
**Decided by:** repo owner

## Context

The site plays a looping music track across all four pages. The track must
loop seamlessly: a perceptible gap or click at the loop join would break
the ambient effect the audio is intended to create.

The obvious implementation is the HTML5 `loop` attribute on an `<audio>`
element. This attribute instructs the browser to restart the track
automatically when it reaches the end. In practice, however, browsers
introduce a silent gap at the loop join — most noticeably in Safari on
iOS and macOS — because the browser must re-buffer the start of the audio
file before resuming playback. The duration of this gap varies by browser
and network conditions but is typically 50–200 ms: audible and jarring
on a continuous music bed.

The component comment in
[`src/components/BackgroundAudio.astro`](../../../src/components/BackgroundAudio.astro)
(lines 20–23) states this explicitly:

> Seamless looping via two `<audio>` "decks" sharing the same source.
> The script crossfades active → standby in the last `CROSSFADE_SEC` of
> the active track. HTML5 `loop` would produce an audible gap at the join
> (especially in Safari) so we manage looping ourselves.

A secondary requirement is cross-page playhead persistence. When the user
navigates from `/` to `/projects` the music should continue from the same
position, not restart from the beginning. A single `<audio loop>` element
could not carry its `currentTime` across a hard navigation; the state
must be saved to `sessionStorage` on `beforeunload` and restored on the
next page's load.

Finally, the crossfade itself must maintain a roughly constant perceived
loudness during the overlap. A naïve linear fade (outgoing × (1 − t),
incoming × t) causes a perceived dip in the middle because loudness
perception is not linear. An equal-power crossfade using complementary
cosine and sine curves keeps the combined power constant throughout the
transition.

## Decision

Implement looping via two `<audio>` elements ("decks") sharing the same
source file. The active deck plays normally. A `timeupdate` listener
watches the active deck's `currentTime`; when `duration − currentTime`
drops below `CROSSFADE_SEC` (1.5 s), a `requestAnimationFrame` loop
begins the crossfade.

The crossfade computes progress `t` in [0, 1] over the `CROSSFADE_SEC`
window and applies equal-power gain curves (lines 413–416 of
`BackgroundAudio.astro`):

```js
const fadeOut = Math.cos((Math.PI / 2) * t);
const fadeIn  = Math.sin((Math.PI / 2) * t);

outgoing.volume = outgoingStartVol * fadeOut;
incoming.volume = incomingTargetVol * fadeIn;
```

At `t = 0` the outgoing deck is at full volume and the incoming deck is
silent. At `t = 1` the outgoing deck is silent and the incoming deck is
at the target volume. Because `cos²θ + sin²θ = 1`, the combined power
is constant throughout the overlap.

When the crossfade completes, the outgoing deck is paused, reset to
`currentTime = 0`, and the decks swap roles. The active key is tracked
in a module-level variable and also written to `sessionStorage` so the
next page knows which element carries the live playhead.

On `beforeunload`, the active deck's `currentTime` and the active deck
key are written to `sessionStorage`. On the next page's load, the script
reads these values, seeks the correct element to the saved position, and
resumes playback — continuing the track across a hard navigation.

An `ended` event listener on both decks acts as a safety net (lines
446–452). If the crossfade fails (standby element refuses to play,
duration is unavailable, or the browser fires `ended` before the rAF
loop catches up), the active deck restarts from `currentTime = 0`. The
worst-case outcome is a sub-frame silent gap rather than silence
indefinitely.

## Considered alternatives

### A. HTML5 `loop` attribute

The simplest path. **Rejected** because it produces an audible gap at the
loop join in Safari (and, to a lesser degree, in Chromium on slower
devices). A personal portfolio is a showcase; an audible glitch every
few minutes in a major browser is unacceptable.

### B. Web Audio API `AudioBufferSourceNode` with sample-accurate scheduling

The Web Audio API allows scheduling playback with sample-accurate
precision. Looping an `AudioBufferSourceNode` using `loop = true` can be
genuinely seamless, and separate source nodes can be scheduled to start
at a precise `AudioContext.currentTime` for a gapless handoff.

**Rejected** for this use case because:

- It requires decoding the entire audio file into memory as a float32
  buffer before playback can begin. For a 3–5 minute music track this
  is a significant memory and startup cost.
- Web Audio API usage significantly complicates the autoplay policy
  story: the `AudioContext` must be resumed from a user gesture, adding
  another state machine layer on top of the existing gesture-unlock
  logic.
- The `<audio>` dual-deck approach already achieves inaudible looping
  at the 1.5 s crossfade length used. The marginal quality gain from
  sample-accurate scheduling does not justify the implementation cost.

### C. Single deck with `currentTime` reset on `ended`

Set no `loop` attribute; listen for the `ended` event; reset
`currentTime = 0` and call `play()` immediately. **Rejected** because
this is identical in effect to the `loop` attribute — the gap between the
`ended` event firing and the new `play()` call completing is the same
re-buffering delay that causes the audible gap in Safari.

### D. Linear crossfade instead of equal-power

Use `outgoing.volume = 1 - t` and `incoming.volume = t`. **Rejected**
because linear crossfades cause a perceived loudness dip at the midpoint
(both decks at 50% volume sounds quieter than one deck at 100%). The
equal-power curve (cos/sin) is the standard solution to this
psychoacoustic artefact and costs no additional complexity.

## Consequences

### Gained

- **Inaudible loop join** on all tested browsers (Safari iOS, Safari
  macOS, Chrome, Firefox). The 1.5 s overlap is long enough that the
  boundary is undetectable in normal listening.
- **Constant perceived loudness** during the crossfade overlap, thanks
  to the equal-power curve.
- **Seamless cross-page playback.** Navigating between pages continues
  the track mid-stream with no restart.
- **Graceful degradation.** The `ended` safety net ensures the music
  restarts even if the crossfade mechanism fails, keeping the worst
  case a brief gap rather than permanent silence.

### Costs

- **Two `<audio>` elements per page.** The standby element idles silently
  most of the time. Its source is prefetched once (via `load()`) at the
  start of the crossfade window so the file is in the browser cache
  before it needs to play.
- **`requestAnimationFrame` loop during crossfade.** Active for 1.5 s
  per loop cycle. The loop terminates immediately on crossfade completion
  and is not running during normal playback.
- **`sessionStorage` dependency.** Playhead persistence fails silently if
  `sessionStorage` is unavailable (private browsing modes with strict
  settings). The audio still plays from the beginning — an acceptable
  degradation.
- **Manual lifecycle management.** The script must track which deck is
  active, abort in-progress crossfades on pause/stop, and reset state
  cleanly. This is approximately 250 lines of vanilla TypeScript in the
  `<script>` block of `BackgroundAudio.astro`.
