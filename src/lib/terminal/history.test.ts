import { describe, it, expect } from 'vitest';
import { History } from './history';

// The History class is the bash-style up/down recall behind the terminal
// prompt. The subtle parts — consecutive-duplicate suppression, the 100-entry
// cap, and the "draft" buffer that restores in-progress input when you arrow
// back down past the newest entry — are exactly the bits a refactor could
// quietly break, so they're pinned here.

describe('History.push', () => {
  it('ignores empty and whitespace-only lines', () => {
    const h = new History();
    h.push('');
    h.push('   ');
    expect(h.prev('draft')).toBeNull();
  });

  it('suppresses a consecutive duplicate of the most recent entry', () => {
    const h = new History();
    h.push('a');
    h.push('b');
    h.push('b'); // duplicate of the tail — must not create a second 'b'
    expect(h.prev('')).toBe('b');
    expect(h.prev('')).toBe('a');
    // Only two distinct entries exist; arrowing past the oldest stays on it.
    expect(h.prev('')).toBe('a');
  });

  it('keeps a non-consecutive repeat as its own entry', () => {
    const h = new History();
    h.push('a');
    h.push('b');
    h.push('a'); // not a duplicate of the tail ('b') — genuinely new
    expect(h.prev('')).toBe('a');
    expect(h.prev('')).toBe('b');
    expect(h.prev('')).toBe('a');
  });

  it('caps at 100 entries, dropping the oldest', () => {
    const h = new History();
    // 101 distinct pushes → c0 is shifted out, c1..c100 remain.
    for (let i = 0; i <= 100; i++) h.push(`c${i}`);
    let last: string | null = null;
    // Arrow all the way to the top; the deepest reachable entry is c1, never c0.
    for (let i = 0; i < 200; i++) {
      const v = h.prev('');
      if (v !== null) last = v;
    }
    expect(last).toBe('c1');
  });
});

describe('History navigation', () => {
  it('returns null when there is no history', () => {
    const h = new History();
    expect(h.prev('draft')).toBeNull();
    expect(h.next()).toBeNull();
  });

  it('walks back through entries newest-first and clamps at the oldest', () => {
    const h = new History();
    h.push('first');
    h.push('second');
    expect(h.prev('')).toBe('second');
    expect(h.prev('')).toBe('first');
    expect(h.prev('')).toBe('first'); // clamped
  });

  it('captures the in-progress draft on first prev and restores it on the way down', () => {
    const h = new History();
    h.push('cmd');
    expect(h.prev('typed-but-not-entered')).toBe('cmd');
    // next() past the newest entry returns the captured draft, then null.
    expect(h.next()).toBe('typed-but-not-entered');
    expect(h.next()).toBeNull();
  });

  it('reset() clears the cursor and draft', () => {
    const h = new History();
    h.push('a');
    h.prev('draft');
    h.reset();
    // After reset, next() has nothing to descend to.
    expect(h.next()).toBeNull();
  });
});
