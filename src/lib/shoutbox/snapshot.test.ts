import { beforeEach, describe, expect, it } from 'vitest';
import {
  SUPPORTED_VERSION,
  formatThreadDate,
  loadSnapshot,
  parseSnapshot,
  resetSnapshotCache,
} from './snapshot';

/**
 * The snapshot is written by a different process, in a different language, on a
 * different machine, and committed by hand. `parseSnapshot` returning null is
 * the only thing between a malformed write and a broken contact page — the
 * skills registry learned that the expensive way, with a blind `as` cast turning
 * a truncated file into an opaque render crash.
 *
 * So these lean on the rejection cases far more than the happy path.
 */

const valid = {
  version: SUPPORTED_VERSION,
  generated_at: '2026-08-02T09:00:00+00:00',
  count: 1,
  threads: [{ id: 7, body: 'nice site', at: '2026-08-01T12:30:00+00:00', reply: null }],
};

describe('parseSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    const parsed = parseSnapshot(valid);
    expect(parsed).not.toBeNull();
    expect(parsed?.threads).toHaveLength(1);
    expect(parsed?.threads[0]?.body).toBe('nice site');
  });

  it('accepts an empty snapshot, which is the normal early state', () => {
    const parsed = parseSnapshot({ ...valid, count: 0, threads: [] });
    expect(parsed?.threads).toEqual([]);
  });

  it('accepts a thread carrying an owner reply', () => {
    const parsed = parseSnapshot({
      ...valid,
      threads: [
        {
          ...valid.threads[0],
          reply: { body: 'thanks', at: '2026-08-01T18:00:00+00:00' },
        },
      ],
    });
    expect(parsed?.threads[0]?.reply?.body).toBe('thanks');
  });

  it('rejects an unknown version rather than half-rendering it', () => {
    // A visitor on a cached bundle can meet a newer file than their JS expects.
    expect(parseSnapshot({ ...valid, version: 2 })).toBeNull();
    expect(parseSnapshot({ ...valid, version: '1' })).toBeNull();
    const { version: _omitted, ...noVersion } = valid;
    expect(parseSnapshot(noVersion)).toBeNull();
  });

  it('rejects a count that disagrees with the thread list', () => {
    // The signature of a truncated or hand-edited file.
    expect(parseSnapshot({ ...valid, count: 5 })).toBeNull();
    expect(parseSnapshot({ ...valid, count: 0 })).toBeNull();
  });

  it('rejects a malformed thread rather than skipping it', () => {
    // Skipping the bad one would publish a silently incomplete list, which is
    // worse than an empty box: nobody would notice.
    for (const bad of [
      { id: 'seven', body: 'x', at: 'now', reply: null },
      { id: 1, body: 42, at: 'now', reply: null },
      { id: 1, body: 'x', at: null, reply: null },
      { id: 1, body: 'x', at: 'now' },
      'not an object',
      null,
    ]) {
      expect(parseSnapshot({ ...valid, threads: [bad] })).toBeNull();
    }
  });

  it('rejects a malformed reply', () => {
    for (const bad of [{ body: 'x' }, { body: 'x', at: 5 }, 'not an object', []]) {
      expect(
        parseSnapshot({ ...valid, threads: [{ ...valid.threads[0], reply: bad }] }),
      ).toBeNull();
    }
  });

  it('rejects non-objects and wrong top-level types', () => {
    for (const bad of [null, undefined, 42, 'string', [], { threads: {} }]) {
      expect(parseSnapshot(bad)).toBeNull();
    }
  });

  it('does not carry unexpected top-level keys through', () => {
    // The reader rebuilds the object field by field, so a stray key in the file
    // cannot reach the renderer.
    const parsed = parseSnapshot({ ...valid, secret: 'leak' });
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed ?? {})).toEqual([
      'version',
      'generated_at',
      'count',
      'threads',
    ]);
  });

  it('does not carry unexpected thread keys through', () => {
    const parsed = parseSnapshot({
      ...valid,
      threads: [{ ...valid.threads[0], ip: '1.2.3.4', status: 'approved' }],
    });
    expect(Object.keys(parsed?.threads[0] ?? {})).toEqual(['id', 'body', 'at', 'reply']);
  });
});

describe('loadSnapshot', () => {
  // Module-level cache; without this each test would see the previous one's result.
  beforeEach(resetSnapshotCache);

  it('returns null on a 404, which is the state before the first approval', async () => {
    const fetchImpl = (async () =>
      new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await loadSnapshot(fetchImpl)).toBeNull();
  });

  it('returns null when the network throws rather than propagating', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(loadSnapshot(fetchImpl)).resolves.toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    const fetchImpl = (async () =>
      new Response('{not json', { status: 200 })) as unknown as typeof fetch;
    expect(await loadSnapshot(fetchImpl)).toBeNull();
  });

  it('returns the parsed snapshot on success', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(valid), { status: 200 })) as unknown as typeof fetch;
    const snapshot = await loadSnapshot(fetchImpl);
    expect(snapshot?.threads[0]?.id).toBe(7);
  });
});

describe('formatThreadDate', () => {
  it('renders a date without a clock', () => {
    // A minute-precise timestamp on an anonymous message invites reading
    // something into when it was sent.
    expect(formatThreadDate('2026-08-01T12:30:00+00:00')).toBe('2026-08-01');
  });

  it('returns empty string for junk rather than "Invalid Date"', () => {
    for (const bad of ['', 'yesterday', 'not-a-date']) {
      expect(formatThreadDate(bad)).toBe('');
    }
  });
});

describe('loadSnapshot caching', () => {
  beforeEach(resetSnapshotCache);

  it('shares one request across repeat visits', async () => {
    // onRoute re-mounts the box on every client-side navigation, so contact ->
    // home -> contact would otherwise be three fetches of the same small file.
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify(valid), { status: 200 });
    }) as unknown as typeof fetch;

    await loadSnapshot(fetchImpl);
    await loadSnapshot(fetchImpl);
    await loadSnapshot(fetchImpl);
    expect(calls).toBe(1);
  });

  it('shares an in-flight request rather than starting a second', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = (async () => {
      calls += 1;
      await gate;
      return new Response(JSON.stringify(valid), { status: 200 });
    }) as unknown as typeof fetch;

    const a = loadSnapshot(fetchImpl);
    const b = loadSnapshot(fetchImpl);
    release?.();
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });

  it('caches a null result too, so a 404 is not re-fetched on every visit', async () => {
    // Absent is the normal state until the first approval; hammering the CDN for
    // a file that is not there yet is the common case, not the rare one.
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    expect(await loadSnapshot(fetchImpl)).toBeNull();
    expect(await loadSnapshot(fetchImpl)).toBeNull();
    expect(calls).toBe(1);
  });
});
