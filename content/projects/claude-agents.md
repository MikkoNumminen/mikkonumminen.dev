---
title: claude-agents — cost-routing subagents for Claude Code
project: claude-agents
url: https://github.com/MikkoNumminen/claude-agents
---

# claude-agents

**Stop paying Opus prices for work a cheaper model does just as well.**

claude-agents is a small, global set of cost-routing subagents for Claude Code. The premise: most of what an expensive model spends tokens on — searching a repo, mechanical edits, writing tests to an existing pattern, translating locale files, mining logs, drafting commit messages — does not need the expensive model. The main session keeps the work that actually needs judgement; everything routine routes down to a cheaper tier.

## The agents

Twelve agents, one markdown file each (frontmatter + instructions), grouped by tier:

- **Haiku, read-only**: `scout` (code recon), `log-miner` (log/CSV/JSONL aggregation), `scribe` (commit/PR text from diffs), `dep-checker` (dependency recon), `tidy` (formatter/lint auto-fix)
- **Sonnet, spec-driven edits**: `mechanic` (already-decided mechanical changes), `test-writer`, `locale-translator`, `doc-scribe`, `migrator` (ORM schema migrations), `bisect` (regression pinning)
- **Session model**: `architect` — the one unpinned agent; it inherits the session's model and effort, so deliberate escalation runs at exactly the strength the user chose

The key design point is that each agent pins both the `model:` tier and the `effort:` reasoning cost in its frontmatter — the two scalars are decoupled. A session can run at high effort while its delegated grep-and-report work runs cheap.

Agents auto-detect each project's stack (test runner, linter, i18n layout) instead of hardcoding, so one global set covers JavaScript, C#, and Python repos alike.

## Install

Two mechanisms:

- **Plugin** (recommended): `/plugin marketplace add MikkoNumminen/claude-agents`, then `/plugin install claude-agents` — agents arrive namespaced (`claude-agents:scout`)
- **Script**: `./install.sh` copies or symlinks the agents into `~/.claude/agents/` under bare names, picked up globally by any repo

It is a sibling of `claude-skills` (a know-how library); both are served from a shared plugin marketplace.

## Status

MIT-licensed and public. Actively maintained as of July 2026.

[GitHub](https://github.com/MikkoNumminen/claude-agents)
