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
 * NOT covered, on purpose:
 * - `content/` — the RAG corpus. It is model input rather than rendered copy,
 *   the answers built from it are generated text, and it is a much larger
 *   surface that wants its own pass plus a re-index.
 * - `src/components`, `src/pages`, `src/data` — every em dash in those is
 *   inside a comment or a test fixture.
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
