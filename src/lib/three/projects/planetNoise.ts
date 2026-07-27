import { Color } from 'three';

/**
 * Palette derivation for the planet surfaces, plus the string hash that seeds
 * them. Pure: same inputs, same outputs, no DOM and no WebGL.
 *
 * This file used to also hold a value-noise fBm kernel that painted per-planet
 * canvases on the CPU. The noise moved to GLSL (see shaderNoise.ts) when the
 * surfaces became shaders; the colour maths stayed, because the shader wants
 * exactly the same 4-stop ramp derived from the same brand colour.
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

/** FNV-1a string hash → uint32. Stable across runs; used to seed per-planet noise. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
