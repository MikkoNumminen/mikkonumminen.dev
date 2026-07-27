/**
 * The planet draw material. Contains no noise.
 *
 * Everything procedural happens once, in the bake pass — see
 * bakePlanetSurface for the measurements that put it there. What is left here
 * is a texture sample, a relief normal read out of neighbouring texels, and
 * the lighting.
 *
 * The lighting is why this scene has no `THREE.Light` at all. The star's
 * position arrives as a uniform and each fragment shades against the direction
 * to it, so a planet on the far side of the system is lit from the far side. A
 * directional light cannot express that: it has one direction for the whole
 * scene, so bodies on opposite sides of the star would be lit identically.
 *
 * Readability, which three fill lights used to provide at the cost of any
 * terminator at all, comes from a night-side floor, a view-dependent rim that
 * traces the silhouette from any angle, and a lift on whatever is hovered.
 */
import { Color, DoubleSide, ShaderMaterial, Vector2, Vector3, type Texture } from 'three';
import type { LocalizedProject } from '../../../data/projects';
import { TIER_TWO_DIM } from './constants';
import { surfaceKindFor, TUNING } from './surfaceKinds';

/** Fraction of full daylight the unlit hemisphere keeps, at rest and hovered. */
export const NIGHT_FLOOR = 0.1;
export const NIGHT_FLOOR_HOVERED = 0.3;

/**
 * Scales the texel-difference gradient up to a usable normal perturbation.
 * The gradient is a height delta across one texel, a much smaller number than
 * the object-space deltas the old procedural relief worked with, so the
 * per-kind relief values keep their meaning across the change.
 */
const RELIEF_GAIN = 8.0;

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
  uniform sampler2D uSurface;
  uniform vec2 uTexel;
  uniform vec3 uSunPos;
  uniform float uRelief;
  uniform float uReliefGain;
  uniform float uNightFloor;
  uniform float uRimStrength;
  uniform float uTierDim;
  uniform vec3 uRimColor;

  varying vec3 vObjPos;
  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  /** Equirectangular lookup for a point on the unit sphere. */
  vec2 sphereUv(vec3 p) {
    return vec2(
      atan(p.z, p.x) / 6.2831853 + 0.5,
      asin(clamp(p.y, -1.0, 1.0)) / 3.14159265 + 0.5
    );
  }

  void main() {
    vec3 p = normalize(vObjPos);
    vec2 uv = sphereUv(p);
    vec4 surf = texture2D(uSurface, uv);
    vec3 albedo = surf.rgb;
    float h = surf.a;

    // Relief from neighbouring texels rather than from two more noise
    // evaluations. This substitution is the whole point of the bake: it is
    // what took the expensive shader from four noise call sites to none.
    float hx = texture2D(uSurface, uv + vec2(uTexel.x, 0.0)).a;
    float hy = texture2D(uSurface, uv + vec2(0.0, uTexel.y)).a;
    vec3 n = normalize(vNormalW);
    vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, n));
    vec3 bitan = cross(n, tangent);
    vec3 shaded = normalize(
      n - (tangent * (hx - h) + bitan * (hy - h)) * uRelief * uReliefGain
    );

    // The star is a point at a known place, so every planet gets its own
    // light direction. This is the terminator.
    vec3 L = normalize(uSunPos - vWorldPos);
    float ndl = max(dot(shaded, L), 0.0);
    vec3 lit = albedo * (uNightFloor + (1.0 - uNightFloor) * ndl);

    // Atmosphere: view-dependent, so it traces the silhouette from wherever
    // the camera is. This is what keeps a planet between viewer and star
    // readable now that nothing fills its dark side.
    float fres = pow(1.0 - max(dot(n, normalize(vViewDirW)), 0.0), 3.0);
    lit += uRimColor * fres * uRimStrength;

    gl_FragColor = vec4(lit * uTierDim, 1.0);
  }
`;

export interface PlanetMaterialOptions {
  /** The baked surface. Absent only where there is no GL context. */
  surface?: Texture | null;
  /** Size of the baked texture, for the neighbour lookup. */
  surfaceWidth?: number;
  surfaceHeight?: number;
}

export function createPlanetMaterial(
  project: LocalizedProject,
  opts: PlanetMaterialOptions = {},
): ShaderMaterial {
  const tuning = TUNING[surfaceKindFor(project.id)];
  const brand = new Color(project.color);
  const width = opts.surfaceWidth ?? 512;
  const height = opts.surfaceHeight ?? 256;

  return new ShaderMaterial({
    uniforms: {
      uSurface: { value: opts.surface ?? null },
      uTexel: { value: new Vector2(1 / width, 1 / height) },
      uSunPos: { value: new Vector3(0, 0, 0) },
      uRelief: { value: tuning.relief },
      uReliefGain: { value: RELIEF_GAIN },
      uNightFloor: { value: NIGHT_FLOOR },
      uRimStrength: { value: 0.8 },
      uTierDim: { value: project.tier === 2 ? TIER_TWO_DIM : 1 },
      // Rim takes the brand colour, lifted, so the atmosphere identifies the
      // project as much as the surface does.
      uRimColor: { value: brand.clone().lerp(new Color(0xffffff), 0.35) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
  });
}
