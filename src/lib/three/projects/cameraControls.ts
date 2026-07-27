/**
 * Pure camera-control math for the projects "solar system" orbit camera,
 * extracted from createProjectsScene so the drag / zoom / damping / projection
 * logic is unit-testable (the scene holds the mutable spherical state; these
 * compute the next values). All functions are pure.
 */

/** Clamp the polar (vertical) angle so the camera can't tip over the poles. */
export function clampPolar(polar: number, min: number, max: number): number {
  return polar < min ? min : polar > max ? max : polar;
}

/**
 * Apply a wheel-zoom step to the orbit radius: exponential in the scroll delta
 * (so a notch feels like the same proportional zoom at any distance), clamped
 * to [minRadius, maxRadius].
 */
export function zoomRadius(
  radius: number,
  deltaY: number,
  zoomSpeed: number,
  minRadius: number,
  maxRadius: number,
): number {
  const next = radius * Math.exp(deltaY * zoomSpeed);
  return next < minRadius ? minRadius : next > maxRadius ? maxRadius : next;
}

/** True once a pointer has moved far enough from its press point to count as a drag (not a click). */
export function exceedsDragThreshold(dx: number, dy: number, threshold: number): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/** One damped step toward a target: move `factor` of the remaining distance. */
export function damp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

/** Angular samples around the outermost orbit when solving the camera fit. */
const FIT_SAMPLES = 72;

/**
 * The camera distance at which the whole system fits inside the frustum.
 *
 * Two things make this more than "divide the radius by the frustum angle".
 *
 * The system is a disc rather than a sphere, seen at an angle: it spans its
 * full diameter horizontally but only a foreshortened fraction vertically.
 * Treating the orbit radius as a vertical half-extent pushes the camera about
 * twice as far back as it needs to go on a landscape viewport and leaves the
 * system a small island in the middle of the screen.
 *
 * And the projection is perspective, not orthographic, so the near edge of the
 * disc magnifies. A point can sit inside the frustum measured at the origin's
 * depth and still project off-screen because it is closer to the camera than
 * the origin is — which is exactly how the outer belt escaped the viewport
 * after the first, flatter version of this.
 *
 * So the fit is solved around the orbit: for each sample angle, the distance at
 * which that point clears both frustum planes, taking its own depth into
 * account. The largest wins.
 */
export function fitRadius(
  maxOrbitRadius: number,
  margin: number,
  fovDegrees: number,
  aspect: number,
  /** Camera polar angle from +Y, radians. */
  polar: number,
  minRadius: number,
  maxRadius: number,
): number {
  const tanHalfFov = Math.tan((fovDegrees * Math.PI) / 180 / 2);
  // Camera elevation above the ecliptic. cos(polar) is the vertical squash of
  // the disc; sin(polar) is how much of a point's offset lies along the view
  // axis, i.e. how much closer to the camera it is than the origin.
  const vertical = Math.abs(Math.cos(polar));
  const towardCamera = Math.abs(Math.sin(polar));

  let needed = minRadius;
  for (let i = 0; i < FIT_SAMPLES; i++) {
    const a = (i / FIT_SAMPLES) * Math.PI * 2;
    // Point on the outermost orbit, in a frame where the camera looks down -z.
    const lateral = Math.abs(maxOrbitRadius * Math.cos(a));
    const depthOffset = maxOrbitRadius * Math.sin(a) * towardCamera;
    const rise = Math.abs(maxOrbitRadius * Math.sin(a) * vertical);
    // Clearing width and height at this point's own depth.
    const byWidth = (lateral + margin) / (tanHalfFov * aspect) + depthOffset;
    const byHeight = (rise + margin) / tanHalfFov + depthOffset;
    needed = Math.max(needed, byWidth, byHeight);
  }
  return needed > maxRadius ? maxRadius : needed;
}

/** Project spherical orbit coords (azimuth, polar, radius) to a Cartesian offset. */
export function sphericalToCartesian(
  azimuth: number,
  polar: number,
  radius: number,
): { x: number; y: number; z: number } {
  const sinPolar = Math.sin(polar);
  return {
    x: radius * sinPolar * Math.sin(azimuth),
    y: radius * Math.cos(polar),
    z: radius * sinPolar * Math.cos(azimuth),
  };
}
