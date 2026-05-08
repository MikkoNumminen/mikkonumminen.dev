import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  LinearFilter,
  LinearMipMapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';

/**
 * Procedural per-planet diffuse + bump textures, ported (and trimmed) from
 * Spacepotatis. Each project id maps to a "style" — noise scale, banding,
 * an optional secondary feature color above a height threshold, and a
 * crater count — which together give every planet a distinct surface
 * identity instead of a flat coloured sphere.
 *
 * Diffuse texture: equirectangular fbm-noise heightfield sampled through a
 * 4-stop palette derived from the base color, optionally banded by latitude
 * (gas giants), with feature-color blended above a threshold (lava, ice,
 * vegetation, etc.) and crater stamps that darken + dent the heightfield.
 *
 * Bump texture: greyscale of the same heightfield, used as `bumpMap` on a
 * `MeshStandardMaterial` to fake surface relief without a normal map.
 */

const TEX_W = 384;
const TEX_H = 192;

type Rgb = readonly [number, number, number];

interface SurfaceStyle {
  readonly noiseScale: number;
  readonly octaves: number;
  /** Strength of latitude-based banding (gas-giant look). 0 = no bands. */
  readonly bandStrength: number;
  /** Secondary color blended in above `featureThreshold`. */
  readonly featureColor: Rgb | null;
  readonly featureThreshold: number;
  readonly featureMix: number;
  readonly craters: number;
  readonly craterSizeRange: readonly [number, number];
}

export interface ProceduralPlanet {
  readonly map: CanvasTexture;
  readonly bumpMap: CanvasTexture;
}

/**
 * Per-project surface style. Each id maps a project's "vibe" to a planet
 * type — corporate banded gas giant, vegetation-pocked rocky world,
 * volcanic boss planet, etc. Unknown ids fall back to a generic rocky
 * world so adding a project doesn't break the build.
 */
function styleFor(id: string): SurfaceStyle {
  switch (id) {
    case 'hrm':
      // Big corporate platform — clean banded gas giant, no craters.
      return {
        noiseScale: 2.2,
        octaves: 4,
        bandStrength: 0.55,
        featureColor: [220, 235, 255],
        featureThreshold: 0.7,
        featureMix: 0.65,
        craters: 0,
        craterSizeRange: [0, 0],
      };
    case 'platform':
      // Workhorse rocky world with vegetation patches + light cratering.
      return {
        noiseScale: 2.8,
        octaves: 5,
        bandStrength: 0,
        featureColor: [80, 130, 70],
        featureThreshold: 0.55,
        featureMix: 0.55,
        craters: 18,
        craterSizeRange: [3, 11],
      };
    case 'portfolio':
      // Lush jungle world — heavy vegetation overlay, no craters.
      return {
        noiseScale: 2.6,
        octaves: 5,
        bandStrength: 0,
        featureColor: [40, 120, 70],
        featureThreshold: 0.5,
        featureMix: 0.6,
        craters: 0,
        craterSizeRange: [0, 0],
      };
    case 'readlog':
      // Cool ethereal — subtle banding + bright cloud-tops feature color.
      return {
        noiseScale: 2.4,
        octaves: 4,
        bandStrength: 0.35,
        featureColor: [240, 230, 255],
        featureThreshold: 0.7,
        featureMix: 0.55,
        craters: 0,
        craterSizeRange: [0, 0],
      };
    case 'audiobookmaker':
      // Icy world — banded blue-grey with bright frost peaks.
      return {
        noiseScale: 2.0,
        octaves: 4,
        bandStrength: 0.5,
        featureColor: [220, 240, 255],
        featureThreshold: 0.7,
        featureMix: 0.7,
        craters: 0,
        craterSizeRange: [0, 0],
      };
    case 'spacepotatis':
      // Volcanic boss-vibe — molten ridges through cooled crust, cratered.
      return {
        noiseScale: 3.0,
        octaves: 5,
        bandStrength: 0.15,
        featureColor: [255, 180, 70],
        featureThreshold: 0.58,
        featureMix: 0.85,
        craters: 18,
        craterSizeRange: [3, 12],
      };
    case 'strudel-patterns':
      // Exotic crystalline mineral world — tight banding, sharp highlights.
      return {
        noiseScale: 5.5,
        octaves: 3,
        bandStrength: 0.5,
        featureColor: [255, 220, 240],
        featureThreshold: 0.6,
        featureMix: 0.65,
        craters: 0,
        craterSizeRange: [0, 0],
      };
    default:
      // Generic rocky world fallback.
      return {
        noiseScale: 2.6,
        octaves: 5,
        bandStrength: 0,
        featureColor: [200, 180, 150],
        featureThreshold: 0.6,
        featureMix: 0.5,
        craters: 22,
        craterSizeRange: [3, 11],
      };
  }
}

export function buildPlanetTexture(id: string, baseColor: number): ProceduralPlanet {
  const seed = hashString(id);
  const palette = derivePalette(baseColor);
  const style = styleFor(id);
  const heights = new Float32Array(TEX_W * TEX_H);
  const map = paintDiffuse(seed, palette, style, heights);
  const bumpMap = paintBump(heights);
  return { map, bumpMap };
}

/**
 * Four-stop ramp derived from the base color: a deep "shadow" version, two
 * mid stops, and a bright peak. Sampling the ramp by height gives the
 * planet a gradient from low-altitude basins to high-altitude highlights
 * even before the feature color is mixed in.
 */
function derivePalette(baseColor: number): readonly [Rgb, Rgb, Rgb, Rgb] {
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
    (s) =>
      [Math.round(s.r * 255), Math.round(s.g * 255), Math.round(s.b * 255)] as Rgb,
  ) as unknown as readonly [Rgb, Rgb, Rgb, Rgb];
}

function paintDiffuse(
  seed: number,
  palette: readonly [Rgb, Rgb, Rgb, Rgb],
  style: SurfaceStyle,
  heightsOut: Float32Array,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('paintDiffuse: 2D context unavailable');

  const img = ctx.createImageData(TEX_W, TEX_H);
  const data = img.data;

  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H;
    const lat = (v - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let x = 0; x < TEX_W; x++) {
      const u = (x + 0.5) / TEX_W;
      const lon = u * 2 * Math.PI;
      // Sample noise on the 3D unit-sphere surface so seams at the equirect
      // poles don't show up as visible repeats.
      const px = cosLat * Math.cos(lon);
      const py = sinLat;
      const pz = cosLat * Math.sin(lon);

      let n = fbm3(
        px * style.noiseScale,
        py * style.noiseScale,
        pz * style.noiseScale,
        seed,
        style.octaves,
      );

      if (style.bandStrength > 0) {
        const band = Math.sin(lat * 7 + n * 4) * 0.5 + 0.5;
        n = n * (1 - style.bandStrength * 0.6) + band * style.bandStrength * 0.6;
      }

      n = Math.max(0, Math.min(1, n));
      heightsOut[y * TEX_W + x] = n;

      const baseRgb = sampleRamp(palette, n);
      let r = baseRgb[0];
      let g = baseRgb[1];
      let b = baseRgb[2];

      if (style.featureColor && n > style.featureThreshold) {
        const t =
          ((n - style.featureThreshold) / (1 - style.featureThreshold)) *
          style.featureMix;
        r = r + (style.featureColor[0] - r) * t;
        g = g + (style.featureColor[1] - g) * t;
        b = b + (style.featureColor[2] - b) * t;
      }

      const idx = (y * TEX_W + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  if (style.craters > 0) {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    for (let i = 0; i < style.craters; i++) {
      const cx = rng() * TEX_W;
      // Bias craters away from the poles where the equirect distortion is
      // worst (a circular crater near a pole would render as a long arc).
      const cy = TEX_H * 0.15 + rng() * TEX_H * 0.7;
      const radius =
        style.craterSizeRange[0]! +
        rng() * (style.craterSizeRange[1]! - style.craterSizeRange[0]!);
      stampCrater(data, heightsOut, TEX_W, TEX_H, cx, cy, radius);
    }
  }

  ctx.putImageData(img, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = LinearMipMapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function paintBump(heights: Float32Array): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('paintBump: 2D context unavailable');

  const img = ctx.createImageData(TEX_W, TEX_H);
  const data = img.data;
  for (let i = 0; i < heights.length; i++) {
    const h = Math.round(heights[i]! * 255);
    const idx = i * 4;
    data[idx] = h;
    data[idx + 1] = h;
    data[idx + 2] = h;
    data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = LinearMipMapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function stampCrater(
  data: Uint8ClampedArray,
  heights: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
): void {
  const r2 = r * r;
  const yMin = Math.max(0, Math.floor(cy - r));
  const yMax = Math.min(h - 1, Math.ceil(cy + r));
  const xMin = Math.max(0, Math.floor(cx - r));
  const xMax = Math.min(w - 1, Math.ceil(cx + r));
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const t = Math.sqrt(d2) / r;
      // Inside ~78% radius: dark depression. Outside: bright raised rim.
      const factor = t < 0.78 ? 0.55 + t * 0.35 : 1.18 - (t - 0.78) * 0.55;
      const heightDelta =
        t < 0.78 ? -0.2 * (1 - t / 0.78) : 0.18 * (1 - (t - 0.78) / 0.22);
      const idx = (y * w + x) * 4;
      data[idx] = clamp255(data[idx]! * factor);
      data[idx + 1] = clamp255(data[idx + 1]! * factor);
      data[idx + 2] = clamp255(data[idx + 2]! * factor);
      const hi = y * w + x;
      heights[hi] = Math.max(0, Math.min(1, heights[hi]! + heightDelta));
    }
  }
}

function sampleRamp(palette: readonly [Rgb, Rgb, Rgb, Rgb], t: number): Rgb {
  const [p0, p1, p2, p3] = palette;
  const f = Math.max(0, Math.min(1, t)) * 3;
  const i = Math.min(Math.floor(f), 2);
  const k = f - i;
  const a = i === 0 ? p0 : i === 1 ? p1 : p2;
  const b = i === 0 ? p1 : i === 1 ? p2 : p3;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function fbm3(x: number, y: number, z: number, seed: number, octaves: number): number {
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

function noise3(x: number, y: number, z: number, seed: number): number {
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

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 2147483647) ^
    Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 16777216) / 16777216;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
