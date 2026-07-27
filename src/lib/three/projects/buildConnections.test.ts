import { describe, it, expect, vi } from 'vitest';
import {
  updateConnectionVisibility,
  animateConnectionFlow,
  resizeConnections,
} from './buildConnections';
import type { ConnectionEntry } from './buildConnections';

// updateConnectionVisibility / animateConnectionFlow / resizeConnections are
// pure scalar writes over an entry's materials. Real entries need
// Line2/LineMaterial (three/examples), so we use fake entries exposing only
// the fields these functions touch — the contract is the per-edge fade, dash
// drift, and resolution propagation.

function fakeEntry(baseHalo: number, baseCore: number, sourceId = 'a', targetId = 'b') {
  return {
    connection: { sourceId, targetId },
    baseHaloOpacity: baseHalo,
    baseCoreOpacity: baseCore,
    visCurrent: 0,
    visTarget: 0,
    haloMaterial: { opacity: 0, resolution: { set: vi.fn() } },
    coreMaterial: { opacity: 0, dashOffset: 0, resolution: { set: vi.fn() } },
  };
}

describe('updateConnectionVisibility', () => {
  const settle = (entries: unknown[], activeId: string | null, steps = 200) => {
    let visible = false;
    for (let i = 0; i < steps; i++) {
      visible = updateConnectionVisibility(entries as ConnectionEntry[], activeId, 0.12);
    }
    return visible;
  };

  it('lights an edge when the active project is either endpoint', () => {
    for (const activeId of ['a', 'b']) {
      const e = fakeEntry(0.4, 0.8, 'a', 'b');
      expect(settle([e], activeId), activeId).toBe(true);
      expect(e.haloMaterial.opacity).toBeCloseTo(0.4, 4);
      expect(e.coreMaterial.opacity).toBeCloseTo(0.8, 4);
    }
  });

  it('leaves edges that do not touch the active project dark', () => {
    const e = fakeEntry(0.4, 0.8, 'a', 'b');
    expect(settle([e], 'unrelated')).toBe(false);
    expect(e.haloMaterial.opacity).toBeCloseTo(0, 4);
    expect(e.coreMaterial.opacity).toBeCloseTo(0, 4);
  });

  it('fades everything out when nothing is active', () => {
    const e = fakeEntry(0.4, 0.8, 'a', 'b');
    settle([e], 'a');
    expect(settle([e], null)).toBe(false);
    expect(e.coreMaterial.opacity).toBeCloseTo(0, 4);
  });

  it('lights only the edges touching the active project', () => {
    const touching = fakeEntry(0.4, 0.8, 'a', 'b');
    const other = fakeEntry(0.4, 0.8, 'c', 'd');
    expect(settle([touching, other], 'a')).toBe(true);
    expect(touching.coreMaterial.opacity).toBeCloseTo(0.8, 4);
    expect(other.coreMaterial.opacity).toBeCloseTo(0, 4);
  });

  it('eases rather than snapping, so a single step is partial', () => {
    const e = fakeEntry(0.4, 0.8, 'a', 'b');
    updateConnectionVisibility([e] as unknown as ConnectionEntry[], 'a', 0.12);
    expect(e.visCurrent).toBeGreaterThan(0);
    expect(e.visCurrent).toBeLessThan(1);
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
