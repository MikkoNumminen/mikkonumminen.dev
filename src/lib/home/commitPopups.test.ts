import { describe, it, expect } from 'vitest';
import { createCommitPicker, type CommitRecord } from './commitPopups';

/** Terse record builder — the picker only cares about identity here. */
const r = (line: string): CommitRecord => ({ hash: '0000000', line });

// The picker is the pure core of the popup layer: random choice with no
// immediate repeat, falling back to the sentinel pool when the build-time
// commit list is empty.

describe('createCommitPicker', () => {
  it('never returns the same message twice in a row', () => {
    const pick = createCommitPicker([r('a'), r('b'), r('c')]);
    let prev = pick();
    for (let i = 0; i < 200; i++) {
      const next = pick();
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('advances to the neighbour when the RNG repeats an index', () => {
    // RNG pinned to 0 → index 0 every time; the no-repeat rule must step
    // to index 1 on the second draw.
    const pick = createCommitPicker([r('a'), r('b'), r('c')], () => 0);
    expect(pick().line).toBe('a');
    expect(pick().line).toBe('b');
  });

  it('falls back to the sentinel pool when given no messages', () => {
    const pick = createCommitPicker([]);
    const msg = pick();
    expect(msg.line.length).toBeGreaterThan(0);
    // Sentinels mirror the conventional-commit shape of real subjects.
    expect(msg.line).toMatch(/^[a-z]+\([a-z0-9-]+\): .+/);
    expect(msg.hash).toMatch(/^[0-9a-f]{7}$/);
  });

  it('handles a single-message pool without spinning', () => {
    const pick = createCommitPicker([r('only')]);
    expect(pick().line).toBe('only');
    expect(pick().line).toBe('only');
  });
});
