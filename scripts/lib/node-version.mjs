/**
 * Tiny semver-minimum check, dependency-free. Backs `scripts/check-env.mjs`,
 * which compares the running Node against package.json's `engines.node`.
 * Only the `>=X.Y.Z` form this project actually declares is supported — not a
 * general semver range parser.
 */

/** Parse "v22.12.0" / "22.12.0" / ">=22.12.0" into [major, minor, patch]. */
export function parseVersion(spec) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(spec));
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True when `current` is >= the minimum declared in `rangeSpec` (a `>=X.Y.Z`). */
export function meetsMinimum(current, rangeSpec) {
  const cur = parseVersion(current);
  const min = parseVersion(rangeSpec);
  if (!cur || !min) return false;
  for (let i = 0; i < 3; i++) {
    if (cur[i] > min[i]) return true;
    if (cur[i] < min[i]) return false;
  }
  return true; // exactly equal
}
