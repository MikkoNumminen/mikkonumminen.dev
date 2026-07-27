import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  type WebGLRenderTarget,
} from 'three';
import type { LocalizedProject } from '../../../data/projects';
import { PLANET_BASE_RADIUS, TIER_TWO_DIM } from './constants';
import { createPlanetMaterial } from './buildPlanetMaterial';
import { bakePlanetSurface } from './bakePlanetSurface';

export interface PlanetEntry {
  project: LocalizedProject;
  /** The orbit-positioned wrapper that holds mesh, glow, and optional ring. */
  group: Group;
  mesh: Mesh;
  orbitLine: Line;
  /** Carries `uAngle`, which the tick advances with the planet. */
  orbitMaterial: ShaderMaterial;
  ring?: Mesh;
  /** The surface shader, so hover can lift its night side and the tick can
   *  keep its idea of where the star is. */
  material: ShaderMaterial;
  /**
   * The baked surface target. GPU memory that `Material.dispose()` does not
   * walk, so the entry carries it and teardown frees it explicitly.
   */
  surfaceTarget?: WebGLRenderTarget;
}

const ORBIT_SEGMENTS = 128;

export function buildPlanet(
  project: LocalizedProject,
  opts: { lowPerf?: boolean; renderer?: import('three').WebGLRenderer } = {},
): {
  entry: PlanetEntry;
  /** The tilted parent group that should be added to the scene. */
  rootGroup: Group;
} {
  const rootGroup = new Group();
  rootGroup.rotation.x = project.tilt;

  // Projects are not equals. Tier 2 keeps the same materials as tier 1 and is
  // pulled back on brightness only, so the ranking reads as distance and light
  // rather than as two different kinds of object.
  const tierDim = project.tier === 2 ? TIER_TWO_DIM : 1;

  const radius = PLANET_BASE_RADIUS * project.scale;
  const geometry = new SphereGeometry(
    radius,
    opts.lowPerf ? 24 : 48,
    opts.lowPerf ? 24 : 48,
  );
  // Baked once, here, so the draw shader carries no noise. Without a
  // renderer there is no GL context to bake into; the material still builds,
  // it just has nothing to sample.
  const baked = opts.renderer
    ? bakePlanetSurface(opts.renderer, project, { lowPerf: opts.lowPerf })
    : null;
  const material = createPlanetMaterial(project, {
    surface: baked?.texture ?? null,
    surfaceWidth: baked?.width,
    surfaceHeight: baked?.height,
  });
  const mesh = new Mesh(geometry, material);
  mesh.userData.projectId = project.id;

  const planetWrap = new Group();
  planetWrap.add(mesh);
  planetWrap.position.set(
    Math.cos(project.phase) * project.orbitRadius,
    0,
    Math.sin(project.phase) * project.orbitRadius,
  );

  let ring: Mesh | undefined;
  if (project.hasRing) {
    const ringGeometry = new RingGeometry(radius * 1.35, radius * 2, 64);
    const ringMaterial = new MeshBasicMaterial({
      color: new Color(project.ringColor ?? project.color),
      transparent: true,
      opacity: 0.5,
      side: DoubleSide,
      depthWrite: false,
    });
    ring = new Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2 - 0.4;
    planetWrap.add(ring);
  }

  rootGroup.add(planetWrap);

  // Orbit ring. A uniform-opacity ellipse reads as wireframe: twelve of them
  // is a diagram, not a sky. Each vertex carries its own angle around the
  // circle, and the shader compares it against the planet's current angle, so
  // the ring brightens into a wake behind the body and fades away opposite.
  //
  // The angle is an attribute and the planet's position is one float uniform,
  // so nothing here is rebuilt per frame — the CPU cost is a single uniform
  // write per planet.
  const orbitGeometry = new BufferGeometry();
  const orbitPositions = new Float32Array((ORBIT_SEGMENTS + 1) * 3);
  const orbitAngles = new Float32Array(ORBIT_SEGMENTS + 1);
  for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
    const angle = (i / ORBIT_SEGMENTS) * Math.PI * 2;
    orbitPositions[i * 3] = Math.cos(angle) * project.orbitRadius;
    orbitPositions[i * 3 + 1] = 0;
    orbitPositions[i * 3 + 2] = Math.sin(angle) * project.orbitRadius;
    orbitAngles[i] = angle;
  }
  orbitGeometry.setAttribute('position', new BufferAttribute(orbitPositions, 3));
  orbitGeometry.setAttribute('aAngle', new BufferAttribute(orbitAngles, 1));
  const orbitMaterial = new ShaderMaterial({
    uniforms: {
      uAngle: { value: project.phase },
      uColor: { value: new Color(project.color) },
      uOpacity: { value: 0.42 * tierDim },
    },
    vertexShader: `
      attribute float aAngle;
      uniform float uAngle;
      varying float vTrail;
      void main() {
        // Fractional distance travelled since the planet passed this vertex.
        float d = fract((uAngle - aAngle) / 6.2831853);
        vTrail = pow(1.0 - d, 3.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTrail;
      void main() {
        gl_FragColor = vec4(uColor, vTrail * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const orbitLine = new Line(orbitGeometry, orbitMaterial);
  rootGroup.add(orbitLine);

  const entry: PlanetEntry = {
    project,
    group: planetWrap,
    mesh,
    orbitLine,
    orbitMaterial,
    ring,
    material,
    surfaceTarget: baked?.target,
  };

  return { entry, rootGroup };
}
