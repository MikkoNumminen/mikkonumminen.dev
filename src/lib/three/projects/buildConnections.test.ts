import { describe, it, expect, vi } from 'vitest';
import {
  fadeConnections,
  animateConnectionFlow,
  resizeConnections,
} from './buildConnections';
import type { ConnectionEntry } from './buildConnections';

// fadeConnections / animateConnectionFlow / resizeConnections are pure scalar
// writes over an entry's materials. Real entries need Line2/LineMaterial
// (three/examples), so we use fake entries exposing only the fields these
// functions touch — the contract is the opacity scaling, dash drift, and
// resolution propagation.

function fakeEntry(baseHalo: number, baseCore: number) {
  return {
    baseHaloOpacity: baseHalo,
    baseCoreOpacity: baseCore,
    haloMaterial: { opacity: 0, resolution: { set: vi.fn() } },
    coreMaterial: { opacity: 0, dashOffset: 0, resolution: { set: vi.fn() } },
  };
}

describe('fadeConnections', () => {
  it('scales both opacities by t against their base values', () => {
    const e = fakeEntry(0.4, 0.8);
    fadeConnections([e] as unknown as ConnectionEntry[], 0.5);
    expect(e.haloMaterial.opacity).toBeCloseTo(0.2, 6);
    expect(e.coreMaterial.opacity).toBeCloseTo(0.4, 6);
  });

  it('t=1 restores base opacities; t=0 zeroes them', () => {
    const e = fakeEntry(0.4, 0.8);
    fadeConnections([e] as unknown as ConnectionEntry[], 1);
    expect(e.haloMaterial.opacity).toBeCloseTo(0.4, 6);
    expect(e.coreMaterial.opacity).toBeCloseTo(0.8, 6);
    fadeConnections([e] as unknown as ConnectionEntry[], 0);
    expect(e.haloMaterial.opacity).toBe(0);
    expect(e.coreMaterial.opacity).toBe(0);
  });
});

describe('animateConnectionFlow', () => {
  it('sets the core dashOffset to -elapsed * FLOW_SPEED (1.1)', () => {
    const e = fakeEntry(0.4, 0.8);
    animateConnectionFlow([e] as unknown as ConnectionEntry[], 2);
    expect(e.coreMaterial.dashOffset).toBeCloseTo(-2.2, 6);
  });
});

describe('resizeConnections', () => {
  it('propagates the resolution to both materials', () => {
    const e = fakeEntry(0.4, 0.8);
    resizeConnections([e] as unknown as ConnectionEntry[], 800, 600);
    expect(e.haloMaterial.resolution.set).toHaveBeenCalledWith(800, 600);
    expect(e.coreMaterial.resolution.set).toHaveBeenCalledWith(800, 600);
  });
});
