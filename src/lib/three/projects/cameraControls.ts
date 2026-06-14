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
