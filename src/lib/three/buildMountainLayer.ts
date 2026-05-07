import { Mesh, MeshBasicMaterial, Shape, ShapeGeometry } from 'three';

export interface MountainLayerHandle {
  mesh: Mesh;
  geometry: ShapeGeometry;
  material: MeshBasicMaterial;
}

/**
 * Earthy mountain silhouette plane — the experience-page world hint. Sits
 * at the lower-right of the scene, behind the horizon glow but in front of
 * the galaxy, so it reads as a distant landscape on the warm side of the
 * envMap.
 *
 * Generated procedurally: a `Shape` traced along a profile of layered sine
 * waves (one slow undulation, one quicker secondary ridge) so the silhouette
 * has natural-looking peaks without committing to a literal mountain shape.
 */
const MOUNTAIN_HALF_WIDTH = 22;
const MOUNTAIN_SEGMENTS = 14;
const MOUNTAIN_COLOR = 0x1a2210;

function generateRidgeProfile(
  halfWidth: number,
  segments: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = -halfWidth + 2 * halfWidth * t;
    // Slow primary undulation + quicker secondary ridge for variety. The
    // constants are picked so peaks never touch the bottom-of-title line at
    // y ≈ 4 in scene units.
    const primary = Math.sin(t * Math.PI * 2.4) * 1.6;
    const secondary = Math.sin(t * Math.PI * 7.1) * 0.45;
    const tertiary = Math.cos(t * Math.PI * 13.3) * 0.18;
    const y = 1.4 + primary + secondary + tertiary;
    points.push([x, y]);
  }
  return points;
}

export function buildMountainLayer(): MountainLayerHandle {
  const shape = new Shape();
  const profile = generateRidgeProfile(MOUNTAIN_HALF_WIDTH, MOUNTAIN_SEGMENTS);

  shape.moveTo(-MOUNTAIN_HALF_WIDTH, 0);
  for (const [x, y] of profile) {
    shape.lineTo(x, y);
  }
  shape.lineTo(MOUNTAIN_HALF_WIDTH, 0);
  shape.closePath();

  const geometry = new ShapeGeometry(shape);
  const material = new MeshBasicMaterial({
    color: MOUNTAIN_COLOR,
    transparent: true,
    opacity: 0.92,
    fog: false,
  });
  const mesh = new Mesh(geometry, material);
  // Lower-right of frame, behind the title; pivot is at the silhouette's base
  mesh.position.set(3, -7.5, -11);

  return { mesh, geometry, material };
}
