#!/usr/bin/env node
// Read recent commits across every sibling repo in the workspace and write DRAFT
// blog entries into src/content/blog/en/. A manual tool, never a build step:
// it must not appear in prebuild/build, because a build that invents prose is a
// build that publishes prose nobody read.
//
//   node scripts/generate-blog-drafts.mjs              top 3 groups, last 3 days
//   node scripts/generate-blog-drafts.mjs --days=14    widen the window
//   node scripts/generate-blog-drafts.mjs --count=5    write more groups
//   node scripts/generate-blog-drafts.mjs --force      rewrite its own drafts
//
// What it can and cannot do, by construction:
//   - Reads git history only. Every git call goes through `git()`, which
//     refuses any subcommand outside a read-only allowlist and checks the
//     argument shape of the one allowlisted subcommand that can also write, so
//     a later edit that reaches for `add`/`commit`/`push` throws instead of
//     staging work.
//   - Writes only into src/content/blog/en/. Never fi/ or sv/ — a machine
//     summary of English commits is not a translation.
//   - Never overwrites prose a person wrote. An existing path is skipped and
//     logged; --force rewrites only files that carry `aiGenerated: true`, which
//     is exactly the set this script produced.
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

const DEFAULTS = { days: 3, count: 3 };

// `days` becomes a millisecond offset subtracted from now, and a large enough
// value puts the result outside the range Date represents, which surfaces as an
// uncaught RangeError from toISOString rather than as a usage error.
const MAX_DAYS = 3650;
const MAX_COUNT = 100;

// Conventional-commit types that describe upkeep rather than a change in
// behaviour. A group made only of these gets a flat sentence saying so instead
// of a summary that implies something happened.
const HOUSEKEEPING_TYPES = new Set(['chore', 'build', 'ci', 'deps', 'style', 'revert']);

// ---------------------------------------------------------------------------
//  Git — read-only by construction
// ---------------------------------------------------------------------------

const READ_ONLY_SUBCOMMANDS = new Set(['rev-parse', 'symbolic-ref', 'rev-list', 'log']);

// `symbolic-ref` is the one allowlisted subcommand that also writes: a second
// operand repoints the named ref and -d deletes it. Matching on the subcommand
// alone would leave the allowlist claiming a safety property it does not have,
// so the read probe's shape is checked as well.
const SYMBOLIC_REF_READ_FLAGS = new Set(['-q', '--quiet', '--short']);

const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const GIT_TIMEOUT_MS = 60_000;

class GitEnvironmentError extends Error {}

function assertReadOnly(args) {
  const subcommand = args[0] ?? '';
  if (!READ_ONLY_SUBCOMMANDS.has(subcommand)) {
    throw new Error(
      `generate-blog-drafts: refusing non-read-only git call: ${subcommand}`,
    );
  }
  if (subcommand !== 'symbolic-ref') return;
  const rest = args.slice(1);
  const flags = rest.filter((arg) => arg.startsWith('-'));
  const operands = rest.filter((arg) => !arg.startsWith('-'));
  const isReadProbe =
    operands.length === 1 && flags.every((flag) => SYMBOLIC_REF_READ_FLAGS.has(flag));
  if (!isReadProbe) {
    throw new Error(
      `generate-blog-drafts: refusing non-read-only git call: symbolic-ref ${rest.join(' ')}`,
    );
  }
}

// Returns null only for a probe whose ref legitimately does not exist. Every
// other failure throws: a missing binary, a timeout, output past maxBuffer, or
// a directory that is not a repository all otherwise read as a quiet week, and
// the run would exit 0 having found nothing.
function git(cwd, args, { probe = false } = {}) {
  assertReadOnly(args);
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: GIT_MAX_BUFFER,
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    // A numeric status means git ran and chose its exit code. Anything else is
    // ENOENT, the timeout's SIGTERM, or ENOBUFS: git never reported at all.
    const gitAnswered = typeof error?.status === 'number';
    const missingRepo = /not a git repository/i.test(stderr);
    if (probe && gitAnswered && !missingRepo) return null;
    throw new GitEnvironmentError(
      `generate-blog-drafts: git ${args.join(' ')} (in ${cwd}) failed: ` +
        (stderr || error?.message || 'no output'),
    );
  }
}

// ---------------------------------------------------------------------------
//  Workspace discovery
// ---------------------------------------------------------------------------

// A linked worktree's own parent is .claude/worktrees, not the workspace, so
// walking up from __dirname finds the wrong siblings when this runs from a
// worktree. The common git dir always points at the main checkout's .git.
function siteRepoRoot() {
  const commonDir = git(ROOT, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  return path.dirname(commonDir);
}

function discoverRepos(workspace) {
  const repos = [];
  for (const entry of fs.readdirSync(workspace, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(workspace, entry.name);
    const gitEntry = fs.statSync(path.join(dir, '.git'), { throwIfNoEntry: false });
    if (!gitEntry) continue;
    // A linked worktree records its git dir in a .git FILE and shares the
    // history of the checkout it came from, so reading both counts every
    // commit in that repository twice.
    if (!gitEntry.isDirectory()) continue;
    repos.push({ name: entry.name, dir });
  }
  return repos;
}

// ---------------------------------------------------------------------------
//  Ref selection
//
//  HEAD and a remote-tracking ref each hold commits the other does not: a local
//  branch sits behind its remote after a fetch, and unpushed work exists only
//  on HEAD. Reading one ref drops the difference in whichever direction it
//  happens to fall, so every ref that exists is handed to a single `git log`,
//  which walks their union and dedupes the shared history for free.
// ---------------------------------------------------------------------------

function remoteCandidates(dir) {
  const candidates = [];
  const originHead = git(dir, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], {
    probe: true,
  });
  if (originHead) candidates.push(originHead.replace(/^refs\/remotes\//, ''));
  candidates.push('origin/main', 'origin/master');
  const seen = new Set();
  return candidates.filter((ref) => {
    if (seen.has(ref)) return false;
    seen.add(ref);
    return (
      git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
        probe: true,
      }) !== null
    );
  });
}

function selectRefs(dir) {
  if (
    git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { probe: true }) ===
    null
  ) {
    return null;
  }
  return ['HEAD', ...remoteCandidates(dir)];
}

// ---------------------------------------------------------------------------
//  Commit reading
// ---------------------------------------------------------------------------

// ASCII unit/record separators rather than newlines or pipes, because a subject
// carries those routinely and these two almost never. Almost: `git commit
// --cleanup=verbatim` accepts control characters in a message, and one stray
// separator shifts every field after it, so each record is validated rather
// than trusted.
const FIELD_SEP = '\u001f';
const RECORD_SEP = '\u001e';
const SHORT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;

function readCommits(repo, refs, since) {
  const raw = git(repo.dir, [
    'log',
    ...refs,
    '--no-merges',
    `--since=${since}`,
    '--date=short',
    '--format=%ad%x1f%s%x1e',
  ]);
  const commits = [];
  let dropped = 0;
  for (const record of raw.split(RECORD_SEP)) {
    const trimmed = record.trim();
    if (trimmed.length === 0) continue;
    const fields = trimmed.split(FIELD_SEP);
    const date = fields[0] ?? '';
    const subject = (fields[1] ?? '').trim();
    if (fields.length !== 2 || !SHORT_DATE.test(date) || subject.length === 0) {
      dropped += 1;
      continue;
    }
    const match = CONVENTIONAL.exec(subject);
    const scope = match?.[2]?.trim();
    commits.push({
      repo: repo.name,
      date,
      subject,
      type: match?.[1] ?? null,
      // A commit with no scope belongs to its repo rather than to a shared
      // bucket of scopeless commits from everywhere.
      key: scope && scope.length > 0 ? scope : repo.name,
    });
  }
  return { commits, dropped };
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
    lines.push(
      'Nothing in this group changes behaviour. It is dependency and upkeep work.',
    );
  }
  return lines.join(' ');
}

function renderEntry(group, options) {
  const title = `${group.key}: ${plural(group.commits.length, 'commit')} in ${plural(options.days, 'day')}`;
  const description =
    `Generated draft. ${plural(group.commits.length, 'commit')} under the ${group.key} scope ` +
    `in ${joinList(group.repos)}. The summary is machine-written and needs replacing.`;
  const tags = [
    ...new Set([kebab(group.key), ...group.repos.map((r) => kebab(r))]),
  ].slice(0, 5);

  const evidence = group.commits
    .map((c) => `- ${inlineCode(plainPunctuation(c.subject))} (${c.repo}, ${c.date})`)
    .join('\n');

  return `---
title: ${yamlString(title)}
description: ${yamlString(description)}
date: ${yamlString(group.newest)}
locale: en
slug: ${yamlString(kebab(group.key))}
aiGenerated: true
hasAudio: false
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

Add a \`project:\` line to the frontmatter naming which project this is about, using an id from \`src/data/projects.ts\`. The generator cannot guess it, because a group of commits can span more than one repository, and an id that is not on that list fails the build.

An entry is not finished when the English prose is. It still needs the Finnish and Swedish translations at the matching path under \`src/content/blog/\`, and a narration for each locale at \`public/audio/blog/<slug>-<locale>.mp3\` with \`hasAudio\` flipped to \`true\` in that locale's frontmatter. See \`public/audio/blog/README.md\`.
`;
}

// ---------------------------------------------------------------------------
//  Output paths
// ---------------------------------------------------------------------------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

// The generator stamps aiGenerated: true on everything it writes, so it can
// recognise its own output and leave anything else alone. --force is for
// regenerating a stale draft, not for overwriting an entry someone rewrote.
// Returns 'written', 'exists', or 'foreign'. Never checks a path and then acts
// on it: `wx` claims a new path or fails in one step, and the overwrite holds a
// single descriptor across inspect-then-replace so the bytes vetted and the
// bytes truncated belong to the same file no matter what happens to the path.
function writeEntry(file, contents, force) {
  try {
    fs.writeFileSync(file, contents, { flag: 'wx' });
    return 'written';
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  if (!force) return 'exists';

  const fd = fs.openSync(file, 'r+');
  try {
    const frontmatter = FRONTMATTER.exec(fs.readFileSync(fd, 'utf8'))?.[1] ?? '';
    if (!/^aiGenerated:\s*true\s*$/m.test(frontmatter)) return 'foreign';
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, contents, 0, 'utf8');
    return 'written';
  } finally {
    fs.closeSync(fd);
  }
}

// Two group keys are distinct Map keys while differing only in case or
// punctuation ("RAG" in one repo, "rag" in another), and both kebab to one
// slug. Writing them in turn silently keeps whichever landed last.
function findSlugCollision(groups) {
  const claimed = new Map();
  for (const group of groups) {
    const slug = kebab(group.key);
    const owner = claimed.get(slug);
    if (owner) return { slug, first: owner, second: group.key };
    claimed.set(slug, group.key);
  }
  return null;
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
      `  --days=N    commit window, in days, 1 to ${MAX_DAYS} (default ${DEFAULTS.days})\n` +
      `  --count=N   how many themes to write, 1 to ${MAX_COUNT} (default ${DEFAULTS.count})\n` +
      '  --force     rewrite an existing draft this script wrote, recognised by\n' +
      '              aiGenerated: true (default: skip it). A file without that\n' +
      '              flag is hand-written and is skipped even with --force.\n' +
      '\n' +
      'Reads git history and writes files. It never stages, commits, or pushes anything.\n',
  );
}

function parseIntFlag(raw, flag, max) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > max) {
    console.error(
      `generate-blog-drafts: ${flag} needs an integer from 1 to ${max}, got "${raw}"`,
    );
    usage();
    process.exit(1);
  }
  return n;
}

function parseArgs(argv) {
  const out = { ...DEFAULTS, force: false };
  for (const arg of argv) {
    if (arg === '--force') out.force = true;
    else if (arg.startsWith('--days='))
      out.days = parseIntFlag(arg.slice(7), '--days', MAX_DAYS);
    else if (arg.startsWith('--count='))
      out.count = parseIntFlag(arg.slice(8), '--count', MAX_COUNT);
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
  if (repos.length === 0) {
    console.error(
      `generate-blog-drafts: no git repositories under ${workspace}. The site checkout is ` +
        'itself one of them, so an empty result means discovery looked in the wrong place.',
    );
    process.exit(1);
  }

  const commits = [];
  for (const repo of repos) {
    const refs = selectRefs(repo.dir);
    if (!refs) {
      console.log(`  ${repo.name}: no readable HEAD, skipped`);
      continue;
    }
    const found = readCommits(repo, refs, since);
    commits.push(...found.commits);
    const note =
      found.dropped > 0 ? `, ${plural(found.dropped, 'malformed record')} dropped` : '';
    console.log(
      `  ${repo.name}: read ${refs.join(' + ')}, ${plural(found.commits.length, 'commit')}${note}`,
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

  const collision = findSlugCollision(selected);
  if (collision) {
    console.error(
      `generate-blog-drafts: scopes "${collision.first}" and "${collision.second}" both write ` +
        `${collision.slug}.md, so one would replace the other. Nothing written.`,
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const written = [];
  const skipped = [];
  for (const group of selected) {
    const file = path.join(OUT_DIR, `${kebab(group.key)}.md`);
    const rel = path.relative(ROOT, file);
    const outcome = writeEntry(file, renderEntry(group, options), options.force);
    if (outcome === 'exists') {
      skipped.push(rel);
      console.log(`  skipped ${rel} (already exists, pass --force to overwrite)`);
      continue;
    }
    if (outcome === 'foreign') {
      skipped.push(rel);
      console.log(`  skipped ${rel} (not aiGenerated: true, so --force leaves it alone)`);
      continue;
    }
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

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
