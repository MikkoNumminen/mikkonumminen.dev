/**
 * Shared constants for the projects scene. Lives here because two siblings
 * (`buildPlanet.ts` and `buildExternalIndicator.ts`) need to agree on the
 * planet base radius — the indicator orbit and pulse rings are sized
 * relative to it.
 */
/**
 * Planet radius before per-project scale. Raised with the tier layout: the
 * orbits were pulled in from a 46-unit spread to 21.4 so the whole system
 * frames, and at the closer camera the old radius left tier-1 planets reading
 * as dots.
 */
export const PLANET_BASE_RADIUS = 1.1;

/**
 * Brightness multiplier for tier-2 projects. Applied to the halo, the
 * self-illumination floor and the orbit line so the outer belt recedes without
 * becoming unreadable.
 */
export const TIER_TWO_DIM = 0.72;
