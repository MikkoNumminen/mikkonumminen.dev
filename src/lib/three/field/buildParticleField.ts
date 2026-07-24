/**
 * The unified home-page particle field: ONE `Points` draw call whose
 * particles morph between three states — galaxy (load-in), name (the
 * "MIKKO NUMMINEN" formation), and starfield (the persistent background
 * for the content sections) — entirely in the vertex shader.
 *
 * State model: every particle carries a target position for each state
 * (`position` = galaxy local-disk space, `aNamePos`, `aStarPos`) plus a
 * per-particle seed. Two uniforms compose the morph:
 *
 *   pos = mix(mix(galaxy, name, uForm), starfield, uDissolve)
 *
 * `uForm` is time-driven (the load-in formation), `uDissolve` is
 * scroll-scrubbed (GSAP ScrollTrigger writes it every scroll update).
 * Both are staggered per particle by the seed so morphs sweep through
 * the field organically instead of moving as a rigid unit.
 *
 * Everything per-frame is a uniform write; the CPU never touches
 * per-particle data after construction. This is the invariant that keeps
 * scroll handling off the critical path — preserve it.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Matrix3,
  Matrix4,
  Points,
  ShaderMaterial,
  Sphere,
  SRGBColorSpace,
  type Texture,
  Vector3,
  Vector4,
} from 'three';
import { makeRadialSpriteTexture } from '../textures';

export interface ParticleFieldOptions {
  count: number;
  /** Galaxy-state positions in local disk space (len = count*3). */
  galaxyPositions: Float32Array;
  /** Name-state positions in world units at unit scale (len = count*3). */
  namePositions: Float32Array;
  /** Per-particle name-state dim flag (0 = glyph, 1 = background dust
   *  that fades hard while the name is formed). len = count. */
  nameDim: Float32Array;
  /** Starfield-state positions in world space (len = count*3). */
  starPositions: Float32Array;
  /** World-space anchor of the galaxy disk. Mutable via the uniform. */
  galaxyCenter: [number, number, number];
  /** Base point size in px at the reference depth. */
  baseSize?: number;
  pixelRatio: number;
}

/** Uniform record — exposed so the scene can write values without string
 *  lookups scattered around the tick loop. */
export interface ParticleFieldUniforms {
  uTime: { value: number };
  uForm: { value: number };
  uDissolve: { value: number };
  /** Pointer position on the z=0 world plane (z component unused). */
  uPointer: { value: Vector3 };
  /** 0 until the first pointer move, then eased toward 1 — stops the
   *  (0,0) default from repelling particles at screen centre on load. */
  uPointerStrength: { value: number };
  /** Fixed pool of 4 ripples: xy = origin on the z=0 plane, z = start
   *  time in scene seconds, w = strength. Inactive slots park at a
   *  start time far in the past. */
  uRipples: { value: [Vector4, Vector4, Vector4, Vector4] };
  uCameraZ: { value: number };
  uGalaxySpin: { value: number };
  uGalaxyCenter: { value: Vector3 };
  uGalaxyTilt: { value: Matrix3 };
  uNameScale: { value: number };
  uSize: { value: number };
  uPixelRatio: { value: number };
  uDensity: { value: number };
  uDriftAmp: { value: number };
  uDriftSpeed: { value: number };
  uBrightness: { value: number };
  uColorA: { value: Color };
  uColorB: { value: Color };
  uScrollDrift: { value: number };
  uMap: { value: Texture };
}

export interface ParticleFieldHandle {
  points: Points;
  uniforms: ParticleFieldUniforms;
  dispose: () => void;
}

// Fixed tilt of the galaxy disk — same lean the old buildGalaxyLayer
// group used, so the spiral reads at the familiar angle.
const GALAXY_TILT_EULER = new Euler(-Math.PI * 0.18, 0, Math.PI * 0.12);

const VERTEX_SHADER = /* glsl */ `
attribute vec3 aNamePos;
attribute float aNameDim;
attribute vec3 aStarPos;
attribute vec4 aSeed; // x: stagger/phase 0..1, y: size jitter, z: density rank 0..1, w: palette mix 0..1

uniform float uTime;
uniform float uForm;
uniform float uDissolve;
uniform float uGalaxySpin;
uniform vec3 uGalaxyCenter;
uniform mat3 uGalaxyTilt;
uniform float uNameScale;
uniform float uSize;
uniform float uPixelRatio;
uniform float uDensity;
uniform float uDriftAmp;
uniform float uDriftSpeed;
uniform float uBrightness;
uniform float uScrollDrift;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform vec4 uRipples[4];
uniform float uCameraZ;

varying vec3 vColor;
varying float vAlpha;

// Interaction tuning. Radii/distances are measured on the z=0 world
// plane (each particle is projected onto it through the camera first,
// so a deep starfield particle reacts to the cursor it VISUALLY sits
// under, not to a world position that projects elsewhere).
const float POINTER_RADIUS = 4.5;
const float POINTER_PUSH = 1.6;
const float RIPPLE_LIFE = 3.0;
const float RIPPLE_SPEED = 10.0;
const float RIPPLE_WIDTH = 2.4;
const float RIPPLE_DAMP = 1.5;
const float RIPPLE_PUSH = 1.5;
const float RIPPLE_LIFT = 0.7;

// Per-particle staggered progress: particles with a low seed lead the
// morph, high seeds trail, so transitions sweep through the field.
float staggered(float u, float sd) {
  return smoothstep(0.0, 1.0, clamp(u * 1.35 - sd * 0.35, 0.0, 1.0));
}

void main() {
  float sd = aSeed.x;

  // Galaxy state: spin the local disk, tilt it, anchor it in the frame.
  float cs = cos(uGalaxySpin);
  float sn = sin(uGalaxySpin);
  vec3 g = position;
  g.xy = mat2(cs, -sn, sn, cs) * g.xy;
  g = uGalaxyTilt * g;
  g += uGalaxyCenter;

  float form = staggered(uForm, sd);
  float dissolve = staggered(uDissolve, sd);

  vec3 pos = mix(g, aNamePos * uNameScale, form);
  pos = mix(pos, aStarPos, dissolve);

  // Cheap trig pseudo-noise drift. Amplitude collapses to a shimmer in
  // the name state (legibility) and relaxes in the starfield.
  float t = uTime * uDriftSpeed;
  vec3 wob = vec3(
    sin(t * 0.9 + sd * 6.2831 + pos.y * 0.35),
    cos(t * 0.7 + sd * 9.0 + pos.x * 0.30),
    sin(t * 0.5 + aSeed.w * 6.2831)
  );
  float amp = mix(mix(1.0, 0.04, form), 0.55, dissolve) * uDriftAmp;
  pos += wob * amp;

  // Where this particle's camera ray crosses the z=0 plane — the space
  // the pointer and ripple origins live in. Deep particles get the same
  // screen-aligned falloff but a subtler world push (natural parallax).
  vec2 eq = pos.xy * (uCameraZ / (uCameraZ - pos.z));

  // Cursor avoidance — particles drift away and flow back, every state.
  vec2 away = eq - uPointer.xy;
  float ad = length(away);
  float push = uPointerStrength * smoothstep(POINTER_RADIUS, 0.0, ad);
  if (ad > 1e-4) pos.xy += (away / ad) * push * POINTER_PUSH;

  // Click ripples — a travelling ring with a gaussian band profile and
  // an exponentially damped envelope, radial push plus a small z lift.
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age >= 0.0 && age <= RIPPLE_LIFE) {
      vec2 d2 = eq - r.xy;
      float rd = length(d2);
      float front = age * RIPPLE_SPEED;
      float bandArg = (rd - front) / RIPPLE_WIDTH;
      float band = exp(-bandArg * bandArg);
      float env = exp(-age * RIPPLE_DAMP) * r.w;
      if (rd > 1e-4) pos.xy += (d2 / rd) * band * env * RIPPLE_PUSH;
      pos.z += band * env * RIPPLE_LIFT;
    }
  }

  pos.y += uScrollDrift;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // Density culling without geometry churn: ranks above the current
  // density collapse to size 0 (still processed, never drawn).
  float vis = step(aSeed.z, uDensity);
  // Name legibility: while the name is formed, background-dust particles
  // shrink and dim hard so the letterforms are the unambiguous subject.
  float dust = aNameDim * form * (1.0 - dissolve);
  float stateSize = mix(mix(1.0, 0.75, form), 0.7, dissolve) * (1.0 - dust * 0.35);
  gl_PointSize = uSize * aSeed.y * stateSize * vis * uPixelRatio * (12.0 / -mv.z);

  // Twinkle — loud in the galaxy, nearly frozen in the name state so the
  // letterforms hold steady, gentle in the starfield.
  float twAmp = mix(mix(0.30, 0.08, form), 0.22, dissolve);
  float tw = 1.0 - twAmp + twAmp * sin(uTime * (1.2 + aSeed.y) + sd * 6.2831);

  vColor = mix(uColorA, uColorB, aSeed.w);
  vAlpha = uBrightness * vis * tw * (1.0 - dust * 0.78);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, vAlpha) * tex;
}
`;

export function buildParticleField(opts: ParticleFieldOptions): ParticleFieldHandle {
  const { count, galaxyPositions, namePositions, starPositions, pixelRatio } = opts;
  const baseSize = opts.baseSize ?? 16;

  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    seeds[i4] = Math.random();
    seeds[i4 + 1] = 0.6 + Math.random();
    seeds[i4 + 2] = Math.random();
    seeds[i4 + 3] = Math.random();
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(galaxyPositions, 3));
  geometry.setAttribute('aNamePos', new BufferAttribute(namePositions, 3));
  geometry.setAttribute('aNameDim', new BufferAttribute(opts.nameDim, 1));
  geometry.setAttribute('aStarPos', new BufferAttribute(starPositions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 4));
  // The shader displaces far beyond the raw attribute bounds; hand the
  // renderer a generous sphere instead of letting it compute a wrong one.
  geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 150);

  const sprite = makeRadialSpriteTexture(64, [
    [0, 'rgba(255, 255, 255, 1)'],
    [0.25, 'rgba(255, 255, 255, 0.85)'],
    [0.6, 'rgba(185, 205, 255, 0.25)'],
    [1, 'rgba(130, 155, 255, 0)'],
  ]);
  // Canvas 2D paints sRGB; declare it so the halo's midtones aren't
  // brightened by the renderer's output encode into a cotton-ball bloom.
  sprite.colorSpace = SRGBColorSpace;

  const tilt = new Matrix3().setFromMatrix4(
    new Matrix4().makeRotationFromEuler(GALAXY_TILT_EULER),
  );

  const uniforms: ParticleFieldUniforms = {
    uTime: { value: 0 },
    uForm: { value: 0 },
    uDissolve: { value: 0 },
    uPointer: { value: new Vector3() },
    uPointerStrength: { value: 0 },
    uRipples: {
      value: [
        new Vector4(0, 0, -1e4, 0),
        new Vector4(0, 0, -1e4, 0),
        new Vector4(0, 0, -1e4, 0),
        new Vector4(0, 0, -1e4, 0),
      ],
    },
    uCameraZ: { value: 26 },
    uGalaxySpin: { value: 0 },
    uGalaxyCenter: { value: new Vector3(...opts.galaxyCenter) },
    uGalaxyTilt: { value: tilt },
    uNameScale: { value: 1 },
    uSize: { value: baseSize },
    uPixelRatio: { value: pixelRatio },
    uDensity: { value: 1 },
    uDriftAmp: { value: 0.4 },
    uDriftSpeed: { value: 1 },
    uBrightness: { value: 1 },
    uColorA: { value: new Color('#a8c0ff') },
    uColorB: { value: new Color('#fff1dc') },
    uScrollDrift: { value: 0 },
    uMap: { value: sprite },
  };

  const material = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: uniforms as unknown as ShaderMaterial['uniforms'],
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });

  const points = new Points(geometry, material);
  // Bounds are shader-driven; never let a stale sphere cull the field.
  points.frustumCulled = false;
  points.renderOrder = 1;

  return {
    points,
    uniforms,
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
      sprite.dispose();
    },
  };
}
