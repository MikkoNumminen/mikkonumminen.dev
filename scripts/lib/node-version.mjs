/**
 * Tiny semver-minimum check, dependency-free. Backs `scripts/check-env.mjs`,
 * which compares the running Node against package.json's `engines.node`.
 * Supports the two forms this project has declared: `>=X.Y.Z` (any newer
 * version) and `^X.Y.Z` (same major, at least X.Y.Z) — not a general semver
 * range parser.
 */

/** Parse "v22.12.0" / "22.12.0" / ">=22.12.0" / "^24.22.1" into [major, minor, patch]. */
export function parseVersion(spec) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(spec));
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True when `current` satisfies `rangeSpec` (a `>=X.Y.Z` or `^X.Y.Z`). */
export function meetsMinimum(current, rangeSpec) {
  const cur = parseVersion(current);
  const min = parseVersion(rangeSpec);
  if (!cur || !min) return false;
  if (/^\s*\^/.test(String(rangeSpec)) && cur[0] !== min[0]) return false;
  for (let i = 0; i < 3; i++) {
    if (cur[i] > min[i]) return true;
    if (cur[i] < min[i]) return false;
  }
  return true; // exactly equal
}
