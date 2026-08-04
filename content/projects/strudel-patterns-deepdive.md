---
title: strudel-patterns · engineering deep-dive
project: strudel-patterns
---

# strudel-patterns: Engineering Deep-Dive

This document covers the hard engineering problems in StrudelForge and how they were actually solved. It assumes familiarity with what the project is and its stack. Those are covered in the companion architecture doc.

## The cpm vs BPM Confusion: The First Systemic Bug

The most consequential bug surfaced on the second day of production. The first version of `jaakko-kulta-future-bass.js` was generated with `.cpm(132)` intending 132 BPM. The session log records what happened: "Earlier pattern played at ~528 BPM-equivalent because I treated cpm as BPM."

The root cause is that Strudel's `.cpm()` (cycles per minute) operates on cycles, not beats. A single cycle in the default 4/4 convention equals one bar of four beats. So `.cpm(132)` fires 132 full bars per minute, which at four kicks per bar gives 528 kicks per minute: gabber, not trance.

The fix was `.cpm(33)` for a 132 BPM feel: 33 cycles per minute × 4 beats per cycle. The conversion is `BPM / 4 = cpm` for standard 4/4 patterns where the kick runs at `bd*4`. This formula is now embedded in `CLAUDE.md` and every track file documents it inline. The session log notes "saved as feedback memory so future patterns don't repeat the mistake" and flags that the component library's starter tracks likely share the same bug: an audit was pending.

This bug category is subtle because the Strudel REPL does not error. The pattern runs, it just runs at the wrong speed. Without that specific domain knowledge of what `.cpm()` counts, no amount of code inspection reveals it.

## Masking as Arrangement: One Pattern for the Whole Song

Strudel's `.mask()` function gates a pattern to cycles where the mask value is truthy. StrudelForge discovered that by writing long binary strings (one digit per bar) all sections of a song can live in a single `stack()` expression without needing `cat()` to sequence them.

The `spacepotatis-mission2.js` file demonstrates the technique at its most complete. The track has four sections of eight bars (INTRO, MAIN A, BREAK, MAIN B) encoded as a 32-element mask per layer:

```
.mask("<0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1>")  // drums
.mask("<0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1>")  // hats (continue through break)
```

Every layer has its own mask string. Drums drop out in the break but hats stay on: that's a different mask for the same section, expressed as different binary digits. The intro lead plays only bars 1–8, the harmony enters at bar 9, the 5th-up power climax only in bars 25–32.

The alternative (using `cat()` to concatenate sections) forces the pattern to be expressed procedurally: introduce section, then main, then break, then main-B. Mask-based arrangement keeps every musical voice visible simultaneously in a flat layout, which means the agent can read and modify any layer without mentally simulating the section sequencing. The tradeoff is that mask strings are opaque: a 32-digit binary string requires counting positions to audit.

The technique is also used in the lander track for structural entry events at specific bars (warm pad enters at bar 3, far motif at bar 5, both exit before bar 15 for a clean loop reset), and in `jaakko-kulta-future-bass.js` for the buildup (snare roll at bars 9–11, kick masked off, drop re-entry at bar 13).

## The Ear-Pain Band Problem and the Frequency Discipline Policy

Three separate tracks ran into the same failure: high-frequency content in the 2–6 kHz range caused listener discomfort. The session log records each instance with a diagnosis.

Galaxy overworld 2 (v1) placed sonar pings at e7/f#7/g7/a6 (1760–3136 Hz) with near-instant 0.005 s attacks: piercing transients directly in the ear's most sensitive region. The shop track (v2) had a sine theremin in the 2–6 kHz band. The landing page (v1) had high shimmer in the same zone.

Each instance is documented with the diagnosis before the fix, not after. The shop diagnosis: "Pad LPF 1500–2800 Hz + theremin LPF 8000 Hz + sine shimmer at oct 5–7 stacked all the energy in the 2–6 kHz range = ear pain band."

The fix that emerged and was codified across the repo:

- All pad layers hard-capped under roughly 2.5 kHz via `.lpf()` or `.bpf()`
- All shimmer and high-register sine layers bandpassed (not just low-passed) to avoid upper-harmonic buildup: `bpf(perlin.range(800, 2000))` rather than an uncapped sine
- All transients on non-drum layers softened with attack times of 0.4 s or more (`attack(0.6)` for the lander's distant stars layer)
- High-register "sonar" content moved down two octaves (e7 → e5) and given a soft attack so it pulses in rather than beeps

This discipline is not enforced by tooling. It is enforced by the design rule documented in every track's header comment block and in `CLAUDE.md`. The comment in `mikkonumminen-dev-lander.js` captures the policy precisely: "Bandpass 800–2000 Hz keeps them muffled-warm, not glassy."

The spectral wash layer in the lander illustrates the pattern in practice: `s("white").bpf(perlin.range(600, 1800))`, white noise bandpassed to the warmest part of the midrange. The 600 Hz floor prevents muddiness; the 1800 Hz ceiling keeps it out of the pain band. The perlin modulation means the center frequency drifts slowly, preventing the static nasal quality of a fixed bandpass.

## Mode Substitution as the Primary Mood Control

The repo contains several tracks that were structurally good but tonally wrong on first delivery. The session log captures each case with a formal diagnosis, then shows the targeted intervention.

The portfolio lander (v1) used D Aeolian. Mikko's feedback was "a bit more positive but still abstract." The diagnosis in the log: "No amount of mix tweaking would make a Dm9 → B♭maj9 → A7sus loop read as 'positive' because the home chord is minor and the cadence chord is unresolved-tense. The 'positive' lever in modal ambient is the mode itself."

The fix pivoted from D Aeolian to F lydian without touching any other layer. Lydian's raised 4th (B natural over F, the #11) is the single interval most associated with positive sci-fi wonder: the log cites Mass Effect Suite, Stellaris, Star Trek TNG. The specific choice of F lydian over alternatives (C lydian = too clinical; D lydian = too bright/shrill; F major = risks "lastenlaulu" diatonic sweetness) is fully reasoned in the session entry.

The portfolio projects page went through the same pivot in reverse. Version 1 used A phrygian based on the X-COM reference. Mikko's feedback: "needs to be more pleasant and major-key-leaning; this view should evoke wonderful feelings about a beautiful galaxy." Diagnosis: the X-COM reference was taken for mood rather than structure. The phrygian mode was correct for alien-invasion dread (Broomhall/McCann scored UFO:EU that way deliberately) but wrong for a serene portfolio view. The rhythmic template (slow tempo, repeating bass arp, sparse-to-full mid-loop entry) was kept unchanged. Only the mode moved: A phrygian to B♭ lydian. The session log notes the specific rejection of F lydian (already used on the lander) to keep the two pages tonally distinct.

Mission 2 went through the same surgery in the opposite direction. After a first-approved major-key version was later described as "a bit too much unicorns with rainbows," the key center moved from E major (I-vi-IV-V) to E minor Phrygian (i-bII-bVI-bVII) while the 32-bar section structure, mask architecture, and Tyrian bassline idiom were preserved. The bII chord (F over E) is the half-step interval above the tonic that is the canonical "90s space-combat dread" harmonic device: the log identifies its appearance in Tyrian's darker tracks, Doom E1M1, and Wipeout XL.

## The Mission 2 Design Dead Ends: Documented Failure Archaeology

Mission 2 is the track with the longest recorded failure history. Three complete iterations were rejected before the approved version; all three are documented in the session log with diagnosis, not just outcomes.

Version 1 (mellow ballad, 88 BPM, D major) was rejected because "mission 2 is a fast phase." The brief had been misread: "mellow" in context meant "lighter than combat but still fast," not a ballad.

Version 2 (chiptune rebuild, 144 BPM) was rejected as "rhythm nonexistent." Post-mortem: over-processed kick with `crush(8).coarse(2)` destroyed punch; 16th hat plus offbeat open hat plus square arp washed out the kick/snare pulse; lead melody had syncopated `~` rests that broke rhythmic flow.

Version 3 (Pokemon-style, 152 BPM) also failed. Diagnosis from the log: "Key insight that flipped the design: in Pokemon-style chip music the BASS drives the rhythm, not the drums. The Game Boy only had one noise channel for percussion: drums are minimal punctuation. The pulse channel bass running constant 8ths is what makes the listener feel the pulse. v2 had a great triangle bass but it was buried under arp + extra hats + heavy kick processing." Despite this insight, version 3 was rejected entirely: "trash this. Lets start clear" followed by a `/clear`. All three versions were never committed.

The approved mission 2 that shipped was designed from a multi-paragraph brief Mikko wrote himself, describing the Tyrian/Alexander Brandon compositional DNA in detail. The session log connects this directly: "The detailed brief style + plan-then-write flow nailed it where three previous mission2 iterations failed. The brief itself was what was missing before."

## The cpm Tempo Selection for VO Underscore

Voice-over underscore tracks face a specific constraint: length must be exact. `spacepotatis-storymusic1.js` targets a 30-second narration. The session log's design rationale: "8 bars = 32 seconds (30s narration + 2s tail to resolve)." At `.cpm(15)`, one bar is 4 seconds (60 BPM feel). 8 bars × 4 seconds = 32 seconds.

The VO mixing philosophy is encoded as inline comments in the file itself, which is unusual, most tracks document their musical logic but not mixing engineering:

- Sub-bass at octave 1 and shimmer at octave 6+ are the prominent layers, sitting below and above the vocal range, leaving the 200–3000 Hz midrange clear
- Pad gain is explicitly capped at 0.32 and described as "behind the voice"
- The motif plays only 4 notes in 32 seconds (one every 8 seconds) "sparse on purpose so the listener's ear stays on the voice, not the music"
- No drums, explicitly: "any rhythmic pulse pulls the listener's ear off the storyteller"

`spacepotatis-storymusic2.js` extends this to 80 seconds for a longer narration ending with "Three... two... one... Punch it." The warp-countdown payoff is handled by masking a sustained C major swell (the "engines warming up" musical metaphor) to bars 17–20, with a one-bar stinger on bar 20 only.

## The export.js Metadata Stripping Problem

Pattern files carry structured metadata in comment headers that serves as the library's search index. But the Strudel REPL auto-runs whatever is pasted: comments are fine, but the inline `//`-comment headers must not accidentally parse as JavaScript or conflict with the expression structure.

The stripping logic in `scripts/export.js` handles two header formats: consecutive `//` lines at file top matching a recognized key (`Genre`, `Tempo`, `Key`, `Role`, `Notes`, `BPM`, `Description`) and `/* */` block comments whose entire body consists of those same keys.

The edge cases the code explicitly handles:

- Interleaved blank lines within a `//` header (allowed while inside the header; a non-matching `//` line stops stripping rather than continuing)
- Block comments with leading stars per-line (`* Genre: techno`): the body parser strips leading `*?` before checking keys
- A leading shebang line (skip and continue)
- Trailing blank lines after stripping (trimmed)

The firm constraint was zero npm dependencies: the script uses only `fs`, `path`, and `child_process` from Node's stdlib. The clipboard path uses platform detection (`clip.exe` on Windows, `pbcopy` on macOS, `xclip` on Linux) with graceful degradation: failure to copy to clipboard silently falls back to stdout-only output rather than erroring.

Preservation of non-metadata inline comments was an explicit design requirement: musical intent comments (`// driving kick`, `// Phrygian ascent`) are the layer documentation and must survive export intact.

## Fake Sidechain via Gain LFO

Hardware sidechaining (ducking a pad or bass in response to a kick trigger) is not available in Strudel's browser audio model. The technique used throughout the repo is a sine LFO on gain cycling at 4× per bar:

```js
.gain(sine.range(0.18, 0.42).fast(4))
```

At `.cpm(33)` (132 BPM), one bar is one cycle. `.fast(4)` runs the sine LFO four times per cycle, so it dips four times per bar, once per kick hit. The gain range `0.18` to `0.42` gives about a 7 dB duck, which is audible without being cartoonish.

This appears in `jaakko-kulta-future-bass.js` (supersaw chord pad), `spacepotatis-mission2.js` (dark pad), and `spacepotatis-mission1.js`. The session log notes it explicitly when introducing it for the mission 1 track as "fake-sidechain `gain(sine.range(0.2,0.45).fast(4))` (4 ducks per cycle)." The technique is not synchronized to the actual kick trigger (it is a free-running LFO at the same rate), which means it gradually drifts out of phase. At `.fast(4)` the drift is slow enough to be inaudible within a 30-second loop pass.

## Signal-Based Filter Modulation: Perlin vs Sine vs Saw

Three different signal sources appear on `.lpf()` across the tracks, each chosen for a specific reason:

- `perlin.range(x, y).slow(N)`: smooth random noise. Used on long pads where the cutoff should drift organically without any repeating LFO shape. Galaxy overworld's chord pad uses `perlin.range(700, 2400).slow(24)`. The 24-bar period means the filter shape never obviously repeats within the 16-bar loop.
- `sine.range(x, y).slow(N)`: regular oscillation. Used on bass filters where a rhythmic sweep is wanted. Mission 2's bass uses `sine.range(700, 2800).slow(8)` for an 8-bar sweep cycle.
- `saw.range(x, y).slow(N)`: unidirectional ramp. Used for buildup effects where the filter should open continuously without swinging back. The `jaakko-kulta-future-bass.js` buildup uses `saw.range(600, 9000).slow(4)` so the filter opens fully over the 4-bar buildup window and does not close partway through.

The stellar wind layer in galaxy overworld uses `lpf(saw.range(300, 2500).slow(8))` for the same reason: the filter opens across the 8-bar swell period, which matches the `s("hh ~ ~ ~ ~ ~ ~ ~").slow(8)` gate on the same layer. The filter and the rhythm are phase-locked by using the same `.slow(8)` on both.

## The 7-Second Rule as a Structural Constraint

A constraint stated by Mikko during the lander iteration ("7 s is the maximum length of a part") propagated into a reusable design pattern. The problem it solved: a 48-second ambient loop with only 3 chords had 16 seconds per chord. A visitor who arrived after the first chord would wait up to 32 seconds to hear any harmonic movement.

The engineering response was to increase `.cpm()` from 10 to 20 (doubling tempo, halving bar duration to 3 seconds), expand the chord progression from 3 chords to 8 chords (each 2 bars = 6 seconds), and add two in-loop structural entry events (warm pad enters at t=6 s, motif at t=12 s). The result: no musical element stays unchanged for more than 7 seconds, even if the chord change is a chord the listener has already heard.

The lander track's header comment block documents the audible-event budget explicitly: a timeline listing every event from t=0 to t=48. This is engineering documentation for a real-time playback constraint, embedded in the music file itself.

## API Uncertainty and the Conservative Reference Strategy

`docs/STRUDEL_REFERENCE.md` opens with an explicit caveat: "This reference was written without live verification against https://strudel.cc on 2026-04-21." It flags specific functions as needing confirmation, `.bank()` drum-machine names, filter envelope aliases (`.lpenv`, `.lpattack`), the `.distort` vs `.shape` distinction, chord shortcut syntax.

The policy in `CLAUDE.md` is absolute: if a function is not in the reference, treat it as unverified and leave it out rather than guessing. The reference explicitly excludes functions it is uncertain about, even documenting what it chose to exclude and why (chord shortcuts: "currently excluded"). This means generated code systematically undershoots the full Strudel API surface. It avoids `.bank()` drum kit selectors because the exact kit name strings are unconfirmed, using raw sample names instead.

The white noise layer (`s("white")`) appears in the shop v3 and lander tracks, while galaxy overworld 1 notes in its session entry: "No noise oscillator (`s("white")` not in STRUDEL_REFERENCE.md), so substituted a heavily LPF'd hat sample for the wind." The reference was updated between sessions, an example of the library expanding as functions were confirmed in practice.

The reference also includes a re-verification checklist (section 23) naming 14 specific Strudel documentation URLs to re-fetch when WebFetch access becomes available. This is forward-looking tooling maintenance: the checklist records what is uncertain so the verification pass has an explicit scope.

## The Component Library as a Design Constraint

The 18 components in `patterns/components/` were seeded from the three starter tracks that were later deleted from the repo. The components were kept; the starter tracks that produced them were not. This created a situation where the component library's origin tracks no longer exist, but the components themselves are valid because they were auditioned independently before extraction.

The `trance-intro-buildup-drop.js` structure component uses `silence` as the placeholder for every layer slot except the kick, which gets a real `s("bd*4")` so the skeleton runs in the REPL without error. This is the minimum-viable-runnable-placeholder pattern: the structure can be auditioned as a timing skeleton before any real musical content is inserted.

Component metadata headers serve double duty. They are human-readable searchable documentation and the stripping target for `export.js`. A component that omits the header would not be stripped and would paste its comment block into the REPL, where it is harmless (comments do not affect execution) but clutters the paste. The consistent header format means `export.js` can strip component files for REPL use just as it strips track files.

## Gap Summary

The following areas have no implementation detail visible in the repo:

- No test suite; quality assurance is entirely manual and by ear
- Strudel MCP integration (described as a planned next step, not implemented)
- Git history before 2026-04-21 (project started that date; no prior iteration record)
- The Strudel REPL's internal behavior (Web Audio API scheduling, clock jitter handling) is the runtime environment but is entirely outside this repo's scope
- No CI, no linting, no format checking: the export script is the only automated tooling
