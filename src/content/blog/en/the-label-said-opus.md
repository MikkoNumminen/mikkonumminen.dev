---
title: 'The label said Opus'
description: 'My cost-routing agents all appeared to be running on Opus. Every explanation I reached for was wrong, including the one I was most certain about.'
date: 2026-07-21
locale: en
slug: the-label-said-opus
aiGenerated: false
hasAudio: false
tags: ['Claude Code', 'agents', 'measurement', 'cost-routing']
---

I run a small set of subagents for Claude Code that route work by cost. Each one
is pinned to the cheapest model tier that can do its job. Search and mechanical
edits go to Haiku, spec-shaped changes to Sonnet, and only real judgement reaches
Opus. The point is to stop paying Opus prices for grep.

So when I opened the agent list mid-run and saw "Opus 4.8" next to every row, it
looked bad. Find, Verify, all of it on Opus. If that was real, the routing was
decoration and every token number I had published about it was fiction.

The first assumption wrote itself: a bug. And it was plausible, because there had
been a real one. Subagents used to inherit the parent session's model and ignore
their own pin, and it had been fixed in a recent version. So I went to fix my
repo.

The fix that came to mind was to swap each tier alias for the full model ID. More
explicit, harder for the session to override. Except none of that is true. An
alias and a full ID sit at the same precedence, so there was nothing to make more
explicit. And a hardcoded ID rots quietly as the tier moves under it, while the
alias tracks it. The fix would have been a regression, and I would have shipped it
with confidence. I am glad I read the docs before the diff.

Then the measurement, which is the only part that counts. Instead of trusting the
label in the UI, I read the model recorded on the actual API responses in each
subagent's own transcript. Scout ran on Haiku. The translator ran on Sonnet. The
pins held. There was nothing to fix.

Which left the obvious question. If my agents were on their tiers, what were the
Opus rows?

They were Explore, a built-in agent type. I have no file for it in my repo, so
none of my pins ever touched it, and it does not inherit the session model either.
On the same screen, in the same session, my own pinned scout was sitting on Haiku.
The Opus rows were never evidence about my routing in either direction. I had been
reading a part of the system my repo does not own and treating it as a verdict on
the part it does.

There was one more, and it was the one I was surest about. The transcripts also
said the main session had run on Fable. I knew that was wrong, because my Fable
quota was full, so either it had not run or I had somehow gotten it for free. The
transcript field is the served model, the responses carried real output tokens,
and there was no reroute marker anywhere in the data. Fable ran. A full quota is
exactly what a few hundred Fable calls leave behind. I had been pointing at the
consequence as if it were the contradiction. The only assumption with my name
confidently on it was the one that broke.

I have written this post before. Once it was a rate limiter quietly corrupting a
comparison. Once it was a parser off by a factor of 23. The variable changes. The
shape does not. The label is not the measurement, and the thing you are most sure
of is the thing to check first.
