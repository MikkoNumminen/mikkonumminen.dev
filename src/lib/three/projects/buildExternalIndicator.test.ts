import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  satelliteOrbitRadius,
  updateExternalIndicator,
  type ExternalIndicator,
} from './buildExternalIndicator';

// updateExternalIndicator is pure per-frame trig: it orbits the satellite,
// drives its material opacity/emissive by visibility, and rides each pulse on a
// sin envelope. The real builder allocates a CanvasTexture (null 2D context in
// jsdom), so we drive the math with a hand-built struct — the function only
// reads numbers and writes into Vector3/material scalars.

function fakeIndicator(opts: {
  orbitRadius: number;
  pulseMaxScale: number;
  basePhase: number;
  phases: number[];
}): ExternalIndicator {
  return {
    satellite: { position: new Vector3() },
    satelliteMaterial: { opacity: 0, emissiveIntensity: 0 },
    pulses: opts.phases.map((phase) => ({
      sprite: { scale: new Vector3(), position: new Vector3() },
      material: { opacity: 0 },
      phase,
    })),
    orbitRadius: opts.orbitRadius,
    pulseMaxScale: opts.pulseMaxScale,
    basePhase: opts.basePhase,
  } as unknown as ExternalIndicator;
}

describe('updateExternalIndicator', () => {
  it('puts the satellite on the +x axis at elapsed 0 / basePhase 0', () => {
    const ind = fakeIndicator({
      orbitRadius: 3,
      pulseMaxScale: 2,
      basePhase: 0,
      phases: [0],
    });
    updateExternalIndicator(ind, 0, 1);
    expect(ind.satellite.position.x).toBeCloseTo(3, 6);
    expect(ind.satellite.position.y).toBeCloseTo(0, 6);
    expect(ind.satellite.position.z).toBeCloseTo(0, 6);
  });

  it('scales satellite opacity and emissive by visibility', () => {
    const ind = fakeIndicator({
      orbitRadius: 3,
      pulseMaxScale: 2,
      basePhase: 0,
      phases: [0],
    });
    updateExternalIndicator(ind, 0.7, 0.4);
    expect(ind.satelliteMaterial.opacity).toBeCloseTo(0.4, 6);
  });

  it('drives the pulse scale and sin-envelope opacity from its phase', () => {
    // elapsed 1.3 / PULSE_DURATION 2.6 = 0.5 → t = 0.5 (phase 0, basePhase 0)
    const ind = fakeIndicator({
      orbitRadius: 3,
      pulseMaxScale: 2,
      basePhase: 0,
      phases: [0],
    });
    updateExternalIndicator(ind, 1.3, 1);
    const pulse = ind.pulses[0];
    expect(pulse?.sprite.scale.x).toBeCloseTo(0.18 + 0.5 * 2, 6); // 1.18
    expect(pulse?.material.opacity).toBeCloseTo(Math.sin(0.5 * Math.PI) * 0.55, 6); // 0.55
    // pulse rides with the satellite
    expect(pulse?.sprite.position.x).toBeCloseTo(ind.satellite.position.x, 6);
  });

  it('visibility 0 zeroes the satellite and every pulse opacity', () => {
    const ind = fakeIndicator({
      orbitRadius: 3,
      pulseMaxScale: 2,
      basePhase: 0.3,
      phases: [0, 0.33, 0.66],
    });
    updateExternalIndicator(ind, 2.1, 0);
    expect(ind.satelliteMaterial.opacity).toBe(0);
    for (const p of ind.pulses) expect(p.material.opacity).toBe(0);
  });
});

describe('satelliteOrbitRadius', () => {
  it('uses the preferred stand-off when there is room', () => {
    expect(satelliteOrbitRadius(1, 100)).toBeCloseTo(2.6, 6);
  });

  it('pulls the satellite in when the neighbouring orbit is close', () => {
    // The largest planets overreach: a fixed multiple of a big radius crosses
    // a gap that does not grow with it. HRM, radius 1.43, wanted 3.72 with
    // 1.9 of room either side. The clamp has to fit inside the allowance AND
    // stay outside the body, which for the biggest planet is a narrow window.
    const allowance = 1.9 * 0.85;
    const r = satelliteOrbitRadius(1.43, allowance);
    expect(r).toBeLessThanOrEqual(allowance);
    expect(r).toBeGreaterThan(1.43);
  });

  it('never pulls the satellite inside its own planet, however tight the gap', () => {
    // The floor wins here, and the satellite crosses the line. That is the
    // right trade: a satellite inside its planet is a rendering bug, whereas
    // one crossing a faint orbit line is a cosmetic overlap.
    expect(satelliteOrbitRadius(1.43, 0.01)).toBeGreaterThan(1.43);
  });

  it('is unbounded when no allowance is given', () => {
    expect(satelliteOrbitRadius(1)).toBeCloseTo(2.6, 6);
  });

  it('leaves small planets untouched, since they already fit', () => {
    // A tier-2 planet at radius 0.77 wants 2.0 and has 1.4 of gap; clamping
    // must not drag every satellite in just because one planet overreached.
    expect(satelliteOrbitRadius(0.77, 2.6 * 0.85)).toBeCloseTo(2.002, 3);
  });
});
