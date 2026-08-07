/**
 * Resolving what `download <something>` meant.
 *
 * WHY THIS IS ITS OWN MODULE. The old selection was one line inside the command
 * handler: `targets.filter((t) => args.includes(t.flag))`. Exact string equality
 * against `--flag`, which meant a bare word was not matched and, worse, was not
 * reported either. Only tokens starting with `--` were checked for typos, so
 * `download blindtest` silently printed the generic menu: you named a document
 * and the terminal answered as if you had named nothing. That reads as the
 * terminal ignoring you, which is exactly when a visitor gives up on commands
 * and asks the chat instead.
 *
 * The chat is the part that can be slow, wrong, or shedding load. The command is
 * the part that always works, so it should be the more forgiving of the two, not
 * the less. Hence: bare ids, `--flag` aliases, unique-prefix matching, and an
 * error that names what it did not understand.
 *
 * Pure and DOM-free so every rule below is unit-tested without a terminal.
 */

/** A listing request rather than a download: bare `download`, or a filter word. */
export type DownloadList = { kind: 'list'; tier: 'all' | 'research' };

export type DownloadResolution =
  | DownloadList
  | { kind: 'target'; id: string }
  | { kind: 'ambiguous'; token: string; candidates: string[] }
  | { kind: 'unknown'; token: string; suggestion: string | null };

/**
 * Words that ask to SEE the list rather than to download something. `research`
 * is here because `--research` has been the documented way to list the research
 * trail since PR #312 and is referenced by the site copy and the RAG corpus
 * document, so it has to keep working even though bare `download` now shows
 * everything.
 */
const LIST_TOKENS = new Set(['research', 'list', 'all', 'help']);

/**
 * Shortest token that may match by prefix. Exact ids always match at any length
 * (`cv` is two characters); prefixes need three so a stray letter cannot resolve
 * to a document. `s` would otherwise download the optimization study.
 */
const MIN_PREFIX = 3;

/** Strip the optional `--`, lowercase, and drop surrounding punctuation. */
export function normaliseToken(token: string): string {
  return token
    .replace(/^--?/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

/** Levenshtein, bounded and tiny: it only ever runs on two short ids. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prev = rows[i - 1];
      const cur = rows[i];
      if (!prev || !cur) continue;
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
  }
  return rows[a.length]?.[b.length] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The closest id to a token nobody recognised, or null when nothing is close.
 * Substring first (a visitor typing part of a name means that name), then a
 * bounded edit distance for genuine typos.
 */
export function suggestId(token: string, ids: readonly string[]): string | null {
  if (!token) return null;
  const contains = ids.filter((id) => id.includes(token) || token.includes(id));
  if (contains.length === 1) return contains[0] ?? null;

  let best: string | null = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (const id of ids) {
    const distance = editDistance(token, id);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  // Scale the tolerance with the token: 3 edits on a 4-letter word is not a typo,
  // it is a different word, and a confidently wrong "did you mean" is worse than
  // none at all.
  const tolerance = Math.min(3, Math.max(1, Math.floor(token.length / 3)));
  return bestDistance <= tolerance ? best : null;
}

/**
 * Decide what the arguments to `download` asked for.
 *
 * Precedence is deliberate: a named document wins over a listing word, so
 * "download the research blindtest" downloads rather than lists. Unknown tokens
 * are only reported when nothing else in the line resolved, which keeps a
 * natural phrasing like "download the research documents" working instead of
 * erroring on "the".
 */
export function resolveDownload(
  args: readonly string[],
  ids: readonly string[],
): DownloadResolution {
  const tokens = args.map(normaliseToken).filter((token) => token.length > 0);
  if (tokens.length === 0) return { kind: 'list', tier: 'all' };

  const matched = new Set<string>();
  let listTier: 'all' | 'research' | null = null;
  let firstUnknown: string | null = null;
  let ambiguous: { token: string; candidates: string[] } | null = null;

  for (const token of tokens) {
    if (ids.includes(token)) {
      matched.add(token);
      continue;
    }
    if (LIST_TOKENS.has(token)) {
      // `research` narrows; `list`/`all`/`help` do not. First listing word wins,
      // so `download all research` shows everything rather than flip-flopping.
      listTier ??= token === 'research' ? 'research' : 'all';
      continue;
    }
    if (token.length >= MIN_PREFIX) {
      const prefixed = ids.filter((id) => id.startsWith(token));
      if (prefixed.length === 1) {
        matched.add(prefixed[0] as string);
        continue;
      }
      if (prefixed.length > 1) {
        ambiguous ??= { token, candidates: prefixed };
        continue;
      }
    }
    firstUnknown ??= token;
  }

  const selected = [...matched];
  if (selected.length === 1) return { kind: 'target', id: selected[0] as string };
  if (selected.length > 1) {
    return { kind: 'ambiguous', token: selected.join(' '), candidates: selected };
  }
  if (ambiguous) return { kind: 'ambiguous', ...ambiguous };
  if (listTier) return { kind: 'list', tier: listTier };
  if (firstUnknown) {
    return {
      kind: 'unknown',
      token: firstUnknown,
      suggestion: suggestId(firstUnknown, ids),
    };
  }
  return { kind: 'list', tier: 'all' };
}
