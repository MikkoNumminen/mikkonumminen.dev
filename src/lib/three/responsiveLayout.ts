/**
 * Pure responsive-layout math for the home scene's title and galaxy, lifted out
 * of the resize handler so the non-obvious clamp ordering is unit-testable.
 */

export interface TitleScaleParams {
  /** Viewport CSS width in px. */
  width: number;
  /** Half the visible world width at the title's z-plane (cameraHalfHeight * aspect). */
  visibleHalfWidth: number;
  /** Half the natural (unscaled) width of the widest title line. */
  titleNaturalHalfWidth: number;
  /** World-space breathing room kept to the right of the title. */
  rightPadding: number;
  /** Viewport width at/above which the title sits at full scale. */
  designWidth: number;
  /** Readability floor — the smallest scale we want, slack permitting. */
  minScale: number;
}

/**
 * Resolve the home title's scale.
 *
 * Two pressures combine: a width-based scale (full size at/above `designWidth`,
 * shrinking on narrower viewports) and a frustum-fit cap (so the widest line's
 * right edge never clips on narrow-aspect viewports). The fit cap is HARD
 * (clipping is worse than tiny text); the readability floor is SOFT and yields
 * to the fit cap — applied only when `fitScale` leaves slack for it.
 */
export function responsiveTitleScale(p: TitleScaleParams): number {
  const widthScale = Math.min(1, p.width / p.designWidth);
  const fitScale = (p.visibleHalfWidth - p.rightPadding) / p.titleNaturalHalfWidth;
  const idealScale = Math.min(widthScale, fitScale);
  return Math.min(fitScale, Math.max(p.minScale, idealScale));
}

export interface GalaxyXParams {
  /** Half the visible world width at the galaxy's z-plane. */
  visibleHalfWidth: number;
  /** Radius of the spiral disk. */
  radius: number;
  /** World-space breathing room kept to the left of the disk. */
  leftPadding: number;
  /** Resting (wide-viewport) x position — negative, left of centre. */
  designX: number;
}

/**
 * Resolve the galaxy's x position. On narrow aspects the design x sits outside
 * the visible frustum and would clip the disk on the left, so the centre is
 * pulled toward x=0 just enough to keep the whole disk inside — never further
 * left than `designX` (wide aspects unchanged) and never past x=0 onto the
 * title's side.
 */
export function responsiveGalaxyX(p: GalaxyXParams): number {
  const maxMagnitude = p.visibleHalfWidth - p.radius - p.leftPadding;
  return Math.min(0, Math.max(p.designX, -maxMagnitude));
}
