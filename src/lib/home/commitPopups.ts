/**
 * Commit-message popups for the home particle field — the presentation
 * half of the easter egg the meteor impact popups used to carry. A small
 * mono-typeset `type(scope)` label rises from a field ripple's origin
 * and fades within a couple of seconds.
 *
 * Strictly click-bound: `spawn` is only ever called from the scene's
 * onRipple callback (plus the once-per-session discoverability hint), so
 * a popup can never appear on its own schedule while someone is reading.
 * Rate-limited so click-mashing reads as ripples, not confetti.
 *
 * Two-tier display: the popup shows a short glimpse of the commit
 * subject, while `spawn` returns the record it picked so the caller can
 * write the fuller line into the field log. Returning it — rather than
 * letting the log pick its own — is what keeps the two agreeing about
 * which commit a given ripple was about.
 */

import { shortenForPopup } from './fieldLog';

const POPUP_LIFETIME_MS = 1900;
const MIN_SPAWN_INTERVAL_MS = 600;

// Sentinel pool used only when build-time `git log` returned nothing
// (e.g. site previewed outside a git checkout). Mirrors the type(scope)
// shape of real entries so a fallback popup is indistinguishable from a
// real one.
const FALLBACK_COMMITS: CommitRecord[] = [
  { hash: '0000000', line: 'feat(home): one continuous particle field' },
  { hash: '0000000', line: 'fix(home): sync restored scroll into the field' },
  { hash: '0000000', line: 'feat(projects): planet selection and zoom' },
  { hash: '0000000', line: 'chore(deps): bump the production dependencies' },
  { hash: '0000000', line: 'docs(decisions): record the field architecture' },
];

/**
 * Random pick with no immediate repeat — sequential indexing would cycle
 * the ~40-message pool in the same order forever. Pure and exported for
 * the unit test; `random` is injectable for determinism.
 */
export function createCommitPicker(
  messages: readonly CommitRecord[],
  random: () => number = Math.random,
): () => CommitRecord {
  const pool = messages.length > 0 ? messages : FALLBACK_COMMITS;
  let lastIdx = -1;
  return (): CommitRecord => {
    if (pool.length === 1) return pool[0]!;
    let idx = Math.floor(random() * pool.length);
    if (idx === lastIdx) idx = (idx + 1) % pool.length;
    lastIdx = idx;
    // Non-null: idx is always a valid index into the non-empty pool.
    return pool[idx]!;
  };
}

/** A commit as baked in by HomePage.astro: short hash plus the first
 *  line of the subject, truncated at build time. */
export interface CommitRecord {
  hash: string;
  line: string;
}

export interface CommitPopupsHandle {
  /** Show one popup at a viewport position. Rate-limited internally.
   *  Returns the record it showed, or null when rate-limited — callers
   *  use it to log the same commit the visitor just saw. */
  spawn: (clientX: number, clientY: number) => CommitRecord | null;
  dispose: () => void;
}

export function buildCommitPopups(messages: readonly CommitRecord[]): CommitPopupsHandle {
  const pick = createCommitPicker(messages);

  const container = document.createElement('div');
  container.className = 'field-popups';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);

  let lastSpawn = -Infinity;
  let disposed = false;

  return {
    spawn: (clientX: number, clientY: number): CommitRecord | null => {
      if (disposed) return null;
      const now = performance.now();
      if (now - lastSpawn < MIN_SPAWN_INTERVAL_MS) return null;
      lastSpawn = now;

      const picked = pick();
      const el = document.createElement('span');
      el.className = 'field-popup';
      // The popup stays a glimpse; the log carries the full first line.
      el.textContent = shortenForPopup(picked.line);
      el.style.left = `${clientX}px`;
      el.style.top = `${clientY}px`;
      container.appendChild(el);
      // Remove on a timer rather than animationend — the global
      // reduced-motion kill-switch zeroes animation durations, and a
      // popup that never animates must still leave the DOM.
      window.setTimeout(() => el.remove(), POPUP_LIFETIME_MS);
      return picked;
    },
    dispose: (): void => {
      disposed = true;
      container.remove();
    },
  };
}
