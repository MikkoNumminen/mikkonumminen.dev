import { describe, it, expect } from 'vitest';
import { createCommitPicker } from './commitPopups';

// The picker is the pure core of the popup layer: random choice with no
// immediate repeat, falling back to the sentinel pool when the build-time
// commit list is empty.

describe('createCommitPicker', () => {
  it('never returns the same message twice in a row', () => {
    const pick = createCommitPicker(['a', 'b', 'c']);
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
    const pick = createCommitPicker(['a', 'b', 'c'], () => 0);
    expect(pick()).toBe('a');
    expect(pick()).toBe('b');
  });

  it('falls back to the sentinel pool when given no messages', () => {
    const pick = createCommitPicker([]);
    const msg = pick();
    expect(msg.length).toBeGreaterThan(0);
    // Sentinels mirror the type(scope) shape of real subjects.
    expect(msg).toMatch(/^[a-z]+\([a-z0-9-]+\)$/);
  });

  it('handles a single-message pool without spinning', () => {
    const pick = createCommitPicker(['only']);
    expect(pick()).toBe('only');
    expect(pick()).toBe('only');
  });
});
