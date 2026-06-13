import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
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
    expect(ind.satelliteMaterial.emissiveIntensity).toBeCloseTo(1.1 * 0.4, 6);
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
