---
title: 'The watchdog that cried wolf'
description: 'My quota watchdog typed 62 stray continues into sessions that were working fine, because its check for success ran on a signal that could never say yes.'
date: 2026-08-06
locale: en
slug: quota-watchdog-that-cried-wolf
project: claude-continue
aiGenerated: true
hasAudio: false
tags: ['claude-code', 'ops', 'build']
---

claude-continue keeps Claude Code's five-hour usage windows running back to back. When a window resets, it types `continue` into paused sessions so the quota does not sit idle overnight. Yesterday it gave up loudly: `gave up after 30 retries (~61m): window never rolled - quota coverage has lapsed`.

The log had eight of these over two months, and they lined up cleanly. Every failure followed a negative `Fire at` correction (-80m down to -120m). Every success followed a positive one. Eight for eight. The conclusion was easy to draw: I had been setting the fire time too early, the 61-minute retry budget ran out 16 minutes before the window was even due to roll, the window got marked handled, and nothing fired at the real reset either. Two hours of dead quota, self-inflicted.

Then I read Claude Code's own transcripts for the morning of August 5. At 06:49 both sessions hit the limit, and Claude itself had recorded the real reset time: 08:40. ccusage, the usage tracker the scheduler relies on, estimated 10:00. My -80m correction was pointing at 08:40. It was right. At 08:41:30 the fire landed, both sessions resumed, and no limit error appeared again. Then, from 08:43 to 09:44, the watchdog typed 30 more `continue`s into two sessions that were working fine. It repeated the performance that evening, initial fires included, in a window where the sessions had never been limited at all. 62 stray `continue`s across two windows.

The cause is in how ccusage builds its usage blocks. It floors a block's start to the whole hour and calls the end five hours later. A resume that lands inside that bucket produces messages ccusage files under the same block. The verification question was "did a new window with a later reset appear?", and under that bookkeeping the answer can never become yes. So the verifier did the only thing its answer allowed: retried, every two minutes, into sessions that had long since gone back to work. This also explains the eight-for-eight correlation. A negative correction fires before ccusage's floored estimate, so the resume lands inside the old bucket and the window "never rolls". A positive correction fires after the bucket has ended, and a fresh block appears. The correlation was real and still pointed at the wrong culprit: my corrections only changed which side of ccusage's rounding the fire landed on. Every alarm was sincere. The condition for calling it off could never be met.

The fix reads the answer from Claude Code itself. A session that gets cut off writes a transcript entry with `error: "rate_limit"` and the text `You've hit your session limit · resets 8:40am (Europe/Helsinki)`. That gives the two facts the scheduler actually needs: whether this specific session is blocked, and the real reset time from the server instead of a floor-to-the-hour guess. The transcript reader needed hardening of its own. The largest single line I found in a real transcript was 2.5 MB, which broke a bounded 512 KB tail read and got a live session reported as unreadable.

What followed was one night, three releases and eight pull requests (#60 through #67).

v0.14.0 added the gate and the transcript verification: only sessions actually parked on a spent limit get typed into. Reviewing my own pull request before merge found eight defects in it. The best one computed the correct "still limited, re-arm at the real reset" answer and then had the caller throw it away.

v0.14.1 exists because clicking Update on v0.14.0 failed with `[SSL: DECRYPTION_FAILED_OR_BAD_RECORD_MAC]`. `ssl.SSLError` is an `OSError` but neither a `URLError` nor a `ConnectionError`, so it fell through every branch of the update retry classifier and killed the download on the first blip, while a plain connection reset would have gotten three retries. One detail pinned the code path: the message had no `<urlopen error ...>` wrapper around it, and only an SSL failure during the body read looks like that. Handshake failures get wrapped, and those were already being retried.

v0.14.2 exists because the GUI showed `state unknown` for one terminal, a state the new gate holds back. The fix I had ready fell back to the project's previous transcript when the newest one had no assistant turn yet. Then I looked at which terminal it was: the one I had cleared with `/clear` an hour earlier. `/clear` opens a fresh transcript in the same terminal, so the newest file legitimately has nothing in it yet. The fallback would have read the pre-clear session's spent limit and typed `continue` into a freshly cleared terminal, which is precisely the harm the whole feature exists to prevent. The two files sit 43 seconds apart on disk, 23:47:10 and 23:47:53. No amount of reading the code would have surfaced that. I knew it because I had typed the `/clear` myself.

Two of the night's bugs were caught by screenshots while the unit tests stayed green. A UTF-8 BOM, which Windows tools write more readily than you would like (Notepad's UTF-8-with-BOM save option, Windows PowerShell's `Out-File -Encoding utf8`), made the config loader silently discard the entire config file, so a setting written to `config.json` changed nothing. It showed up because the "switch off" screenshot rendered identically to the "switch on" one. The `/clear` mislabel above was the other. The technique, if you want it: `PrintWindow(hwnd, hdc, 2)` captures a window's own content even when another window is on top of it.

The worst bug of the night was in one of my own fixes. While fixing the SSL retry I moved checksum verification inside the retry loop, which quietly broke the rule that nothing unverified gets installed: a release with no digest went from refused to installed unverified. I found it by reproducing it, since reading the diff had already failed me once. After that, every fix in the run was mutation-tested: revert the fix, confirm its test actually fails. Twice a mutant came back as not caught, and both times the mutant itself was malformed rather than the test. `return "" or X` evaluates to `X`, which silences nothing.

v0.14.2 went out through its own Update button, the first release where the button carried the retry fix it needed. 714 tests. The tool now asks each session directly whether it is stuck, and it leaves the working ones alone.
