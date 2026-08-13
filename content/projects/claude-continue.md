---
title: claude-continue · Claude Code session scheduler
project: claude-continue
url: https://github.com/MikkoNumminen/claude-continue
---

# claude-continue

**Keep Claude Code's 5-hour usage windows running back-to-back.**

Claude Code enforces a rolling 5-hour usage quota. When the quota is exhausted mid-job, the session pauses and waits for the user to type something that opens the next window. Left unattended, that gap is dead time: quota that resets and sits idle until someone notices.

claude-continue closes that gap. It reads the active window's reset time from `ccusage` (the only local source for this: Claude Code's own CLI and `~/.claude.json` expose nothing about the current window), sleeps until the estimated reset, fires the configured action, then verifies the window actually rolled and re-arms for the next one. The result is back-to-back 5-hour windows with no idle gap in between.

Mikko built this for his own long autonomous Claude Code runs on a Max plan: start a job, let it hit the limit, walk away. When the window rolls over, the paused sessions receive a `continue` and keep going.

## What it does

The core is a self-rescheduling watch loop. At each reset it either broadcasts `continue` into paused Claude sessions (the resume path), or runs a headless `claude -p` to open a fresh window without touching any terminal (the quota-mode path). After firing, it re-reads `ccusage` to confirm the window rolled, if it did not, it retries on a bounded backoff schedule rather than trusting the estimate blindly.

The watch loop is also exposed as a one-button Tkinter GUI (`claude-continue gui`) and as an unattended background daemon installed via launchd on macOS or Windows Task Scheduler on Windows/WSL.

## Platform support

Four action paths cover four runtime environments:

- **macOS + iTerm2**: AppleScript broadcast into matching sessions; skips sessions that are mid-turn (`is processing` flag)
- **tmux** (macOS or Linux): `tmux send-keys` into matching panes; terminal-agnostic
- **Windows native**: console-input injection directly into each Claude process via `AttachConsole` + `WriteConsoleInput`; no focus stealing
- **Windows/WSL keystroke**: `WScript.Shell.SendKeys` via PowerShell into a titled window (opt-in; focus-stealing)
- **Headless exec**: a detached `claude -p` subprocess on any platform; the reliable default on Windows/WSL

## Tech stack

Python 3.9+ (stdlib only: zero runtime third-party packages), Tkinter, PyInstaller (build time only), GitHub Actions

## Highlights

- Zero runtime dependencies beyond Python stdlib and Node (`npx ccusage`)
- Verify-and-retry correctness: the raw ccusage estimate is treated as approximate; the loop confirms the window rolled before re-arming
- Four distinct terminal-driving mechanisms across four platforms, each with its own skip-busy logic
- Self-update with SHA-256 verification and detached helper swap, surviving antivirus on Windows
- Full injectable test seam: 714 tests run offline in under a second

## Status

Work in progress, version 0.12.3 as of June 2026. The zero-config experience is macOS-first (iTerm2 + launchd); the cross-platform routes (`--exec`, `--tmux`) already work. Releases ship a standalone macOS `.app` and a Windows one-dir folder (zipped), both built with PyInstaller. Linux has no bundled unattended agent yet: `watch` works, but service-manager integration is left to the user.

[GitHub](https://github.com/MikkoNumminen/claude-continue)
