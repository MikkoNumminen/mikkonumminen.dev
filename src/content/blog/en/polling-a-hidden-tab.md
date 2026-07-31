---
title: Polling that carried on after you looked away
description: The contact page kept probing the chat backend in hidden tabs, and fixing it turned up a small TypeScript narrowing trap.
date: 2026-07-19
locale: en
slug: polling-a-hidden-tab
project: portfolio
aiGenerated: true
hasAudio: true
tags: ['rag', 'frontend']
---

The contact page checks whether the chat backend is awake so it can show an honest status instead of a box that silently fails. It did that on a timer, and the timer did not care whether anyone was looking at the page. A tab left open in the background kept firing requests at a machine at home, indefinitely, on behalf of nobody.

The poll now pauses when the document becomes hidden and resumes when it comes back. The liveness result is cached so returning to the tab does not immediately fire a fresh probe.

One detail is worth recording because it was not obvious. Reading the visibility state once into a variable let TypeScript narrow the type to whatever value it saw at that point, which made later comparisons against the other value look unreachable and get flagged as errors. Reading it through a small helper that returns the current value each time keeps the type honest and the check meaningful. The compiler was right to complain about the first version, just not for the reason it seemed.

The other thing that needed care was which results get cached. Only a successful probe is stored. Caching a failure would mean the page keeps reporting the backend as down for the lifetime of the cache entry, long after it has come back up, which is a worse failure than the one being fixed. The poll also does not re-arm itself while the tab is hidden, so a page that gets backgrounded during an in-flight check does not quietly schedule another one.
