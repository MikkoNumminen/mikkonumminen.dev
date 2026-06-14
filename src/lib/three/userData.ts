/**
 * Guarded reads of Three.js `Object3D.userData`.
 *
 * Three.js types `userData` as `Record<string, any>`, so reads like
 * `mesh.userData.line as number` are unchecked assertions at a boundary we set
 * ourselves — if a key were ever absent or mistyped, the bare cast would feed
 * `NaN`/`undefined` downstream silently rather than failing loudly. These
 * helpers validate the runtime type and fall back, turning that self-made
 * boundary into a checked one. Pure and unit-tested; callers stay readable.
 */

/** A minimal structural view of anything carrying a Three.js-style `userData` bag. */
interface HasUserData {
  userData: Record<string, unknown>;
}

/** Read a finite number from `userData[key]`, or `fallback` (default 0) if missing/non-numeric. */
export function userDataNumber(obj: HasUserData, key: string, fallback = 0): number {
  const v = obj.userData[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Read a string from `userData[key]`, or `undefined` if missing/non-string. */
export function userDataString(obj: HasUserData, key: string): string | undefined {
  const v = obj.userData[key];
  return typeof v === 'string' ? v : undefined;
}
