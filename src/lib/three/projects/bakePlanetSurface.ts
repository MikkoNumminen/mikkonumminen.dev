/**
 * Bakes each planet's surface into a texture, once, at build time.
 *
 * This exists because of a measurement rather than a preference. The scene's
 * first frame blocked the main thread for 1159 ms on a cold load, and stubbing
 * shaders one at a time attributed 777 ms of that to the planet programs alone.
 *
 * The driver turned out to be neither the number of programs nor the octave
 * count. Collapsing the four surface kinds into one program made it 230 ms
 * *worse*, and bounding the fbm loop from eight octaves to four changed
 * nothing measurable. What did move it was removing fbm call sites: dropping
 * two of the four in the planet fragment saved 523 ms. Each call site inlines
 * a noise body, and the compiler charges by volume.
 *
 * So the noise lives here now, in a program that runs once per planet into a
 * render target, and the shader that gets compiled alongside everything else
 * and runs every frame contains none of it. It samples this texture and takes
 * the relief normal from neighbouring texels rather than from two more fbm
 * evaluations.
 *
 * Measured after the split: 1159 ms to 359 ms, which is the 131 ms
 * everything-else floor plus the 228 ms the star still costs. The star cannot
 * take the same treatment because its surface animates; a static bake would
 * freeze the churn.
 *
 * Still procedural, still no image assets in the repo. The texture is
 * generated on the GPU at run time; it is a cache, not a shipped file.
 */
import {
  Color,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { LocalizedProject } from '../../../data/projects';
import { derivePalette, hashString, type Rgb } from './planetNoise';
import { FBM, SIMPLEX_3D } from './shaderNoise';
import {
  SURFACE_KIND,
  surfaceKindFor,
  TUNING,
  type SurfaceKindName,
} from './surfaceKinds';

const rgbToColor = (c: Rgb): Color => new Color(c[0] / 255, c[1] / 255, c[2] / 255);

/**
 * Bake resolution. Wide rather than square because the target is sampled
 * equirectangularly, so longitude needs twice the samples latitude does.
 *
 * The low tier halves both axes. Compile cost does not care about resolution
 * — that is per-program, not per-pixel — so this trades only the one-off fill
 * and the memory, which is what a weak GPU actually feels.
 */
export function bakeSize(lowPerf = false): { width: number; height: number } {
  return lowPerf ? { width: 256, height: 128 } : { width: 512, height: 256 };
}

/** Octaves the bake runs at. Compile-time, so the low tier gets a smaller program. */
export function bakeOctaves(lowPerf = false): number {
  return lowPerf ? 2 : 4;
}

const BAKE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BAKE_FRAGMENT = /* glsl */ `
  uniform float uSeed;
  uniform float uNoiseScale;
  uniform float uBandStrength;
  uniform float uFeatureThreshold;
  uniform float uFeatureMix;
  uniform vec3 uFeatureColor;
  uniform vec3 uPal0;
  uniform vec3 uPal1;
  uniform vec3 uPal2;
  uniform vec3 uPal3;
  varying vec2 vUv;

  ${SIMPLEX_3D}
  ${FBM}

  vec3 ramp(float t) {
    float f = clamp(t, 0.0, 1.0) * 3.0;
    if (f < 1.0) return mix(uPal0, uPal1, f);
    if (f < 2.0) return mix(uPal1, uPal2, f - 1.0);
    return mix(uPal2, uPal3, f - 2.0);
  }

  void main() {
    // Inverse equirectangular: texel back to a point on the unit sphere.
    float lon = (vUv.x - 0.5) * 6.2831853;
    float lat = (vUv.y - 0.5) * 3.14159265;
    vec3 p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    vec3 s = p * uNoiseScale + uSeed;

    // Specialised per kind rather than branched on a uniform: four small
    // programs measured 230 ms cheaper to compile than one containing all
    // four paths, because the compiler cannot strip what it cannot fold.
    float h;
    #if SURFACE_KIND == 1
      float warp = fbm(s * 1.4, OCTAVES);
      float band = 0.5 + 0.5 * sin(p.y * 9.0 + warp * 4.5);
      h = mix(fbm(s, OCTAVES), band, uBandStrength);
    #elif SURFACE_KIND == 2
      h = smoothstep(0.35, 0.65, fbm(s, OCTAVES));
    #elif SURFACE_KIND == 3
      float n3 = fbm(s, OCTAVES);
      float ridged = 1.0 - abs(n3 * 2.0 - 1.0);
      h = mix(ridged, 0.5 + 0.5 * sin(p.y * 14.0), uBandStrength * 0.5);
    #else
      float n0 = fbm(s, OCTAVES);
      float pits = fbm(s * 0.55 + 17.0, 3);
      h = clamp(n0 - smoothstep(0.62, 0.98, pits) * 0.35, 0.0, 1.0);
    #endif

    vec3 albedo = ramp(h);
    albedo = mix(albedo, uFeatureColor, smoothstep(uFeatureThreshold, 1.0, h) * uFeatureMix);
    // Albedo in rgb, height in alpha: the draw shader needs both, and one
    // sample is cheaper than two textures.
    gl_FragColor = vec4(albedo, h);
  }
`;

export interface BakedSurface {
  texture: Texture;
  /** Owned by the caller. Must be disposed with the planet. */
  target: WebGLRenderTarget;
  width: number;
  height: number;
}

/**
 * Render one planet's albedo and height field into a texture.
 *
 * The caller owns the returned target and is responsible for disposing it;
 * a render target is GPU memory that `Material.dispose()` does not walk.
 */
export function bakePlanetSurface(
  renderer: WebGLRenderer,
  project: LocalizedProject,
  opts: { lowPerf?: boolean } = {},
): BakedSurface {
  const kind: SurfaceKindName = surfaceKindFor(project.id);
  const tuning = TUNING[kind];
  const palette = derivePalette(new Color(project.color).getHex());
  const { width, height } = bakeSize(opts.lowPerf);

  const target = new WebGLRenderTarget(width, height, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    // Longitude wraps; latitude does not.
    wrapS: RepeatWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const material = new ShaderMaterial({
    defines: { SURFACE_KIND: SURFACE_KIND[kind], OCTAVES: bakeOctaves(opts.lowPerf) },
    uniforms: {
      uSeed: { value: (hashString(project.id) % 1000) / 7.3 },
      uNoiseScale: { value: tuning.noiseScale },
      uBandStrength: { value: tuning.bandStrength },
      uFeatureThreshold: { value: tuning.featureThreshold },
      uFeatureMix: { value: tuning.featureMix },
      uFeatureColor: { value: rgbToColor(tuning.featureColor) },
      uPal0: { value: rgbToColor(palette[0]) },
      uPal1: { value: rgbToColor(palette[1]) },
      uPal2: { value: rgbToColor(palette[2]) },
      uPal3: { value: rgbToColor(palette[3]) },
    },
    vertexShader: BAKE_VERTEX,
    fragmentShader: BAKE_FRAGMENT,
  });

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const quad = new Mesh(geometry, material);
  scene.add(quad);

  const previousTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(previousTarget);

  // The quad and its material exist only for this one draw.
  geometry.dispose();
  material.dispose();

  return { texture: target.texture, target, width, height };
}
