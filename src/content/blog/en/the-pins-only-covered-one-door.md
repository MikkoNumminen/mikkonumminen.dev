---
title: 'The pins only covered one door'
description: 'Every one of my agents was pinned to a cheap model. Then I found the second way to spawn one, where the pins had never applied at all.'
date: 2026-07-26
locale: en
slug: the-pins-only-covered-one-door
aiGenerated: true
tags: ['Claude Code', 'agents', 'cost-routing', 'workflows']
---

Five days ago I checked whether my cost-routing agents were really running on the
models I had pinned them to. They were. I read the model recorded on the actual
API responses rather than the label in the interface, and every pin held. That
much was true. The sentence I built on top of it was bigger than the thing I had
measured.

The pins live in frontmatter, one file per agent, and the Agent tool honours them.
That is one way to spawn a subagent. It is not the only one. A workflow script
fans work out with `agent(prompt, options)` calls, and those take a different code
path. A call that names no model gets a generic worker that inherits the
orchestrating session's model and effort instead.

So while I was confirming that scout ran on Haiku, my review workflows were
fanning out a dozen agents at a time, every one of them on whatever the session
happened to be. Which was Opus at high effort, because that is what I set for the
work I deliberately keep on the main session.

Nothing announced this. It shows in one place only, in each agent's own metadata,
where the type reads workflow-subagent instead of the agent's name. Five review
workflows had gone out that way. Between them they spent roughly 3.8 million
tokens at orchestrator rates, and the reviews were not five times better for it.

The repair was three things. The gap is written down in the README now, because
the next person to trip over it will be me. Two new agents, a reviewer and a
refuter, give a review fan-out something cheap to point at: one lens over a diff
on Sonnet, one adversarial pass per finding on Haiku. And an opt-in hook reads a
workflow script before it runs and names the calls that pin nothing.

The hook is warn-only on purpose. It exits with the code that surfaces a message
rather than the code that blocks the call, because inheriting is sometimes the
right answer. A final synthesis pass usually does want the session model. The
point is to make the choice visible, not to make it for you.

It was also wrong twice before it was right, in ways my own tests had not thought
to ask about. It finds calls by scanning text, so an unpinned call whose prompt
happened to contain the words model: read as pinned, and a nested call let the
inner pin vouch for the outer one. Both came from treating the whole call as code.
It now blanks out strings, template literals and comments first, and counts
brackets over what is left.

Then the only part that settles anything. I replayed it over the 85 workflow
scripts sitting on this machine from months of real work. It flagged 73 and stayed
quiet on 12, and all 12 are genuinely pinned. So it is not hypothetical. It would
have fired on the large majority of workflows I have ever run, including all five
of the expensive ones.

The agents, the hook, and the ladder that decides what routes where are public at
[github.com/MikkoNumminen/claude-agents](https://github.com/MikkoNumminen/claude-agents).

Last time the lesson was that the label is not the measurement. This one sits
right next to it. I had measured one door carefully and then described the whole
building. A pin that covers one code path is worth exactly one code path, and
everything past that was me generalising from a true result.
