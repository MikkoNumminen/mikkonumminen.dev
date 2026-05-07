import { Group, Mesh, MeshPhysicalMaterial } from 'three';
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

export function buildTitle(font: Font, title: string): TitleHandle {
  const group = new Group();
  // Pure white tint so the envMap dominates the look — the warm sun and cool
  // counter-glow we baked into the environment carry the color story. High
  // metalness + low roughness = real chrome that reflects the world; clearcoat
  // adds a polished lacquer over the top.
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.95,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    reflectivity: 1,
    envMapIntensity: 1.25,
  });

  const lines = title.split('\n');
  const meshes: Mesh[] = [];
  let lineY = 0;
  for (const line of lines) {
    const geometry = new TextGeometry(line, {
      font,
      size: 2.2,
      depth: 0.7,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.07,
      bevelSegments: 6,
    });
    geometry.computeBoundingBox();
    // `computeBoundingBox` populates `boundingBox` synchronously, so the
    // assertion is safe in the very next statement.
    const bb = geometry.boundingBox!;
    const width = bb.max.x - bb.min.x;
    const height = bb.max.y - bb.min.y;
    geometry.translate(-width / 2, -height / 2, 0);

    const mesh = new Mesh(geometry, material);
    mesh.position.y = lineY;
    group.add(mesh);
    meshes.push(mesh);
    lineY -= height + 0.6;
  }

  const totalHeight = -lineY - 0.6;
  group.position.y = totalHeight / 2;

  return { group, meshes, material, totalHeight };
}
