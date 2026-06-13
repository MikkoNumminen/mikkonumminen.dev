import { Color } from 'three';

/**
 * Deterministic procedural-texture kernel for the planet diffuse/bump maps —
 * value-noise fBm, seeded RNG, string hashing, and palette ramps. Extracted
 * from buildPlanetTexture so the pure math is testable in isolation (the
 * texture painting itself is 2d-canvas-bound and can't run headless). Every
 * function here is pure: same inputs → same outputs, no DOM, no WebGL.
 */

export type Rgb = readonly [number, number, number];

/**
 * Derive a 4-stop dark→light palette from a base color, preserving hue and
 * stepping lightness/saturation. Returns integer RGB triples in [0,255].
 */
export function derivePalette(baseColor: number): readonly [Rgb, Rgb, Rgb, Rgb] {
  const c = new Color(baseColor);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const stops: Color[] = [
    new Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.5), 0.04),
    new Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.75), Math.max(0.1, hsl.l * 0.3)),
    new Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9), Math.max(0.22, hsl.l * 0.55)),
    new Color().setHSL(
      hsl.h,
      Math.min(1, hsl.s * 0.7),
      Math.max(0.55, Math.min(0.85, hsl.l * 0.95)),
    ),
  ];
  return stops.map(
    (s) => [Math.round(s.r * 255), Math.round(s.g * 255), Math.round(s.b * 255)] as Rgb,
  ) as unknown as readonly [Rgb, Rgb, Rgb, Rgb];
}

/** Sample a 4-stop palette at `t` in [0,1] (clamped), linearly across the three segments. */
export function sampleRamp(palette: readonly [Rgb, Rgb, Rgb, Rgb], t: number): Rgb {
  const [p0, p1, p2, p3] = palette;
  const f = Math.max(0, Math.min(1, t)) * 3;
  const i = Math.min(Math.floor(f), 2);
  const k = f - i;
  const a = i === 0 ? p0 : i === 1 ? p1 : p2;
  const b = i === 0 ? p1 : i === 1 ? p2 : p3;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Fractional Brownian motion: `octaves` of value noise summed at halving amplitude / doubling frequency, normalized to ~[0,1). */
export function fbm3(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves: number,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 131);
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / max;
}

/** Trilinearly-interpolated value noise over the integer lattice; returns [0,1). */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = smooth(xf);
  const v = smooth(yf);
  const w = smooth(zf);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** Smoothstep easing (3t² − 2t³) used to ease the lattice interpolation. */
export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Integer-lattice hash → [0,1). Deterministic per (x,y,z,seed). */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 2147483647) ^
    Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 16777216) / 16777216;
}

/** Mulberry32 seeded PRNG: returns a function yielding successive [0,1) values. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → uint32. Stable across runs; used to seed per-planet noise. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Clamp a value to the [0,255] byte range. */
export function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
