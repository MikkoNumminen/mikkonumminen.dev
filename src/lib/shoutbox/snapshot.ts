/**
 * Reader for the published shoutbox snapshot.
 *
 * The snapshot is a COMMITTED artifact at `public/data/shoutbox.json`, served by
 * the CDN and fetched here at runtime. It deliberately does NOT come from the
 * chat backend: reads therefore never touch the machine at home, so the thread
 * list is up whenever the site is up, not whenever that PC is awake. Only
 * submitting a message needs the backend, and that is gated separately.
 *
 * Same shape as `src/lib/terminal/skills.ts` reading the skills registry, down
 * to the runtime shape-guard — see `parseSnapshot`. That file's docstring records
 * why: it used to trust the JSON with a blind `as` cast, and a truncated file
 * surfaced as an opaque render crash rather than an empty state.
 */

/** One owner reply, published with its message as a thread. */
export interface SnapshotReply {
  body: string;
  at: string;
}

/** One approved message. `reply` is null far more often than not. */
export interface SnapshotThread {
  id: number;
  body: string;
  at: string;
  reply: SnapshotReply | null;
}

export interface Snapshot {
  version: number;
  generated_at: string;
  count: number;
  threads: SnapshotThread[];
}

/**
 * The shape version this reader understands.
 *
 * A visitor on a cached bundle can meet a newer file than their JavaScript
 * expects. Refusing an unknown version degrades to the empty state, which is a
 * far better outcome than half-rendering a structure whose meaning changed.
 */
export const SUPPORTED_VERSION = 1;

const SNAPSHOT_PATH = '/data/shoutbox.json';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseReply(raw: unknown): SnapshotReply | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;
  if (typeof raw.body !== 'string' || typeof raw.at !== 'string') return undefined;
  return { body: raw.body, at: raw.at };
}

/**
 * Runtime shape-guard. Returns null on ANY structural mismatch.
 *
 * Strict on purpose, and strict about the version first: this file is written by
 * a different process, in a different language, on a different machine, and the
 * only thing standing between a malformed write and a broken contact page is
 * this function returning null.
 */
export function parseSnapshot(raw: unknown): Snapshot | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== SUPPORTED_VERSION) return null;
  if (typeof raw.generated_at !== 'string') return null;
  if (typeof raw.count !== 'number') return null;
  if (!Array.isArray(raw.threads)) return null;

  const threads: SnapshotThread[] = [];
  for (const item of raw.threads) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== 'number') return null;
    if (typeof item.body !== 'string') return null;
    if (typeof item.at !== 'string') return null;
    const reply = parseReply(item.reply);
    if (reply === undefined) return null;
    threads.push({ id: item.id, body: item.body, at: item.at, reply });
  }

  // `count` is what the generator claimed; `threads.length` is what arrived. A
  // mismatch means a truncated or hand-edited file, which is exactly the case
  // the empty state exists for.
  if (raw.count !== threads.length) return null;

  return {
    version: raw.version,
    generated_at: raw.generated_at,
    count: raw.count,
    threads,
  };
}

/**
 * Share one in-flight or recent fetch across visits, mirroring `skills.ts`.
 *
 * `onRoute` re-mounts the box on every client-side navigation, so without this a
 * visitor going contact -> home -> contact re-fetches each time. 60s is long
 * enough to cover that and short enough that a fresh deploy shows up on reload.
 *
 * `loadedAt` is stamped at RESOLUTION, not at fetch start: stamping it earlier
 * would shorten the effective TTL by the fetch's own latency. It stays null
 * while in flight, so concurrent callers share the one request.
 */
const CACHE_TTL_MS = 60_000;
let cache: { promise: Promise<Snapshot | null>; loadedAt: number | null } | null = null;

/** Test seam: the cache is module state and would otherwise leak between tests. */
export function resetSnapshotCache(): void {
  cache = null;
}

/**
 * Fetch and validate the snapshot. Never throws, never logs.
 *
 * A missing file is the NORMAL state until the first message is approved, so a
 * 404 is not an error worth surfacing — it renders the empty box, exactly as the
 * skills registry does before its file exists.
 *
 * NO AbortSignal, deliberately. The obvious instinct is to cancel this when the
 * visitor navigates away, and it is wrong here: the response is a small file the
 * next visit wants, and aborting a promise that is shared through the cache above
 * would poison it for every other caller. The component guards its own
 * `.then` with an abort check instead, so a late resolution touches no detached
 * DOM. `cache: 'no-store'` keeps the CDN copy authoritative; the TTL is the only
 * thing doing any caching.
 */
export async function loadSnapshot(
  fetchImpl: typeof fetch = fetch,
): Promise<Snapshot | null> {
  if (cache && (cache.loadedAt === null || Date.now() - cache.loadedAt < CACHE_TTL_MS)) {
    return cache.promise;
  }
  const promise = (async () => {
    try {
      const res = await fetchImpl(SNAPSHOT_PATH, { cache: 'no-store' });
      if (!res.ok) return null;
      return parseSnapshot(await res.json());
    } catch {
      return null;
    }
  })();
  cache = { promise, loadedAt: null };
  void promise.then(() => {
    if (cache?.promise === promise) cache.loadedAt = Date.now();
  });
  return promise;
}

/**
 * `2026-08-02T09:15:00+00:00` -> `2026-08-02`.
 *
 * Date only, no clock. A shoutbox thread is not a chat log, and a minute-precise
 * timestamp on an anonymous message invites reading something into when it was
 * sent. Returns '' for anything unparseable rather than the string `Invalid
 * Date`, so a bad value renders as absent instead of as visible breakage.
 *
 * UTC, not the visitor's local date, and that is a real trade rather than an
 * oversight: a message approved at 01:30 Helsinki time shows the previous day.
 * The alternative makes the rendered date depend on where the reader is sitting,
 * which also makes these tests depend on the machine's timezone — CI runs UTC and
 * this laptop does not. One deterministic date everywhere is worth more than
 * being right about midnight for a date-only stamp.
 */
export function formatThreadDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}
