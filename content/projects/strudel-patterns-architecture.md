---
title: Strudel Patterns — architecture & design
project: strudel-patterns
---

# Strudel Patterns — Architecture & Design

Strudel Patterns (internally called **StrudelForge**) is an AI-first music production environment for authoring algorithmic electronic music. The core loop is: describe a track in natural language → Claude generates Strudel code → paste into the Strudel REPL → listen → iterate. Every artifact produced is a pure JavaScript expression, self-contained, no build step required.

## Overview & High-Level Architecture

StrudelForge is a flat repository, not a monorepo. There are no sub-packages and no runtime server. The "system" is the combination of a curated knowledge base (reference docs, genre profiles, music theory notes), a component library of reusable musical building blocks, and a structured AI context (`CLAUDE.md`) that keeps code generation disciplined across sessions.

Key top-level directories:

- `patterns/tracks/` — complete compositions, one `.js` file each (10 tracks at time of writing, covering genres from ambient space chillout to 132 BPM combat synthwave)
- `patterns/components/` — reusable building blocks categorized by musical role: `drums/`, `bass/`, `synths/`, `fx/`, `structures/`
- `patterns/experiments/` — scratch space with no quality bar; components graduate out of here
- `presets/` — `sounds.js` and `effects.js`, reference snippets to copy into patterns (not modules to import)
- `docs/` — the knowledge base: `STRUDEL_REFERENCE.md`, `GENRE_PROFILES.md`, `MUSIC_THEORY.md`, `ARCHITECTURE.md`
- `sessions/SESSION_LOG.md` — append-only iteration log: goal, prompts, what worked, what didn't, artifacts created
- `scripts/export.js` — Node.js CLI that strips metadata headers from pattern files and optionally copies to the system clipboard

The workflow diagram in `docs/ARCHITECTURE.md` makes the loop explicit: describe → Claude reads repo and writes Strudel → paste into REPL → listen → feedback → iterate → (when a phrase is keeper-tier) extract to `patterns/components/`.

## Tech Stack and Key Choices

| Layer | Choice | Reason |
|---|---|---|
| Pattern engine | [Strudel](https://strudel.cc) | JavaScript port of TidalCycles; functional reactive programming model; runs natively in the browser REPL with no install |
| Audio synthesis | Strudel superdough (Web Audio API) | Built-in; no external audio dependencies |
| AI generation | Claude Code | Structured project context via `CLAUDE.md` enables disciplined, repo-aware generation across sessions |
| Version control | Git | Creative history — every iteration is a commit, making the full evolution of any track traceable |
| Export tooling | Node.js (stdlib only) | `scripts/export.js` has zero npm dependencies; strips metadata headers, prints paste-ready output to stdout, optionally copies to clipboard via platform-native tools (`clip.exe` / `pbcopy` / `xclip`) |

The decision to use no npm dependencies outside Node's stdlib for `export.js` is explicit: the script is a one-file utility that should work without `node_modules`.

**Why Strudel specifically:** Strudel patterns are pure expressions — composable via `stack()`, sequenced via `cat()`/`seq()`, transformed via chainable methods. There is no global state, no side effects, and no build step. A pattern file is simultaneously executable code and a readable score.

## Data Model and Component Lifecycle

There is no database. Persistence is the filesystem and git history.

Every component file carries a structured metadata header in comments:

```js
// Genre: dark techno
// Tempo: 138-142
// Key: A minor
// Role: bassline (rolling, offbeat)
// Notes: works well under a filtered-noise hat loop
```

These headers are what make the component library searchable during generation. `scripts/export.js` strips them before the pattern reaches the REPL — recognizing seven canonical keys (`Genre`, `Tempo`, `Key`, `Role`, `Notes`, `BPM`, `Description`) and handling both `//`-line and block-comment (`/* */`) formats.

Components follow a three-stage lifecycle documented in `docs/ARCHITECTURE.md`:

1. **Born** — written inline in a track or experiment
2. **Tested** — must sound good in context
3. **Extracted** — moved to `patterns/components/<category>/` with a metadata header when recognized as reusable

The 18 components in `patterns/components/` (5 drums, 3 bass, 5 synths, 3 fx, 2 structures) demonstrate the pattern in practice. The two structure files (`trance-intro-buildup-drop.js`, `techno-intro-groove-break-groove.js`) are paste-runnable arrangement skeletons with `silence` placeholders.

## Key Design Decisions and Trade-offs

**Documentation as architecture.** The knowledge base rests on three anchor reference docs, each with a distinct job:

- `docs/STRUDEL_REFERENCE.md` — a filtered API surface (not a full dump) whose stated purpose is to prevent hallucination of non-existent Strudel methods. If a function is not listed here, `CLAUDE.md` instructs the agent to treat it as unverified and work around it. This trades completeness for reliability of generated code.
- `docs/GENRE_PROFILES.md` — 12 genre profiles with canonical BPM ranges, drum palettes, harmonic material, and paste-ready reference sketches. The "what" of each genre.
- `docs/MUSIC_THEORY.md` — condensed theory notes covering pitch notation, intervals, scales (including modes), chord voicings, common progressions, bass/root motion, and rhythmic theory, each section paired with copy-pasteable Strudel snippets. This is the "why it sounds good" layer: it gives the agent enough theory vocabulary to make deliberate harmonic and rhythmic choices rather than pattern-matching genre conventions blindly.

**No declarations, no state, no imports.** `CLAUDE.md` lists hard-forbidden patterns: `.play()`, `setcps()`/`setCps()`, `const`/`let`/`var`, `register()`, `await`. The rationale is REPL compatibility — the Strudel REPL auto-runs the top-level expression; declarations break it. The generated artifact is always a single expression ending in `.cpm(N)`.

**Presets are copy-paste, not modules.** `presets/sounds.js` and `presets/effects.js` deliberately omit `.cpm()` so snippets can be merged into host patterns without tempo conflicts. The files are annotated with the explicit instruction: "These are NOT imports. Don't require this file."

**Separation of tracks, experiments, and components.** The three-tier folder structure encodes a quality contract: `experiments/` has no bar; `tracks/` require "I'd listen to this"; `components/` require "I'd build on this." This prevents premature abstraction and mirrors the Rule of Three pattern.

**AI-first project design.** The entire repo is shaped to give a stateless AI agent enough context to resume any session without human briefing. `CLAUDE.md` encodes communication rules, code rules, musical priorities, genre knowledge, and the iteration protocol. `GENRE_PROFILES.md` encodes 12 genre profiles with canonical BPM ranges, drum palettes, harmonic material, and paste-ready reference sketches. Session logs give the agent a written trail of prior decisions.

**MCP integration as a planned next step.** `docs/ARCHITECTURE.md` explicitly documents a future integration with [strudel-mcp-server](https://github.com/williamzujkowski/strudel-mcp-server) that would give the agent direct control over Strudel playback, eliminating the manual paste step. The repo is described as "intentionally shaped to survive that transition" — components stay modular and paste-ready; the MCP server only removes the last manual step.

## Infrastructure and Deployment

There is no server, no CI pipeline, and no deployment target. The only infrastructure is:

- **Git** — version control on the local filesystem
- **Strudel REPL** at `https://strudel.cc` — the runtime, operated externally via manual paste
- **Claude Code harness** — `.claude/settings.json` allowlists specific Bash commands (`ls`, `cat`, `git status/diff/log/add/commit`, `node scripts/export.js`) and two WebFetch domains (`strudel.cc`, `github.com`)
- **Rendered MP3s** — selected tracks have rendered MP3s committed to `renders/`; WAV sources are git-ignored to keep the repo lean

There are no environment variables, no secrets, and no external service dependencies beyond the Strudel REPL itself.

## Testing Strategy

There is no automated test suite. Quality assurance is by ear: generate, paste into the REPL, listen. The session log captures what passed this audit and what was reverted. The quality gate before outputting a pattern is a manual checklist encoded in `CLAUDE.md`: no forbidden syntax, all functions verified against `STRUDEL_REFERENCE.md`, tempo set via `.cpm()`, layers commented with musical intent, pattern self-contained.

## Scale and Performance Considerations

Strudel patterns run entirely in the browser's Web Audio API. There is no backend load. The main scale consideration is git repository size: WAV render sources are git-ignored; only MP3s are committed. Pattern files are small JavaScript expressions. The 10 tracks in `patterns/tracks/` range from 63 to 174 lines; 7 of 10 exceed 100 lines, and only 3 are under 100 (63, 80, and 97 lines). Components are shorter — each encodes a single musical role and typically fits in under 40 lines.
