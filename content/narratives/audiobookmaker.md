---
title: How AudiobookMaker was built · development narrative
project: audiobookmaker
kind: project
type: narrative
date: 2026-06-28
---

## Origin

AudiobookMaker is a Windows desktop app that turns PDF, EPUB, Word/DOCX, or plain-text files into MP3 audiobooks; scanned PDFs are run through Tesseract OCR first so even image-only documents work. The first commit, "initialize project structure and dependencies," landed 2026-03-25, and the README states the motive plainly: a 400-page PDF takes hours to read, but the same hours spent listening leave hands and eyes free, and commercial audiobook services don't carry the specific Finnish legal texts, niche academic papers, or that PDF a colleague sent last week. It is Finnish-first with English supported, and ships as a per-user Windows installer (unsigned: SmartScreen warns) with auto-update via GitHub Releases. The same Chatterbox engine also voices Spacepotatis's in-game narration.

## Key technical choices and the why

The core abstraction is a TTS engine registry: five engines (Edge-TTS, Piper, Chatterbox, VoxCPM2, Qwen VoiceDesign) implement one four-method contract and advertise `uses_subprocess` / `supports_per_chapter` flags, so the GUI and CLI dispatch on capability rather than engine identity. Edge-TTS is the default (cloud, no model download); Piper is the offline CPU fallback; Chatterbox (GPU, ~15 GB of weights, best Finnish via the Finnish-NLP finetune) is isolated in its own Python 3.11 venv and launched as a subprocess to keep the installer under ~200 MB; VoxCPM2 and the Qwen POC are guarded behind a `not sys.frozen` check so they never ship. Finnish gets a first-class multi-pass normalizer with governor-word case inflection because num2words alone cannot choose the right Finnish grammatical case. Packaging is PyInstaller plus Inno Setup, with ffmpeg and Tesseract bundled.

## Dead ends and how they resolved

The history is mostly hardening. Before v3.7 English books were routed through the Finnish normalizer, so Roman numerals came out as Finnish ordinals; the fix added a per-language dispatcher that stops Finnish rules on English runs. The Chatterbox venv leaked isolation in roughly five acts: an inherited PYTHONPATH made the venv prefer the app's bundled packages (fixed by stripping PYTHONPATH/HOME/STARTUP in an isolated env), a half-built venv could be used mid-install (fixed with an `.install-incomplete` sentinel), Repair's force-reinstall pulled the CPU-only torch wheel (fixed by pinning the cu124 URL), and a smoke test that imported modules but never ran synthesis passed while real Convert crashed (fixed by running a selftest through the production runner). A waiter thread's unconditional 60-second wait killed any book longer than a minute and aborted final MP3 assembly; the fix split the cancel path from normal completion. Tiny 7–15-character chunks made Chatterbox ramble 10+ seconds of garbage, fixed by folding short chunks into the preceding one. The OCR path completed then crashed parsing empty hOCR when tessdata/configs was missing from the bundle. And the multi-chunk loop exposed two upstream Chatterbox bugs (a forward-hook leak that made calls 2+ return ~0.4 s of garbage, and an unclamped out-of-range flow token that tripped a CUDA device-side assert mid-book) both written up with reproducers and sent upstream (PRs #505, #510). Documentation drift recurred enough to become its own bug class, each instance fixed with a check script; the Finnish pass count itself drifted, with a commit correcting it from 19 to 16.

## Notable implementation details

Persistence is flat files, no database: a `config.json` with precedence CLI flag > env var > file > default, a SHA-256-keyed OCR cache, and a resumable chunk cache (`--overwrite` replace/skip/fresh). A kernel advisory lock (`process_lock.py`, fcntl/msvcrt) stops two GPU subprocesses from thrashing the allocator into system RAM and freezing the OS: a real field observation. Audio assembly was rewritten to stream chunks through ffmpeg's concat demuxer instead of holding a whole ~2.5 GB book in pydub memory, and now raises on format mismatch instead of silently resampling. Supply-chain fetches were pinned by hash, tag, and version.

## Outcome

By 2026-06-24 the project sat at v3.22.0 across ~1,260 commits and over 150 merged pull requests, with 3000+ tests (outbound network blocked by default, ~300 for the Finnish normalizer alone) running on Windows and macOS CI legs, plus a codegen-smell audit and a monitor that auto-files an issue when master goes red. Releases ship as a per-user installer with SHA-256-verified auto-update.
