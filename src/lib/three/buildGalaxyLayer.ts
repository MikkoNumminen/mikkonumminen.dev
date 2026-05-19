import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  PointsMaterial,
} from 'three';

export interface GalaxyLayerOptions {
  /**
   * `spiral` produces a multi-armed log-spiral disk; `elliptical` produces
   * a denser ellipsoidal blob (no arms) for visual contrast when two
   * galaxies share the scene.
   */
  shape?: 'spiral' | 'elliptical';
  starCount?: number;
  radius?: number;
  arms?: number;
  spiralTightness?: number;
  color?: number;
  starSize?: number;
  /** Group position [x, y, z] in scene units. */
  position?: [number, number, number];
  /** Group rotation [x, y, z] in radians. */
  rotation?: [number, number, number];
  /** Disk thickness for `spiral`, ignored for `elliptical`. */
  diskThickness?: number;
  /** Semi-axes [x, y, z] for `elliptical`. Ignored for `spiral`. */
  semiAxes?: [number, number, number];
}

export interface GalaxyLayerHandle {
  group: Group;
  starsGeometry: BufferGeometry;
  starsMaterial: PointsMaterial;
  /**
   * Drive the slow z-axis rotation and decay any click impulse.
   * `elapsed` is the scene clock in seconds — used as the absolute
   * rotation angle so the spin never drifts after visibility-pause
   * resumes. Previously the rotation was set inline in homeScene's tick;
   * folded into the handle here so all galaxy state lives in one place.
   */
  tick: (delta: number, elapsed: number) => void;
  /**
   * Trigger a one-shot brightness flare — point size pops and opacity
   * brightens for ~600 ms before easing back. Reads as "the galaxy lit
   * up" without needing a per-vertex shader for a true radial wave.
   */
  play: () => void;
}

const DEFAULTS: Required<GalaxyLayerOptions> = {
  shape: 'spiral',
  starCount: 700,
  radius: 8,
  arms: 3,
  spiralTightness: 2.5,
  color: 0x80a8ff,
  starSize: 0.085,
  position: [-14, -5, -18],
  rotation: [-Math.PI * 0.18, 0, Math.PI * 0.12],
  diskThickness: 0.8,
  semiAxes: [3.2, 2.6, 2.2],
};

function generateSpiralStars(opts: Required<GalaxyLayerOptions>): Float32Array {
  const positions = new Float32Array(opts.starCount * 3);
  const armOffset = (Math.PI * 2) / opts.arms;

  for (let i = 0; i < opts.starCount; i++) {
    const arm = i % opts.arms;
    const t = Math.sqrt(i / opts.starCount);
    const r = t * opts.radius;
    const angle = arm * armOffset + t * Math.PI * opts.spiralTightness;
    const angleJitter = (Math.random() - 0.5) * 0.45;
    const radialJitter = (Math.random() - 0.5) * 0.6;
    const finalAngle = angle + angleJitter;
    const finalR = r + radialJitter;

    const i3 = i * 3;
    positions[i3] = Math.cos(finalAngle) * finalR;
    positions[i3 + 1] = Math.sin(finalAngle) * finalR;
    positions[i3 + 2] = (Math.random() - 0.5) * opts.diskThickness;
  }
  return positions;
}

/**
 * Ellipsoidal star distribution — uniform-direction unit vectors scaled
 * by a center-biased radial factor and the per-axis semi-axes. The bias
 * (`pow(rand, 0.55)`) concentrates stars toward the core so the result
 * reads as a dense fuzzy blob with a fading halo, not a hollow shell.
 */
function generateEllipticalStars(opts: Required<GalaxyLayerOptions>): Float32Array {
  const positions = new Float32Array(opts.starCount * 3);
  const [sx, sy, sz] = opts.semiAxes;

  for (let i = 0; i < opts.starCount; i++) {
    const r = Math.pow(Math.random(), 0.55);
    const cosPhi = 2 * Math.random() - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const theta = Math.random() * Math.PI * 2;

    const i3 = i * 3;
    positions[i3] = sinPhi * Math.cos(theta) * r * sx;
    positions[i3 + 1] = cosPhi * r * sy;
    positions[i3 + 2] = sinPhi * Math.sin(theta) * r * sz;
  }
  return positions;
}

/**
 * Procedural spiral galaxy — defaults to the cool blue projects-world hint
 * in the lower-left of the hero scene. Pass options to make a different
 * galaxy (different color, fewer arms, smaller radius, different position)
 * — the second galaxy used for the periodic collision is just another
 * call to this function with tighter parameters.
 */
export function buildGalaxyLayer(opts: GalaxyLayerOptions = {}): GalaxyLayerHandle {
  const config: Required<GalaxyLayerOptions> = { ...DEFAULTS, ...opts };

  const group = new Group();

  const positions =
    config.shape === 'elliptical'
      ? generateEllipticalStars(config)
      : generateSpiralStars(config);
  const starsGeometry = new BufferGeometry();
  starsGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  const starsMaterial = new PointsMaterial({
    size: config.starSize,
    color: config.color,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const stars = new Points(starsGeometry, starsMaterial);
  group.add(stars);

  group.position.set(...config.position);
  group.rotation.set(...config.rotation);
  // Snapshot the configured z-rotation so the per-frame tick can layer
  // the slow spin on top of it without losing the original tilt.
  const baseRotZ = group.rotation.z;
  const baseSize = config.starSize;
  const baseOpacity = 0.85;

  let clickImpulse = 0;
  // Negative so arms trail rotation (real spiral galaxies rotate against the
  // arm curl). Arm geometry sweeps CCW with radius, so spin must be CW.
  const SPIN_RATE = -0.04;
  const PLAY_SIZE_PEAK = 0.5; // +50% point size at impulse=1
  const PLAY_OPACITY_PEAK = 0.15; // 0.85 → 1.0 at impulse=1
  const PLAY_DECAY = 1.8; // per-second; ~550 ms back to imperceptible

  const tick = (delta: number, elapsed: number): void => {
    group.rotation.z = baseRotZ + elapsed * SPIN_RATE;
    if (clickImpulse > 0) {
      clickImpulse = Math.max(0, clickImpulse - delta * PLAY_DECAY);
    }
    starsMaterial.size = baseSize * (1 + clickImpulse * PLAY_SIZE_PEAK);
    starsMaterial.opacity = Math.min(1, baseOpacity + clickImpulse * PLAY_OPACITY_PEAK);
  };

  const play = (): void => {
    clickImpulse = 1;
  };

  return { group, starsGeometry, starsMaterial, tick, play };
}
