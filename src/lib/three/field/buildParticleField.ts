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
 *
 * Numeric tuning for the name state's micro-life lives in `tuning.ts`
 * and is interpolated into the GLSL source below as compile-time
 * constants, so the knobs sit in one block outside the shader.
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
import { FIELD_TUNING, glslFloat } from './tuning';

export interface ParticleFieldOptions {
  count: number;
  /** Galaxy-state positions in local disk space (len = count*3). */
  galaxyPositions: Float32Array;
  /** Name-state positions in world units at unit scale (len = count*3). */
  namePositions: Float32Array;
  /** Per-particle name-state dim flag (0 = glyph, 1 = background dust
   *  that fades hard while the name is formed). len = count. */
  nameDim: Float32Array;
  /** Wordmark-state positions at unit scale (len = count*3), and its own
   *  dim flag (len = count). Both zero-filled when the wordmark raster
   *  failed — the idle choreography skips the formation in that case,
   *  but the attributes must still exist for the program to link. */
  wordPositions: Float32Array;
  wordDim: Float32Array;
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
  /** Two name-click impulse slots: xy = origin on the z=0 plane, z =
   *  start time in scene seconds, w = strength. Two rather than one so a
   *  re-strike during a return adds to the decaying first instead of
   *  restarting it from wherever the particle currently sits. */
  uImpulses: { value: [Vector4, Vector4] };
  /** Idle-choreography blend: 0 = the name (or whatever the load-in and
   *  scroll say), 1 = fully in the current idle formation. */
  uIdle: { value: number };
  /** Weights over the three idle formations [galaxy, word, sparse]. */
  uIdleWeights: { value: Vector3 };
  /** Idle galaxy variant: xyz = world anchor, w = scale. */
  uIdleGalaxy: { value: Vector4 };
  uIdleGalaxyTilt: { value: Matrix3 };
  uIdleGalaxySpin: { value: number };
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

const M = FIELD_TUNING.microLife;
const I = FIELD_TUNING.impulse;
const D = FIELD_TUNING.idle;

const VERTEX_SHADER = /* glsl */ `
attribute vec3 aNamePos;
attribute float aNameDim;
attribute vec3 aWordPos;
attribute float aWordDim;
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
uniform vec4 uImpulses[2];
uniform float uIdle;
uniform vec3 uIdleWeights;
uniform vec4 uIdleGalaxy;
uniform mat3 uIdleGalaxyTilt;
uniform float uIdleGalaxySpin;
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

// Micro-life constants, injected from FIELD_TUNING (field/tuning.ts) so
// every knob lives in one block outside the shader. Compile-time
// literals — the driver folds them; none of this costs a uniform read.
const float NAME_SWAY = ${glslFloat(M.nameSway)};
const float NAME_SHIMMER = ${glslFloat(M.nameShimmer)};
const float NAME_SHIMMER_SPEED = ${glslFloat(M.nameShimmerSpeed)};
const float NAME_TWINKLE = ${glslFloat(M.nameTwinkle)};
const float WAVE_PERIOD = ${glslFloat(M.wavePeriod)};
const float WAVE_FREQUENCY = ${glslFloat(M.waveFrequency)};
const float WAVE_SHARPNESS = ${glslFloat(M.waveSharpness)};
const float WAVE_GAIN = ${glslFloat(M.waveGain)};
const float STRAY_FRACTION = ${glslFloat(M.strayFraction)};
const float STRAY_PERIOD = ${glslFloat(M.strayPeriod)};
const float STRAY_DUTY = ${glslFloat(M.strayDuty)};
const float STRAY_DISTANCE = ${glslFloat(M.strayDistance)};
const float IMPULSE_RADIUS = ${glslFloat(I.radius)};
const float IMPULSE_PUSH = ${glslFloat(I.push)};
const float IMPULSE_ATTACK = ${glslFloat(I.attack)};
const float IMPULSE_RETURN_MIN = ${glslFloat(I.returnMin)};
const float IMPULSE_RETURN_MAX = ${glslFloat(I.returnMax)};
const float IMPULSE_LIFT = ${glslFloat(I.lift)};
const float SPARSE_RADIUS = ${glslFloat(D.sparseRadius)};
const float SPARSE_ASPECT = ${glslFloat(D.sparseAspect)};
const float SPARSE_DEPTH = ${glslFloat(D.sparseDepth)};

const float PI = 3.14159265;
const float TAU = 6.28318531;

// Per-particle staggered progress: particles with a low seed lead the
// morph, high seeds trail, so transitions sweep through the field.
float staggered(float u, float sd) {
  return smoothstep(0.0, 1.0, clamp(u * 1.35 - sd * 0.35, 0.0, 1.0));
}

// Hash11 (Dave Hoskins). The seed attribute's four components are all
// spoken for as ordered quantities (stagger, size, density rank, palette
// mix); hashing decorrelates the micro-life draws from them, which
// matters most for the density rank — using it raw would make any
// density cull remove a spatially coherent slab.
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// Idle formation (c): a calm centred cloud, derived from hashed seeds
// rather than stored in an attribute — 24k particles' worth of free
// positions. Hashed rather than read raw for the reason above: the
// density rank is one of the seed components, and using it as a
// coordinate would make the density drop this formation applies carve a
// spatially coherent slab out of the cloud instead of thinning it.
vec3 sparseTarget(vec4 seed) {
  float r = pow(hash11(seed.x * 12.9898 + 78.233), 0.5) * SPARSE_RADIUS;
  float cz = hash11(seed.w * 39.346 + 11.135) * 2.0 - 1.0;
  float sz = sqrt(max(0.0, 1.0 - cz * cz));
  float az = hash11(seed.y * 53.771 + 27.319) * TAU;
  return vec3(sz * cos(az) * r * SPARSE_ASPECT, cz * r, sz * sin(az) * r * SPARSE_DEPTH);
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

  // Idle choreography: alternative formations the field cycles through
  // when nobody is interacting. Three weighted targets rather than a
  // swappable buffer or a branch, so ANY shape can cross-fade to any
  // other — the cycle has consecutive alternatives, and routing each
  // one through the name would flash the name mid-choreography.
  //
  // The whole block sits BEFORE the dissolve mix on purpose: scroll wins
  // by construction, because at uDissolve 1 the starfield is the answer
  // no matter what idle is doing.
  float idleMix = staggered(uIdle, sd);
  if (uIdle > 0.0) {
    float ic = cos(uIdleGalaxySpin);
    float is = sin(uIdleGalaxySpin);
    vec3 ig = position;
    ig.xy = mat2(ic, -is, is, ic) * ig.xy;
    ig = uIdleGalaxyTilt * ig * uIdleGalaxy.w + uIdleGalaxy.xyz;

    vec3 idle = uIdleWeights.x * ig
      + uIdleWeights.y * (aWordPos * uNameScale)
      + uIdleWeights.z * sparseTarget(aSeed);
    pos = mix(pos, idle, idleMix);
  }

  pos = mix(pos, aStarPos, dissolve);

  // Cheap trig pseudo-noise drift. Amplitude collapses to a shimmer in
  // the name state (legibility) and relaxes in the starfield.
  float t = uTime * uDriftSpeed;
  vec3 wob = vec3(
    sin(t * 0.9 + sd * 6.2831 + pos.y * 0.35),
    cos(t * 0.7 + sd * 9.0 + pos.x * 0.30),
    sin(t * 0.5 + aSeed.w * 6.2831)
  );
  float amp = mix(mix(1.0, NAME_SWAY, form), 0.55, dissolve) * uDriftAmp;
  pos += wob * amp;

  // ── Micro-life ───────────────────────────────────────────────────────
  // The formed name is the one state with no motion of its own, and a
  // frozen field reads as a finished PNG. Everything below is masked to
  // glyph particles in the name state, and sized well under the ~0.43
  // world glyph stem so the letterforms never soften.
  float nameState = form * (1.0 - dissolve);
  // Micro-life belongs to the name and nothing else — it fades out as
  // the field leaves for an idle formation and returns with it.
  float glyph = nameState * (1.0 - aNameDim) * (1.0 - idleMix);

  // Faster than the sway above and out of phase per particle: amplitude
  // alone just makes the name lean, frequency is what reads as shimmer.
  vec3 shimmer = vec3(
    sin(uTime * NAME_SHIMMER_SPEED + sd * 40.0),
    cos(uTime * NAME_SHIMMER_SPEED * 1.13 + aSeed.w * 37.0),
    sin(uTime * NAME_SHIMMER_SPEED * 0.87 + aSeed.y * 29.0)
  );
  pos += shimmer * (NAME_SHIMMER * glyph);

  // Strays: a hashed slice of the glyph particles wanders off the
  // letterform and eases back on its own phase. sin^2 has zero slope at
  // both ends, so an excursion departs and lands without a visible kink.
  float strayOn = step(1.0 - STRAY_FRACTION, hash11(aSeed.x * 91.7 + aSeed.w * 13.3));
  float strayCycle = fract(uTime / STRAY_PERIOD + hash11(aSeed.w * 5.31 + 2.7));
  float strayEnv = sin(PI * min(strayCycle / STRAY_DUTY, 1.0));
  float strayAz = hash11(aSeed.w * 7.13 + 1.7) * TAU;
  float strayCos = hash11(aSeed.x * 3.71 + 5.3) * 2.0 - 1.0;
  float straySin = sqrt(max(0.0, 1.0 - strayCos * strayCos));
  pos += vec3(straySin * cos(strayAz), straySin * sin(strayAz), strayCos) *
    (strayEnv * strayEnv * STRAY_DISTANCE * glyph * strayOn);

  // Scroll drift applies BEFORE the interaction block: the pointer and
  // ripple origins are converted from screen coordinates, so they refer
  // to where particles VISUALLY sit — which includes the drift offset.
  pos.y += uScrollDrift;

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

  // Name-click impulse — a local strike, not a travelling ring: an
  // immediate radial kick that eases back to the glyph target over a
  // per-particle window, so the name reassembles organically instead of
  // snapping back as a unit. Two slots, so a re-strike mid-return adds
  // to the first rather than restarting it from a displaced position.
  // Branchless on purpose: an inactive slot parks its start time far in
  // the past, which clamps its envelope to zero.
  for (int i = 0; i < 2; i++) {
    vec4 im = uImpulses[i];
    float life = IMPULSE_RETURN_MIN + aSeed.x * (IMPULSE_RETURN_MAX - IMPULSE_RETURN_MIN);
    float age = uTime - im.z;
    float k = clamp(age / life, 0.0, 1.0);
    float settle = (1.0 - k) * (1.0 - k);
    // Masked by idleMix as well as the name state: a strike belongs to
    // the name, and a decaying one must not follow the field out into an
    // idle formation if the idle delay is ever tuned below its lifetime.
    float env =
      smoothstep(0.0, IMPULSE_ATTACK, age) * settle * im.w * nameState * (1.0 - idleMix);
    vec2 d3 = eq - im.xy;
    float id = length(d3);
    float fall = smoothstep(IMPULSE_RADIUS, 0.0, id);
    pos.xy += (d3 / max(id, 1e-4)) * fall * env * IMPULSE_PUSH;
    pos.z += fall * env * IMPULSE_LIFT * (aSeed.w * 2.0 - 1.0);
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // Density culling without geometry churn: ranks above the current
  // density collapse to size 0 (still processed, never drawn).
  float vis = step(aSeed.z, uDensity);
  // Name legibility: while the name is formed, background-dust particles
  // shrink and dim hard so the letterforms are the unambiguous subject.
  // The wordmark formation hands that role to its own dust flag; the
  // galaxy and sparse formations have no subject to protect, and their
  // zero weight drops the dimming entirely.
  float dust = mix(aNameDim, aWordDim * uIdleWeights.y, idleMix) * nameState;
  float stateSize = mix(mix(1.0, 0.75, form), 0.7, dissolve) * (1.0 - dust * 0.35);
  gl_PointSize = uSize * aSeed.y * stateSize * vis * uPixelRatio * (12.0 / -mv.z);

  // Twinkle — loud in the galaxy, restrained in the name state so the
  // letterforms hold steady, gentle in the starfield.
  float twAmp = mix(mix(0.30, NAME_TWINKLE, form), 0.22, dissolve);
  float tw = 1.0 - twAmp + twAmp * sin(uTime * (1.2 + aSeed.y) + sd * 6.2831);

  // Brightness wave: a highlight travelling letter to letter across the
  // formed name. Phase comes from NAME-space x, not the live position,
  // so the crest tracks the letterforms rather than being dragged around
  // by shimmer, cursor push and ripples.
  float wavePhase = uTime * (TAU / WAVE_PERIOD) - aNamePos.x * WAVE_FREQUENCY;
  float wave = pow(0.5 + 0.5 * cos(wavePhase), WAVE_SHARPNESS);

  vColor = mix(uColorA, uColorB, aSeed.w);
  vAlpha =
    uBrightness * vis * tw * (1.0 - dust * 0.78) * (1.0 + WAVE_GAIN * wave * glyph);
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
  geometry.setAttribute('aWordPos', new BufferAttribute(opts.wordPositions, 3));
  geometry.setAttribute('aWordDim', new BufferAttribute(opts.wordDim, 1));
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
  // The idle variant's own lean — the same disk turned toward the
  // viewer, which is what makes it read as a variation rather than a
  // rewind of the load-in.
  const idleTilt = new Matrix3().setFromMatrix4(
    new Matrix4().makeRotationFromEuler(
      new Euler(D.galaxyVariant.tiltX, 0, D.galaxyVariant.tiltZ),
    ),
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
    uImpulses: {
      value: [new Vector4(0, 0, -1e4, 0), new Vector4(0, 0, -1e4, 0)],
    },
    uIdle: { value: 0 },
    uIdleWeights: { value: new Vector3(1, 0, 0) },
    uIdleGalaxy: {
      value: new Vector4(
        D.galaxyVariant.x,
        D.galaxyVariant.y,
        D.galaxyVariant.z,
        D.galaxyVariant.scale,
      ),
    },
    uIdleGalaxyTilt: { value: idleTilt },
    uIdleGalaxySpin: { value: 0 },
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
    // Safe cast: ParticleFieldUniforms is a structural subtype of the
    // IUniform record three expects — narrowed here only so callers get
    // typed uniform access instead of string lookups.
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
