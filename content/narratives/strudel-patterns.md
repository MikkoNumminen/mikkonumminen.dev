---
title: How Strudel Patterns was built · development narrative
project: strudel-patterns
kind: project
type: narrative
date: 2026-06-28
---

## Origin

Strudel Patterns: internally named **StrudelForge**, is a collection of live-coded electronic music written in Strudel, the JavaScript pattern engine that ports TidalCycles into the browser. The initial commit (2026-04-22) landed the whole environment at once: a `CLAUDE.md` context file, a `docs/` knowledge base, a component library, an `export.js` helper, a session log, and the first real track, a "Jaakko kulta" trance remix. Every track is a single composable JavaScript expression, stacked synths, basslines, drums, and effect chains layered in code rather than in a DAW. It was started as an **AI-first** production environment: describe a track in natural language, Claude generates Strudel code, paste into the REPL at strudel.cc, listen, iterate, with each decision logged in git and `sessions/SESSION_LOG.md` so the evolution of any track is traceable. Selected tracks score the game Spacepotatis (galaxy overworld, mission themes, story-narration beds) and the mikkonumminen.dev landing page.

## Key technical choices and the why

Strudel was chosen because patterns are pure expressions (composable, no global state, no build step, a file that is simultaneously executable code and a readable score. To stay REPL-compatible, `CLAUDE.md` hard-forbids `const`/`let`/`var`, `.play()`, `setcps()`, `register()`, and `await`; every artifact is one expression ending in `.cpm(N)`. A deliberate **conservative reference strategy** governs generation: `docs/STRUDEL_REFERENCE.md` is a filtered API surface (not a full dump) whose job is to prevent hallucinating non-existent Strudel methods) if a function isn't listed, the agent treats it as unverified and works around it. `export.js` was kept to Node stdlib only (`fs`, `path`, `child_process`), zero npm dependencies, so it runs without `node_modules`. An early commit set an MP3-only repo policy: WAV sources are git-ignored, only 320 kbps renders are committed to keep the repo lean. A three-tier folder contract (`experiments/` no bar, `tracks/` "I'd listen to this", `components/` "I'd build on this") prevents premature abstraction.

## Dead ends and how they resolved

The first systemic bug was **cpm vs BPM confusion**: the first Jaakko kulta version used `.cpm(132)` intending 132 BPM but played at roughly 528 BPM-equivalent, because `.cpm()` counts cycles (bars), not beats. The fix and formula (`BPM / 4 = cpm`, so `.cpm(33)` for 132 BPM) was embedded in `CLAUDE.md` and every track. The REPL never errors on this; the pattern just runs at the wrong speed.

A recurring **ear-pain band** problem hit three tracks where 2–6 kHz content caused listener discomfort. The galaxy-overworld-2 commit records sonar tones being retuned down 1–2 octaves after ear pain was flagged; the shop rewrite commit notes a v2 that "sounded like a children's song" with a high-frequency theremin that hurt eardrums, triggering a full reset. The codified discipline: cap pads under ~2.5 kHz, bandpass shimmer, soften non-drum attacks, leave the 2–6 kHz band empty.

**Mode substitution** became the primary mood lever after mixing alone failed. The lander pivoted D Aeolian → F lydian for a "positive" feel; the projects page went A phrygian → B♭ lydian; mission 2 was repaletted from bright E-major synthpop to E phrygian 90s tracker combat after the major version read as "too much unicorns with rainbows." Mission 2 carries the longest failure history: three uncommitted iterations (mellow ballad 88 BPM, chiptune 144 BPM "rhythm nonexistent", Pokemon-style 152 BPM) were all rejected before a detailed brief produced the keeper. Three scaffolded starter tracks were later deleted; their extracted components were kept.

## Notable implementation details

Arrangement is done by **masking**: per-bar binary strings (`.mask("<0 0 ... 1 1>")`) gate each layer so an entire multi-section song lives in one flat `stack()` rather than being sequenced with `cat()`. **Fake sidechain** ducks pads via a free-running gain LFO (`.gain(sine.range(0.18,0.42).fast(4))`, ~7 dB, four ducks per bar). Filter modulation picks perlin (organic drift), sine (rhythmic sweep), or saw (one-way buildup) per intent. VO underscores are length-math'd: storymusic1 is 8 bars = 32 s at `.cpm(15)` for a 30 s narration. A "7-second rule" (no part unchanged beyond 7 s) drove the lander from `.cpm(10)` to 20 and 3 chords to 8.

## Outcome

Per the architecture doc there are 10 tracks (63–174 lines each) and 18 components. There is no automated test suite, no CI, and no lint: quality is by ear, generate-paste-listen, logged in the session log. The only runtime is the external Strudel REPL; MCP integration to remove the manual paste step is documented as a planned next step, not implemented. Tracks ship as committed MP3 renders and score Spacepotatis and the portfolio landing page. The git history runs 2026-04-22 through 2026-05-13.
