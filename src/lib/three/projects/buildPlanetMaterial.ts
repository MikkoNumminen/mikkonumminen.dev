/**
 * Procedural planet surfaces on the GPU: one shader source, one compiled
 * program per surface kind, everything else varied through uniforms.
 *
 * This replaces a CPU path that painted a 256x128 equirectangular diffuse and
 * bump map per planet into a canvas, queued across frames to keep the main
 * thread responsive. That path worked, but it cost ~87 ms of synchronous build
 * on first navigation and it could not produce the one thing this scene was
 * missing: a terminator. A bump-mapped MeshStandardMaterial lit by four lights
 * — three of which existed purely to guarantee every planet was lit from
 * wherever the viewer stood — has no day and night side by construction.
 *
 * So the light is computed here instead. There is no THREE.Light in the scene
 * any more: the star's position is a uniform, and each fragment shades against
 * the direction to it. A directional light would have been wrong regardless —
 * it has one direction for the whole scene, so planets on opposite sides of
 * the star would be lit from the same side.
 *
 * Readability, which the old fill lights were protecting, comes from three
 * cheaper things: a night-side floor so the dark hemisphere is dim rather than
 * black, a view-dependent fresnel rim that traces the silhouette from any
 * angle, and a lift on whatever the pointer is on.
 */
import { Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';
import type { LocalizedProject } from '../../../data/projects';
import { derivePalette, hashString, type Rgb } from './planetNoise';
import { FBM, SIMPLEX_3D } from './shaderNoise';
import { TIER_TWO_DIM } from './constants';

/**
 * Surface archetypes. The CPU path keyed these off project id with a `default`
 * branch, which meant five of the twelve projects — every one added after the
 * original seven — silently shared one generic rocky world. Each id is named
 * here so adding a project is a deliberate choice rather than a fall-through.
 */
export const SURFACE_KIND = {
  rocky: 0,
  banded: 1,
  icy: 2,
  crystalline: 3,
} as const;

export type SurfaceKindName = keyof typeof SURFACE_KIND;

const KIND_BY_ID: Record<string, SurfaceKindName> = {
  hrm: 'banded',
  platform: 'banded',
  portfolio: 'rocky',
  audiobookmaker: 'rocky',
  passwordmanager: 'icy',
  'feedback-intelligence': 'banded',
  readlog: 'rocky',
  'readlog-dotnet': 'rocky',
  spacepotatis: 'rocky',
  'strudel-patterns': 'crystalline',
  'claude-continue': 'icy',
  'claude-agents': 'crystalline',
};

export function surfaceKindFor(id: string): SurfaceKindName {
  return KIND_BY_ID[id] ?? 'rocky';
}

interface SurfaceTuning {
  noiseScale: number;
  bandStrength: number;
  featureColor: Rgb;
  featureThreshold: number;
  featureMix: number;
  relief: number;
}

/** Per-kind defaults; the palette itself still comes from the brand colour. */
const TUNING: Record<SurfaceKindName, SurfaceTuning> = {
  rocky: {
    noiseScale: 2.6,
    bandStrength: 0,
    featureColor: [214, 196, 168],
    featureThreshold: 0.62,
    featureMix: 0.5,
    relief: 0.9,
  },
  banded: {
    noiseScale: 2.2,
    bandStrength: 0.62,
    featureColor: [232, 240, 255],
    featureThreshold: 0.66,
    featureMix: 0.45,
    // Cloud bands are not surface relief.
    relief: 0.15,
  },
  icy: {
    noiseScale: 3.0,
    bandStrength: 0.18,
    featureColor: [226, 242, 255],
    featureThreshold: 0.52,
    featureMix: 0.7,
    relief: 0.6,
  },
  crystalline: {
    noiseScale: 4.6,
    bandStrength: 0.35,
    featureColor: [255, 226, 246],
    featureThreshold: 0.58,
    featureMix: 0.66,
    relief: 1.1,
  },
};

const PLANET_OCTAVES = 4;
const PLANET_OCTAVES_LOW = 2;

/** Fraction of full daylight the unlit hemisphere keeps, at rest and hovered. */
export const NIGHT_FLOOR = 0.1;
export const NIGHT_FLOOR_HOVERED = 0.3;

const rgbToColor = (c: Rgb): Color => new Color(c[0] / 255, c[1] / 255, c[2] / 255);

const VERTEX = /* glsl */ `
  varying vec3 vObjPos;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  void main() {
    vObjPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uSunPos;
  uniform float uSeed;
  uniform float uNoiseScale;
  uniform float uBandStrength;
  uniform float uFeatureThreshold;
  uniform float uFeatureMix;
  uniform float uRelief;
  uniform float uNightFloor;
  uniform float uRimStrength;
  uniform float uTierDim;
  uniform vec3 uFeatureColor;
  uniform vec3 uRimColor;
  uniform vec3 uPal0;
  uniform vec3 uPal1;
  uniform vec3 uPal2;
  uniform vec3 uPal3;

  varying vec3 vObjPos;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  ${SIMPLEX_3D}
  ${FBM}

  /** Same 4-stop ramp the CPU path used, so the brand colour reads identically. */
  vec3 ramp(float t) {
    float f = clamp(t, 0.0, 1.0) * 3.0;
    if (f < 1.0) return mix(uPal0, uPal1, f);
    if (f < 2.0) return mix(uPal1, uPal2, f - 1.0);
    return mix(uPal2, uPal3, f - 2.0);
  }

  float surfaceHeight(vec3 p) {
    vec3 s = p * uNoiseScale + uSeed;
    #if SURFACE_KIND == 1
      // Banded: latitude stripes dominate, fbm only warps them so the bands
      // waver instead of ruling the sphere like lines of longitude.
      float warp = fbm(s * 1.4, OCTAVES);
      float band = 0.5 + 0.5 * sin(p.y * 9.0 + warp * 4.5);
      float n = fbm(s, OCTAVES);
      return mix(n, band, uBandStrength);
    #elif SURFACE_KIND == 2
      // Icy: fbm pushed to high contrast, so plates read as flat sheets split
      // by sharp cracks rather than as gentle dunes.
      float n = fbm(s, OCTAVES);
      return smoothstep(0.35, 0.65, n);
    #elif SURFACE_KIND == 3
      // Crystalline: ridged noise. Folding fbm about its midpoint turns smooth
      // hills into creases, which is what reads as facets.
      float n = fbm(s, OCTAVES);
      float ridged = 1.0 - abs(n * 2.0 - 1.0);
      float band = 0.5 + 0.5 * sin(p.y * 14.0);
      return mix(ridged, band, uBandStrength * 0.5);
    #else
      // Rocky: fbm with a second, coarser layer subtracted to pit the surface,
      // standing in for the crater stamps the CPU path drew by hand.
      float n = fbm(s, OCTAVES);
      float pits = fbm(s * 0.55 + 17.0, 3);
      return clamp(n - smoothstep(0.62, 0.98, pits) * 0.35, 0.0, 1.0);
    #endif
  }

  void main() {
    vec3 p = normalize(vObjPos);
    float h = surfaceHeight(p);

    vec3 albedo = ramp(h);
    albedo = mix(
      albedo,
      uFeatureColor,
      smoothstep(uFeatureThreshold, 1.0, h) * uFeatureMix
    );
    // The 4-stop ramp bottoms out near black, which was fine when an emissive
    // map and three fill lights were painting over it. With one light and a
    // 10% night floor it left half of every planet unreadable, so the low end
    // is lifted toward the mid stop.
    albedo = mix(albedo, uPal2, 0.22);

    // Relief without a normal map: sample the height field along two tangent
    // directions and tilt the normal by the difference. Two extra fbm calls,
    // versus a second full texture upload per planet.
    //
    // The delta is NOT divided by the sample distance. Doing that turns it into
    // a true slope, and on a unit sphere sampled 0.02 apart a height difference
    // of 0.05 becomes a 68-degree tilt: every surface renders as speckle. The
    // raw delta, scaled, is the bump strength that actually reads.
    vec3 n = normalize(vNormalW);
    vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, n));
    vec3 bitan = cross(n, tangent);
    float e = 0.05;
    float hT = surfaceHeight(normalize(p + tangent * e));
    float hB = surfaceHeight(normalize(p + bitan * e));
    vec3 shaded = normalize(n - (tangent * (hT - h) + bitan * (hB - h)) * uRelief);

    // The star is a point at a known place, so every planet gets its own light
    // direction. This is the terminator.
    vec3 L = normalize(uSunPos - vWorldPos);
    float ndl = max(dot(shaded, L), 0.0);
    vec3 lit = albedo * (uNightFloor + (1.0 - uNightFloor) * ndl);

    // Atmosphere: view-dependent, so it traces the silhouette from wherever the
    // camera is. This is what keeps a planet between viewer and star readable
    // now that nothing fills its dark side.
    float fres = pow(1.0 - max(dot(n, normalize(vViewDirW)), 0.0), 3.0);
    lit += uRimColor * fres * uRimStrength;

    gl_FragColor = vec4(lit * uTierDim, 1.0);
  }
`;

export interface PlanetMaterialOptions {
  lowPerf?: boolean;
}

export function createPlanetMaterial(
  project: LocalizedProject,
  opts: PlanetMaterialOptions = {},
): ShaderMaterial {
  const kind = surfaceKindFor(project.id);
  const tuning = TUNING[kind];
  const palette = derivePalette(new Color(project.color).getHex());
  const brand = new Color(project.color);

  return new ShaderMaterial({
    defines: {
      SURFACE_KIND: SURFACE_KIND[kind],
      OCTAVES: opts.lowPerf ? PLANET_OCTAVES_LOW : PLANET_OCTAVES,
    },
    uniforms: {
      uSunPos: { value: new Vector3(0, 0, 0) },
      // Keeps each planet's surface distinct even where two share a kind.
      uSeed: { value: (hashString(project.id) % 1000) / 7.3 },
      uNoiseScale: { value: tuning.noiseScale },
      uBandStrength: { value: tuning.bandStrength },
      uFeatureThreshold: { value: tuning.featureThreshold },
      uFeatureMix: { value: tuning.featureMix },
      uRelief: { value: tuning.relief },
      uNightFloor: { value: NIGHT_FLOOR },
      uRimStrength: { value: 0.8 },
      uTierDim: { value: project.tier === 2 ? TIER_TWO_DIM : 1 },
      uFeatureColor: { value: rgbToColor(tuning.featureColor) },
      // Rim takes the brand colour, lifted, so the atmosphere identifies the
      // project as much as the surface does.
      uRimColor: { value: brand.clone().lerp(new Color(0xffffff), 0.35) },
      uPal0: { value: rgbToColor(palette[0]) },
      uPal1: { value: rgbToColor(palette[1]) },
      uPal2: { value: rgbToColor(palette[2]) },
      uPal3: { value: rgbToColor(palette[3]) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
  });
}
