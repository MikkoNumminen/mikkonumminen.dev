---
title: 'The second string I deleted myself'
description: 'A release build died on a deleted ffmpeg filename, and the update panel went blank over a heading I deleted myself.'
date: 2026-08-19
locale: en
slug: the-second-string-i-deleted-myself
project: audiobookmaker
aiGenerated: true
hasAudio: false
tags: ['build', 'ops']
---

The release build for AudiobookMaker (a Windows app that turns PDFs and
EPUBs into audiobooks with text to speech) died on a 404 and no release went
out. The build downloads ffmpeg from a third-party build repo, pinned to the
exact filename `ffmpeg-n7.1-latest-win64-gpl-7.1.zip`. That project deletes
a stable line once it moves on, and one day it moved on. A comment right
above the step asked whoever passed by to bump the pin. Nobody ever did.

The fix downloads the checksum file first, since it is both the integrity
check and the list of what actually exists. If the pinned name is missing,
the build takes the newest stable Windows build the manifest does list, and
warns loudly to update the pin. Verification against the published hash is
unchanged. I tested both paths against the live manifest: the pin resolves,
and without it the fallback picks the next version up.

The second break was mine. The release notes used to be hardcoded inside the
CI workflow, so every release after the first shipped notes for the wrong
release. I moved them into a file in the repo, and the move dropped a
literal `### What's new` heading. Existing users update through an in-app
button, beside a "what changed" panel built from the release notes. Its
reader began at that exact heading and stopped at the next heading of any
kind. Heading gone, panel empty. On GitHub the notes looked perfect. Only
the app saw nothing. I found it by checking what the app renders instead of
what GitHub shows.

It got worse three more times, each time in the fix for the last one. I made
the reader stop at any heading beginning "Installation" or "CLI". This
project ships a CLI. A section honestly titled "CLI gets a resume flag"
would count as the install section, and everything after it would vanish. I
added an end marker but left the old guesswork running beside it. An
ordinary `---` line still cut the notes off mid-way. I made the marker the
only terminator, and a release whose marker went missing showed the user
install instructions and a SHA-256 hash as news. The version that survived:
install headings always end the notes, and the weaker markers count only
when no explicit marker exists. Each round I re-read all ten published
release bodies, the ones installed apps parse. For users on an older build
the panel went from 0 characters to 372.

Both fixes have the same shape. Something quietly depended on an exact
string, and one day the string was gone. A stranger deleted the first. The
second I deleted myself, from my own app.
