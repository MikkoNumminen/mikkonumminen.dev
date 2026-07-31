---
title: Ten days, four pages
description: I rebuilt every page of this site in ten days. The front page is now a single field of 24,000 particles, and my name is made out of them.
date: 2026-07-31
locale: en
slug: ten-days-four-pages
project: portfolio
aiGenerated: true
hasAudio: true
tags: ['three.js', 'design']
---

Over roughly ten days I rebuilt every page of this site. This is what changed, page by page, written for people who do not care what a shader is.

## Home

The front page is where most of the ten days went, and it is the change I would show first.

What was there before was a pile. My name stood at the top as solid 3D letters in a chrome material, lit by eight separate lights. Behind it spun a spiral galaxy. Meteors streaked across and flashed on impact. Commit messages popped up on a random timer. The letters carried decorations: a mountain with snow on the M, a ring around the O, a goat. There was a lens flare. Each was its own system, all shouting over the others from the same top of the page. Below that, ordinary flat page, with a gradient hiding the line where the 3D stopped.

I deleted the lot. What replaced it is one thing: a field of 24,000 particles that covers the whole page, sits behind everything, and never goes away.

The real change is that my name is no longer text. There are no letters on the front page at all. The letters are drawn once on a hidden surface, and the particles are told where the ink landed. Each particle knows three homes: a place in the galaxy, one in my name, one in the starfield behind the rest of the page. Scrolling moves them between those homes: the galaxy pours itself into the name, and further down the name scatters into stars that follow you down the page. Scroll back up and the name reassembles itself, and I did not have to build that part. It is the same particles going home.

Because the field is painted in the page's own background colour and covers everything, the old colour seam between the top and the rest is not patched any more. It cannot exist.

The formed name is not a still image. It shimmers, and the shimmer is built from speed rather than distance: pushing particles further only makes the name lean, while moving them faster reads as alive. A crest of brightness walks across the letters every eight seconds. One particle in a hundred is allowed to wander off the letterforms, and each one that does spends about three seconds away before easing back on its own schedule. Click the name and it takes the hit, then recovers.

The cursor pushes particles aside. Clicks send ripples, and the commit messages from this site's own repository now surface on those ripples instead of on a timer. The glow knows what you are looking at: loudest on the galaxy, calm on the formed name, nearly gone among the stars.

The commits are real, baked in at build time. For a while in production they were not: the build system checks out only the newest commit, so a request for sixty received one and the page fell back to a hardcoded placeholder list. A feature built to show real history spent its first weeks showing invented history. It shows the real thing now. I checked. Twice.

There was a measured reason too. The old pile froze the browser for 306 milliseconds compiling its ten drawing programs under those eight lights, and the freeze landed exactly where a visitor's first scroll arrives. The new page holds behind a short loading screen until it has drawn two smooth frames in a row. The cost is paid before you are invited in, not under your first gesture. On weak hardware the field thins out; small screens and reduced-motion visitors get a still image.

## Projects

There is a small solar system on this site. You can drag it around and zoom, and each planet is one of my projects.

That was true before too, in theory. Then I measured it. At the default camera position, nine of the twelve orbits sat entirely outside the visible frame, so only three projects were ever on screen. Worse, the maximum zoom-out was set closer than the outermost orbit, which meant you could not reach the other nine even by trying. I had built a solar system and made most of it unreachable.

All twelve are on screen now, whatever the shape of your window, and every one of them can be reached. The site itself sits at the centre as the sun, with the projects orbiting it.

The page also starts much faster. The first frame used to freeze the browser for 1,159 milliseconds, which is long enough to wonder whether the tab has died. The fix that worked was dull: compute each planet's surface once and reuse it, instead of recomputing every pixel on every frame. That removed 69 percent of the freeze. Two confident theories failed before that one, and the more confident of the two, combining the drawing programs into a single one, made the freeze 230 milliseconds worse.

## Experience

The front page's only rival for biggest improvement sits at the end of the experience page: one card listing the 107 technologies I actually build with, in five groups (languages, frontend, backend and data, AI and LLM, platform). Every row opens to show what sits underneath it. Open Rust and you see the cryptography libraries. Open Python and you see the document and speech libraries.

The card has a toggle between two readings of the same data: by technology, or by project. Flip it and the same information reorganises into twelve projects, each showing what it is built from. Both views come from one list, so they can never disagree with each other.

The list was also not written from memory. It was read out of the actual dependency files of fifteen repositories on my machine. Then the result was cut back hard. Model names and operating system utilities went. So did the ordinary libraries every developer on earth uses. A list that includes trivia makes the serious entries look like padding, and I would rather show 107 rows I can defend than 300 that look impressive. A small "work" badge marks anything used in paid client work rather than in my own projects.

The rest of the page draws my working life as a mountain climb, from 24 years in hardware retail at the bottom to today at the top. It used to run the wrong way round, so climbing meant scrolling down. It now runs upward, as climbing tends to. The page also used to finish with a message saying you had reached the end, followed by two more sections. There is one closing card now.

## Contact

The last page is a terminal you type into. It answers questions about my projects in plain language, and the model doing the answering runs on a computer in my home, on my own hardware, rather than on some company's service. When it has no source for an answer, it refuses instead of inventing one. I consider the refusal a feature.

The newest change is small. When that machine at home is awake, the terminal now announces it, so a visitor knows there is something on the other end willing to take real questions. Before, the only clues were tiny and easy to miss, and I suspect most people typed a command or two and left without ever discovering the interesting part.

## Full circle

The four pages agree with each other now, and with my CV, because they all read from the same sources rather than from my memory of them. If I ever want to claim a skill I do not have, I will first need to falsify the dependency files of fifteen repositories. At that point it is honestly less work to learn the thing.
