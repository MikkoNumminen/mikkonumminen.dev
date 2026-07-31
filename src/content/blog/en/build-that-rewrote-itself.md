---
title: A build step that kept rewriting a file it had not changed
description: The skills registry PDF was regenerated on every build, producing a dirty working tree and a meaningless binary diff.
date: 2026-07-20
locale: en
slug: build-that-rewrote-itself
project: portfolio
aiGenerated: true
hasAudio: false
tags: ['build', 'skills-pdf']
---

The skills registry PDF is committed to the repository, and the build regenerated it every single time. Because the renderer does not produce byte-identical output across runs, that meant every build left a modified binary file in the working tree. The diff carried no information. It was just noise that had to be either committed or thrown away after every run.

The fix was to hash the things the PDF actually depends on and skip rendering when that hash matches what produced the existing file. Straightforward in principle. The part that needed a second pass was the cache key itself, which initially covered only the content inputs. The Chrome print flags also change the output while leaving the content untouched, so a flag change would have been silently ignored and the stale PDF kept. Those flags are now folded into the key.

Two smaller things fell out of the same work. The existence check before reading the cached file was replaced by just reading it and handling the missing-file error, because anything can happen in the gap between checking and reading. And the PDF got a gitattributes entry marking it as binary, which stops git from attempting a line-based diff on it. That one should have been there from the beginning.

There was also a counting bug nearby that had nothing to do with caching. The registry contains one entry that is a redirect rather than a real skill, and the headline number was counting it. The aggregates now derive the active count from the per-skill flags and exclude redirects, so the number on the cover is 33 rather than 34.
