import * as THREE from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export interface TitleHandle {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  material: THREE.MeshPhysicalMaterial;
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
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf3f6ff,
    metalness: 0.55,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    reflectivity: 0.85,
  });

  const lines = title.split('\n');
  const meshes: THREE.Mesh[] = [];
  let lineY = 0;
  for (const line of lines) {
    const geometry = new TextGeometry(line, {
      font,
      size: 2.2,
      depth: 0.45,
      curveSegments: 8,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.025,
      bevelSegments: 4,
    });
    geometry.computeBoundingBox();
    // `computeBoundingBox` populates `boundingBox` synchronously, so the
    // assertion is safe in the very next statement.
    const bb = geometry.boundingBox!;
    const width = bb.max.x - bb.min.x;
    const height = bb.max.y - bb.min.y;
    geometry.translate(-width / 2, -height / 2, 0);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = lineY;
    group.add(mesh);
    meshes.push(mesh);
    lineY -= height + 0.6;
  }

  const totalHeight = -lineY - 0.6;
  group.position.y = totalHeight / 2;

  return { group, meshes, material, totalHeight };
}
