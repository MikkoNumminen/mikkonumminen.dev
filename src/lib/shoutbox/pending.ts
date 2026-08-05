/**
 * The visitor's own just-submitted messages, held in their browser only.
 *
 * WHY THIS EXISTS. Accepting a submission puts a row in a moderation queue and
 * changes nothing else. The published thread list is a committed snapshot that
 * moves only when the owner approves, publishes and commits, which is days, not
 * seconds. Before this, a visitor pressed send, watched their text vanish from
 * the input, read one line of status, and had no evidence afterwards that they
 * had written anything at all.
 *
 * WHAT IT IS NOT. Nothing here publishes, and nothing here is shared. These
 * entries live in one browser's localStorage and are rendered as visibly
 * unpublished. ADR 0017's property is that nothing a visitor does can put their
 * text on the page; showing someone their own pending text, in their own
 * browser, marked as pending, does not weaken that. Rendering it must still go
 * through `textContent` like every other body on this page.
 *
 * THE HONESTY PROBLEM this file is mostly about: rejection is a DELETE with no
 * undo and no notification. A stored "waiting for approval" entry for a message
 * the owner rejected would otherwise sit there telling that person a lie
 * forever. So entries expire (`MAX_AGE_MS`), and they are dropped as soon as
 * their text turns up in the published snapshot. An entry that is neither
 * published nor expired is the only case where "waiting" is still true, and it
 * is the only case that renders.
 */

const STORAGE_KEY = 'mn_shoutbox_pending';

/**
 * After this, a still-unpublished entry stops claiming to be waiting. Long
 * enough to cover a slow moderation round, short enough that a rejected message
 * does not haunt the box. There is no signal that distinguishes "rejected" from
 * "not looked at yet", so this is a timeout on a question that has no answer.
 */
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A cap, not a quota. One person cannot have many messages genuinely in flight,
 * so a longer list means something is wrong (a script, a stuck queue), and an
 * unbounded list in storage is a leak rather than a feature.
 */
export const MAX_ENTRIES = 5;

export interface PendingMessage {
  /** Exactly what was submitted, after the gate accepted it. */
  body: string;
  /** Epoch milliseconds. Used for the stamp and for expiry. */
  at: number;
}

/**
 * localStorage is not a given: Safari in private mode has thrown on write, and
 * a browser with storage disabled throws on mere access. Every path here treats
 * that as "no memory available" rather than an error worth surfacing, because
 * the feature this backs is a convenience and the submission already succeeded.
 */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is PendingMessage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { body?: unknown; at?: unknown };
  return (
    typeof record.body === 'string' &&
    record.body.length > 0 &&
    typeof record.at === 'number' &&
    Number.isFinite(record.at)
  );
}

function write(store: Storage, entries: PendingMessage[]): void {
  try {
    if (entries.length === 0) store.removeItem(STORAGE_KEY);
    else store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded, or storage disabled between read and write. The visitor's
    // message is queued either way; losing the local echo is not worth a throw.
  }
}

/**
 * Every stored entry, unfiltered. Anything that is not a well-formed array of
 * well-formed entries reads as empty, so a corrupt or hand-edited value
 * degrades to "no pending messages" instead of throwing inside a render.
 */
function readRaw(store: Storage): PendingMessage[] {
  let parsed: unknown;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isEntry);
}

/**
 * The entries that are still honestly "waiting": not expired, and not present in
 * the published snapshot.
 *
 * Matching on body text rather than an id is deliberate. The submit response
 * carries no id (`{"accepted": true}` and nothing else), and the queue id is
 * never exposed to the browser, so the text is the only handle the client has.
 * The duplicate gate makes the same text inside the window collide anyway, so
 * two distinct pending entries cannot share one body.
 *
 * Prunes storage as a side effect: reading is the only moment this code reliably
 * runs, so it is also the only reliable moment to forget things.
 */
export function readPending(
  publishedBodies: readonly string[] = [],
  now = Date.now(),
): PendingMessage[] {
  const store = storage();
  if (!store) return [];

  const published = new Set(publishedBodies);
  const stored = readRaw(store);
  const live = stored.filter(
    (entry) => now - entry.at < MAX_AGE_MS && !published.has(entry.body),
  );

  if (live.length !== stored.length) write(store, live);
  return live;
}

/**
 * Remember one accepted submission. Call it only after the backend said yes: a
 * refused message is not waiting for anything.
 *
 * Re-submitting text that is already stored refreshes nothing and adds nothing,
 * so a double send cannot produce two identical pending entries.
 */
export function addPending(body: string, now = Date.now()): PendingMessage[] {
  const store = storage();
  if (!store) return [];

  const existing = readRaw(store).filter((entry) => entry.body !== body);
  const next = [...existing, { body, at: now }].slice(-MAX_ENTRIES);
  write(store, next);
  return next;
}

/** Forget everything. Exists for tests and for a future "clear" affordance. */
export function clearPending(): void {
  const store = storage();
  if (!store) return;
  write(store, []);
}
