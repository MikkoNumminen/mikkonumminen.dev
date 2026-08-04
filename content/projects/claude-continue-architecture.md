---
title: claude-continue · architecture & design
project: claude-continue
---

# claude-continue: Architecture & Design

claude-continue automates Claude Code's 5-hour usage window cycling. It reads the active window's reset time from `ccusage`, waits, fires a resume or open-window action, verifies the window rolled, and re-arms, so a paused Claude session never idles at the limit longer than the retry backoff.

## Overview and High-Level Architecture

The system has three layers: a CLI entry point that builds a `Config` and dispatches subcommands, a watch loop that owns the core scheduling logic, and a set of platform-specific action modules that perform the actual terminal interaction.

```
cli.py  (argparse: status | doctor | watch | gui | once | fire | install | uninstall | update)
  │ builds Config (flags > env vars > JSON file > defaults)
  ▼
watch.run()                         — the self-rescheduling loop
  _next_plan()
    ccusage.get_active_block()      — npx ccusage blocks --active --json --offline
    schedule.next_target()          — reset + reset_offset + buffer
    schedule.fixed_target()         — --at / --every fallback
  _sleep_until()                    — ≤60 s slices (survives Mac sleep)
  action.perform()
    iterm.broadcast()               — macOS AppleScript into iTerm2 sessions
    tmux.broadcast()                — tmux send-keys (macOS or Linux)
    winterm.continue_instances()    — AttachConsole + WriteConsoleInput (Windows native)
    winterm.send_keystroke()        — PowerShell SendKeys (Windows/WSL opt-in)
    subprocess.Popen(exec_cmd)      — headless detached run (any platform)
  _verify_and_retry()               — re-read ccusage; retry if window didn't roll

gui.py         — Tkinter window over the same WatchController / watch.run
launchd.py     — install as a macOS LaunchAgent (KeepAlive, RunAtLoad)
tasksched.py   — install as a Windows Task Scheduler task (onlogon, /rl highest)
update.py      — self-update: GitHub releases API → download → SHA-256 verify → swap + relaunch
selfremove.py  — complete uninstall: agent + config + logs + bundle self-delete
```

## Tech Stack and Key Choices

**Python 3.9, stdlib only.** The hard rule is that there are no runtime third-party Python packages. Every import in `src/claude_continue/` is from the standard library. This means `pip install -e .` has no `[dependencies]` to resolve, the build is simple, and the frozen binary has a predictable closure. Config is JSON rather than TOML explicitly because `tomllib` is Python 3.11+ and the target is 3.9.

**Tkinter for the GUI.** Tkinter ships with CPython on every supported platform, so the GUI adds no new dependencies. The trade-off is that native macOS Tk has quirks: specifically, button `fg`/`bg` are silently ignored, so color state is conveyed via a glyph in the label text rather than a background tint. The GUI module lazy-imports `tkinter` inside `run()` so that CLI subcommands never pay the import cost.

**PyInstaller for packaging (build-time only).** The standalone macOS `.app` and Windows one-dir folder are built with PyInstaller. `packaging/build-macos.sh` and `packaging/build-windows.ps1` each create a throwaway venv, install PyInstaller there, build, and leave the main Python environment untouched. The macOS build is ad-hoc signed only (not notarized); first-run Gatekeeper quarantine is cleared with `xattr -dr com.apple.quarantine`. PyInstaller brings its own OpenSSL into the bundle, which on macOS frequently loads zero CA certificates: `update._ssl_context()` handles this by detecting a frozen context with empty `cert_store_stats()` and additively loading the OS system bundle (`/etc/ssl/cert.pem`).

**ccusage as the only reset-time source.** Claude Code does not expose the current usage window through its CLI or `~/.claude.json`. `ccusage` (an external Node.js tool by ryoppippi) reconstructs 5-hour blocks by parsing the local Claude Code transcript files. claude-continue calls it as `npx ccusage blocks --active --json --offline`: `--offline` is mandatory because without it ccusage may perform a network pricing fetch, which would stall the watch loop. The call runs with a subprocess timeout (default 30 s), and any failure (missing binary, timeout, non-JSON output, unexpected JSON shape) surfaces as `CcusageUnavailable` rather than crashing the daemon.

## The Watch Loop in Detail

`watch.run()` is the central seam. All external effects are injectable keyword arguments with defaults pointing at the real implementations:

| Port | Contract |
|---|---|
| `clock` | Returns tz-aware UTC `datetime` |
| `sleep` | Interruptible sleep; real impl is `threading.Event.wait` so SIGTERM exits promptly |
| `get_block` | Returns active `Block` or `None`; raises `CcusageUnavailable` on failure |
| `perform` | Executes the action; returns a list of acted-on labels; raises `ActionError` on failure |
| `stop` | Returns `True` when the loop should exit |

Each cycle begins with `_next_plan()`, which chooses between a fixed schedule (if `--at` or `--every` was given) and the ccusage-driven schedule (read the block, call `schedule.next_target(block, buffer, reset_offset)`). If ccusage is unavailable or no active block exists, the plan is `poll`: the loop backs off at `poll_interval` (default 600 s) and tries again.

Sleeping is done in slices of at most 60 seconds via `_sleep_until()`. The reason is macOS: a machine that enters sleep suspends `time.sleep` at the OS level, so a single long sleep can overshoot a reset by hours. Polling in short slices means the loop wakes promptly after the machine resumes and fires immediately for the current window.

After firing, `_verify_and_retry()` re-reads ccusage. A successful resume produces a new active block whose `reset_at` is later than the one that was just fired against. If the block has not advanced (ccusage's estimate was early, or the session is still rate-limited) the loop re-fires `continue` every `retry_interval` (default 120 s) up to `retry_cap` (default 30) attempts, for roughly one hour of retry coverage. This bounded retry is the correctness mechanism: the estimate is approximate, but the retry window covers the plausible early-estimate range.

A deduplication guard (`last_fired_block_id`) prevents the loop from re-arming and re-firing a window it has already handled and retried on: once the retry cap is exhausted for a given block ID, the loop polls until a genuinely new window appears.

Signal handling registers `SIGTERM`, `SIGINT`, and (on Windows) `SIGBREAK` against the same `threading.Event` used as the sleeper. This means a `launchctl bootout` or Task Scheduler stop terminates the loop within the next 60-second slice without leaving the daemon wedged.

## The Cross-Platform Terminal-Driving Model

Each platform gets a distinct action module. The dispatch order in `action.perform()` is:

1. `exec_cmd` set → headless `subprocess.Popen` detached from the watch process (cross-platform, reliable)
2. `start_window` (quota mode) → headless `claude -p "Reply with only: ok"`: opens a fresh window without touching any terminal
3. `cfg.tmux` → `tmux.broadcast()`
4. Platform is macOS → `iterm.broadcast()`
5. `cfg.keystroke_all` and platform is Windows → `winterm.continue_instances()`
6. `cfg.keystroke` and platform is Windows/WSL → `winterm.send_keystroke()`
7. Otherwise → `ActionError`

### iTerm2 (macOS)

`iterm.py` generates an AppleScript that iterates over every window → tab → session in iTerm2 and checks each session's `name` against the configured filter (default: `["claude", "✳"]`). Before sending text, it reads `is processing of s`: iTerm2's per-session boolean that is true while a turn is running. Sessions with `is processing` true are skipped unless `--force` is set. The AppleScript is piped into `osascript -` via subprocess, which also means it requires iTerm2's Accessibility permission on first run. Two known AppleScript pitfalls are documented in comments: `tab` is an iTerm2 term inside a `tell application "iTerm2"` block (the word means tabs, so it can't be used as a variable), and `rows` is another reserved iTerm property. The list-sessions variant used by the GUI's live panel reads `status<TAB>name` lines by building a separate AppleScript that avoids both reserved words.

### tmux (macOS and Linux)

`tmux.py` calls `tmux list-panes -a -F "#{pane_id}\t#{session_name}\t#{window_name}\t#{pane_title}"` to enumerate all panes, then filters by matching `window_name` and `pane_title` against the configured substrings. `session_name` is deliberately excluded from the filter because tmux session names are often working-directory names (e.g. `claude-continue`), which would otherwise match every pane in the session.

tmux has no `is processing` equivalent, so busy detection reads pane content: `tmux capture-pane -p -t <pane_id>` and scans the last 12 non-blank lines for the pattern Claude displays while mid-turn (default `"esc to interrupt"`). The 12-line tail is generous because Claude's footer sits above the input box, not on the very last visible line. The bias is deliberate: a false-busy only delays a resume by one retry interval, while a false-idle would inject into an active turn. Text is sent with `send-keys -l` (literal, so `-` cannot be misread as a flag) followed by a separate `send-keys "Enter"` event.

### Windows native (console-input injection)

The `--keystroke-all` path in `winterm.py` is the most technically involved action. PowerShell's `WScript.Shell.SendKeys` can only target one focused window, which means sessions multiplexed as tabs or split panes inside a single Windows Terminal window could not all be reached. The solution is `AttachConsole` + `WriteConsoleInput`: the watch process calls `FreeConsole()`, then `AttachConsole(target_pid)` to attach to each Claude process's pseudoconsole, opens `CONIN$` with `CreateFileW`, and writes `INPUT_RECORD` structures for each character of `continue\r`. The key events are built as UTF-16 code units (non-BMP characters are split into surrogate pairs), so a custom resume text containing emoji stays valid.

A critical hazard came up during development: `AttachConsole` rewrites the calling process's standard handles. A windowed PyInstaller app has no console and no parent console to re-attach to after `FreeConsole()`, so the `AttachConsole(_ATTACH_PARENT_PROCESS)` restore in the `finally` block silently fails, leaving stdin/stdout/stderr pointing at the now-freed Claude console. Every subsequent `subprocess.run` in the GUI then fails with `[WinError 6] The handle is invalid`, breaking all ccusage polls and the instance panel for the rest of the session. The fix: snapshot the three standard handle values with `GetStdHandle` before the attach dance, and restore them via `SetStdHandle` if the re-attach to the parent console fails.

### Windows/WSL keystroke (single window)

`winterm.send_keystroke()` calls PowerShell's `WScript.Shell.AppActivate(title)` followed by `SendKeys(text + "{ENTER}")`. This path steals focus and only hits one window (the one whose title begins with `window_title`, default `"Windows Terminal"`). SendKeys has metacharacters (`+ ^ % ~ ( ) { } [ ]`) that must be braced-escaped in the payload. `doctor` verifies the target window exists by enumerating `Get-Process | MainWindowTitle` before confirming the path is ready: the most common failure is that Windows Terminal's title bar shows the active tab's name, not the literal "Windows Terminal".

## Scheduling: ccusage-driven vs. Fixed

`schedule.next_target()` computes `block.reset_at + timedelta(seconds=offset + buffer)`. The `reset_offset` correction exists because ccusage floors each window's `startTime` to the whole hour. If Mikko's first message in a window was sent at 09:23, ccusage's `startTime` is 09:00 and its `endTime` is 14:00, but the real reset is at 14:23. The estimate fires 23 minutes early. `reset_offset` (settable via `--reset-offset`, `CLAUDE_CONTINUE_RESET_OFFSET`, the config file, or the GUI's Fire at field) is added to the estimate before the buffer, so the watcher fires at the right time and the verify-and-retry catches any remaining slop.

`schedule.fixed_target()` handles the `--at HH:MM` and `--every H [--anchor HH:MM]` paths. The `--every` implementation uses a continuous grid anchored to a fixed epoch (year 2000, anchor HH:MM) rather than re-anchoring per call-day. This avoids injecting an extra fire whenever the step size does not divide 24, and it handles DST spring-forward gaps by stepping forward until the target is genuinely in the future.

## State, Config, and the Pidlock

`config.py` defines a `Config` dataclass with defaults. `config.resolve()` layers them: defaults → `~/.config/claude-continue/config.json` → `CLAUDE_CONTINUE_<FIELD>` environment variables → explicit overrides from parsed CLI args. JSON is the config format because `tomllib` requires Python 3.11+.

`lock.py` maintains a pidfile at `~/.config/claude-continue/claude-continue.pid`. The watch loop acquires the lock at startup and releases it at clean exit, preventing a manually-started `watch` and the launchd/Task Scheduler agent from both firing simultaneously and doubling up on every resume.

## Scheduling Agents

**macOS: launchd.** `launchd.py` writes a LaunchAgent plist to `~/Library/LaunchAgents/com.mikko.claude-continue.plist` with `RunAtLoad`, `KeepAlive` (restarts on crash, not on clean exit), a `ThrottleInterval` of 30 s, and an explicit `PATH` that includes Node's bin directory. The PATH is necessary because nvm's node is not on launchd's default PATH, so `npx ccusage` would fail silently without it. The install code detects whether node is reachable through a stable Homebrew location (`/opt/homebrew/bin`, `/usr/local/bin`) and prefers that over a version-pinned nvm path that would go stale after a node upgrade. The plist template is stored as a Python `string.Template` in `launchd.py` and a documentation copy in `templates/`; CI checks them for drift.

**Windows/WSL: Task Scheduler.** `tasksched.py` registers a task named `claude-continue` via `schtasks /create /sc onlogon /rl highest`. Because the actual watch command (with all its flags) is too complex to quote safely in the `/tr` argument, the install writes a wrapper `.cmd` (or `.sh` on WSL) containing the real command and registers the task to invoke that wrapper. The wrapper body is generated by `_cmd_command()` / `_cmd_arg()`: argv[0] uses real double-quote quoting so cmd.exe can resolve a space-containing install path; each subsequent argument is argv-quoted then caret-escaped, so cmd's batch layer never enters quote state and operators (`& | < >`) cannot be injected. `%` is doubled to suppress variable expansion even inside quotes. Under WSL the task lives on the Windows side and invokes `wsl.exe -d <distro> -e /bin/sh <wrapper>`.

## Self-Update

`update.py` queries the GitHub releases API (`api.github.com/repos/MikkoNumminen/claude-continue/releases/latest`) using stdlib `urllib`, verifies TLS against an allowlist of known GitHub asset hosts (`github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`), and checks the downloaded zip against the SHA-256 digest shipped in the release asset metadata. Version comparison is done with a tuple-based `_version_tuple()` that pads shorter versions to equal length, so `1.0 == 1.0.0`.

On macOS the swap is synchronous: `ditto -x -k` extracts the new `.app` into a temp dir, the old bundle is renamed aside, `ditto` copies the new one in, and on failure the old bundle is restored and named back. A detached shell script polls for the app's PID to disappear (capped at ~30 s to handle PID recycling), then calls `open` to relaunch. On Windows the installed files are locked while the process is running, so the swap is deferred: `apply_update()` extracts the zip in-process, writes a `.cmd` helper to `%TEMP%`, and spawns it detached (`CREATE_NO_WINDOW`). The helper polls via file-redirected `tasklist | findstr` (anonymous pipes fail in a window-less console), waits for the PID to vanish, then performs an atomic directory rename (the preferred path) or an in-place file overwrite (the fallback when another process holds the install directory open, which blocks `rename` even though file writes inside it succeed). Either path keeps a backup and rolls back if the copy fails, so the worst case is "un-updated, not bricked". A pending stamp written after the helper spawns allows the next launch to detect and surface a silently-failed swap.

## Testing Model

The test suite (~300 tests, ~0.4 s) is entirely offline. Every external effect in the watch loop has an injectable port: `clock`, `sleep`, `get_block`, `perform`, and `stop`. ccusage is mocked either by injecting `get_block` directly or by setting `CLAUDE_CONTINUE_CCUSAGE_CMD="cat tests/fixtures/active.json"`. Platform detection is overridden with `CLAUDE_CONTINUE_PLATFORM=windows|macos|wsl|linux`. All subprocess calls (`osascript`, `tmux`, `ditto`, `Popen`) are mocked in tests. Pure decision functions (`schedule.*`, `watch_explanation`, `update_decision`, `should_auto_recheck`) are tested directly without any subprocess or display.

CI runs on Python 3.9 + 3.12 × {ubuntu, macOS, Windows}. The 3.9 job enforces the no-3.10-syntax rule: `match`, `X | Y` type unions outside annotations, and `tomllib` are all excluded. `ruff` enforces style (pyupgrade is intentionally disabled: `%`-style logging stays). `mypy` type-checks the package. A `gitleaks` scan covers the full git history with a custom rule that catches `sk-ant-` Anthropic keys. The release workflow (tag-triggered) builds both platform artifacts and attaches them to the GitHub release; the in-app Update button picks them up from there.

## Key Engineering Challenges

**The ccusage estimate problem.** ccusage floors window start times to the hour, so its reset estimate can be up to one hour early. The initial design fired once and assumed success. The verify-and-retry mechanism replaced that: after firing, re-read ccusage; if the block ID has not advanced, re-fire on a 120-second cadence for up to 30 retries (~1 hour). This turned an occasionally-wrong estimate into a correctness-preserving mechanism. The GUI's `reset_offset` field surfaces the correction to users who notice the estimate is systematically wrong for their usage pattern.

**Windows antivirus and the one-dir switch.** The original Windows release was a single-file PyInstaller exe. On every launch, PyInstaller unpacked `python311.dll` and the rest of the runtime into `%TEMP%`, which heuristic antivirus scanners (specifically IPVanish Threat Protection) flagged as malware behavior and blocked. Version 0.9.0 switched to a one-dir build: the runtime DLLs live permanently in an `_internal\` folder beside the exe, are scanned once on install, and are never re-extracted. Version metadata (CompanyName, ProductName, file version) was added to the exe resource block, and UPX compression was explicitly disabled: UPX inflates false-positive rates on Windows and corrupts macOS binaries. This change required redesigning the self-update to swap entire directories rather than single files.

**The Windows console handle leak.** The `continue_instances()` path calls `FreeConsole()` + `AttachConsole(target_pid)` for each Claude process, then `FreeConsole()` + `AttachConsole(-1)` to re-attach to the parent console. In the windowed GUI there is no parent console, so the `AttachConsole(-1)` call fails, leaving stdin/stdout/stderr pointing at the now-freed Claude pseudoconsole. The next `subprocess.run` in the GUI (a ccusage poll or instance-list query) inherited those stale handles and died with `[WinError 6] The handle is invalid`: the watcher appeared to work but stopped recognizing Claude instances and stopped updating ccusage. The fix is to snapshot all three standard handles with `GetStdHandle` before the attach dance and restore them with `SetStdHandle` if the parent re-attach fails.

**Windows self-update and locked directories.** Windows refuses to rename a directory that any live process has open as its current working directory or that an antivirus scanner is scanning. The original updater used a rename aside of the install directory, which failed silently in this case, leaving the user on the old version with no feedback. Version 0.12.1 added an in-place overwrite fallback: when the rename fails (detected by checking whether the destination path still contains the exe), the helper copies the old install to `<dir>.old` first, then uses `robocopy /E` to overwrite files in place. If the overwrite fails partway, `robocopy` restores from the backup. The backup is dropped only after confirming a complete, working tree; a partial restore that still cannot confirm its own success leaves the backup in place and does not relaunch.

**The tasksched `.cmd` injection hazard.** The first implementation of the Windows Task Scheduler wrapper used Python's `subprocess.list2cmdline()` to build the `.cmd` file body. `list2cmdline` quotes correctly for the C runtime's `CommandLineToArgvW` parser but does not quote for the `cmd.exe` batch layer that runs first. A config value containing `%` (variable expansion) or an unquoted `&` (operator) could corrupt or inject into the scheduled command. The fix was a custom two-layer quoting scheme: argv[0] uses real double-quote quoting (so cmd.exe resolves a spaced path), each subsequent argument is caret-escaped (so operators are never live), and `%` is doubled everywhere.

## Known Limitations and Open Items

The `TODO.md` tracks the following:

- **Code signing.** The Windows build is unsigned, so Windows SmartScreen may warn on first launch. SignPath.io offers a free tier for open-source projects, but eligibility must be confirmed before wiring up CI. macOS notarization requires the Apple Developer Program ($99/yr); the documented workaround is `xattr -dr com.apple.quarantine` or right-click → Open on first run. Neither signing option is currently in place.
- **Linux has no unattended agent.** The watch loop works on Linux via `--tmux` or `--exec`, but there is no bundled systemd unit or equivalent. Users must wire `watch` into their own service manager.
- **`--keystroke-all` has no skip-busy filter.** On Windows native the console-input injection path has no per-session "is processing" equivalent. A session that happens to be mid-turn at the reset moment will also receive `continue`. The iTerm2 and tmux paths both have skip-busy; this is a platform limitation.
- **The GUI's reset_offset correction is session-scoped.** The Fire at correction computed from the GUI's field is derived from the live ccusage estimate and is not persisted across restarts. For an unattended run, `reset_offset` must be set in the config file or via `--reset-offset`.
