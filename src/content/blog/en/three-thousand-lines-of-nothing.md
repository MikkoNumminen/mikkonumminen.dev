---
title: Three thousand lines that changed nothing
description: A whitespace-only rewrite made CodeQL report four alerts as new. None of them were, and the way that failure runs is the part worth writing down.
date: 2026-08-04
locale: en
slug: three-thousand-lines-of-nothing
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['build', 'ops', 'ragctl']
---

A pull request that added feature flags to the RAG control CLI came back from CI with CodeQL failing. One high-severity alert and three notes, all reported as introduced by that pull request. I went to look at them. A world-writable `chmod` on the log directory, and three exception handlers that swallow their error with a bare `pass`. Two of those are a JSON decode and the third is an `OSError` around a signal. All four were already on master, unmodified, the oldest of them for six weeks.

The cause was line endings. The file is stored with CRLF, my editing pass rewrote it as LF, and a change of 326 real lines arrived as a diff of 3804. Every line in the file counted as touched. CodeQL scopes new alerts to changed lines, and I had just told it that every line was changed.

The obvious cost is that the review is useless. Nobody can find a real change inside a whole-file rewrite, including the person who made it.

The second cost runs the opposite way from how it first looks. A rewrite like that does not invent alerts. It drags in whatever was already sitting in the file. So the risk is not the four false alarms I had to dismiss. It is that a genuine problem in one of my 326 real lines would have arrived in the same list as the six-week-old ones, indistinguishable from them. I had already written off all four as noise, and a fifth would have gone out with them.

The fix was not to normalise the repository. There is no `text=auto` rule here and the tree is genuinely mixed. `config.py` is CRLF and `pipeline.py` is LF, so a sweeping conversion would have reproduced the same unreadable diff across dozens of files at once. The rule is per file, following what each file's own history already says. I put that one back to CRLF. The diff went from 3804 lines to 326 and the alert attribution cleared on its own.

Checking that it had cleared turned up something else. CodeQL still reported a configuration it could not find, on every open pull request rather than only mine. An earlier change of my own had renamed the analysis category, and master still carries analyses registered under the old name that no workflow produces any more. GitHub responds by declining to work out which alerts a pull request introduced at all. Nothing was red, because that check is not required and both analysis jobs pass. That is how it stayed quiet. It is still open.

The pull request underneath all of this was about a tool that refuses to trust its own success message. It writes the setting, restarts the container, and then reads the value back from inside the running process instead of believing the line that says `Started`. I nearly shipped it inside a diff that misreported what it contained.
