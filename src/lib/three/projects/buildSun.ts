/**
 * The central star of the projects "solar system": a shader-driven photosphere
 * that churns, wrapped in a noise-modulated corona shell.
 *
 * The previous build was a flat-coloured sphere plus two additive sprites. It
 * rendered as a featureless white disc, and the reason was tone mapping rather
 * than the lack of noise: ACES at exposure 1.05 puts a near-white emissive at
 * the shoulder of the curve, so any detail shaded onto it compresses to the
 * same value. Two things fix that. Limb darkening drops the edge well below the
 * shoulder, which is what makes the body read as a sphere at all. And the
 * output is scaled past 1.0, so once the bloom composer lands (with its
 * half-float buffer) the highlights have somewhere above white to live.
 */
import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { FBM, SIMPLEX_3D } from './shaderNoise';

export interface SunHandle {
  group: Group;
  core: Mesh;
  coreMaterial: ShaderMaterial;
  coreGeometry: SphereGeometry;
  corona: Mesh;
  coronaMaterial: ShaderMaterial;
  coronaGeometry: SphereGeometry;
  /** Advance the churn. Call once per frame with seconds since start. */
  tick: (elapsed: number) => void;
}

const SUN_CORE_RADIUS = 2.1;
export const SUN_CORONA_RADIUS = 3.8;

/**
 * Camera stand-off when the star is the focused body. Derived from the corona
 * rather than picked: framing it like a planet puts the camera inside the
 * shell.
 */
export const SUN_FOCUS_DISTANCE = SUN_CORONA_RADIUS * 2.9;

/**
 * Photosphere palette, coolest edge to hottest centre.
 *
 * Pulled back from the first pass, which read as lava against a scene that is
 * otherwise entirely cool blue: the star was the most saturated thing on
 * screen by a wide margin and dragged the eye off the planets it exists to
 * light. The hue is unchanged — a star should be warm — but the mid and edge
 * stops carry less chroma, and more of the disc reaches the near-white centre,
 * so the body reads as bright rather than orange.
 */
const SUN_EDGE = 0x9c5432;
const SUN_MID = 0xf5c489;
const SUN_HOT = 0xfff6e2;
const CORONA_COLOR = 0xffb27a;

/**
 * How far past white the photosphere is driven. Above 1.0 only means anything
 * once the composer's half-float buffer exists to carry it; below that the tone
 * mapping clips it back, which is why this is tuned to read without bloom
 * rather than relying on it.
 */
const SUN_INTENSITY = 1.45;

/** Octaves in the warp and detail passes. Halved on the low tier. */
const SUN_OCTAVES = 4;
const SUN_OCTAVES_LOW = 2;

const VERTEX = /* glsl */ `
  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vObjPos = position;
    vNormalW = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uEdge;
  uniform vec3 uMid;
  uniform vec3 uHot;
  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${SIMPLEX_3D}
  ${FBM}

  void main() {
    vec3 p = normalize(vObjPos);

    // Domain warp: sample fbm through a vector that is itself fbm. One pass
    // scrolls; two passes boil, which is what a photosphere actually does.
    vec3 q = vec3(
      fbm(p * 2.1 + vec3(0.0, uTime * 0.05, 0.0), OCTAVES),
      fbm(p * 2.1 + vec3(5.2, 1.3, uTime * 0.04), OCTAVES),
      fbm(p * 2.1 + vec3(1.7, 9.2, uTime * 0.06), OCTAVES)
    );
    float n = fbm(p * 3.2 + q * 1.6, OCTAVES);
    // Granulation: a faster, finer layer over the convective cells.
    float g = fbm(p * 11.0 + q * 0.6 + vec3(uTime * 0.11), 3);
    float h = clamp(n * 0.72 + g * 0.28, 0.0, 1.0);

    vec3 col = mix(uEdge, uMid, smoothstep(0.18, 0.56, h));
    col = mix(col, uHot, smoothstep(0.38, 0.80, h));

    // Limb darkening. The single most important term here: without it the disc
    // has a hard, flat edge that no amount of surface noise disguises.
    float ndv = max(dot(normalize(vNormalW), normalize(vViewDir)), 0.0);
    col *= mix(0.42, 1.0, pow(ndv, 0.45));

    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`;

const CORONA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;

  ${SIMPLEX_3D}
  ${FBM}

  void main() {
    // This shell is rendered back-side, so the visible fragments are the far
    // hemisphere and their outward normals point AWAY from the camera: the
    // usual 1 - max(dot(N, V), 0) fresnel evaluates to 1 across the entire
    // disc and paints a solid ball rather than a corona.
    //
    // Signed depth instead. d runs 0 at the shell's silhouette to -1 straight
    // behind the star, so -d is thickest near the core and thins to nothing at
    // the outer edge, which is the direction a corona actually falls off. The
    // core writes depth, so the innermost part is occluded by the star itself.
    float d = dot(normalize(vNormalW), normalize(vViewDir));
    float falloff = pow(clamp(-d, 0.0, 1.0), 2.6);
    // Modulated so the corona churns rather than pulsing as one uniform ring,
    // which is how the old sine-driven sprites read.
    float n = fbm(normalize(vObjPos) * 2.6 + vec3(0.0, uTime * 0.07, 0.0), 3);
    gl_FragColor = vec4(uColor, falloff * (0.35 + 0.65 * n) * uIntensity);
  }
`;

export function buildSun(opts: { lowPerf?: boolean } = {}): SunHandle {
  const defines = { OCTAVES: opts.lowPerf ? SUN_OCTAVES_LOW : SUN_OCTAVES };

  const group = new Group();

  const coreGeometry = new SphereGeometry(SUN_CORE_RADIUS, 64, 64);
  const coreMaterial = new ShaderMaterial({
    defines,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: SUN_INTENSITY },
      uEdge: { value: new Color(SUN_EDGE) },
      uMid: { value: new Color(SUN_MID) },
      uHot: { value: new Color(SUN_HOT) },
    },
    vertexShader: VERTEX,
    fragmentShader: CORE_FRAGMENT,
  });
  const core = new Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const coronaGeometry = new SphereGeometry(SUN_CORONA_RADIUS, 48, 48);
  const coronaMaterial = new ShaderMaterial({
    defines,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.85 },
      uColor: { value: new Color(CORONA_COLOR) },
    },
    vertexShader: VERTEX,
    fragmentShader: CORONA_FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: BackSide,
  });
  const corona = new Mesh(coronaGeometry, coronaMaterial);
  group.add(corona);

  const tick = (elapsed: number): void => {
    coreMaterial.uniforms.uTime!.value = elapsed;
    coronaMaterial.uniforms.uTime!.value = elapsed;
  };

  return {
    group,
    core,
    coreMaterial,
    coreGeometry,
    corona,
    coronaMaterial,
    coronaGeometry,
    tick,
  };
}
