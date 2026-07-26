---
title: Do the cheap agents pay for themselves? Seven delegations, measured
project: claude-agents
date: 2026-07-26
type: research
---

# Do the cheap agents pay for themselves? Seven delegations, measured

I run a set of cost-routing subagents for Claude Code. Each is pinned to the cheapest model tier that can do its job, and the orchestrating session is supposed to keep only the work that needs judgement. I had never checked whether the arrangement actually pays.

So I instrumented one working session. Seven delegations across two repositories, all of it real work — reviewing pull requests, writing agent definitions, translating a blog post, mapping a corpus — not a benchmark built to be measured.

## The headline numbers

| | Value |
|---|---|
| Delegations | 7 |
| Tokens, Haiku tier | 231,369 |
| Tokens, Sonnet tier | 92,457 |
| Tokens, total | 323,826 |
| Tool calls made by agents | 122 |
| Agent wall-clock | 22.9 min |
| Cost as delegated (upper bound) | $2.08 |
| Same tokens at Opus 5 rates (upper bound) | $8.10 |
| Delegated cost as a share of that | 26% |

Both cost figures are upper bounds, because the runtime reports one token total per agent rather than an input/output split, and I charged every token at the higher output rate. The true figures are lower and the ratio between them is roughly stable, since the input:output price ratio is 1:5 on all three tiers.

## The price gap is narrower than the premise it was built on

The repository's own pitch is "stop paying Opus prices for work a cheaper model does just as well." That framing dates from Opus 4.1 at $15/$75 per million tokens, where Haiku was one fifteenth the price. It is no longer true.

| Model | Input | Output | Share of Opus 5 |
|---|---|---|---|
| Claude Opus 5 | $5 | $25 | — |
| Claude Sonnet 5 | $2 | $10 | 2/5 |
| Claude Haiku 4.5 | $1 | $5 | 1/5 |

The ceiling on delegation savings is now **5x**, and only for the Haiku tier. Sonnet work saves 60%, not 87%. Any claim resting on "roughly fifteen times cheaper" is quoting retired pricing.

There is a second-order effect pointing the other way. Opus 5 and Sonnet 5 use a newer tokenizer that, per Anthropic's own documentation, "produces approximately 30% more tokens for the same text"; Haiku 4.5 predates it. So a Haiku agent's token count and an Opus orchestrator's are not in the same units, and the same work costs more tokens on Opus. That widens the real gap above 5x. I am not going to publish a combined multiple: multiplying a vendor approximation by a price ratio and quoting it to three figures would be exactly the false precision this kind of report exists to avoid.

## What I cannot measure, and will not estimate

The number everyone wants is "how much did delegation save." I cannot produce it honestly.

To compute a saving I would need to know what the same task would have cost had I done it inline, and I have no instrument for my own token consumption. Worse, the two paths are not equivalent in the direction people assume: a subagent starts cold and re-reads context the orchestrator already holds, so it can spend *more* tokens on the same task, not fewer. "Tokens at a cheaper rate" is therefore a comparison between a measured number and an imagined one.

What I can state is narrower and true: **doing this work through cheap agents cost $2.08 at most.** Whether that beats the alternative is unmeasured.

## Quality is the real question, and it splits three ways

Cost only matters if the output is usable. Six of seven outputs were used. Here is the breakdown that actually decides whether the routing earns its place:

| Outcome | Count |
|---|---|
| Found something I had missed | 3 |
| Usable output, no independent find | 3 |
| Net negative — produced a false finding | 1 |

The three finds are the case for delegation, and none of them were things I was going to catch:

- **A stale cached measurement.** A correctness review of a footer-positioning fix noticed that the footer's document position was measured at mount and refreshed only on `resize` — so a late-loading image or a swapped webfont would move the footer without the viewport ever changing size, aiming the correction at where the footer used to be. I had written that code and verified it. I had not thought about reflow.
- **A false positive in my own detector.** A review of a hook I had written — one that scans workflow scripts for unpinned agent calls — found that a regex literal containing `agent(` was scanned as a real call, because the masking covered strings and comments but not regexes.
- **A wrong premise in the task itself.** Reconnaissance on the corpus revealed that the site's blog directory is not indexed at all; the corpus reads a different tree entirely. I had been about to update the wrong files.

## The one that cost me

An accessibility review of the same footer change reported that `prefers-reduced-motion` failed to suppress the new transform, exposing motion-sensitive users to repositioning on scroll.

It was wrong, and rejecting it took a full verification pass: reading three stylesheets to establish that the transform is untransitioned in all three places it appears — deliberately, so it cannot lag scroll — which makes it 1:1 scroll-linked positioning of the same class as `position: sticky`, not the animation that exemption targets. Suppressing it would have restored the original bug for precisely the users the exemption serves.

This is the honest cost of a cheap review tier: at 1 in 7, a false finding is affordable, but it is not free, and the refutation work lands on the expensive model.

## The A/B: neither version won

For one task I did the work twice — a rewrite of a corpus document — once delegated to Sonnet and once myself, from an identical brief.

Neither was better. The delegated version chose two section headings that retrieve better than mine (`The workflow-inheritance gap` beats my prose-shaped alternative for a document that will be chunked and embedded) and worked a concept into the opening paragraph that I had forgotten. Mine chunked better, having split two new agent descriptions into their own subsection where the delegated version crammed them into single oversized bullets, and it was more precise on one identifier.

The shipped document is a merge. Delegated cost for that draft: 23,746 tokens, three tool calls, 27 seconds. As a way to obtain a second complete draft to argue with, that is cheap. As a way to obtain a finished document, it was not — and the framing that treats delegation as "get the output back and use it" is the wrong model.

## Where the routing rule breaks down

The rule I work under names bright-line triggers: a search across three or more files goes to a scout, the same edit repeated across three or more files goes to a mechanic. During this session I hit a case that satisfied the trigger and where following it would have been wrong — three one-line corrections across three corpus files, where writing a brief precise enough to delegate would have taken longer than making the edits.

There is a floor below which delegation costs more than it saves, and the current rule does not express it. The trigger should probably be a conjunction: three or more files **and** enough specification that the brief is shorter than the work.

## Limits

- **n = 7.** One session, one orchestrator model, two repositories, one author. Nothing here is a rate; the 1-in-7 false-finding figure could as easily be 1-in-3 or 1-in-20.
- **The counterfactual is absent by construction**, as described above. No saving is claimed.
- **Outcome grading is mine**, and I graded work I had commissioned. "Found something I had missed" is checkable against the commits it produced; "usable output" is a judgement call.
- **Costs are upper bounds**, charging input tokens at output rates.

## What I changed as a result

Nothing about the tiering. The evidence supports it: three independent catches for $2.08 is a good trade even before any cost comparison, and the one false finding was cheap to reject.

Two things did change. The pricing claim in the repository documentation is being corrected, because "Opus prices" now means a 5x gap and the old framing quietly overstates it. And workflow scripts — a second code path where the pins were never applied at all, and which had silently spent roughly 3.8 million tokens at orchestrator rates — now have documentation, two review-shaped agents to point at, and an opt-in hook that names unpinned calls before a fan-out starts.
