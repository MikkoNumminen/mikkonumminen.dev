import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  PointsMaterial,
} from 'three';

export interface GalaxyLayerOptions {
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
  /** Multiplier applied each frame to make galaxies that should look denser. */
  diskThickness?: number;
}

export interface GalaxyLayerHandle {
  group: Group;
  starsGeometry: BufferGeometry;
  starsMaterial: PointsMaterial;
}

const DEFAULTS: Required<GalaxyLayerOptions> = {
  starCount: 700,
  radius: 8,
  arms: 3,
  spiralTightness: 2.5,
  color: 0x80a8ff,
  starSize: 0.085,
  position: [-14, -5, -18],
  rotation: [-Math.PI * 0.18, 0, Math.PI * 0.12],
  diskThickness: 0.8,
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
 * Procedural spiral galaxy — defaults to the cool blue projects-world hint
 * in the lower-left of the hero scene. Pass options to make a different
 * galaxy (different color, fewer arms, smaller radius, different position)
 * — the second galaxy used for the periodic collision is just another
 * call to this function with tighter parameters.
 */
export function buildGalaxyLayer(opts: GalaxyLayerOptions = {}): GalaxyLayerHandle {
  const config: Required<GalaxyLayerOptions> = { ...DEFAULTS, ...opts };

  const group = new Group();

  const positions = generateSpiralStars(config);
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

  return { group, starsGeometry, starsMaterial };
}
