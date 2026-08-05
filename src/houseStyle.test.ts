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
 * Code comments are exempt, and the repo's comments are verbose on purpose, so
 * the `.ts` locale files are stripped of comments before checking rather than
 * scanned raw. A guard that fires on something legitimate gets deleted instead
 * of read.
 *
 * `docs/decisions` is covered because the ADRs are indexed into the RAG corpus
 * too (bind-mounted as ADR_DIR). They are excluded from retrieval by default,
 * but that is a config flag, not a guarantee.
 *
 * `content/` prose is covered too: it is the RAG corpus, so it reaches readers
 * as retrieved context behind generated answers. Code fences inside it are
 * skipped, and `content/code/` is skipped entirely, for the same reason
 * `.prettierignore` skips it: that is other repositories' source, not our copy.
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

describe('no em dashes in user-facing prose', () => {
  it.each(['en', 'fi'])('locale %s carries none', (locale) => {
    const source = readFileSync(join('src/i18n/locales', `${locale}.ts`), 'utf8');
    expect(offendingLines(stripTsComments(source))).toEqual([]);
  });

  it('README carries none', () => {
    expect(offendingLines(readFileSync('README.md', 'utf8'))).toEqual([]);
  });

  it('no corpus prose file carries one', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'code') walk(full);
        } else if (entry.name.endsWith('.md')) {
          let inFence = false;
          readFileSync(full, 'utf8')
            .split('\n')
            .forEach((line) => {
              if (line.trimStart().startsWith('```')) inFence = !inFence;
              else if (!inFence && line.includes(EM_DASH))
                offenders.push(`${full}: ${line.trim().slice(0, 100)}`);
            });
        }
      }
    };
    walk('content');
    expect(offenders).toEqual([]);
  });

  it('no architecture decision record carries one', () => {
    const offenders: string[] = [];
    for (const file of readdirSync('docs/decisions')) {
      if (!file.endsWith('.md')) continue;
      let inFence = false;
      readFileSync(join('docs/decisions', file), 'utf8')
        .split('\n')
        .forEach((line) => {
          if (line.trimStart().startsWith('```')) inFence = !inFence;
          else if (!inFence && line.includes(EM_DASH))
            offenders.push(`${file}: ${line.trim().slice(0, 100)}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('no audit or study document carries one', () => {
    const offenders: string[] = [];
    // Recursive: the studies live in dated subdirectories, not only at the top.
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.md')) {
          let inFence = false;
          readFileSync(full, 'utf8')
            .split('\n')
            .forEach((line) => {
              if (line.trimStart().startsWith('```')) inFence = !inFence;
              // Inline code quotes real source; its punctuation is not ours to fix.
              else if (!inFence && line.replace(/`[^`]*`/g, '').includes(EM_DASH))
                offenders.push(`${full}: ${line.trim().slice(0, 100)}`);
            });
        }
      }
    };
    walk('docs/audits');
    expect(offenders).toEqual([]);
  });

  it('no blog post carries one', () => {
    const offenders: string[] = [];
    for (const locale of readdirSync('src/content/blog')) {
      const dir = join('src/content/blog', locale);
      for (const file of readdirSync(dir)) {
        const found = offendingLines(readFileSync(join(dir, file), 'utf8'));
        if (found.length > 0) offenders.push(`${locale}/${file}: ${found[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
