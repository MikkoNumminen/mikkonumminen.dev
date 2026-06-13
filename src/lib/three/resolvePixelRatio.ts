/**
 * Clamp a device pixel ratio to a hard cap. Shared by `createRenderer` (at
 * init) and `createResizeHandler` (on every resize) so the two paths can never
 * drift — a past regression set the resize cap to a hardcoded 2 while init used
 * 1.5, silently undoing the low-perf path on retina displays (full audit E-MA1).
 *
 * The default cap of 1.5 is ~56% of the pixel work of DPR 2 while staying
 * sharper than 1; see `CreateRendererOptions.maxPixelRatio`.
 */
export function resolvePixelRatio(devicePixelRatio: number, maxPixelRatio = 1.5): number {
  return Math.min(devicePixelRatio, maxPixelRatio);
}
