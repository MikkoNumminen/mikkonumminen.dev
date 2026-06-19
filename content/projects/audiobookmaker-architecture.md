---
title: AudiobookMaker — architecture & design
project: audiobookmaker
---

# AudiobookMaker — Architecture & Design

AudiobookMaker converts PDFs, EPUBs, and scanned books into MP3 audiobooks. It targets Finnish and English, ships as a Windows installer for end users, and exposes the same synthesis pipeline through a built-in CLI for batch and headless use.

## Overview & High-Level Architecture

The system is a single Python application (`pyproject.toml` declares `requires-python = ">=3.11"`) with two entry surfaces — a CustomTkinter GUI (`src/gui_unified.py`) and a CLI (`src/cli/`) — that share the same backend modules.

```
User input (PDF / EPUB / TXT)
  → Text extraction layer  (pdf_parser, epub_parser, OCR fallback)
  → Text normalization     (16-pass Finnish or multi-pass English)
  → Chunking               (sentence-aware splits)
  → TTS engine registry    (Edge-TTS / Piper / Chatterbox / VoxCPM2 / Qwen VoiceDesign POC)
  → ffmpeg audio assembly  (pydub + bundled ffmpeg)
  → MP3 output
```

The GUI is `UnifiedApp`, which inherits from two mixins (`SynthMixin` for synthesis orchestration, `UpdateMixin` for auto-update banner) plus `customtkinter.CTk`. Widget composition is split into per-section builder modules under `src/gui_builders/` (header bar, engine bar, settings frame, action row) — each builder contains only layout, no business logic.

The CLI (`src/cli/`) is a thin presentation layer over the same backend modules the GUI uses. There is no CLI-only synthesis logic: bug fixes in the backend propagate to both surfaces automatically.

Chatterbox is the one engine that cannot run in-process. Its PyTorch + CUDA dependencies (~15 GB of model weights) are kept in an isolated Python 3.11 venv. The bridge class `tts_chatterbox_bridge.py` sets a `uses_subprocess = True` flag; the dispatcher routes synthesis through `ChatterboxRunner` (`src/launcher_bridge.py`), which manages a `subprocess.Popen` and pumps stdout lines through a `queue.Queue` into the GUI's Tk `after()` timer.

## Tech Stack and Key Choices

| Component | Library | Reason |
|---|---|---|
| PDF extraction | PyMuPDF | Reliable selectable-text extraction with chapter heuristics |
| EPUB extraction | ebooklib + BeautifulSoup | Standard EPUB spine traversal |
| OCR fallback | ocrmypdf + Tesseract | Handles image-only pages; `skip_text=True` preserves existing layers in mixed PDFs |
| Online TTS | edge-tts | Microsoft's neural TTS; Finnish voices Noora and Harri are described as best-in-class; no model downloads required |
| Offline CPU TTS | piper-tts (ONNX Runtime) | ~60 MB per voice; runs fully offline on CPU; privacy-sensitive use cases |
| GPU TTS | Chatterbox (PyTorch + CUDA) | Supports reference-clip voice imitation at synthesis time; Finnish-NLP/Chatterbox-Finnish finetune for highest Finnish quality |
| GPU TTS (dev) | VoxCPM2 | Zero-shot voice imitation; not in the end-user installer |
| GPU TTS (dev POC) | Qwen3-TTS VoiceDesign | Natural-language voice description; developer-only, not in the end-user installer |
| Audio assembly | pydub + ffmpeg | Chunk concatenation and silence trimming |
| GUI | CustomTkinter | Modern Tk theme (Cold Forge design tokens in `src/gui_style.py`, loaded from `assets/themes/cold_forge.json`) |
| Finnish normalization | num2words + custom 16-pass pipeline | num2words alone cannot handle Finnish grammatical case, abbreviations, or loanwords reliably |
| Packaging | PyInstaller + Inno Setup | Self-contained Windows installer; ffmpeg and Tesseract bundled; no Python required on end-user machine |

Edge-TTS is the default. Piper is the offline fallback. Chatterbox's ML dependencies are kept out of the main bundle to hold the installer below ~200 MB; the Chatterbox venv installs on demand via the in-app **Install engines…** modal.

VoxCPM2 and the Qwen VoiceDesign POC are both guarded in `engine_registry.py` behind `if not getattr(sys, "frozen", False)` so they are excluded from the frozen build.

## Data Model and Persistence

AudiobookMaker has no database. All persistence is flat files:

- `~/.audiobookmaker/config.json` — session preferences (last-used engine, voice, language, speed, reference audio, voice description). The CLI and GUI share this file. Config precedence: CLI flag > `AUDIOBOOKMAKER_*` environment variable > `config.json` > built-in default.
- `~/.audiobookmaker/piper_voices/` — downloaded Piper ONNX model files (~60 MB per voice).
- `~/.audiobookmaker/voice_packs/` — imported voice pack folders (`meta.yaml`, `reference.wav`, optionally `adapter.pt` LoRA weights).
- OCR cache: OCR'd PDFs are cached keyed by source-file SHA-256, so a second run over the same scanned PDF skips Tesseract.
- Chunk cache: synthesized audio chunks are persisted in a `.chunks/` directory beside the output file, keyed by chunk content. An interrupted conversion can be resumed from the last successful chunk on the next run. The CLI `--overwrite` flag controls this cache: `replace` (default) reuses cached chunks and overwrites the final MP3; `skip` exits immediately if the output already exists; `fresh` deletes the `.chunks/` directory before starting so synthesis begins from scratch.
- `data/*.yaml` — text-normalizer lexicons bundled in the PyInstaller `datas=` block.

Voice pack format: a directory containing `meta.yaml` (name, language, tier), `sample.wav`, and either `reference.wav` (few-shot tier) or `adapter.pt` (LoRA tier). Packs appear in the Voice dropdown only when the active engine is Chatterbox.

## Security Posture

A dedicated credential-and-identity audit (2026-05-10) verified the following design properties:

- `HF_TOKEN` is read only from a gitignored `.env` file, only in modules unreachable from the frozen build's entry graph (`voice_pack/diarize.py`, `scripts/voice_pack_analyze.py`). The shipped `.exe` cannot exfiltrate it.
- `python-dotenv` is not included in `hiddenimports` and is not imported by any module in the frozen entry-point closure. PyInstaller therefore never bundles it.
- The bundled `scripts/generate_chatterbox_audiobook.py` sets `HF_HUB_DISABLE_IMPLICIT_TOKEN=1` at module top, actively preventing implicit Hugging Face token use.
- No `shell=True` subprocess calls exist in the codebase.
- No `eval`, `exec`, or `pickle.loads` on untrusted data.
- PowerShell and batch script interpolation is guarded with character-validation helpers (`_assert_ps_safe_path`, `_assert_bat_safe_path`).
- Venv paths are canonicalized with `Path.resolve()` plus root validation, guarding against path-traversal in engine installation.
- All HTTP requests (urllib, edge-tts, HuggingFace downloads) include explicit timeouts (10–60 seconds).
- The auto-updater verifies a SHA-256 hash before executing a downloaded installer; if the hash is missing from both the release notes and the `.exe.sha256` sidecar asset, the silent install is blocked and the user is offered a manual browser download.
- The Windows installer uses `PrivilegesRequired=lowest` (installs to `%LOCALAPPDATA%\Programs\AudiobookMaker`), requiring no elevation.
- The only personal identity string in the frozen binary is the GitHub repo URL (`MikkoNumminen/AudiobookMaker`) baked into the auto-updater's polling endpoint — this is structurally necessary and documented in the audit.
- CI uses only the ephemeral `secrets.GITHUB_TOKEN` (repo-scoped, auto-issued). No PATs, signing keys, or third-party tokens in workflows.
- The voice-cloning pipeline (which requires a HF token) is kept out of the end-user installer by design. The GUI can consume voice packs but cannot produce them; production is gated behind Python, CUDA, and a developer setup.

## Key Design Decisions and Trade-offs

**TTS engine registry pattern.** All five engines implement the same four-method contract (`check_status`, `list_voices`, `default_voice`, `synthesize`). Engines advertise `uses_subprocess` and `supports_per_chapter` class flags; the dispatcher branches on those flags rather than on engine identity. This lets the GUI and CLI remain engine-agnostic and lets new engines plug in without touching dispatch logic.

**Chatterbox venv isolation.** Keeping Chatterbox's PyTorch and CUDA dependencies in a separate venv prevents them from inflating the main bundle and from interfering with the main app's dependency set. The isolation also enabled the venv-integrity hardening (see Engineering Challenges below): the subprocess boundary makes provenance and environment state observable.

**Finnish text normalizer as a first-class module.** Finnish TTS pronunciation degrades in predictable ways (abbreviations, grammatical case on number words, loanwords, compound-word seam splitting). The 16-pass normalizer (`tts_normalizer_fi.py`) runs before chunking so the chunker splits on fully expanded sentences. The English normalizer runs a comparable multi-pass pipeline covering Roman numerals, abbreviations, dates, currency, units, time, telephone numbers, URLs, and acronyms; heavy passes live in standalone `src/_en_pass_*.py` modules for isolated unit testing.

**Generated CLI documentation.** `docs/CLI.md` is produced by `scripts/render_cli_help.py` from the argparse definitions in `src/cli/`. A pre-commit hook checks it is in sync. This prevents the reference from drifting from the actual flags.

**Voice-cloning friction by design.** The voice cloning pipeline (analyze → export → train → package) is intentionally excluded from the installer. Per the README: "the people most likely to do real harm are those who download a one-click installer and click around; the people most likely to do useful work are those willing to set up Python, install CUDA, read a README." The GUI imports but does not produce voice packs.

**Auto-update as P0.** The conventions file designates auto-update integrity as P0. Every release CI job builds the installer, computes a SHA-256, injects it into the release notes, and post-verifies that the hash is recoverable. The updater blocks silent install if no hash is present.

## Testing Strategy

The test suite has 3000+ tests in flat `tests/test_*.py` files mirroring the `src/` module names. Configuration in `pytest.ini`:

- Per-test timeout: 60 seconds (`timeout_method = thread`, chosen because `signal.alarm` is POSIX-only and Windows requires the thread method).
- `tests/conftest.py` blocks outbound network connections by default; tests that need network access must declare the `network` marker explicitly.
- `slow` marker covers tests that run a real TTS engine end-to-end. The pre-commit hook skips them (`-m "not slow"`); `pytest tests/` without filtering runs everything.
- GUI tests skip on headless CI runners (module-level `tkinter` imports initialize the Tcl notifier thread, which cannot be torn down cleanly on headless Windows; re-enabling these is noted as a future task).
- `gpu` marker is reserved for future Chatterbox/VoxCPM2 CUDA-path coverage.
- The Finnish normalizer alone is covered by a large suite of unit tests (~300). Audio-export tests skip automatically when `ffmpeg` is not on PATH.
- A `test_project_git_hooks_are_active` test fails locally if `scripts/install-hooks.sh` was never run, pointing developers back to the setup step.

CI runs tests on Windows (build-release workflow) and macOS (tests-macos workflow). The macOS leg was added after a path-root bug (`TMPDIR` vs `TEMP`/`TMP`) was caught only locally.

## Infrastructure, Deployment, and CI/CD

GitHub Actions workflows:

- `build-release.yml` — triggered on `v*` tag push; builds the PyInstaller bundle on `windows-2022`, wraps it in Inno Setup, uploads the installer and a `.exe.sha256` sidecar, injects the SHA-256 into release notes, and post-verifies hash recoverability. Also runs the test suite on PRs against master.
- `test-master.yml` — runs on every direct push to master (closing the gap where release bumps and hotfixes bypassed CI); includes a commit-message scan for vendor-branding tokens.
- `tests-macos.yml` — macOS test leg.
- `gui-tests.yml` / `gui-tests-windows.yml` — GUI test variants.
- `codegen-smell-audit.yml` — 4 grep-based checks (2 gating, 2 warn-only) for AI-codegen patterns.
- `monitor-ci.yml` — auto-opens a GitHub issue when master goes red.
- `build-launcher.yml` — builds the legacy minimal launcher binary.

Version numbering: `APP_VERSION` in `src/auto_updater.py` is the source of truth. CI rewrites it from the git tag at build time. The `release-cut` skill encodes the release checklist (20 releases in 90 days documented in the skill catalog).

The Windows installer uses `PrivilegesRequired=lowest` (per-user install to `%LOCALAPPDATA%`) and writes a registry uninstall key so a prior version is removed before the new one installs. `src/cleanup.py` runs silently on startup to rescue user MP3s from legacy install paths before removing them.

## Notable Engineering Challenges

**Chatterbox engine venv integrity.** A series of field failures produced a pattern where install/repair reported success while Convert kept failing. The fix established four invariants now enforced by tests: (1) the installer's post-install smoke test runs the same runner script and environment as a real synthesis; (2) the subprocess spawn uses `launcher_bridge.isolated_python_env()`, which strips `PYTHONPATH`/`PYTHONHOME`/`PYTHONSTARTUP` and sets `PYTHONNOUSERSITE` to prevent the venv interpreter from being redirected to the app's bundled packages; (3) every run prints a build stamp so a stale script is visible in any user log; (4) the venv carries an `.install-incomplete` marker from creation until smoke passes, preventing Convert from running against a half-built venv. Repair distinguishes corruption-shaped failures (triggering clean rebuild) from environmental ones such as a missing NVIDIA driver (which escalate differently). The diagnostic runbook is encoded in the `engine-venv-triage` skill.

**English Grandmom prosody quirks.** Grandmom is the default voice of the Finnish-NLP Chatterbox-Finnish finetune — nobody recorded her. The English path cannot use the Finnish-only model; instead it feeds the multilingual Chatterbox base model a synthesized Grandmom reference clip to copy her timbre. Because the reference is Finnish speech, Finnish rhythm leaks into English output at sentence boundaries and around certain terminal words. The documented workarounds are: raise `--chunk-chars` to avoid chunk-boundary glitches, or reword to avoid trigger words. This is documented in `docs/english_grandmom.md`.

**Documentation and catalog drift.** Three separate incidents of drift between two places that nothing compared mechanically led to the same class of fix each time: a check script that fails when the two disagree. Examples: `scripts/check_skill_catalog.py` verifies both directions of the skill directory vs README count; `scripts/render_cli_help.py` generates `docs/CLI.md` from argparse definitions; `test_fi_v7_params.py` locks a production temperature constant to the doc's claimed value.

**macOS path-root bug.** `engine_installer._allowed_venv_roots()` whitelisted `TEMP`/`TMP` (Windows names) but not `TMPDIR` (macOS/Linux). The revision-pin tests rejected `tmp_path` on the Mac dev box while CI (Windows only) was green. Fixed by adding `TMPDIR` and adding a macOS CI leg.

## Single-Instance and Process-Lock Subsystem

Two complementary modules prevent resource conflicts at different scopes:

**`src/single_instance.py` — one GUI window per machine.** Called from `main.py` before the GUI is created. On Windows it acquires a named mutex (`AudiobookMaker_SingleInstance`); on other platforms it uses an atomic exclusive-create lock file under the temp directory (PID written at `O_CREAT|O_EXCL` to avoid a race between two racing instances). If another instance is already running, a dialog asks the user whether to open a second window anyway — the dialog text explicitly warns that GPU engines may conflict. If the user declines, `main.py` exits cleanly; an `atexit` handler calls `release()` to drop the lock on normal exit.

**`src/process_lock.py` — one heavy ML subprocess per machine.** A separate OS-level advisory lock (`fcntl.flock` on POSIX, `msvcrt.locking` on Windows) held for the lifetime of any voice-pack analyze, synthesize, clone, or train subprocess. The kernel drops the lock automatically if the holder crashes, so a dead run can never wedge subsequent runs. The motivation (documented in the module's docstring) is a field observation from 2026-05-10: two concurrent Chatterbox/faster-whisper/pyannote subprocesses (~6 GB VRAM + ~2 GB RAM each) swap-thrashed the GPU allocator into system RAM and froze the OS. Using the kernel lock rather than a hand-rolled PID file buys atomic mutual exclusion and automatic crash-release without PID liveness probing. Callers use it as a context manager (`with single_ml_subprocess_lock(): ...`); `LockHeld` is raised if another process is already running.

## Upstream Contribution: Chatterbox Hook-Leak Fix

`docs/upstream/chatterbox/` contains a prepared contribution to the `resemble-ai/chatterbox` upstream repository:

- **`BUG_REPORT.md`** — a detailed bug report for `AlignmentStreamAnalyzer` in the multilingual Chatterbox engine. Each call to `ChatterboxMultilingualTTS.generate()` constructs a new `AlignmentStreamAnalyzer` and passes its `RemovableHandle` to `register_forward_hook` without storing it, so the hook is never removed. After N calls the stale hooks corrupt the alignment matrix, causing calls 2+ to return ~0.4 s of garbage instead of the expected 15–30 s. The report includes a minimal reproducer and a root-cause analysis tracing the leak through `alignment_stream_analyzer.py` and `t3.py`.
- **`repro_hook_leak.py`** — standalone reproducer that quantifies hook accumulation and output duration degradation across five successive `generate()` calls.
- **`hook_leak_fix.patch`** — a patch against `alignment_stream_analyzer.py` and `t3.py` that stores every `RemovableHandle` on `self._hook_handles`, saves `tfmr.config` mutation state exactly once, and adds `AlignmentStreamAnalyzer.close()` (with `__enter__`/`__exit__`) called in a `try/finally` block inside `T3.inference()`.

This work was motivated by AudiobookMaker's multi-chunk synthesis loop: the upstream bug makes the multilingual engine unusable for any workflow that reuses a loaded model across requests.

## Scale and Performance Considerations

AudiobookMaker is a single-user desktop application. Performance considerations documented in the repo:

- Edge-TTS requires no model download and is fast; it is the default for most users.
- Piper runs on CPU with ~60 MB models; suitable for older machines and offline use.
- Chatterbox and VoxCPM2 require an NVIDIA GPU with ~8 GB VRAM and CUDA 12+. On machines without a compatible GPU the engines show as unavailable in the dropdown; Edge-TTS and Piper continue working.
- The audio preflight for voice recording validates SNR (≥ 15 dB), duration (5–30 s), loudness (roughly −35 to −10 dBFS), and clipping (< 0.05 %). The README notes that skipping the preflight produces worse voice cloning.
- The `Make sample` feature synthesizes only the first ~30 seconds (~500 chars) so users can A/B engines before committing to a full multi-hour conversion.
- CLI synthesis commands accept `--json` and emit NDJSON (one event per line) for integration with external tooling and progress monitoring.
- `duration_estimate.py` provides a pre-synthesis ETA.
