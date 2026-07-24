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
 * The data pipeline is unchanged from the meteor era: recent commit
 * subjects are baked into a data attribute at build time by
 * HomePage.astro and parsed by the boot script.
 */

const POPUP_LIFETIME_MS = 1900;
const MIN_SPAWN_INTERVAL_MS = 600;

// Sentinel pool used only when build-time `git log` returned nothing
// (e.g. site previewed outside a git checkout). Mirrors the type(scope)
// shape of real entries so a fallback popup is indistinguishable from a
// real one.
const FALLBACK_COMMITS: string[] = [
  'feat(home)',
  'fix(home)',
  'feat(projects)',
  'fix(projects)',
  'chore(lint)',
  'feat(experience)',
  'fix(contact)',
  'feat(observability)',
  'docs(audit)',
  'fix(a11y)',
];

/**
 * Random pick with no immediate repeat — sequential indexing would cycle
 * the ~40-message pool in the same order forever. Pure and exported for
 * the unit test; `random` is injectable for determinism.
 */
export function createCommitPicker(
  messages: string[],
  random: () => number = Math.random,
): () => string {
  const pool = messages.length > 0 ? messages : FALLBACK_COMMITS;
  let lastIdx = -1;
  return (): string => {
    if (pool.length === 1) return pool[0]!;
    let idx = Math.floor(random() * pool.length);
    if (idx === lastIdx) idx = (idx + 1) % pool.length;
    lastIdx = idx;
    // Non-null: idx is always a valid index into the non-empty pool.
    return pool[idx]!;
  };
}

export interface CommitPopupsHandle {
  /** Show one popup at a viewport position. Rate-limited internally. */
  spawn: (clientX: number, clientY: number) => void;
  dispose: () => void;
}

export function buildCommitPopups(messages: string[]): CommitPopupsHandle {
  const pick = createCommitPicker(messages);

  const container = document.createElement('div');
  container.className = 'field-popups';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);

  let lastSpawn = -Infinity;
  let disposed = false;

  return {
    spawn: (clientX: number, clientY: number): void => {
      if (disposed) return;
      const now = performance.now();
      if (now - lastSpawn < MIN_SPAWN_INTERVAL_MS) return;
      lastSpawn = now;

      const el = document.createElement('span');
      el.className = 'field-popup';
      el.textContent = pick();
      el.style.left = `${clientX}px`;
      el.style.top = `${clientY}px`;
      container.appendChild(el);
      // Remove on a timer rather than animationend — the global
      // reduced-motion kill-switch zeroes animation durations, and a
      // popup that never animates must still leave the DOM.
      window.setTimeout(() => el.remove(), POPUP_LIFETIME_MS);
    },
    dispose: (): void => {
      disposed = true;
      container.remove();
    },
  };
}
