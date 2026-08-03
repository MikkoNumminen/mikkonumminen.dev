/**
 * The shoutbox write path.
 *
 * Posts to the local backend through the same-origin `/api/rag/*` rewrite the
 * chat already uses (ADR 0012), so the browser only ever talks to its own
 * origin. The path lives under the `rag` prefix not because a shoutbox is
 * retrieval-augmented anything, but because that prefix means "the machine at
 * home" and already carries the `x-vercel-enable-rewrite-caching: 0` header
 * block. A new top-level path would have needed its own copy of that.
 *
 * NOTHING HERE PUBLISHES. A successful submit puts a row in a moderation queue.
 * The public site reads a committed JSON snapshot that only changes when the
 * owner approves something and commits it, so this endpoint cannot put text on
 * the page no matter what it accepts.
 */

import { getChatBaseUrl } from '../terminal/chat';

/** What the visitor is told, and nothing about why beyond the backend's words. */
export type SubmitOutcome =
  | { kind: 'queued' }
  /** The gate refused it, with a reason the visitor can act on. */
  | { kind: 'refused'; detail: string }
  /** Network, timeout, 5xx, or the box being switched off. Try again later. */
  | { kind: 'failed' };

const TIMEOUT_MS = 10_000;

/**
 * Submit one message.
 *
 * Never throws. Every failure mode collapses to `failed`, because the visitor
 * can do exactly one thing about any of them and a taxonomy of transport errors
 * is not information they can use.
 *
 * The gate's refusals are different and are passed through verbatim: "that is
 * over 500 characters" is actionable, and inventing our own copy for it here
 * would mean two sources of truth for the same rule.
 */
export async function submitShout(
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitOutcome> {
  const base = getChatBaseUrl();
  // No backend configured (CI, a fork, a local build without the env var) — the
  // component hides the form in that case, so this is belt and braces.
  if (!base) return { kind: 'failed' };

  try {
    const res = await fetchImpl(`${base}/shout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 404 is the box being switched off at the backend (SHOUTBOX_ENABLED=false),
    // which reads to a visitor exactly like the machine being asleep.
    if (!res.ok) return { kind: 'failed' };

    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) return { kind: 'failed' };
    const record = data as { accepted?: unknown; detail?: unknown };

    if (record.accepted === true) return { kind: 'queued' };
    if (typeof record.detail === 'string' && record.detail.trim()) {
      return { kind: 'refused', detail: record.detail };
    }
    return { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}
