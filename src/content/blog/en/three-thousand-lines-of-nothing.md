---
title: Three thousand lines that changed nothing
description: A whitespace-only rewrite made CodeQL report four alerts as new. None of them were, and the direction of that error is the part worth keeping.
date: 2026-08-04
locale: en
slug: three-thousand-lines-of-nothing
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['build', 'ops', 'ragctl']
---

A pull request that added feature flags to the RAG control CLI came back from CI with CodeQL failing: one high-severity alert and three notes, all reported as introduced by that pull request. I went to look at them. A world-writable `chmod` on the log directory, and three exception handlers that swallow a JSON decode error with a bare `pass`. All four were already on master, unmodified, some of them for months.

The cause was line endings. That file is stored with CRLF, my editing pass rewrote it as LF, and so a change of 326 real lines arrived as a diff of 3804. Every line in the file counted as touched. CodeQL scopes new alerts to changed lines, and I had just told it that every line was changed.

The obvious cost is that the review is useless. Nobody can find a real change inside a whole-file rewrite, including the person who made it.

The cost that matters is the other one, and it runs the opposite way from how it first looks. A rewrite like that does not invent alerts. It drags in whatever was already sitting in the file. So the failure mode is not four false alarms I have to dismiss — it is that if one of my 326 real lines had introduced a genuine problem, it would have arrived in the same list as the three-month-old ones, indistinguishable from them. A gate that flags everything flags nothing. I would have dismissed the batch, because the first four I checked were noise, and the fifth would have gone with them.

The fix was not to normalise the repository. There is no `text=auto` rule here and the tree is genuinely mixed — `config.py` is CRLF, `pipeline.py` is LF — so a sweeping conversion would have reproduced the same unreadable diff across dozens of files at once. The rule is per file, following what each file's own history already says. I put that one back to CRLF. The diff went from 3804 lines to 326 and the alert attribution cleared on its own.

Checking that it had cleared turned up something else. CodeQL still reported a configuration it could not find, on every open pull request, not just mine. An earlier change of my own had renamed the analysis category, and master still carries analyses registered under the old name that no workflow produces any more. GitHub responds by declining to work out which alerts a pull request introduced at all. Nothing was red, because that check is not required and both analysis jobs pass, which is how it stayed quiet. That one is still open.

The pull request underneath all of this was about a tool that refuses to trust its own success message — it writes the setting, restarts the container, and then asserts the value from inside the running process rather than believing the line that says `Started`. I nearly shipped it behind a diff that lied about itself.
