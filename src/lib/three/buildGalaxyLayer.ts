import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  PointsMaterial,
} from 'three';

export interface GalaxyLayerHandle {
  group: Group;
  starsGeometry: BufferGeometry;
  starsMaterial: PointsMaterial;
}

/**
 * Far-back blue galaxy spiral — the projects-page world hint. Sits in the
 * lower-left of the scene (offset via group.position) so it appears behind
 * and to the side of the title without competing with it.
 *
 * Spiral arms are generated procedurally: three arms, log-spiral tightness,
 * with jitter for organic feel.
 */
const GALAXY_STAR_COUNT = 700;
const GALAXY_RADIUS = 8;
const GALAXY_ARMS = 3;
const SPIRAL_TIGHTNESS = 2.5;
const GALAXY_COLOR = 0x80a8ff;

function generateSpiralStars(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const armOffset = (Math.PI * 2) / GALAXY_ARMS;

  for (let i = 0; i < count; i++) {
    const arm = i % GALAXY_ARMS;
    // Bias toward the outer arms by sqrt-distributing t
    const t = Math.sqrt(i / count);
    const r = t * GALAXY_RADIUS;
    const angle = arm * armOffset + t * Math.PI * SPIRAL_TIGHTNESS;
    // Jitter angle and radial position so stars don't sit perfectly on the line
    const angleJitter = (Math.random() - 0.5) * 0.45;
    const radialJitter = (Math.random() - 0.5) * 0.6;
    const finalAngle = angle + angleJitter;
    const finalR = r + radialJitter;

    const i3 = i * 3;
    positions[i3] = Math.cos(finalAngle) * finalR;
    positions[i3 + 1] = Math.sin(finalAngle) * finalR;
    // Thin disk thickness — galaxies are mostly flat
    positions[i3 + 2] = (Math.random() - 0.5) * 0.8;
  }
  return positions;
}

export function buildGalaxyLayer(): GalaxyLayerHandle {
  const group = new Group();

  // Spiral stars
  const positions = generateSpiralStars(GALAXY_STAR_COUNT);
  const starsGeometry = new BufferGeometry();
  starsGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  const starsMaterial = new PointsMaterial({
    size: 0.085,
    color: GALAXY_COLOR,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const stars = new Points(starsGeometry, starsMaterial);
  group.add(stars);

  // Position the whole galaxy lower-left and far back
  group.position.set(-14, -5, -18);
  // Tilt so the spiral plane is angled toward the viewer
  group.rotation.x = -Math.PI * 0.18;
  group.rotation.z = Math.PI * 0.12;

  return { group, starsGeometry, starsMaterial };
}
