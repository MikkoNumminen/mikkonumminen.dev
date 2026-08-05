import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * House style for text a reader actually sees.
 *
 * The em dash is the single strongest tell that a machine drafted a piece of
 * copy, and this site publishes under a real name. Nine blog posts were written
 * without one before a tenth arrived with six, which is how the rule got written
 * down; this is the rule with teeth.
 *
 * Scope is deliberately narrow: files that are user-facing PROSE end to end.
 * Code is exempt everywhere, and consistently. The `.ts` locale files are
 * stripped of comments, and every markdown surface skips fenced blocks and
 * inline spans, because both quote real source whose punctuation is not ours to
 * rewrite. A guard that fires on something legitimate gets deleted instead of
 * read, so the exemption is the same on every surface rather than per caller.
 *
 * `docs/decisions` is covered because the ADRs are indexed into the RAG corpus
 * too (bind-mounted as ADR_DIR). They are excluded from retrieval by default,
 * but that is a config flag, not a guarantee.
 *
 * `docs/audits` is covered because four of those documents are the source of
 * PDFs the contact terminal serves, and it is walked recursively because the
 * studies live in dated subdirectories.
 *
 * `content/` prose is covered too: it is the RAG corpus, so it reaches readers
 * as retrieved context behind generated answers. `content/code/` is skipped
 * entirely, for the same reason `.prettierignore` skips it: that is other
 * repositories' source, not our copy.
 *
 * NOT covered, on purpose: `src/components`, `src/pages` and `src/data`, where
 * every em dash is inside a comment or a test fixture.
 */

const EM_DASH = '—';

function stripTsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function offendingLines(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.includes(EM_DASH))
    .map((line) => line.trim().slice(0, 120));
}

/** Offending lines in one markdown file, ignoring fenced blocks and inline code. */
function markdownOffenders(file: string): string[] {
  const offenders: string[] = [];
  let inFence = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
    } else if (!inFence && line.replace(/`[^`]*`/g, '').includes(EM_DASH)) {
      offenders.push(`${file}: ${line.trim().slice(0, 100)}`);
    }
  }
  return offenders;
}

/** Every markdown file under `dir`, recursively, minus any skipped directory. */
function markdownFiles(dir: string, skipDirs: string[] = []): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name)) found.push(...markdownFiles(full, skipDirs));
    } else if (entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found;
}

function offendersUnder(dir: string, skipDirs: string[] = []): string[] {
  return markdownFiles(dir, skipDirs).flatMap(markdownOffenders);
}

describe('no em dashes in user-facing prose', () => {
  it.each(['en', 'fi'])('locale %s carries none', (locale) => {
    const source = readFileSync(join('src/i18n/locales', `${locale}.ts`), 'utf8');
    expect(offendingLines(stripTsComments(source))).toEqual([]);
  });

  it('README carries none', () => {
    expect(markdownOffenders('README.md')).toEqual([]);
  });

  it('no corpus prose file carries one', () => {
    expect(offendersUnder('content', ['code'])).toEqual([]);
  });

  it('no architecture decision record carries one', () => {
    expect(offendersUnder('docs/decisions')).toEqual([]);
  });

  it('no audit or study document carries one', () => {
    expect(offendersUnder('docs/audits')).toEqual([]);
  });

  it('no blog post carries one', () => {
    expect(offendersUnder('src/content/blog')).toEqual([]);
  });
});
