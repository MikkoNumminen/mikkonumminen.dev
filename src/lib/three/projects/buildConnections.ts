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
  /** Reusable position buffer. Allocated once, mutated each frame. */
  positions: Float32Array;
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

    const positions = new Float32Array((ARC_SEGMENTS + 1) * 3);

    // Soft underglow — wider, lower opacity, no dashes.
    const haloGeometry = new LineGeometry();
    haloGeometry.setPositions(positions);
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
    haloLine.computeLineDistances();
    haloLine.renderOrder = 4;
    group.add(haloLine);

    // Bright dashed core — narrower, animated dashOffset gives the
    // "data flowing source → target" effect.
    const coreGeometry = new LineGeometry();
    coreGeometry.setPositions(positions);
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
      positions,
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

    const positions = e.positions;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const u = 1 - t;
      const u2 = u * u;
      const t2 = t * t;
      const ut2 = 2 * u * t;
      _p.set(
        u2 * _src.x + ut2 * _mid.x + t2 * _tgt.x,
        u2 * _src.y + ut2 * _mid.y + t2 * _tgt.y,
        u2 * _src.z + ut2 * _mid.z + t2 * _tgt.z,
      );
      const idx = i * 3;
      positions[idx] = _p.x;
      positions[idx + 1] = _p.y;
      positions[idx + 2] = _p.z;
    }

    // setPositions internally rebuilds the instance geometry. Both
    // halo and core share the same arc, so we update both.
    e.haloGeometry.setPositions(positions);
    e.coreGeometry.setPositions(positions);
    e.haloLine.computeLineDistances();
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
  }
}
