---
title: How claude-continue was built — development narrative
project: claude-continue
kind: project
type: narrative
date: 2026-06-28
---

## Origin

claude-continue began on 2026-06-14 as a one-shot shell helper, `claude-continue.sh`: sleep until a given HH:MM, then use AppleScript to type `continue` into matching iTerm2 sessions. The same day it was rewritten as a stdlib-only Python CLI with a stated goal — resume paused Claude Code sessions the instant each 5-hour usage window resets, so quota runs back-to-back instead of idling between windows. The problem it solves is concrete: Claude Code enforces a rolling 5-hour quota and exposes nothing about the active window through its CLI or `~/.claude.json`, so an unattended job that hits the limit sits idle until someone notices. Mikko built it for his own long autonomous runs on a Max plan.

## Key technical choices and the why

The hard rule is zero runtime third-party Python packages — every import is stdlib, so `pip install -e .` has nothing to resolve and the frozen binary has a predictable closure. Config is JSON rather than TOML explicitly because `tomllib` is Python 3.11+ and the target is 3.9. Tkinter is the GUI because it ships with CPython on every platform. PyInstaller is build-time only.

`ccusage` (an external Node tool that reconstructs 5-hour blocks from local transcripts) is the only reset-time source. It is called as `npx ccusage blocks --active --json --offline` — `--offline` is mandatory because a network pricing fetch would stall the watch loop — and any failure surfaces as `CcusageUnavailable` rather than crashing the daemon. The watch loop is written around injectable ports (`clock`, `sleep`, `get_block`, `perform`, `stop`) so the whole suite runs offline.

## Dead ends and how they resolved

The most important pivot was the early-fire bug (v0.5.0). ccusage floors each window's start to the whole hour, so its reset estimate runs early; the watcher fired `continue` before the real reset and the still-limited session ignored it. Worse, the original code treated "no active block" as success and returned, never retrying. The fix redefined correctness: the only proof a resume landed is a NEW window whose reset is later than the one fired for. Retry coverage was widened (interval 300s→120s, cap 6→30) to span roughly an hour. Later the `reset_offset` "Fire at" feature surfaced the correction directly to users.

The single-file Windows exe re-unpacked `python311.dll` into `%TEMP%` on every launch, which IPVanish Threat Protection blocked ("Failed to load Python DLL"). v0.9.0 switched to a one-dir build shipped as a zip, disabled UPX, and embedded version metadata — which forced redesigning self-update to swap whole directories.

The Windows console-injection path (`AttachConsole` + `WriteConsoleInput`) leaked standard handles: a windowed GUI has no parent console to re-attach to, so the restore failed and left stdin/stdout/stderr pointing at the freed Claude console — every later `subprocess.run` died with `[WinError 6]`. The fix snapshots the three handles with `GetStdHandle` and restores them with `SetStdHandle` if re-attach fails.

The Task Scheduler wrapper `.cmd` was first built with `list2cmdline`, which quotes for the exe's argv parser but not cmd.exe's batch layer, so `%` and `&`/`|` could inject. The first patch escaped `"` as `\"`, but cmd counts raw `"` to toggle quote-state, reopening the hole — adversarial review reproduced it on real cmd.exe. The rework caret-escapes every cmd metacharacter including quotes and doubles `%`.

The Windows self-update rename-aside failed silently when the install dir was held open; v0.12.1 added an in-place robocopy overwrite fallback with backup and restore-on-failure.

## Notable implementation details

Sleeping is done in ≤60-second slices because macOS suspends `time.sleep` during system sleep and a single long sleep would overshoot a reset. Busy-session detection differs by path: iTerm2 reads `is processing`; tmux scans `capture-pane` for "esc to interrupt". The Windows native console-injection path has no skip-busy equivalent — a documented platform limitation. A `last_fired_block_id` dedup guard stops the loop re-firing a window it already handled. The launchd plist injects an explicit PATH because nvm's node is not on launchd's default PATH.

## Outcome

A 2026-06-22 robustness audit over v0.10.0 recorded 10 findings (2 high, 5 medium, 3 low), all remediated, and each first remediation cut had a real defect the adversarial review caught. The offline test suite grew from 58 at the Python rewrite to 247 by v0.5.0 to roughly 300, running in about 0.4s; CI runs Python 3.9 and 3.12 across ubuntu/macOS/Windows with ruff, mypy, and a gitleaks scan. As of June 2026 the project is at v0.12.3: the zero-config experience is macOS-first (iTerm2 + launchd), the `--exec` and `--tmux` routes work cross-platform, and Linux has no bundled unattended agent yet.
