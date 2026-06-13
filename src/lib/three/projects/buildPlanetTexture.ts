import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipMapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import {
  type Rgb,
  derivePalette,
  sampleRamp,
  fbm3,
  mulberry32,
  hashString,
  clamp255,
} from './planetNoise';

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

// 256×128 (down from 384×192) — at typical projects-view planet sizes
// the smaller texture is visually indistinguishable while cutting the
// per-pixel work to ~45 % so the synchronous build doesn't block the
// main thread for a noticeable beat on first navigation.
const TEX_W = 256;
const TEX_H = 128;

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
  /** Bump-map relief depth on the final mesh. Gas giants stay near 0
   *  (cloud bands aren't surface), rocky worlds push higher. */
  readonly bumpScale: number;
}

export interface ProceduralPlanet {
  readonly map: CanvasTexture;
  readonly bumpMap: CanvasTexture;
  /** Caller passes this to `MeshStandardMaterial.bumpScale`. */
  readonly bumpScale: number;
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
        bumpScale: 0.05,
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
        craterSizeRange: [2, 7],
        bumpScale: 0.22,
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
        bumpScale: 0.16,
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
        bumpScale: 0.08,
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
        bumpScale: 0.1,
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
        craterSizeRange: [2, 8],
        bumpScale: 0.26,
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
        bumpScale: 0.18,
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
        craterSizeRange: [2, 7],
        bumpScale: 0.2,
      };
  }
}

/**
 * Pending texture-paint jobs, drained a couple per animation frame so the
 * first /projects navigation doesn't block the main thread painting every
 * planet's procedural surface synchronously in one tight loop. The scene
 * graph is wired up immediately against blank CanvasTextures; the pixels
 * fill in over the next few frames as the queue drains.
 *
 * Each job carries a `cancelled` flag flipped by a `dispose` listener on
 * its textures, so a scene torn down mid-build never paints into (or
 * re-uploads) a canvas whose texture has already been freed.
 */
interface PaintJob {
  run: () => void;
  cancelled: boolean;
}

const pendingPaintJobs: PaintJob[] = [];
/** How many queued planets to paint per frame — a couple keeps the reveal
 *  to a few frames (subtle), not a slow drip, while still yielding to the
 *  renderer between batches. */
const PAINT_JOBS_PER_FRAME = 2;
let drainScheduled = false;
/**
 * True once the first planet of the current synchronous build burst has
 * been painted inline. The planets are built in one synchronous loop, so
 * the queue is momentarily empty between calls; this flag (cleared on the
 * next animation frame) is what makes only the *first* planet paint
 * synchronously rather than every one.
 */
let syncPaintedThisBurst = false;

function drainPaintJobs(): void {
  drainScheduled = false;
  // A new burst can begin paint-synchronously again once the loop has
  // yielded to a frame.
  syncPaintedThisBurst = false;
  let painted = 0;
  while (pendingPaintJobs.length > 0 && painted < PAINT_JOBS_PER_FRAME) {
    const job = pendingPaintJobs.shift()!;
    if (job.cancelled) continue;
    job.run();
    painted++;
  }
  if (pendingPaintJobs.length > 0) scheduleDrain();
}

function scheduleDrain(): void {
  if (drainScheduled) return;
  drainScheduled = true;
  requestAnimationFrame(drainPaintJobs);
}

export function buildPlanetTexture(id: string, baseColor: number): ProceduralPlanet {
  const seed = hashString(id);
  const palette = derivePalette(baseColor);
  const style = styleFor(id);
  const heights = new Float32Array(TEX_W * TEX_H);

  // Create the textures up front against blank canvases so the planet
  // material has valid resources immediately. The expensive pixel work is
  // deferred into a paint job below.
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = TEX_W;
  mapCanvas.height = TEX_H;
  const map = finishDiffuseTexture(mapCanvas);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = TEX_W;
  bumpCanvas.height = TEX_H;
  const bumpMap = finishBumpTexture(bumpCanvas);

  const job: PaintJob = {
    cancelled: false,
    run: (): void => {
      // Diffuse populates `heights`; bump reads it — keep that order.
      paintDiffuse(mapCanvas, seed, palette, style, heights);
      paintBump(bumpCanvas, heights);
      map.needsUpdate = true;
      bumpMap.needsUpdate = true;
    },
  };
  // Disposing either texture (scene teardown) cancels the pending paint so
  // we never touch a freed resource if the build is still in flight.
  const cancel = (): void => {
    job.cancelled = true;
  };
  map.addEventListener('dispose', cancel);
  bumpMap.addEventListener('dispose', cancel);

  // Paint the first planet of a fresh burst synchronously so the scene
  // isn't entirely blank on the first rendered frame; defer the rest a
  // couple per animation frame. `scheduleDrain` after the synchronous
  // paint clears `syncPaintedThisBurst` on the next frame even when no
  // jobs were deferred (a single-planet scene), so a later navigation can
  // paint its first planet synchronously again.
  if (!syncPaintedThisBurst) {
    syncPaintedThisBurst = true;
    job.run();
    scheduleDrain();
  } else {
    pendingPaintJobs.push(job);
    scheduleDrain();
  }

  return { map, bumpMap, bumpScale: style.bumpScale };
}

function paintDiffuse(
  canvas: HTMLCanvasElement,
  seed: number,
  palette: readonly [Rgb, Rgb, Rgb, Rgb],
  style: SurfaceStyle,
  heightsOut: Float32Array,
): void {
  const ctx = canvas.getContext('2d');
  // 2D context can fail in extremely locked-down environments. Leave the
  // (blank) canvas as-is so the already-created CanvasTexture stays a
  // valid Three.js resource; planet renders dark but the page doesn't
  // crash.
  if (!ctx) return;

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
    const [minR, maxR] = style.craterSizeRange;
    for (let i = 0; i < style.craters; i++) {
      const cx = rng() * TEX_W;
      // Bias craters away from the poles where the equirect distortion is
      // worst (a circular crater near a pole would render as a long arc).
      const cy = TEX_H * 0.15 + rng() * TEX_H * 0.7;
      const radius = minR + rng() * (maxR - minR);
      stampCrater(data, heightsOut, TEX_W, TEX_H, cx, cy, radius);
    }
  }

  ctx.putImageData(img, 0, 0);
}

function finishDiffuseTexture(canvas: HTMLCanvasElement): CanvasTexture {
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

function paintBump(canvas: HTMLCanvasElement, heights: Float32Array): void {
  const ctx = canvas.getContext('2d');
  // Same fallback rationale as paintDiffuse — leave the blank canvas in
  // place rather than crashing the scene if the 2D context is unavailable.
  if (!ctx) return;

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
}

function finishBumpTexture(canvas: HTMLCanvasElement): CanvasTexture {
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
