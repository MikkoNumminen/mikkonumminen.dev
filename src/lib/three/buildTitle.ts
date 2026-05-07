import { Group, Mesh, MeshPhysicalMaterial } from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export interface TitleSegmentSpec {
  text: string;
  material: MeshPhysicalMaterial;
}

export interface TitleLineSpec {
  segments: TitleSegmentSpec[];
}

export interface TitleHandle {
  group: Group;
  meshes: Mesh[];
  /** All distinct materials referenced by the segments — caller disposes. */
  materials: MeshPhysicalMaterial[];
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
const DEPTH = 0.7;
const CURVE_SEGMENTS = 12;
const BEVEL_THICKNESS = 0.09;
const BEVEL_SIZE = 0.07;
const BEVEL_SEGMENTS = 6;
const LINE_GAP = 0.6;

/**
 * Build the title as a stack of lines, each composed of one or more
 * themed segments laid out adjacent left-to-right. Each segment has its
 * own material so the four worlds can each be visually represented in
 * the letterforms — e.g. "MIK" in projects-blue chrome, "KO" in home
 * white chrome, "NUMM" in experience-bronze, "INEN" in contact-phosphor
 * green. The segment seams are invisible because adjacent characters
 * (like the two K's in MIKKO) sit flush against each other.
 */
export function buildTitle(font: Font, lines: TitleLineSpec[]): TitleHandle {
  const group = new Group();
  const allMeshes: Mesh[] = [];
  const allMaterials: MeshPhysicalMaterial[] = [];
  let lineY = 0;

  for (const line of lines) {
    const geometries: TextGeometry[] = [];
    const widths: number[] = [];
    let lineHeight = 0;

    for (const seg of line.segments) {
      const geometry = new TextGeometry(seg.text, {
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
      const cy = (bb.max.y + bb.min.y) / 2;
      // Origin at left-edge / vertical-center so we can place segments by
      // left x and align them on a shared horizontal axis.
      geometry.translate(-bb.min.x, -cy, 0);
      geometries.push(geometry);
      widths.push(width);
      lineHeight = Math.max(lineHeight, height);
    }

    const totalLineWidth = widths.reduce((a, b) => a + b, 0);
    let xCursor = -totalLineWidth / 2;

    for (let i = 0; i < line.segments.length; i++) {
      const seg = line.segments[i]!;
      const geometry = geometries[i]!;
      const width = widths[i]!;
      const mesh = new Mesh(geometry, seg.material);
      mesh.position.set(xCursor, lineY, 0);
      group.add(mesh);
      allMeshes.push(mesh);
      if (!allMaterials.includes(seg.material)) {
        allMaterials.push(seg.material);
      }
      xCursor += width;
    }

    lineY -= lineHeight + LINE_GAP;
  }

  const totalHeight = -lineY - LINE_GAP;
  group.position.y = totalHeight / 2;

  return { group, meshes: allMeshes, materials: allMaterials, totalHeight };
}

/**
 * Convenience: build the four themed materials used to decorate the four
 * segments of the title. Each is a chrome variant tinted toward one of the
 * four worlds; contact additionally emits a faint phosphor green so it
 * reads as a lit screen rather than just colored metal.
 */
export interface TitleMaterials {
  projects: MeshPhysicalMaterial;
  home: MeshPhysicalMaterial;
  experience: MeshPhysicalMaterial;
  contact: MeshPhysicalMaterial;
}

export function buildTitleMaterials(): TitleMaterials {
  const baseChrome = {
    metalness: 0.95,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    reflectivity: 1,
    envMapIntensity: 1.25,
  } as const;

  const projects = new MeshPhysicalMaterial({
    color: 0xa8c4ff,
    ...baseChrome,
  });
  const home = new MeshPhysicalMaterial({
    color: 0xffffff,
    ...baseChrome,
  });
  const experience = new MeshPhysicalMaterial({
    color: 0xd4a373,
    ...baseChrome,
    roughness: 0.14,
    envMapIntensity: 1.1,
  });
  const contact = new MeshPhysicalMaterial({
    color: 0x8df5a4,
    ...baseChrome,
    metalness: 0.85,
    roughness: 0.12,
    emissive: 0x4ade80,
    emissiveIntensity: 0.22,
  });

  return { projects, home, experience, contact };
}
