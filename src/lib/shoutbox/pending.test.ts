import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addPending, MAX_AGE_MS, MAX_ENTRIES, readPending } from './pending';

/**
 * The pending echo's whole risk is telling someone their message is waiting when
 * it is not. Rejection is a DELETE with no undo and no notification, so nothing
 * ever arrives to say "stop waiting" — expiry and the published-snapshot check
 * are the only two things that end the claim. These pin both, plus the failure
 * modes of the storage it lives in.
 */

const KEY = 'mn_shoutbox_pending';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readPending', () => {
  it('returns what was added', () => {
    addPending('hello there', 1000);
    expect(readPending([], 1000)).toEqual([{ body: 'hello there', at: 1000 }]);
  });

  it('drops an entry once its text appears in the published snapshot', () => {
    addPending('hello there', 1000);
    expect(readPending(['hello there'], 1000)).toEqual([]);
  });

  it('forgets a published entry rather than re-filtering it every load', () => {
    addPending('hello there', 1000);
    readPending(['hello there'], 1000);
    // The snapshot argument is empty this time: if the entry survived in
    // storage it would come back, which is the bug this asserts against.
    expect(readPending([], 1000)).toEqual([]);
  });

  it('expires an entry that was never published', () => {
    addPending('into the void', 0);
    expect(readPending([], MAX_AGE_MS - 1)).toHaveLength(1);
    expect(readPending([], MAX_AGE_MS)).toEqual([]);
  });

  it('reads corrupt storage as empty rather than throwing', () => {
    window.localStorage.setItem(KEY, 'not json at all');
    expect(readPending()).toEqual([]);
  });

  it('discards entries of the wrong shape', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        { body: 'good', at: 5 },
        { body: 'no timestamp' },
        { at: 9 },
        null,
        'nope',
      ]),
    );
    expect(readPending([], 5)).toEqual([{ body: 'good', at: 5 }]);
  });

  /**
   * The server stores its own normalised form (NFKC,each line stripped, blank runs
   * collapsed) and never tells the browser what it was. Comparing raw text
   * against the published copy therefore fails on the most ordinary input there
   * is: a message with a trailing newline. The echo would then sit next to the
   * published copy of itself, still claiming to be waiting.
   */
  it('clears an echo whose published copy differs in INTERNAL whitespace', () => {
    // The server strips each line at both ends, so this is what gets published.
    // Trimming the stored copy cannot reach the difference: it is in the middle.
    addPending('hello  \n  there', 1000);
    expect(readPending(['hello\nthere'], 1000)).toEqual([]);
  });

  it('clears an echo whose published copy differs in invisible characters', () => {
    addPending('hello\u200bthere', 1000);
    expect(readPending(['hellothere'], 1000)).toEqual([]);
  });

  it('reads a non-array payload as empty', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ body: 'wrong container', at: 1 }));
    expect(readPending()).toEqual([]);
  });
});

describe('addPending', () => {
  it('does not store the same text twice', () => {
    addPending('same text', 1000);
    addPending('same text', 2000);
    // Kept once, at the newer timestamp: the duplicate gate would refuse the
    // second submission anyway, so two entries could never both be waiting.
    expect(readPending([], 2000)).toEqual([{ body: 'same text', at: 2000 }]);
  });

  it('stores the trimmed text, which is closer to what will be published', () => {
    addPending('  padded  ', 1000);
    expect(readPending([], 1000)).toEqual([{ body: 'padded', at: 1000 }]);
  });

  it('treats a whitespace-only variant as the same message, not a second one', () => {
    addPending('same text', 1000);
    addPending('same text\n', 2000);
    expect(readPending([], 2000)).toEqual([{ body: 'same text', at: 2000 }]);
  });

  it('keeps only the newest MAX_ENTRIES', () => {
    for (let i = 0; i < MAX_ENTRIES + 3; i += 1) addPending(`message ${i}`, 1000 + i);
    const stored = readPending([], 1000);
    expect(stored).toHaveLength(MAX_ENTRIES);
    expect(stored[0]?.body).toBe(`message ${3}`);
  });
});

describe('when storage is unavailable', () => {
  /**
   * A browser with storage disabled throws on ACCESS, not on use, so the guard
   * has to wrap the property read itself. Safari in private mode has historically
   * thrown on write instead, which is the second case below.
   */
  it('survives localStorage throwing on access', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('storage disabled');
      },
    });
    expect(() => addPending('anything')).not.toThrow();
    expect(readPending()).toEqual([]);
  });

  it('survives setItem throwing on a full quota', () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    vi.stubGlobal('window', { localStorage: store });
    expect(() => addPending('anything')).not.toThrow();
  });
});
