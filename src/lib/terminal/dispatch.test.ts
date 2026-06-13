import { describe, it, expect } from 'vitest';
import { tokenize, tabComplete } from './dispatch';
import { buildCommands } from './commands';
import { getTranslations } from '../../i18n';

// tokenize() and tabComplete() are the pure halves of the dispatcher (the
// DOM-touching handleCommand is exercised at a higher level). tabComplete is
// run against the real command set so the "hidden commands are not offered"
// and "single match completes" rules are pinned against production data.
const commands = buildCommands(getTranslations('en'));

describe('tokenize', () => {
  it('splits on runs of whitespace and trims', () => {
    expect(tokenize('  help   me  ')).toEqual(['help', 'me']);
  });

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('    ')).toEqual([]);
  });

  it('preserves argument order', () => {
    expect(tokenize('download --cv extra')).toEqual(['download', '--cv', 'extra']);
  });
});

describe('tabComplete', () => {
  it('completes a unique prefix and appends a trailing space', () => {
    // Only `help` starts with "he".
    expect(tabComplete('he', commands)).toBe('help ');
  });

  it('leaves the value unchanged when the prefix is ambiguous', () => {
    // Both `contact` and `clear` start with "c".
    expect(tabComplete('c', commands)).toBe('c');
  });

  it('leaves the value unchanged when nothing matches', () => {
    expect(tabComplete('zzz', commands)).toBe('zzz');
  });

  it('does not offer hidden commands', () => {
    // `man` is hidden and is the only command starting with "ma"; with it
    // excluded there is no candidate, so the partial is returned as-is.
    expect(tabComplete('ma', commands)).toBe('ma');
  });

  it('does not complete once past the first token', () => {
    expect(tabComplete('download arg', commands)).toBe('download arg');
  });
});
