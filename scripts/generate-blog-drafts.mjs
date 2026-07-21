#!/usr/bin/env node
// Read recent commits across every sibling repo in the workspace and write DRAFT
// blog entries into src/content/blog/en/. A manual tool, never a build step:
// it must not appear in prebuild/build, because a build that invents prose is a
// build that publishes prose nobody read.
//
//   node scripts/generate-blog-drafts.mjs              top 3 groups, last 3 days
//   node scripts/generate-blog-drafts.mjs --days=14    widen the window
//   node scripts/generate-blog-drafts.mjs --count=5    write more groups
//   node scripts/generate-blog-drafts.mjs --force      overwrite existing files
//
// What it can and cannot do, by construction:
//   - Reads git history only. Every git call goes through `git()`, which
//     refuses any subcommand outside a read-only allowlist, so a later edit
//     that reaches for `add`/`commit`/`push` throws instead of staging work.
//   - Writes only into src/content/blog/en/. Never fi/ or sv/ — a machine
//     summary of English commits is not a translation.
//   - Never overwrites. An existing path is skipped and logged; --force is the
//     only way past that.
//   - Every entry carries `draft: true`, so nothing it writes reaches a built
//     page until a human edits the file and flips the flag.
//
// The generated body is deliberately thin. A deterministic script cannot write
// a reflection, so it does not try: it states the commit counts, lists the
// subjects as evidence, and then says plainly that the summary needs replacing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src', 'content', 'blog', 'en');
const WORKTREE_MARKER = path.join('.claude', 'worktrees');

const DEFAULTS = { days: 3, count: 3 };

// Conventional-commit types that describe upkeep rather than a change in
// behaviour. A group made only of these gets a flat sentence saying so instead
// of a summary that implies something happened.
const HOUSEKEEPING_TYPES = new Set(['chore', 'build', 'ci', 'deps', 'style', 'revert']);

// ---------------------------------------------------------------------------
//  Git — read-only by construction
// ---------------------------------------------------------------------------

const READ_ONLY_SUBCOMMANDS = new Set(['rev-parse', 'symbolic-ref', 'rev-list', 'log']);

// The allowlist is the safety property, not the comment above it. Returns null
// on a non-zero exit because half these calls are existence probes for refs
// that legitimately do not exist.
function git(cwd, args) {
  const subcommand = args[0] ?? '';
  if (!READ_ONLY_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`generate-blog-drafts: refusing non-read-only git call: ${subcommand}`);
  }
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
//  Workspace discovery
// ---------------------------------------------------------------------------

// A linked worktree's own parent is .claude/worktrees, not the workspace, so
// walking up from __dirname finds the wrong siblings when this runs from a
// worktree. The common git dir always points at the main checkout's .git.
function siteRepoRoot() {
  const commonDir = git(ROOT, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!commonDir) return ROOT;
  return path.dirname(commonDir);
}

function discoverRepos(workspace) {
  const repos = [];
  for (const entry of fs.readdirSync(workspace, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(workspace, entry.name);
    // A registered worktree carries a .git file and the same history as its
    // parent checkout, so scanning one would double every commit it holds.
    if (dir.includes(WORKTREE_MARKER)) continue;
    if (!fs.existsSync(path.join(dir, '.git'))) continue;
    repos.push({ name: entry.name, dir });
  }
  return repos;
}

// ---------------------------------------------------------------------------
//  Ref selection
//
//  A checkout's local default branch can sit behind its remote, and reading
//  HEAD then silently drops the commits that only exist on origin. Prefer a
//  remote-tracking ref whenever it carries commits HEAD does not.
// ---------------------------------------------------------------------------

function remoteCandidates(dir) {
  const candidates = [];
  const originHead = git(dir, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (originHead) candidates.push(originHead.replace(/^refs\/remotes\//, ''));
  candidates.push('origin/main', 'origin/master');
  const seen = new Set();
  return candidates.filter((ref) => {
    if (seen.has(ref)) return false;
    seen.add(ref);
    return git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null;
  });
}

function countRevs(dir, range) {
  const out = git(dir, ['rev-list', '--count', range]);
  const n = Number.parseInt(out ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

function selectRef(dir) {
  if (git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']) === null) {
    return null;
  }
  for (const ref of remoteCandidates(dir)) {
    const ahead = countRevs(dir, `HEAD..${ref}`);
    if (ahead === 0) continue;
    const localOnly = countRevs(dir, `${ref}..HEAD`);
    const note =
      localOnly > 0
        ? `${ahead} ahead of HEAD, ${localOnly} local-only commit(s) not on the remote`
        : `${ahead} ahead of HEAD`;
    return { ref, note };
  }
  return { ref: 'HEAD', note: 'no remote ref ahead of it' };
}

// ---------------------------------------------------------------------------
//  Commit reading
// ---------------------------------------------------------------------------

// ASCII unit/record separators rather than newlines or pipes: a commit subject
// can contain anything, and these two bytes are the only delimiters git will
// never emit inside one.
const FIELD_SEP = '\u001f';
const RECORD_SEP = '\u001e';
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;

function readCommits(repo, ref, since) {
  const raw = git(repo.dir, [
    'log',
    ref,
    '--no-merges',
    `--since=${since}`,
    '--date=short',
    '--format=%ad%x1f%s%x1e',
  ]);
  if (!raw) return [];
  return raw
    .split(RECORD_SEP)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [date = '', subject = ''] = record.split(FIELD_SEP);
      const match = CONVENTIONAL.exec(subject);
      const scope = match?.[2]?.trim();
      return {
        repo: repo.name,
        date,
        subject,
        type: match?.[1] ?? null,
        // A commit with no scope belongs to its repo rather than to a shared
        // bucket of scopeless commits from everywhere.
        key: scope && scope.length > 0 ? scope : repo.name,
      };
    });
}

// ---------------------------------------------------------------------------
//  Grouping
// ---------------------------------------------------------------------------

function groupCommits(commits) {
  const byKey = new Map();
  for (const commit of commits) {
    const bucket = byKey.get(commit.key);
    if (bucket) bucket.push(commit);
    else byKey.set(commit.key, [commit]);
  }
  const groups = [];
  for (const [key, items] of byKey) {
    items.sort((a, b) => b.date.localeCompare(a.date));
    const dates = items.map((c) => c.date).sort();
    groups.push({
      key,
      commits: items,
      newest: dates[dates.length - 1] ?? '',
      oldest: dates[0] ?? '',
      repos: [...new Set(items.map((c) => c.repo))].sort(),
    });
  }
  // Count first, then recency, then key: a stable order so two runs over the
  // same history pick the same groups.
  groups.sort(
    (a, b) =>
      b.commits.length - a.commits.length ||
      b.newest.localeCompare(a.newest) ||
      a.key.localeCompare(b.key),
  );
  return groups;
}

// ---------------------------------------------------------------------------
//  Text helpers
// ---------------------------------------------------------------------------

// House style for blog copy bans em- and en-dashes. Commit subjects are echoed
// verbatim into the entry, so they are normalised too rather than left as the
// one place the rule leaks.
function plainPunctuation(text) {
  return text.replace(/[—–]/g, '-');
}

function kebab(value) {
  const slug = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : 'untitled';
}

// JSON string syntax is a valid YAML 1.2 double-quoted scalar, so quoting this
// way keeps a subject containing a colon, a quote, or a stray newline from
// breaking the frontmatter it lands in.
function yamlString(value) {
  return JSON.stringify(plainPunctuation(String(value)).replace(/\s+/g, ' ').trim());
}

function yamlStringList(values) {
  return `[${values.map((v) => yamlString(v)).join(', ')}]`;
}

// Commit subjects contain backticks often enough to matter, and a single-tick
// span around one silently renders as broken prose. The fence has to be longer
// than the longest run inside, padded so a leading or trailing tick survives.
function inlineCode(text) {
  const runs = [...text.matchAll(/`+/g)].map((m) => m[0].length);
  const fence = '`'.repeat(Math.max(0, ...runs) + 1);
  const pad = runs.length > 0 ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

function joinList(items) {
  if (items.length === 0) return 'no repositories';
  if (items.length === 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
//  Entry rendering
// ---------------------------------------------------------------------------

function typeBreakdown(commits) {
  const counts = new Map();
  for (const commit of commits) {
    const type = commit.type ?? 'unlabelled';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function machineSummary(group) {
  const breakdown = typeBreakdown(group.commits);
  const window =
    group.oldest === group.newest
      ? `on ${group.newest}`
      : `between ${group.oldest} and ${group.newest}`;
  const lines = [
    `${plural(group.commits.length, 'commit')} under the ${inlineCode(group.key)} scope, ` +
      `in ${joinList(group.repos)}, ${window}.`,
    `By conventional-commit type: ${breakdown.map(([t, n]) => `${t} ${n}`).join(', ')}.`,
  ];
  const onlyHousekeeping = breakdown.every(([type]) => HOUSEKEEPING_TYPES.has(type));
  if (onlyHousekeeping) {
    lines.push('Nothing in this group changes behaviour. It is dependency and upkeep work.');
  }
  return lines.join(' ');
}

function renderEntry(group, options) {
  const title = `${group.key}: ${plural(group.commits.length, 'commit')} in ${plural(options.days, 'day')}`;
  const description =
    `Generated draft. ${plural(group.commits.length, 'commit')} under the ${group.key} scope ` +
    `in ${joinList(group.repos)}. The summary is machine-written and needs replacing.`;
  const tags = [...new Set([kebab(group.key), ...group.repos.map((r) => kebab(r))])].slice(0, 5);

  const evidence = group.commits
    .map((c) => `- ${inlineCode(plainPunctuation(c.subject))} (${c.repo}, ${c.date})`)
    .join('\n');

  return `---
title: ${yamlString(title)}
description: ${yamlString(description)}
date: ${group.newest}
locale: en
slug: ${yamlString(kebab(group.key))}
aiGenerated: true
draft: true
tags: ${yamlStringList(tags)}
---

## What the commits say

${plainPunctuation(machineSummary(group))}

## The commits

${evidence}

## Replace this before publishing

\`scripts/generate-blog-drafts.mjs\` generated this file from git history. Everything above is a count and a list. It is not a reflection on the work and does not claim to be one, because a script that reads commit subjects has no access to why any of them were written.

Rewrite the summary as an account of what the work actually was: what broke, what the constraint turned out to be, what the fix cost. Rewrite the title and description to match. Then set \`draft: false\`.
`;
}

// ---------------------------------------------------------------------------
//  CLI
// ---------------------------------------------------------------------------

function usage() {
  console.log(
    'generate-blog-drafts: write DRAFT blog entries from recent commits across the workspace.\n' +
      '\n' +
      '  usage: node scripts/generate-blog-drafts.mjs [--days=N] [--count=N] [--force]\n' +
      '\n' +
      `  --days=N    commit window, in days (default ${DEFAULTS.days})\n` +
      `  --count=N   how many themes to write (default ${DEFAULTS.count})\n` +
      '  --force     overwrite an existing draft file (default: skip it)\n' +
      '\n' +
      'Reads git history and writes files. It never stages, commits, or pushes anything.\n',
  );
}

function parseIntFlag(raw, flag) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    console.error(`generate-blog-drafts: ${flag} needs a positive integer, got "${raw}"`);
    process.exit(1);
  }
  return n;
}

function parseArgs(argv) {
  const out = { ...DEFAULTS, force: false };
  for (const arg of argv) {
    if (arg === '--force') out.force = true;
    else if (arg.startsWith('--days=')) out.days = parseIntFlag(arg.slice(7), '--days');
    else if (arg.startsWith('--count=')) out.count = parseIntFlag(arg.slice(8), '--count');
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`generate-blog-drafts: unknown argument "${arg}"`);
      usage();
      process.exit(1);
    }
  }
  return out;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspace = path.dirname(siteRepoRoot());
  const since = new Date(Date.now() - options.days * 86_400_000).toISOString();

  console.log(`generate-blog-drafts: workspace ${workspace}`);
  console.log(`generate-blog-drafts: window ${options.days} day(s), since ${since}`);

  const repos = discoverRepos(workspace);
  const commits = [];
  for (const repo of repos) {
    const selected = selectRef(repo.dir);
    if (!selected) {
      console.log(`  ${repo.name}: no readable HEAD, skipped`);
      continue;
    }
    const found = readCommits(repo, selected.ref, since);
    commits.push(...found);
    console.log(
      `  ${repo.name}: ref ${selected.ref} (${selected.note}), ${plural(found.length, 'commit')}`,
    );
  }

  if (commits.length === 0) {
    console.log(
      `\ngenerate-blog-drafts: no commits in the last ${plural(options.days, 'day')} across ` +
        `${plural(repos.length, 'repo')}. Nothing written.`,
    );
    return;
  }

  const groups = groupCommits(commits);
  const selected = groups.slice(0, options.count);
  console.log(
    `\ngenerate-blog-drafts: ${plural(commits.length, 'commit')} in ` +
      `${plural(groups.length, 'group')}, writing the top ${selected.length}`,
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const written = [];
  const skipped = [];
  for (const group of selected) {
    const file = path.join(OUT_DIR, `${kebab(group.key)}.md`);
    const rel = path.relative(ROOT, file);
    if (fs.existsSync(file) && !options.force) {
      skipped.push(rel);
      console.log(`  skipped ${rel} (already exists, pass --force to overwrite)`);
      continue;
    }
    fs.writeFileSync(file, renderEntry(group, options));
    written.push(rel);
    console.log(`  wrote   ${rel} (${plural(group.commits.length, 'commit')})`);
  }

  console.log(
    `\ngenerate-blog-drafts: wrote ${written.length}, skipped ${skipped.length}.\n` +
      'Nothing was staged, committed, or pushed. Every file above is draft: true and\n' +
      'aiGenerated: true, so it stays out of the built site until a human edits it and\n' +
      'flips draft to false. Read the prose first: the summaries are mechanical counts,\n' +
      'not reflections, and they are not publishable as written.',
  );
}

main();
