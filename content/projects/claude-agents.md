---
title: claude-agents · cost-routing subagents for Claude Code
project: claude-agents
url: https://github.com/MikkoNumminen/claude-agents
---

# claude-agents

**Stop paying Opus prices for work a cheaper model does just as well.**

claude-agents is a small, global set of cost-routing subagents for Claude Code. The premise: most of what an expensive model spends tokens on (searching a repo, mechanical edits, writing tests to an existing pattern, translating locale files, mining logs, drafting commit messages, reviewing a diff along one lens) does not need the expensive model. The main session keeps the work that actually needs judgement; everything routine routes down to a cheaper tier.

## The agents

Fourteen agents, one markdown file each (frontmatter + instructions), grouped by tier:

- **Haiku, read-only**: `scout` (code recon), `log-miner` (log/CSV/JSONL aggregation), `scribe` (commit/PR text from diffs), `dep-checker` (dependency recon), `tidy` (formatter/lint auto-fix), `refuter` (single-finding refutation)
- **Sonnet, spec-driven edits**: `mechanic` (already-decided mechanical changes), `test-writer`, `locale-translator`, `doc-scribe`, `migrator` (ORM schema migrations), `bisect` (regression pinning), `reviewer` (single-lens diff review)
- **Session model**: `architect`. The one unpinned agent; it inherits the session's model and effort, so deliberate escalation runs at exactly the strength the user chose

The key design point is that each agent pins both the `model:` tier and the `effort:` reasoning cost in its frontmatter: the two scalars are decoupled. A session can run at high effort while its delegated grep-and-report work runs cheap.

Agents auto-detect each project's stack (test runner, linter, i18n layout) instead of hardcoding, so one global set covers JavaScript, C#, and Python repos alike.

### The review pair

`reviewer` and `refuter` exist to make a review fan-out affordable.

`reviewer` (Sonnet, low effort, read-only) takes one named lens from the orchestrator (correctness, accessibility, lifecycle-and-leaks), and reviews a diff along that lens only. Every finding has to name a concrete failure at a specific file:line; "could be fragile" is not a finding. It reports at most a handful, and an empty list is an explicitly valid answer rather than evidence it did not try.

`refuter` (Haiku, low effort, read-only) takes exactly one claimed finding and tries to kill it. It confirms only when it cannot refute, and defaults to refuted when uncertain, on the reasoning that a false finding costs the implementer more attention than a missed minor one.

## The workflow-inheritance gap

The frontmatter pins above are honoured by Claude Code's **Agent tool**. Workflow scripts are a second, separate code path, and they do not read those files.

Inside a workflow script, a bare `agent(prompt, { ... })` call that names no model spawns a generic `workflow-subagent` that inherits the orchestrating session's model and effort, not the tier the frontmatter would have pinned. If the session is running a frontier model at high effort, so is every agent it fans out.

This is silent. Nothing in the transcript announces it. The only tell is in each agent's own metadata, where `agentType` reads `workflow-subagent` instead of the agent's own name.

Measured consequence: five review workflows fanned out roughly 3.8 million subagent tokens at orchestrator rates because no call passed `model`.

The fix is to pass the tier explicitly on every workflow-script `agent()` call:

```js
agent(prompt, { agentType: 'reviewer', model: 'sonnet', effort: 'low' });
```

Passing both `agentType` and an explicit `model`/`effort` is deliberate belt-and-braces: `agentType` resolves from the same registry the Agent tool uses, but the explicit pins make the call correct regardless of that resolution. The rule that follows: treat an unset `model` or `effort` in a workflow script as a bug, not a default.

## The warn-unpinned-workflow-agents hook

`hooks/warn-unpinned-workflow-agents.mjs` is a `PreToolUse` hook that scans a workflow script before it runs and names the `agent()` calls that pin no model.

- **Warn-only by construction**: it exits 1 (advisory), never 2, which is the code Claude Code treats as blocking. Inheriting is sometimes the correct choice (a final synthesis pass usually does want the session model), so the hook is a reminder, not a policy.
- **Escape hatch**: writing `@inherit-model` in a call marks the inheritance as deliberate and skips it.
- **Opt-in**: not installed by `install.sh`; enabling it means registering it in `settings.json` yourself.
- **How it reads a script**: it masks the contents of strings, template literals, comments and regex literals, then counts brackets over what remains. That is what stops prompt text from faking a pin or breaking the span: a `)` inside a prompt, the words `model:` inside a prompt, an apostrophe in a comment, a regex containing `agent(`. Nested calls get their own spans, so an inner call's pin cannot vouch for an unpinned outer one.
- **Known limit**: it is a text scan, not a parser. `agent` reached through an alias, or options spread in from a variable, will fool it. It errs toward silence, so a quiet hook is not evidence.

Verified against 85 real workflow scripts: 73 flagged, 12 silent, and every silent one is genuinely pinned.

## Install

Two mechanisms:

- **Plugin** (recommended): `/plugin marketplace add MikkoNumminen/claude-agents`, then `/plugin install claude-agents`, agents arrive namespaced (`claude-agents:scout`)
- **Script**: `./install.sh` copies or symlinks the agents into `~/.claude/agents/` under bare names, picked up globally by any repo

It is a sibling of `claude-skills` (a know-how library); both are served from a shared plugin marketplace.

## Status

MIT-licensed and public. Actively maintained; fourteen agents plus the opt-in workflow hook as of July 2026.

[GitHub](https://github.com/MikkoNumminen/claude-agents)
