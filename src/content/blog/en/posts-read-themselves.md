---
title: The posts can read themselves now
description: Turn on the sound button while you are reading and a voice reads the post to you. The recordings were made with one of the projects listed on this site.
date: 2026-07-31
locale: en
slug: posts-read-themselves
project: portfolio
aiGenerated: false
hasAudio: false
tags: ['audio', 'text-to-speech']
---

Every post here can now be read aloud, and there is nothing new to click. The site has one sound button, the same one that has always turned the music on. Turn it on while you are reading a post and a voice starts reading that post to you.

The voice belongs to the page you are on. Move to another view and it stops there, while the music carries on without a gap. Changing pages never turns your sound off. That stays your decision until you make it otherwise.

The recordings were made with AudiobookMaker, which is one of the projects listed on this site. It exists to turn text into speech, so it was the obvious thing to point at my own writing.

English is recorded. Finnish and Swedish are not, and I am not going to invent a date for them.

One detail under the surface. Each post has to declare whether a recording exists for it, and the test suite checks that claim against the files on disk in both directions. A post that claims audio it does not have fails the build. So does a recording that no post admits to.

If you would rather read in silence, leave the button alone. That is still what happens if you do nothing.
