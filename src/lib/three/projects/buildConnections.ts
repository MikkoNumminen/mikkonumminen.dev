import { Color, Group, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { Connection } from '../../../data/projects';
import type { PlanetEntry } from './buildPlanet';

const ARC_SEGMENTS = 48;
const ARC_LIFT = 2.4;
const FLOW_SPEED = 1.1;

export interface ConnectionEntry {
  connection: Connection;
  source: PlanetEntry;
  target: PlanetEntry;
  /** Soft underglow drawn first; gives the line a halo. */
  haloLine: Line2;
  haloMaterial: LineMaterial;
  haloGeometry: LineGeometry;
  /** Bright dashed core that flows from source to target. */
  coreLine: Line2;
  coreMaterial: LineMaterial;
  coreGeometry: LineGeometry;
  /**
   * Direct references to each geometry's interleaved position buffer
   * (length 6 * ARC_SEGMENTS, layout `[startX,startY,startZ,endX,endY,endZ, …]`).
   * The per-frame update mutates these in place — no allocation, no
   * re-upload of a fresh BufferAttribute each tick.
   */
  haloPositions: Float32Array;
  corePositions: Float32Array;
  baseHaloOpacity: number;
  baseCoreOpacity: number;
}

export interface ConnectionsBundle {
  group: Group;
  entries: ConnectionEntry[];
}

export function buildConnections(
  connections: Connection[],
  planets: PlanetEntry[],
  resolution: { width: number; height: number },
): ConnectionsBundle {
  const group = new Group();
  group.renderOrder = 4;
  const entries: ConnectionEntry[] = [];

  for (const c of connections) {
    const source = planets.find((p) => p.project.id === c.sourceId);
    const target = planets.find((p) => p.project.id === c.targetId);
    if (!source || !target) continue;

    // setPositions takes a list of vertex xyz triples. We pass a zero-filled
    // initial buffer; the actual coordinates are written every frame in
    // updateConnections via direct interleaved-buffer mutation. The buffer
    // length determines segment count, so it must be sized correctly here.
    const initial = new Float32Array((ARC_SEGMENTS + 1) * 3);

    // Soft underglow — wider, lower opacity, no dashes.
    const haloGeometry = new LineGeometry();
    haloGeometry.setPositions(initial);
    const haloMaterial = new LineMaterial({
      color: new Color(c.color),
      linewidth: 7,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      worldUnits: false,
    });
    haloMaterial.resolution.set(resolution.width, resolution.height);
    const haloLine = new Line2(haloGeometry, haloMaterial);
    haloLine.renderOrder = 4;
    group.add(haloLine);
    // Halo line is solid (no dashes), so it never needs computeLineDistances.

    // Bright dashed core — narrower, animated dashOffset gives the
    // "data flowing source → target" effect.
    const coreGeometry = new LineGeometry();
    coreGeometry.setPositions(initial);
    const coreMaterial = new LineMaterial({
      color: new Color(c.color),
      linewidth: 2.2,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      dashed: true,
      dashSize: 0.55,
      gapSize: 0.45,
      dashOffset: 0,
      worldUnits: false,
    });
    coreMaterial.resolution.set(resolution.width, resolution.height);
    const coreLine = new Line2(coreGeometry, coreMaterial);
    coreLine.computeLineDistances();
    coreLine.renderOrder = 5;
    group.add(coreLine);

    // Grab references to the interleaved Float32Array backing each
    // geometry. setPositions allocated a fresh buffer of length
    // 6 * ARC_SEGMENTS; subsequent updates mutate this array directly.
    const haloPositions = haloGeometry.attributes.instanceStart.data
      .array as Float32Array;
    const corePositions = coreGeometry.attributes.instanceStart.data
      .array as Float32Array;

    entries.push({
      connection: c,
      source,
      target,
      haloLine,
      haloMaterial,
      haloGeometry,
      coreLine,
      coreMaterial,
      coreGeometry,
      haloPositions,
      corePositions,
      baseHaloOpacity: haloMaterial.opacity,
      baseCoreOpacity: coreMaterial.opacity,
    });
  }

  return { group, entries };
}

// Scratch vectors hoisted to module scope so the per-frame update path
// allocates nothing.
const _src = new Vector3();
const _tgt = new Vector3();
const _mid = new Vector3();
const _p = new Vector3();

export function updateConnections(entries: ConnectionEntry[]): void {
  for (const e of entries) {
    e.source.group.getWorldPosition(_src);
    e.target.group.getWorldPosition(_tgt);

    // Quadratic Bézier: midpoint lifted above the ecliptic so the arc
    // is visible even when both planets sit on the same side of the sun.
    _mid.copy(_src).add(_tgt).multiplyScalar(0.5);
    _mid.y += ARC_LIFT;

    // Mutate the interleaved buffer in place. Each segment occupies six
    // floats: three for the start vertex, three for the end vertex. Vertex
    // i is the "end" of segment (i-1) AND the "start" of segment i, so we
    // write each computed point into both positions where applicable.
    const halo = e.haloPositions;
    const core = e.corePositions;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const u = 1 - t;
      const u2 = u * u;
      const t2 = t * t;
      const ut2 = 2 * u * t;
      const x = u2 * _src.x + ut2 * _mid.x + t2 * _tgt.x;
      const y = u2 * _src.y + ut2 * _mid.y + t2 * _tgt.y;
      const z = u2 * _src.z + ut2 * _mid.z + t2 * _tgt.z;
      if (i < ARC_SEGMENTS) {
        // Start of segment i.
        const idx = i * 6;
        halo[idx] = core[idx] = x;
        halo[idx + 1] = core[idx + 1] = y;
        halo[idx + 2] = core[idx + 2] = z;
      }
      if (i > 0) {
        // End of segment (i-1).
        const idx = (i - 1) * 6 + 3;
        halo[idx] = core[idx] = x;
        halo[idx + 1] = core[idx + 1] = y;
        halo[idx + 2] = core[idx + 2] = z;
      }
    }

    // Mark the InterleavedBuffer dirty so the GPU re-uploads. instanceStart
    // and instanceEnd share the same backing buffer, so flipping one flag
    // covers both attributes for this geometry.
    e.haloGeometry.attributes.instanceStart.data.needsUpdate = true;
    e.coreGeometry.attributes.instanceStart.data.needsUpdate = true;

    // Bounding sphere drives frustum culling. setPositions() used to call
    // this for us; we now own it. Cheap (Three.js mutates the existing
    // Sphere instance in place after the first allocation).
    e.haloGeometry.computeBoundingSphere();
    e.coreGeometry.computeBoundingSphere();

    // Only the core line is dashed, so only it needs distances each frame.
    // Skipping it on the halo halves the per-frame allocation cost.
    e.coreLine.computeLineDistances();
  }
}

export function animateConnectionFlow(entries: ConnectionEntry[], elapsed: number): void {
  // Negative offset makes dashes drift forward along the curve — visual
  // shorthand for "this end feeds into that end".
  const offset = -elapsed * FLOW_SPEED;
  for (const e of entries) {
    e.coreMaterial.dashOffset = offset;
  }
}

/**
 * Smoothly fade connections in/out. Used to dim them while a planet is
 * selected (so they don't crowd the close-up detail view). `t` runs from
 * 0 (fully dimmed) to 1 (fully visible).
 */
export function fadeConnections(entries: ConnectionEntry[], t: number): void {
  for (const e of entries) {
    e.haloMaterial.opacity = e.baseHaloOpacity * t;
    e.coreMaterial.opacity = e.baseCoreOpacity * t;
  }
}

export function resizeConnections(
  entries: ConnectionEntry[],
  width: number,
  height: number,
): void {
  for (const e of entries) {
    e.haloMaterial.resolution.set(width, height);
    e.coreMaterial.resolution.set(width, height);
  }
}

export function disposeConnections(entries: ConnectionEntry[]): void {
  for (const e of entries) {
    e.haloGeometry.dispose();
    e.haloMaterial.dispose();
    e.coreGeometry.dispose();
    e.coreMaterial.dispose();
    // Line2 wraps the LineGeometry in an internal LineSegmentsGeometry
    // instance buffer — that is a separate GPU allocation that must also
    // be released explicitly.
    e.haloLine.geometry.dispose();
    e.coreLine.geometry.dispose();
  }
}
