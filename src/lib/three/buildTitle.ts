import { type BufferAttribute, Group, Mesh, type MeshPhysicalMaterial } from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export interface TitleHandle {
  group: Group;
  meshes: Mesh[];
  material: MeshPhysicalMaterial;
  /** Total stacked height of all lines, used to vertically center the group. */
  totalHeight: number;
}

export function loadFont(url: string): Promise<Font> {
  const loader = new FontLoader();
  return new Promise<Font>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

const SIZE = 2.2;
/** Extrusion depth of the title geometry. Exported so per-zone decor can
 * align to the midplane of the extruded letters. */
export const DEPTH = 0.7;
const CURVE_SEGMENTS = 12;
const BEVEL_THICKNESS = 0.09;
const BEVEL_SIZE = 0.07;
const BEVEL_SEGMENTS = 6;
const LINE_GAP = 0.6;

/**
 * Width of `text` rendered with the same TextGeometry settings buildTitle
 * uses, so callers can compute world-space x ranges for substrings (e.g.
 * "where in MIKKO does the K-K sit") and place per-zone decor accordingly.
 * Disposes the throwaway geometry before returning.
 */
export function measureTextWidth(font: Font, text: string): number {
  if (text.length === 0) return 0;
  const geo = new TextGeometry(text, {
    font,
    size: SIZE,
    depth: DEPTH,
    curveSegments: CURVE_SEGMENTS,
    bevelEnabled: true,
    bevelThickness: BEVEL_THICKNESS,
    bevelSize: BEVEL_SIZE,
    bevelSegments: BEVEL_SEGMENTS,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const w = bb.max.x - bb.min.x;
  geo.dispose();
  return w;
}

/**
 * Rewrite TextGeometry's UVs so they span [0, 1] across the geometry's
 * own bounding box, regardless of the geometry's world position.
 *
 * `ExtrudeGeometry`'s default UVs are world-coord based (`u = vertex.x`,
 * `v = vertex.y`) which means a `texture.repeat` value would have to know
 * the geometry's width and position to lay a single horizontal gradient
 * across each line. Remapping to local-bbox space lets us share one
 * gradient texture across both lines — `MIKKO` and `NUMMINEN` each get
 * the full 0→1 sweep across their own width.
 */
function remapUVsToLocalBBox(
  geometry: TextGeometry,
  bbMinX: number,
  bbMinY: number,
  width: number,
  height: number,
): void {
  const positions = geometry.attributes.position as BufferAttribute;
  const uvs = geometry.attributes.uv as BufferAttribute;
  for (let i = 0; i < uvs.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    uvs.setXY(i, (x - bbMinX) / width, (y - bbMinY) / height);
  }
  uvs.needsUpdate = true;
}

/**
 * Build the title as a stack of lines, each rendered as a single
 * TextGeometry sharing one material. The shared material's `map` (a
 * horizontal four-world gradient) flows continuously across each line —
 * no segment seams, no kerning artefacts.
 */
export function buildTitle(
  font: Font,
  title: string,
  material: MeshPhysicalMaterial,
): TitleHandle {
  const group = new Group();
  const meshes: Mesh[] = [];
  const lines = title.split('\n');
  let lineY = 0;

  for (const line of lines) {
    const geometry = new TextGeometry(line, {
      font,
      size: SIZE,
      depth: DEPTH,
      curveSegments: CURVE_SEGMENTS,
      bevelEnabled: true,
      bevelThickness: BEVEL_THICKNESS,
      bevelSize: BEVEL_SIZE,
      bevelSegments: BEVEL_SEGMENTS,
    });
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const width = bb.max.x - bb.min.x;
    const height = bb.max.y - bb.min.y;

    // Remap UVs BEFORE we translate the geometry so the local-space
    // measurement matches the original vertex positions.
    remapUVsToLocalBBox(geometry, bb.min.x, bb.min.y, width, height);

    geometry.translate(-width / 2, -height / 2, 0);

    const mesh = new Mesh(geometry, material);
    mesh.position.y = lineY;
    group.add(mesh);
    meshes.push(mesh);
    lineY -= height + LINE_GAP;
  }

  const totalHeight = -lineY - LINE_GAP;
  group.position.y = totalHeight / 2;

  return { group, meshes, material, totalHeight };
}
